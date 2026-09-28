"""
VESTIGE//NULL — Blender asset builder.

Builds every 3D asset for the browser game headlessly and exports GLB files to
jrpg/assets/models/:

  * party + enemies: low-poly PS2-era figures, rigidly skinned to an armature,
    with baked animation actions (idle, run, attack, cast, hit, death, ...)
  * level: the Null Spire megastructure, built from jrpg/data/level.json so the
    walkable geometry matches the game's collision data exactly
  * props: save sphere, chest, and a Pixverse "card" rig for video sprites

Run with either a Blender install or the `bpy` wheel:

    python3 pipeline/blender/build_assets.py            # pip install bpy
    blender -b -P pipeline/blender/build_assets.py      # desktop Blender

Blender space is Z-up with characters facing -Y; the glTF exporter converts to
Y-up / +Z-forward, which is what three.js expects.
"""
import json
import math
import os
import random
import sys

import bpy  # noqa: I001 (bpy must load before bmesh/mathutils)
import bmesh
from mathutils import Matrix, Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "jrpg", "assets", "models")
LEVEL = os.path.join(ROOT, "jrpg", "data", "level.json")
FPS = 30

# ----------------------------------------------------------------------------
# scene + materials
# ----------------------------------------------------------------------------


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear()
    bpy.context.scene.render.fps = FPS
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.armatures):
        for item in list(block):
            block.remove(item)


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]


_mats = {}


def mat(name, color, rough=0.8, metal=0.0, emit=None, strength=0.0):
    """Principled material; `emit` makes glowing seams/halos (bloom in-game)."""
    key = (name, color, rough, metal, emit, strength)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    if not m.node_tree:  # Blender < 5 needs node trees switched on
        m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*hex_rgb(color), 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if emit:
        bsdf.inputs["Emission Color"].default_value = (*hex_rgb(emit), 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    _mats[key] = m
    return m


# ----------------------------------------------------------------------------
# mesh building (bmesh primitives, each part rigidly bound to one bone)
# ----------------------------------------------------------------------------


class Builder:
    """Accumulates primitives into one bmesh with per-part material + bone."""

    def __init__(self):
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()
        self.materials = []
        self.groups = []

    def _mat_index(self, m):
        if m not in self.materials:
            self.materials.append(m)
        return self.materials.index(m)

    def _group_index(self, bone):
        if bone not in self.groups:
            self.groups.append(bone)
        return self.groups.index(bone)

    def _finish(self, verts, bone, m):
        gi = self._group_index(bone) if bone else None
        mi = self._mat_index(m)
        vset = set(verts)
        for f in self.bm.faces:
            if f.verts[0] in vset:
                f.material_index = mi
                f.smooth = False
        if gi is not None:
            for v in verts:
                v[self.deform][gi] = 1.0
        return verts

    # primitives ---------------------------------------------------------
    def box(self, bone, m, center, size, rot=(0, 0, 0)):
        M = Matrix.LocRotScale(Vector(center), _euler(rot), Vector(size))
        r = bmesh.ops.create_cube(self.bm, size=1.0, matrix=M)
        return self._finish(r["verts"], bone, m)

    def cyl(self, bone, m, a, b, r1, r2=None, seg=6):
        """Tapered cylinder from point a to point b."""
        r2 = r1 if r2 is None else r2
        a, b = Vector(a), Vector(b)
        d = b - a
        q = Vector((0, 0, 1)).rotation_difference(d.normalized()) if d.length > 1e-6 else Quaternion()
        M = Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4()
        r = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=seg,
                                  radius1=r1, radius2=r2, depth=d.length, matrix=M)
        return self._finish(r["verts"], bone, m)

    def sphere(self, bone, m, center, radius, seg=8, scale=(1, 1, 1), rot=(0, 0, 0)):
        M = Matrix.LocRotScale(Vector(center), _euler(rot), Vector(scale))
        r = bmesh.ops.create_uvsphere(self.bm, u_segments=seg, v_segments=max(4, seg // 2 + 1),
                                      radius=radius, matrix=M)
        return self._finish(r["verts"], bone, m)

    def torus(self, bone, m, center, R, r, seg=16, tube=4, rot=(0, 0, 0), gaps=0):
        """Ring (halos). `gaps` removes segments for a cracked/broken look."""
        M = Matrix.LocRotScale(Vector(center), _euler(rot), Vector((1, 1, 1)))
        rng = random.Random(int(R * 1000 + seg))
        skip = set(rng.sample(range(seg), gaps)) if gaps else set()
        verts = []
        rings = []
        for i in range(seg):
            a = 2 * math.pi * i / seg
            ring = []
            for j in range(tube):
                b = 2 * math.pi * j / tube
                p = Vector(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
                v = self.bm.verts.new(M @ p)
                ring.append(v)
                verts.append(v)
            rings.append(ring)
        for i in range(seg):
            if i in skip:
                continue
            n = (i + 1) % seg
            for j in range(tube):
                k = (j + 1) % tube
                self.bm.faces.new((rings[i][j], rings[n][j], rings[n][k], rings[i][k]))
        return self._finish(verts, bone, m)

    def cone(self, bone, m, base, tip, r, seg=4):
        return self.cyl(bone, m, base, tip, r, 0.0, seg)

    def to_object(self, name):
        me = bpy.data.meshes.new(name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.materials:
            me.materials.append(m)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        for g in self.groups:
            ob.vertex_groups.new(name=g)
        return ob


def _euler(rot):
    from mathutils import Euler
    return Euler(rot, "XYZ")


# ----------------------------------------------------------------------------
# skeletons
# ----------------------------------------------------------------------------


def humanoid_joints(h=1.0, shoulder=0.21, hip=0.1, arm=1.0, leg=1.0):
    """Joint positions for a figure ~1.8m tall * h, arms at sides, facing -Y."""
    s = h
    J = {}
    J["root"] = (0, 0, 0)
    hip_z = 0.95 * s * leg
    J["hips"] = (0, 0, hip_z)
    J["spine"] = (0, 0, hip_z + 0.1 * s)
    J["chest"] = (0, 0, hip_z + 0.35 * s)
    J["neck"] = (0, 0, hip_z + 0.55 * s)
    J["head"] = (0, 0, hip_z + 0.63 * s)
    J["head_end"] = (0, 0, hip_z + 0.9 * s)
    sh_z = hip_z + 0.5 * s
    for side, x in (("L", 1), ("R", -1)):
        J["upper_arm." + side] = (x * shoulder * s, 0, sh_z)
        J["forearm." + side] = (x * (shoulder + 0.03) * s, 0.02, sh_z - 0.28 * s * arm)
        J["hand." + side] = (x * (shoulder + 0.04) * s, 0.0, sh_z - 0.53 * s * arm)
        J["hand_end." + side] = (x * (shoulder + 0.04) * s, 0.0, sh_z - 0.62 * s * arm)
        J["thigh." + side] = (x * hip * s, 0, hip_z)
        J["shin." + side] = (x * (hip + 0.01) * s, -0.02, hip_z * 0.53)
        J["foot." + side] = (x * (hip + 0.01) * s, 0.0, 0.09 * s)
        J["foot_end." + side] = (x * (hip + 0.01) * s, -0.17 * s, 0.02)
    return J


HUMANOID_BONES = [
    # name, head joint, tail joint, parent
    ("root", "root", None, None),
    ("hips", "hips", "spine", "root"),
    ("spine", "spine", "chest", "hips"),
    ("chest", "chest", "neck", "spine"),
    ("neck", "neck", "head", "chest"),
    ("head", "head", "head_end", "neck"),
] + [
    b for s in ("L", "R") for b in (
        ("upper_arm." + s, "upper_arm." + s, "forearm." + s, "chest"),
        ("forearm." + s, "forearm." + s, "hand." + s, "upper_arm." + s),
        ("hand." + s, "hand." + s, "hand_end." + s, "forearm." + s),
        ("thigh." + s, "thigh." + s, "shin." + s, "hips"),
        ("shin." + s, "shin." + s, "foot." + s, "thigh." + s),
        ("foot." + s, "foot." + s, "foot_end." + s, "shin." + s),
    )
]


def build_armature(name, J, bones, extra=()):
    """extra: (name, head, tail, parent) tuples for halo/wing/prop bones."""
    arm = bpy.data.armatures.new(name + "_rig")
    ob = bpy.data.objects.new(name + "_rig", arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    for bname, hj, tj, parent in list(bones) + list(extra):
        eb = arm.edit_bones.new(bname)
        eb.head = Vector(J[hj]) if isinstance(hj, str) else Vector(hj)
        if tj is None:
            eb.tail = eb.head + Vector((0, 0, 0.2))
        else:
            eb.tail = Vector(J[tj]) if isinstance(tj, str) else Vector(tj)
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in ob.pose.bones:
        pb.rotation_mode = "QUATERNION"
    return ob


def bind(mesh_ob, arm_ob):
    mesh_ob.parent = arm_ob
    mod = mesh_ob.modifiers.new("rig", "ARMATURE")
    mod.object = arm_ob


# ----------------------------------------------------------------------------
# animation: poses authored as world-axis rotations, converted to bone space
# ----------------------------------------------------------------------------

X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def deg(d):
    return math.radians(d)


class Animator:
    def __init__(self, arm_ob):
        self.ob = arm_ob
        self.rest = {b.name: b.matrix_local.to_3x3() for b in arm_ob.data.bones}
        arm_ob.animation_data_create()

    def local_quat(self, bone, rots):
        """rots: list of (world_axis, degrees). Positive X pitches -Y (forward) up."""
        M = self.rest[bone]
        q = Quaternion()
        for axis, d in rots:
            q = Quaternion((M.inverted() @ axis).normalized(), deg(d)) @ q
        return q

    def local_loc(self, bone, world_offset):
        return self.rest[bone].inverted() @ Vector(world_offset)

    def action(self, name, keys, loop=True, only=None):
        """keys: list of (frame, {bone: [(axis, deg), ...]}, {bone: (x, y, z)}).
        `only` limits keying to those bones so overlay actions (halo spin,
        floating props) can be layered on top of the base animation in-game."""
        act = bpy.data.actions.new(name)
        act.use_fake_user = True
        self.ob.animation_data.action = act
        pbs = self.ob.pose.bones
        for frame, rots, locs in keys:
            for pb in pbs:
                if only and pb.name not in only:
                    continue
                pb.rotation_quaternion = self.local_quat(pb.name, rots.get(pb.name, []))
                pb.location = self.local_loc(pb.name, locs.get(pb.name, (0, 0, 0)))
                pb.keyframe_insert("rotation_quaternion", frame=frame)
                pb.keyframe_insert("location", frame=frame)
        track = self.ob.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(keys[0][0]), act)
        strip.name = name
        track.mute = True
        self.ob.animation_data.action = None
        return act


def sym(side_rots):
    """Mirror a pose for the other side: flips Y/Z world rotations."""
    return [(ax, -d if ax is not X else d) for ax, d in side_rots]


def humanoid_actions(A, style="blade", extra=None):
    """Shared animation set. `style` tweaks attack/cast poses per character."""
    extra = extra or {}

    def pose(**kw):
        return {k.replace("_L", ".L").replace("_R", ".R"): v for k, v in kw.items()}

    # idle: slow breathing, shoulders roll, weapon arm relaxed
    idle_a = pose(chest=[(X, 2)], neck=[(X, -2)], upper_arm_L=[(Y, 6)], upper_arm_R=[(Y, -6)],
                  forearm_L=[(X, 8)], forearm_R=[(X, 14)], thigh_L=[(Z, 4)], thigh_R=[(Z, -4)])
    idle_b = pose(chest=[(X, -2)], neck=[(X, 1)], upper_arm_L=[(Y, 8)], upper_arm_R=[(Y, -8)],
                  forearm_L=[(X, 12)], forearm_R=[(X, 18)], thigh_L=[(Z, 4)], thigh_R=[(Z, -4)])
    for k, v in extra.get("idle", {}).items():
        idle_a.setdefault(k, []).extend(v)
        idle_b.setdefault(k, []).extend(v)
    A.action("idle", [(1, idle_a, {"hips": (0, 0, 0)}), (31, idle_b, {"hips": (0, 0, -0.015)}),
                      (61, idle_a, {"hips": (0, 0, 0)})])

    # run: 20 frame cycle
    def run_pose(p):
        s = 1 if p == 0 else -1
        return pose(
            hips=[(Z, 8 * s)], spine=[(X, -10)], chest=[(Z, -14 * s)],
            thigh_L=[(X, -40 * s)], shin_L=[(X, 50 if s < 0 else 10)],
            thigh_R=[(X, 40 * s)], shin_R=[(X, 50 if s > 0 else 10)],
            upper_arm_L=[(X, 35 * s), (Y, 10)], forearm_L=[(X, -50)],
            upper_arm_R=[(X, -35 * s), (Y, -10)], forearm_R=[(X, -50)])
    A.action("run", [(1, run_pose(0), {"hips": (0, 0, 0)}), (6, pose(spine=[(X, -10)], shin_L=[(X, 30)], shin_R=[(X, 30)], forearm_L=[(X, -50)], forearm_R=[(X, -50)]), {"hips": (0, 0, 0.06)}),
                     (11, run_pose(1), {"hips": (0, 0, 0)}), (16, pose(spine=[(X, -10)], shin_L=[(X, 30)], shin_R=[(X, 30)], forearm_L=[(X, -50)], forearm_R=[(X, -50)]), {"hips": (0, 0, 0.06)}),
                     (21, run_pose(0), {"hips": (0, 0, 0)})])

    # attack: wind up, strike, recover (in place; the game moves the root)
    if style == "claw":
        wind = pose(chest=[(Z, 30)], upper_arm_R=[(X, 60), (Y, -40)], forearm_R=[(X, -70)], thigh_L=[(X, -20)], shin_L=[(X, 20)])
        hit = pose(chest=[(Z, -35), (X, -15)], upper_arm_R=[(X, -95)], forearm_R=[(X, -10)], thigh_R=[(X, 25)], thigh_L=[(X, -30)], shin_L=[(X, 30)])
    elif style == "staff":
        wind = pose(chest=[(X, 10)], upper_arm_R=[(X, -150)], forearm_R=[(X, -30)], upper_arm_L=[(Y, 20)])
        hit = pose(chest=[(X, -20)], upper_arm_R=[(X, -60)], forearm_R=[(X, -10)], thigh_L=[(X, -25)], shin_L=[(X, 25)])
    else:  # blade
        wind = pose(chest=[(Z, 40)], spine=[(Z, 15)], upper_arm_R=[(X, -100), (Z, 60)], forearm_R=[(X, -60)], thigh_R=[(X, 20)], thigh_L=[(X, -20)], shin_L=[(X, 25)])
        hit = pose(chest=[(Z, -45), (X, -15)], spine=[(Z, -15)], upper_arm_R=[(X, -70), (Z, -50)], forearm_R=[(X, -5)], thigh_L=[(X, -35)], shin_L=[(X, 35)], thigh_R=[(X, 20)])
    A.action("attack", [(1, {}, {}), (8, wind, {"hips": (0, 0.05, -0.05)}), (13, hit, {"hips": (0, -0.25, -0.12)}),
                        (22, hit, {"hips": (0, -0.25, -0.12)}), (34, {}, {})], loop=False)

    # cast: arms raise, head tilts back, float
    cast = pose(chest=[(X, 12)], neck=[(X, 15)], upper_arm_L=[(X, -120), (Y, 30)], upper_arm_R=[(X, -120), (Y, -30)],
                forearm_L=[(X, -20)], forearm_R=[(X, -20)], shin_L=[(X, 30)], shin_R=[(X, 20)])
    A.action("cast", [(1, {}, {}), (12, cast, {"root": (0, 0, 0.15)}), (30, cast, {"root": (0, 0, 0.22)}), (42, {}, {})], loop=False)

    # hit: recoil
    hit_p = pose(spine=[(X, 20)], chest=[(X, 15)], neck=[(X, 20)], upper_arm_L=[(Y, 35)], upper_arm_R=[(Y, -35)], thigh_L=[(X, -15)], shin_L=[(X, 20)])
    A.action("hit", [(1, {}, {}), (4, hit_p, {"hips": (0, 0.12, -0.05)}), (16, {}, {})], loop=False)

    # guard
    guard = pose(chest=[(X, -8)], upper_arm_L=[(X, -70), (Y, -30)], forearm_L=[(X, -90)], upper_arm_R=[(X, -70), (Y, 30)], forearm_R=[(X, -90)], thigh_L=[(X, -15)], shin_L=[(X, 25)], thigh_R=[(X, 10)])
    A.action("guard", [(1, guard, {"hips": (0, 0, -0.08)}), (21, guard, {"hips": (0, 0, -0.08)})])

    # death: knees then collapse forward
    kneel = pose(thigh_L=[(X, -80)], shin_L=[(X, 110)], thigh_R=[(X, -60)], shin_R=[(X, 120)], spine=[(X, -25)], neck=[(X, -30)],
                 upper_arm_L=[(Y, 10)], upper_arm_R=[(Y, -10)])
    down = pose(root=[(X, -80)], thigh_L=[(X, -20)], shin_L=[(X, 40)], thigh_R=[(X, -10)], shin_R=[(X, 30)], upper_arm_L=[(Y, 60)], upper_arm_R=[(Y, -60)], neck=[(Z, 30)])
    A.action("death", [(1, {}, {}), (12, kneel, {"hips": (0, 0, -0.42)}), (30, down, {"root": (0, -0.05, 0.12)}), (60, down, {"root": (0, -0.05, 0.12)})], loop=False)

    # victory
    vic = pose(chest=[(X, 10)], upper_arm_R=[(X, -160)], forearm_R=[(X, -10)], upper_arm_L=[(Y, 20)], neck=[(X, 10)])
    A.action("victory", [(1, {}, {}), (14, vic, {}), (50, vic, {"hips": (0, 0, 0.02)})], loop=False)


# ----------------------------------------------------------------------------
# characters
# ----------------------------------------------------------------------------

C = {
    "void": "#0a0a0d", "coat": "#141419", "cloth": "#1d1e24", "concrete": "#3a3b40",
    "bone": "#d9d2c3", "skin": "#c9b8ad", "hair": "#e8e6e1", "steel": "#5a5f68", "rust": "#4a2b24",
    "cyan": "#4ff0ff", "red": "#ff2a4a", "violet": "#9b5cff", "amber": "#ffb347",
}


def M_(key, **kw):
    return mat(key, C.get(key, key), **kw)


GLOW_SCALE = 0.45  # tuned against the game's bloom pass


def glow(color, strength=6.0):
    return mat("glow_" + color.strip("#"), "#000000", rough=0.4, emit=C.get(color, color), strength=strength * GLOW_SCALE)


def limbs(b, J, m_arm, m_leg, m_hand, arm_r=(0.055, 0.045), leg_r=(0.075, 0.055), boots=None):
    for s in ("L", "R"):
        b.cyl("upper_arm." + s, m_arm, J["upper_arm." + s], J["forearm." + s], arm_r[0], arm_r[1])
        b.cyl("forearm." + s, m_arm, J["forearm." + s], J["hand." + s], arm_r[1], arm_r[1] * 0.85)
        b.box("hand." + s, m_hand, Vector(J["hand." + s]) + Vector((0, 0, -0.045)), (0.06, 0.07, 0.1))
        b.cyl("thigh." + s, m_leg, J["thigh." + s], J["shin." + s], leg_r[0], leg_r[1])
        b.cyl("shin." + s, boots or m_leg, J["shin." + s], J["foot." + s], leg_r[1], leg_r[1] * 0.8)
        f = Vector(J["foot." + s])
        b.box("foot." + s, boots or m_leg, f + Vector((0, -0.06, -0.045)), (0.09, 0.24, 0.08))


def export(name, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    path = os.path.join(OUT, name + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_animations=True, export_animation_mode="ACTIONS", export_force_sampling=True,
        export_nla_strips=True, export_def_bones=False, export_apply=False,
        export_yup=True, export_skins=True, export_morph=False, export_lights=False,
        export_extras=True)
    print("  wrote", os.path.relpath(path, ROOT), f"{os.path.getsize(path) / 1024:.0f} KB")


def character(name, J, dress, style="blade", extra_bones=(), extra_anim=None, custom=None):
    reset_scene()
    rig = build_armature(name, J, HUMANOID_BONES, extra_bones)
    b = Builder()
    dress(b, J)
    body = b.to_object(name + "_mesh")
    bind(body, rig)
    A = Animator(rig)
    humanoid_actions(A, style, extra_anim)
    if custom:
        custom(A)
    rig["vestige_kind"] = "character"
    export(name, [rig, body])


# --- Sable: the severed swordswoman (FFX/Shadow Hearts lead) -----------------

def dress_sable(b, J):
    coat, cloth, skin, hair = M_("coat", rough=0.55), M_("cloth"), M_("skin", rough=0.6), M_("hair", rough=0.5)
    steel, red, cyan = M_("steel", metal=0.8, rough=0.3), glow("red", 8), glow("cyan", 10)
    hip, chest, neck, head = (Vector(J[k]) for k in ("hips", "chest", "neck", "head"))
    b.cyl("hips", cloth, hip + Vector((0, 0, -0.05)), hip + Vector((0, 0, 0.12)), 0.14, 0.12, 8)
    b.cyl("spine", cloth, hip + Vector((0, 0, 0.1)), chest, 0.12, 0.15, 8)
    b.cyl("chest", coat, chest, neck + Vector((0, 0, -0.02)), 0.17, 0.12, 8)
    # high collar + coat tails (split so legs can move)
    b.cyl("chest", coat, neck + Vector((0, 0, -0.06)), neck + Vector((0, 0, 0.08)), 0.1, 0.12, 8)
    for s, x in (("L", 1), ("R", -1)):
        b.box("thigh." + s, coat, Vector(J["thigh." + s]) + Vector((x * 0.04, 0.05, -0.3)), (0.13, 0.08, 0.62), rot=(0.12, x * -0.1, 0))
    b.box("hips", coat, hip + Vector((0, 0.1, -0.35)), (0.26, 0.04, 0.7), rot=(0.2, 0, 0))
    b.box("chest", red, chest + Vector((0, -0.16, 0.05)), (0.02, 0.01, 0.2))  # vein seam
    b.sphere("head", skin, head + Vector((0, 0, 0.1)), 0.1, 8, scale=(0.85, 0.95, 1.1))
    b.box("head", mat("visor", "#050506", rough=0.2, emit=C["cyan"], strength=3), head + Vector((0, -0.085, 0.12)), (0.14, 0.03, 0.025))
    for i in range(7):  # spiky white hair
        a = -0.9 + i * 0.3
        base = head + Vector((math.sin(a) * 0.07, 0.03, 0.17))
        b.cone("head", hair, base, base + Vector((math.sin(a) * 0.12, 0.16, 0.02 - abs(a) * 0.06)), 0.05, 4)
    b.torus("head", red, head + Vector((0, 0.06, 0.32)), 0.16, 0.008, 18, 3, rot=(0.35, 0, 0), gaps=4)
    b.cyl("upper_arm.L", coat, J["upper_arm.L"], J["forearm.L"], 0.075, 0.06, 6)
    b.cyl("upper_arm.R", coat, J["upper_arm.R"], J["forearm.R"], 0.075, 0.06, 6)
    limbs(b, J, coat, cloth, M_("void"), boots=steel)
    # gravity blade in right hand, pointing forward/down
    h = Vector(J["hand.R"]) + Vector((0, 0, -0.06))
    b.box("hand.R", steel, h + Vector((0, -0.02, 0)), (0.05, 0.05, 0.14))
    b.box("hand.R", steel, h + Vector((0, -0.02, -0.08)), (0.16, 0.04, 0.03))
    b.box("hand.R", M_("void", metal=0.9, rough=0.2), h + Vector((0, -0.02, -0.62)), (0.035, 0.012, 1.0))
    b.box("hand.R", cyan, h + Vector((0, -0.029, -0.62)), (0.012, 0.004, 0.98))


def sable():
    J = humanoid_joints(1.0, shoulder=0.19, hip=0.09)
    character("sable", J, dress_sable, "blade")


# --- Wisp: the hacker-mage (.hack / Kingdom Hearts) ------------------------

def dress_wisp(b, J):
    suit, hood, skin = M_("cloth", rough=0.5), mat("hood", "#101218", rough=0.7), M_("skin")
    cyan, violet, steel = glow("cyan", 9), glow("violet", 7), M_("steel", metal=0.9, rough=0.25)
    hip, chest, neck, head = (Vector(J[k]) for k in ("hips", "chest", "neck", "head"))
    b.cyl("hips", suit, hip + Vector((0, 0, -0.05)), hip + Vector((0, 0, 0.1)), 0.12, 0.11, 8)
    b.cyl("spine", suit, hip + Vector((0, 0, 0.1)), chest, 0.105, 0.13, 8)
    b.cyl("chest", suit, chest, neck, 0.15, 0.1, 8)
    for i in range(4):  # glowing circuit lines
        z = chest.z - 0.1 + i * 0.07
        b.box("chest" if i > 1 else "spine", cyan, Vector((0, -0.13 + i * 0.005, z)), (0.2 - i * 0.02, 0.005, 0.008))
    b.sphere("head", skin, head + Vector((0, 0, 0.1)), 0.095, 8, scale=(0.85, 0.95, 1.05))
    b.sphere("head", hood, head + Vector((0, 0.07, 0.13)), 0.13, 8, scale=(1.05, 1.1, 1.1))  # open at the front
    b.cone("head", hood, head + Vector((0, 0.1, 0.18)), head + Vector((0, 0.38, 0.0)), 0.08, 5)
    b.box("head", cyan, head + Vector((0.035, -0.09, 0.11)), (0.025, 0.01, 0.01))
    b.box("head", cyan, head + Vector((-0.035, -0.09, 0.11)), (0.025, 0.01, 0.01))
    # capelet
    b.cyl("chest", hood, neck + Vector((0, 0, -0.02)), chest + Vector((0, 0, -0.06)), 0.1, 0.24, 7)
    limbs(b, J, suit, suit, M_("void"), arm_r=(0.045, 0.04), leg_r=(0.065, 0.05), boots=M_("coat"))
    # keyblade-like staff in right hand
    h = Vector(J["hand.R"]) + Vector((0, 0, -0.05))
    b.cyl("hand.R", steel, h + Vector((0, 0.35, 0)), h + Vector((0, -0.75, 0)), 0.018, 0.018, 6)
    b.torus("hand.R", steel, h + Vector((0, 0.3, 0)), 0.06, 0.012, 10, 3, rot=(0, 0, 0))
    for i in range(3):
        b.box("hand.R", steel, h + Vector((0, -0.62 - i * 0.05, -0.05 - i * 0.02)), (0.02, 0.035, 0.08 + i * 0.03))
    b.sphere("hand.R", cyan, h + Vector((0, -0.78, 0)), 0.035, 6)
    # floating grimoire (own bone, bobbing)
    g = Vector(J["hand.L"]) + Vector((0.18, -0.15, 0.25))
    b.box("grimoire", mat("tome", "#1b1024", rough=0.4), g, (0.2, 0.26, 0.05), rot=(0.4, 0, 0.3))
    b.box("grimoire", violet, g + Vector((0, 0, 0.03)), (0.12, 0.18, 0.005), rot=(0.4, 0, 0.3))


def wisp():
    J = humanoid_joints(0.92, shoulder=0.17, hip=0.085)
    g = Vector(J["hand.L"]) + Vector((0.18, -0.15, 0.25))
    extra = [("grimoire", tuple(g), tuple(g + Vector((0, 0, 0.15))), "chest")]

    def bob(A):
        A.action("grimoire_float", [(1, {"grimoire": [(Z, 0)]}, {"grimoire": (0, 0, 0)}),
                                    (46, {"grimoire": [(Z, 180), (X, 10)]}, {"grimoire": (0, 0, 0.06)}),
                                    (91, {"grimoire": [(Z, 360)]}, {"grimoire": (0, 0, 0)})], only={"grimoire"})
    character("wisp", J, dress_wisp, "staff", extra, custom=bob)


# --- Hex: the possessed harmonixer (Shadow Hearts) ------------------------

def dress_hex(b, J):
    jacket, pants, skin = mat("jacket", "#23201f", rough=0.7), M_("cloth"), M_("skin")
    bio, red, scarf = mat("biomech", "#2b1418", rough=0.35, metal=0.5), glow("red", 9), mat("scarf", "#5a0f1a", rough=0.8)
    hip, chest, neck, head = (Vector(J[k]) for k in ("hips", "chest", "neck", "head"))
    b.cyl("hips", pants, hip + Vector((0, 0, -0.05)), hip + Vector((0, 0, 0.12)), 0.16, 0.15, 8)
    b.cyl("spine", jacket, hip + Vector((0, 0, 0.1)), chest, 0.15, 0.2, 8)
    b.cyl("chest", jacket, chest, neck, 0.22, 0.13, 8)
    b.cyl("chest", scarf, neck + Vector((0, 0, -0.05)), neck + Vector((0, 0, 0.06)), 0.12, 0.11, 8)
    b.box("chest", scarf, neck + Vector((0.06, 0.16, -0.25)), (0.1, 0.03, 0.45), rot=(0.3, 0, 0.1))
    b.sphere("head", skin, head + Vector((0, 0, 0.11)), 0.105, 8, scale=(0.9, 0.95, 1.05))
    b.sphere("head", mat("hairdark", "#15110f"), head + Vector((0, 0.02, 0.17)), 0.11, 8, scale=(1, 1.05, 0.7))
    b.box("head", red, head + Vector((-0.04, -0.095, 0.12)), (0.03, 0.01, 0.012))
    # normal left arm
    for s in ("L",):
        b.cyl("upper_arm." + s, jacket, J["upper_arm." + s], J["forearm." + s], 0.075, 0.06)
        b.cyl("forearm." + s, skin, J["forearm." + s], J["hand." + s], 0.055, 0.045)
        b.box("hand." + s, skin, Vector(J["hand." + s]) + Vector((0, 0, -0.05)), (0.07, 0.08, 0.1))
    # fused biomech right arm: oversized claw with glowing veins
    b.sphere("upper_arm.R", bio, J["upper_arm.R"], 0.13, 7, scale=(1.1, 1, 0.9))
    for i in range(3):
        base = Vector(J["upper_arm.R"]) + Vector((-0.05, 0.03 * i - 0.03, 0.08))
        b.cone("upper_arm.R", bio, base, base + Vector((-0.12, 0.05 * (i - 1), 0.16)), 0.04, 4)
    b.cyl("upper_arm.R", bio, J["upper_arm.R"], J["forearm.R"], 0.1, 0.09, 6)
    b.cyl("forearm.R", bio, J["forearm.R"], J["hand.R"], 0.1, 0.12, 6)
    b.box("forearm.R", red, Vector(J["forearm.R"]) + Vector((-0.02, -0.1, -0.12)), (0.015, 0.01, 0.2))
    h = Vector(J["hand.R"])
    b.box("hand.R", bio, h + Vector((0, 0, -0.06)), (0.16, 0.16, 0.12))
    for i in range(4):
        base = h + Vector((-0.06 + i * 0.04, -0.06, -0.1))
        b.cone("hand.R", mat("claw", "#d4cdbd", rough=0.3), base, base + Vector((0, -0.08, -0.2)), 0.02, 4)
    for s in ("L", "R"):
        b.cyl("thigh." + s, pants, J["thigh." + s], J["shin." + s], 0.085, 0.065)
        b.cyl("shin." + s, M_("coat"), J["shin." + s], J["foot." + s], 0.07, 0.06)
        b.box("foot." + s, M_("coat"), Vector(J["foot." + s]) + Vector((0, -0.06, -0.045)), (0.1, 0.25, 0.09))


def hex_():
    J = humanoid_joints(1.06, shoulder=0.23, hip=0.1)
    character("hex", J, dress_hex, "claw")


# --- enemies ---------------------------------------------------------------

def dress_saint(b, J, ghost=False):
    porcelain = mat("porcelain", "#cfc8bb", rough=0.25)
    robe = mat("saintrobe", "#0e0e12", rough=0.9) if not ghost else mat("ghostrobe", "#000000", rough=1, emit="#3fa7b5", strength=0.35)
    tube, red = mat("tubing", "#2a2d33", rough=0.4, metal=0.6), glow("red", 10)
    hip, chest, neck, head = (Vector(J[k]) for k in ("hips", "chest", "neck", "head"))
    b.cyl("hips", robe, hip + Vector((0, 0, -0.9)), hip + Vector((0, 0, 0.1)), 0.35, 0.1, 7)
    b.cyl("spine", tube, hip, chest, 0.07, 0.08, 6)
    for i in range(6):  # exposed ribs
        z = hip.z + 0.12 + i * 0.07
        b.torus("spine" if i < 3 else "chest", porcelain, Vector((0, 0, z)), 0.1 - abs(i - 3) * 0.01, 0.012, 10, 3, gaps=3)
    b.cyl("chest", robe, chest, neck, 0.14, 0.09, 7)
    b.cyl("neck", tube, neck, head, 0.035, 0.03, 5)
    b.sphere("head", porcelain, head + Vector((0, 0, 0.12)), 0.1, 8, scale=(0.8, 0.9, 1.35))
    b.box("head", M_("void"), head + Vector((0.035, -0.08, 0.15)), (0.03, 0.02, 0.07))
    b.box("head", M_("void"), head + Vector((-0.035, -0.08, 0.15)), (0.03, 0.02, 0.07))
    b.torus("halo", red, head + Vector((0, 0.1, 0.35)), 0.22, 0.015, 24, 4, rot=(math.radians(-70), 0, 0), gaps=5)
    for i in range(4):  # dripping from halo
        a = i * 1.4
        top = head + Vector((math.cos(a) * 0.2, 0.1 + math.sin(a) * 0.05, 0.3))
        b.cone("halo", red, top, top + Vector((0, 0, -0.12 - i * 0.05)), 0.012, 4)
    for s in ("L", "R"):
        b.cyl("upper_arm." + s, tube, J["upper_arm." + s], J["forearm." + s], 0.035, 0.03, 5)
        b.cyl("forearm." + s, porcelain, J["forearm." + s], J["hand." + s], 0.03, 0.02, 5)
        hand = Vector(J["hand." + s])
        for f in range(3):
            b.cone("hand." + s, porcelain, hand, hand + Vector(((f - 1) * 0.04, -0.02, -0.28)), 0.012, 4)
        b.cyl("thigh." + s, tube, J["thigh." + s], J["shin." + s], 0.035, 0.03, 5)
        b.cyl("shin." + s, tube, J["shin." + s], J["foot." + s], 0.03, 0.02, 5)


def saint(name="saint", ghost=False):
    J = humanoid_joints(1.35, shoulder=0.2, hip=0.08, arm=1.5, leg=1.1)
    head = Vector(J["head"])
    extra = [("halo", tuple(head + Vector((0, 0.1, 0.3))), tuple(head + Vector((0, 0.1, 0.5))), "head")]
    sway = {"halo": [(Z, 0)], "hips": [(Z, 5)]}
    character(name, J, lambda b, J: dress_saint(b, J, ghost), "blade", extra, {"idle": sway},
              custom=lambda A: A.action("halo_spin", [(1, {"halo": [(Z, 0)]}, {}), (61, {"halo": [(Z, 180)]}, {}), (121, {"halo": [(Z, 360)]}, {})], only={"halo"}))


def dress_wraith(b, J):
    shroud, cable, cyan = mat("shroud", "#08090c", rough=1.0), mat("cable", "#17181c", rough=0.4, metal=0.5), glow("cyan", 8)
    hip, chest, neck, head = (Vector(J[k]) for k in ("hips", "chest", "neck", "head"))
    b.cyl("spine", shroud, hip, chest, 0.12, 0.17, 6)
    b.cyl("chest", shroud, chest, neck, 0.2, 0.08, 6)
    b.sphere("head", shroud, head + Vector((0, 0.02, 0.1)), 0.13, 6, scale=(1, 1.2, 1))
    b.sphere("head", cyan, head + Vector((0, -0.1, 0.1)), 0.035, 6)
    for s in ("L", "R"):
        b.cyl("upper_arm." + s, cable, J["upper_arm." + s], J["forearm." + s], 0.03, 0.025, 4)
        b.cyl("forearm." + s, cable, J["forearm." + s], J["hand." + s], 0.025, 0.02, 4)
        b.cone("hand." + s, cyan, J["hand." + s], Vector(J["hand." + s]) + Vector((0, -0.05, -0.25)), 0.025, 4)
        # cables instead of legs
        for k in range(3):
            off = Vector(((k - 1) * 0.05, 0.02 * k, 0))
            b.cyl("thigh." + s, cable, Vector(J["thigh." + s]) + off, Vector(J["shin." + s]) + off * 1.5, 0.02, 0.018, 4)
            b.cyl("shin." + s, cable, Vector(J["shin." + s]) + off * 1.5, Vector(J["foot." + s]) + off * 2.5 + Vector((0, 0.1 * k, 0.1)), 0.018, 0.005, 4)


def wraith():
    J = humanoid_joints(1.0, shoulder=0.2, hip=0.07)
    hover = {"root": [(X, -8)]}
    character("wraith", J, dress_wraith, "claw", extra_anim={"idle": hover})


def moth():
    """Flying rig: body + four wing bones, separate animation set."""
    reset_scene()
    J = {"root": (0, 0, 0), "body": (0, 0, 1.4), "body_end": (0, 0.6, 1.4), "head": (0, -0.05, 1.45), "head_end": (0, -0.3, 1.5)}
    bones = [("root", "root", None, None), ("body", "body", "body_end", "root"), ("head", "head", "head_end", "body")]
    for s, x in (("L", 1), ("R", -1)):
        J["wf." + s] = (x * 0.08, 0.05, 1.45)
        J["wf_end." + s] = (x * 1.1, -0.2, 1.7)
        J["wb." + s] = (x * 0.08, 0.3, 1.4)
        J["wb_end." + s] = (x * 0.8, 0.8, 1.25)
        bones += [("wing_f." + s, "wf." + s, "wf_end." + s, "body"), ("wing_b." + s, "wb." + s, "wb_end." + s, "body")]
    rig = build_armature("moth", J, bones)
    b = Builder()
    chitin, glass = mat("chitin", "#15131a", rough=0.3, metal=0.4), mat("glassdark", "#1a2a30", rough=0.1, metal=0.2)
    wing = mat("mothwing", "#1c1a22", rough=0.6, emit="#2a8fa0", strength=0.18)
    vein, red = glow("cyan", 7), glow("red", 8)
    b.sphere("body", chitin, (0, 0.3, 1.38), 0.13, 8, scale=(0.9, 2.6, 0.9))
    for i in range(5):
        b.torus("body", vein, (0, 0.1 + i * 0.1, 1.38), 0.12 - i * 0.012, 0.008, 10, 3, rot=(math.pi / 2, 0, 0))
    b.sphere("head", chitin, (0, -0.1, 1.46), 0.1, 8)
    b.sphere("head", red, (0.05, -0.17, 1.49), 0.03, 6)
    b.sphere("head", red, (-0.05, -0.17, 1.49), 0.03, 6)
    for s, x in (("L", 1), ("R", -1)):
        b.cone("head", chitin, (x * 0.03, -0.15, 1.52), (x * 0.25, -0.45, 1.8), 0.01, 3)
        for bone, pts in (("wing_f." + s, [(0.08, 0.0), (1.1, -0.25), (1.25, 0.2), (0.6, 0.35)]),
                          ("wing_b." + s, [(0.08, 0.3), (0.6, 0.35), (0.95, 0.8), (0.3, 0.9)])):
            z = 1.44 if "wing_f" in bone else 1.38
            vs = [Vector((x * px, py, z + (px * 0.15 if "wing_f" in bone else -px * 0.1))) for px, py in pts]
            bm = b.bm  # thin two-sided slab so the wing reads from both sides
            top = [bm.verts.new(v + Vector((0, 0, 0.01))) for v in vs]
            bot = [bm.verts.new(v - Vector((0, 0, 0.01))) for v in vs]
            bm.faces.new(top if x > 0 else top[::-1])
            bm.faces.new(bot[::-1] if x > 0 else bot)
            b._finish(top + bot, bone, wing)
            b.cyl(bone, vein, vs[0], vs[2], 0.008, 0.004, 3)
            b.cyl(bone, vein, vs[0], vs[1], 0.006, 0.003, 3)
    # cracked cocoon shards orbiting
    for i in range(5):
        a = i * 1.25
        b.box("body", glass, (math.cos(a) * 0.45, 0.3 + math.sin(a) * 0.4, 1.0 + (i % 2) * 0.2), (0.12, 0.02, 0.2), rot=(a, 0.4, a * 0.5))
    body = b.to_object("moth_mesh")
    bind(body, rig)
    A = Animator(rig)

    def flap(up):
        d = 35 if up else -30
        return {"wing_f.L": [(Y, -d)], "wing_f.R": [(Y, d)], "wing_b.L": [(Y, -d * 0.7)], "wing_b.R": [(Y, d * 0.7)]}
    A.action("idle", [(1, flap(True), {"root": (0, 0, 0.1)}), (11, flap(False), {"root": (0, 0, -0.05)}), (21, flap(True), {"root": (0, 0, 0.1)})])
    A.action("run", [(1, flap(True), {}), (6, flap(False), {}), (11, flap(True), {})])
    lunge = dict(flap(False), body=[(X, -30)])
    A.action("attack", [(1, flap(True), {}), (8, dict(flap(True), body=[(X, 20)]), {"root": (0, 0.2, 0.3)}),
                        (14, lunge, {"root": (0, -0.9, -0.3)}), (24, flap(True), {"root": (0, -0.4, 0)}), (34, flap(True), {})], loop=False)
    A.action("cast", [(1, flap(True), {}), (10, flap(False), {"root": (0, 0, 0.5)}), (20, flap(True), {"root": (0, 0, 0.6)}),
                      (30, flap(False), {"root": (0, 0, 0.5)}), (42, flap(True), {})], loop=False)
    A.action("hit", [(1, flap(True), {}), (4, dict(flap(False), body=[(X, 25)]), {"root": (0, 0.3, 0)}), (16, flap(True), {})], loop=False)
    dead = dict({"wing_f.L": [(Y, 60)], "wing_f.R": [(Y, -60)], "wing_b.L": [(Y, 50)], "wing_b.R": [(Y, -50)]}, body=[(Y, 40)])
    A.action("death", [(1, flap(True), {}), (20, dead, {"root": (0, 0, -0.8)}), (40, dead, {"root": (0, 0, -1.3)}), (60, dead, {"root": (0, 0, -1.3)})], loop=False)
    A.action("guard", [(1, flap(False), {}), (21, flap(False), {})])
    A.action("victory", [(1, flap(True), {}), (11, flap(False), {}), (21, flap(True), {})], loop=False)
    export("moth", [rig, body])


def dress_warden(b, J):
    armor = mat("wardenarmor", "#1a1b20", rough=0.35, metal=0.7)
    conc = M_("concrete", rough=0.9)
    red, cyan, bone = glow("red", 10), glow("cyan", 8), M_("bone", rough=0.4)
    hip, chest, neck, head = (Vector(J[k]) for k in ("hips", "chest", "neck", "head"))
    b.cyl("hips", armor, hip + Vector((0, 0, -0.1)), hip + Vector((0, 0, 0.2)), 0.3, 0.26, 8)
    b.box("hips", conc, hip + Vector((0, 0.05, -0.55)), (0.62, 0.35, 0.9))  # monolithic skirt
    b.cyl("spine", armor, hip + Vector((0, 0, 0.15)), chest, 0.22, 0.34, 8)
    b.box("chest", armor, chest + Vector((0, 0, 0.18)), (0.8, 0.45, 0.5))
    b.box("chest", red, chest + Vector((0, -0.23, 0.2)), (0.05, 0.01, 0.4))
    b.box("chest", red, chest + Vector((0, -0.23, 0.12)), (0.3, 0.01, 0.03))
    for s, x in (("L", 1), ("R", -1)):
        b.box("chest", conc, chest + Vector((x * 0.5, 0, 0.4)), (0.36, 0.5, 0.26), rot=(0, x * 0.25, 0))
        b.cone("chest", armor, chest + Vector((x * 0.55, 0.1, 0.5)), chest + Vector((x * 0.9, 0.5, 1.2)), 0.07, 4)
    b.box("head", bone, Vector(J["head"]) + Vector((0, 0, 0.14)), (0.22, 0.24, 0.32))
    b.box("head", red, Vector(J["head"]) + Vector((0, -0.125, 0.18)), (0.16, 0.01, 0.02))
    for bone_name, R, rot in (("halo", 0.55, (math.radians(-80), 0, 0)), ("halo2", 0.8, (math.radians(-60), math.radians(20), 0))):
        b.torus(bone_name, red if bone_name == "halo" else cyan, Vector(J["head"]) + Vector((0, 0.25, 0.45)), R, 0.025, 32, 4, rot=rot, gaps=6)
    for s in ("L", "R"):
        b.cyl("upper_arm." + s, armor, J["upper_arm." + s], J["forearm." + s], 0.13, 0.11, 6)
        b.cyl("forearm." + s, armor, J["forearm." + s], J["hand." + s], 0.11, 0.14 if s == "R" else 0.1, 6)
        b.cyl("thigh." + s, armor, J["thigh." + s], J["shin." + s], 0.16, 0.13, 6)
        b.cyl("shin." + s, conc, J["shin." + s], J["foot." + s], 0.15, 0.18, 6)
        b.box("foot." + s, conc, Vector(J["foot." + s]) + Vector((0, -0.1, -0.06)), (0.26, 0.45, 0.14))
    b.box("hand.L", bone, Vector(J["hand.L"]) + Vector((0, 0, -0.1)), (0.16, 0.16, 0.22))
    # gravity cannon right arm
    h = Vector(J["hand.R"])
    b.cyl("hand.R", armor, h + Vector((0, 0.1, 0)), h + Vector((0, -0.9, -0.1)), 0.16, 0.2, 8)
    b.torus("hand.R", cyan, h + Vector((0, -0.9, -0.1)), 0.17, 0.02, 12, 3, rot=(math.pi / 2, 0, 0))
    b.sphere("hand.R", cyan, h + Vector((0, -0.85, -0.1)), 0.1, 6)


def warden():
    J = humanoid_joints(1.9, shoulder=0.27, hip=0.11)
    head = Vector(J["head"])
    extra = [("halo", tuple(head + Vector((0, 0.25, 0.45))), tuple(head + Vector((0, 0.25, 0.75))), "head"),
             ("halo2", tuple(head + Vector((0, 0.25, 0.45))), tuple(head + Vector((0, 0.25, 0.75))), "head")]
    character("warden", J, dress_warden, "claw", extra,
              custom=lambda A: A.action("halo_spin", [(1, {"halo": [(Z, 0)], "halo2": [(Y, 0)]}, {}),
                                                      (91, {"halo": [(Z, 180)], "halo2": [(Y, -180)]}, {}),
                                                      (181, {"halo": [(Z, 360)], "halo2": [(Y, -360)]}, {})], only={"halo", "halo2"}))


# ----------------------------------------------------------------------------
# props
# ----------------------------------------------------------------------------

def props():
    reset_scene()
    # save sphere (FFX homage): glowing crystal in a cage of cables
    b = Builder()
    core = mat("savecore", "#000000", emit="#4ff0ff", strength=2.5)
    cage = mat("savecage", "#1c1d22", rough=0.3, metal=0.8)
    b.sphere(None, core, (0, 0, 1.2), 0.45, 12)
    for i in range(6):
        b.torus(None, cage, (0, 0, 1.2), 0.62, 0.015, 24, 3, rot=(math.pi / 2, 0, i * math.pi / 6), gaps=2)
    b.cyl(None, cage, (0, 0, 0), (0, 0, 0.5), 0.5, 0.3, 8)
    b.torus(None, glow("cyan", 5), (0, 0, 0.05), 0.9, 0.02, 32, 3, gaps=3)
    ob = b.to_object("savepoint")
    export("savepoint", [ob])

    reset_scene()
    b = Builder()
    stone = mat("reliquarystone", "#2c2d33", rough=0.9)
    metal = mat("reliquarymetal", "#57504a", rough=0.4, metal=0.8)
    b.box(None, stone, (0, 0, 0.3), (0.9, 0.6, 0.6))
    b.box(None, metal, (0, 0, 0.62), (0.95, 0.65, 0.06))
    b.box(None, glow("amber", 6), (0, -0.31, 0.45), (0.12, 0.02, 0.12))
    ob = b.to_object("chest")
    export("chest", [ob])


# ----------------------------------------------------------------------------
# level: megastructure built from level.json
# ----------------------------------------------------------------------------

def g2b(x, y, z):
    """game (x, y up, z toward camera) -> blender (x, -z as y, y as z)"""
    return Vector((x, -z, y))


def level():
    reset_scene()
    data = json.load(open(LEVEL))
    rng = random.Random(7)
    conc = mat("concrete", "#34363b", rough=0.95)
    conc_dark = mat("concrete_dark", "#1b1c20", rough=0.95)
    metal = mat("girder", "#2a2c31", rough=0.5, metal=0.8)
    cable = mat("cable", "#0e0f12", rough=0.4, metal=0.3)
    seam_c, seam_r = glow("cyan", 3), glow("red", 5)
    lamp = mat("lamp", "#000000", emit="#ffcf8a", strength=4)
    b = Builder()

    def slab(x0, x1, z0, z1, y, thick=1.2, m=conc):
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        b.box(None, m, g2b(cx, y - thick / 2, cz), (x1 - x0, z1 - z0, thick))
        # underside trusses
        b.box(None, conc_dark, g2b(cx, y - thick - 0.5, cz), ((x1 - x0) * 0.8, (z1 - z0) * 0.8, 1.0))

    def rail(ax, az, bx, bz, y, seam=seam_c):
        a, c = g2b(ax, y + 0.5, az), g2b(bx, y + 0.5, bz)
        b.cyl(None, metal, a, c, 0.04, 0.04, 4)
        d = (c - a)
        n = max(1, int(d.length / 2.5))
        for i in range(n + 1):
            p = a + d * (i / n)
            b.cyl(None, metal, p - Vector((0, 0, 0.5)), p, 0.035, 0.035, 4)
        e1, e2 = g2b(ax, y + 0.02, az), g2b(bx, y + 0.02, bz)
        b.cyl(None, seam, e1, e2, 0.025, 0.025, 3)

    for w in data["walk"]:
        x0, x1, z0, z1 = w["x0"], w["x1"], w["z0"], w["z1"]
        if w["type"] == "box":
            y = w["y"]
            slab(x0, x1, z0, z1, y)
            # floor grid seams
            for gx in range(int(x0) + 2, int(x1) - 1, 4):
                b.box(None, conc_dark, g2b(gx, y + 0.005, (z0 + z1) / 2), (0.06, z1 - z0 - 0.2, 0.02))
            is_bridge = (x1 - x0) < 6 or (z1 - z0) < 6
            if is_bridge:
                if (x1 - x0) < (z1 - z0):
                    rail(x0 + 0.1, z0, x0 + 0.1, z1, y)
                    rail(x1 - 0.1, z0, x1 - 0.1, z1, y)
                else:
                    rail(x0, z0 + 0.1, x1, z0 + 0.1, y, seam_r)
                    rail(x0, z1 - 0.1, x1, z1 - 0.1, y, seam_r)
            else:
                for (ax, az, bx, bz) in ((x0, z0, x1, z0), (x0, z1, x1, z1), (x0, z0, x0, z1), (x1, z0, x1, z1)):
                    b.cyl(None, seam_c, g2b(ax, y + 0.03, az), g2b(bx, y + 0.03, bz), 0.03, 0.03, 3)
                # colossal monoliths flanking large platforms
                for k in range(3):
                    mx = x0 + 1.2 if k % 2 == 0 else x1 - 1.2
                    mz = z0 + (z1 - z0) * (0.2 + 0.3 * k)
                    hgt = rng.uniform(5, 11)
                    b.box(None, conc_dark, g2b(mx, y + hgt / 2, mz), (0.8, 1.6, hgt))
                    b.box(None, lamp, g2b(mx - 0.41 * (1 if mx < 0 else -1), y + 2.4, mz), (0.02, 0.3, 0.6))
        else:  # stair ramp
            ya, yb = w["yz0"], w["yz1"]
            steps = int(abs(z1 - z0) / 0.5)
            for i in range(steps):
                t0, t1 = i / steps, (i + 1) / steps
                za, zb = z0 + (z1 - z0) * t0, z0 + (z1 - z0) * t1
                ytop = ya + (yb - ya) * (t0 + t1) / 2 + 0.12
                b.box(None, conc, g2b((x0 + x1) / 2, ytop - 0.5, (za + zb) / 2), (x1 - x0, abs(zb - za) + 0.02, 1.0))
            ymid = (ya + yb) / 2
            b.cyl(None, seam_r, g2b(x0, ya + 0.3, z0), g2b(x0, yb + 0.3, z1), 0.03, 0.03, 3)
            b.cyl(None, seam_r, g2b(x1, ya + 0.3, z0), g2b(x1, yb + 0.3, z1), 0.03, 0.03, 3)
            b.box(None, conc_dark, g2b((x0 + x1) / 2, ymid - 3, (z0 + z1) / 2), (x1 - x0 + 0.6, abs(z1 - z0), 5))

    # arches over bridges / thresholds (Nihei gates)
    for (x, y, z, w_) in ((0, 0, -8, 5.5), (0, 0, -29.5, 5.5), (0, 6, -62, 7), (12, 6, -70, 5.5), (0, 14, -98, 8)):
        h = 9 + w_
        vertical = abs(x) < 1
        for s in (-1, 1):
            off = (s * w_ / 2, 0) if vertical else (0, s * w_ / 2)
            b.box(None, conc_dark, g2b(x + off[0], y + h / 2, z + off[1]), (1.0, 1.0, h))
        b.box(None, conc_dark, g2b(x, y + h, z), (w_ + 2, 1.2, 1.6) if vertical else (1.2, w_ + 2, 1.6))
        b.box(None, seam_r, g2b(x, y + h - 0.85, z + (-0.61 if vertical else 0)), (w_, 0.02, 0.06) if vertical else (0.02, w_, 0.06))

    # colossal pillars that fall away into the abyss
    for p in data["pillars"]:
        r = p["r"]
        b.cyl(None, conc_dark, g2b(p["x"], -120, p["z"]), g2b(p["x"], 140, p["z"]), r, r * 0.9, 8)
        for k in range(rng.randint(3, 6)):  # ring platforms / greebles
            y = rng.uniform(-40, 60)
            b.cyl(None, metal, g2b(p["x"], y, p["z"]), g2b(p["x"], y + rng.uniform(0.4, 2), p["z"]), r * 1.2, r * 1.2, 8)
        for k in range(rng.randint(2, 5)):
            y = rng.uniform(-30, 70)
            ang = rng.uniform(0, 6.28)
            b.box(None, lamp if k == 0 else seam_c, g2b(p["x"] + math.cos(ang) * r * 0.98, y, p["z"] + math.sin(ang) * r * 0.98), (0.2, 0.2, rng.uniform(1, 5)))

    # sagging cables between pillars
    pl = data["pillars"]
    for i in range(len(pl)):
        for j in range(i + 1, len(pl)):
            a, c = pl[i], pl[j]
            if math.hypot(a["x"] - c["x"], a["z"] - c["z"]) > 45 or rng.random() < 0.3:
                continue
            ya, yc = rng.uniform(12, 40), rng.uniform(12, 40)
            sag = rng.uniform(4, 12)
            pts = []
            for k in range(9):
                t = k / 8
                pts.append(g2b(a["x"] + (c["x"] - a["x"]) * t, ya + (yc - ya) * t - sag * math.sin(math.pi * t), a["z"] + (c["z"] - a["z"]) * t))
            for k in range(8):
                b.cyl(None, cable, pts[k], pts[k + 1], 0.12, 0.12, 4)

    # distant megastructure horizon: huge slabs in fog
    for k in range(70):
        ang = rng.uniform(0, math.tau)
        dist = rng.uniform(90, 200)
        x, z = math.cos(ang) * dist, -60 + math.sin(ang) * dist
        w_, d_, h = rng.uniform(8, 30), rng.uniform(8, 30), rng.uniform(60, 260)
        yb = rng.uniform(-150, -60)
        b.box(None, conc_dark, g2b(x, yb + h / 2, z), (w_, d_, h))
        if rng.random() < 0.5:
            for _ in range(rng.randint(1, 4)):
                b.box(None, lamp if rng.random() < 0.3 else seam_c, g2b(x + rng.uniform(-w_ / 2, w_ / 2), rng.uniform(-40, yb + h), z + d_ / 2 + 0.1), (rng.uniform(0.3, 3), 0.1, rng.uniform(0.2, 0.8)))

    ob = b.to_object("spire")
    export("level_spire", [ob])


def arena():
    """Battle stage: ring platform floating in the void."""
    reset_scene()
    rng = random.Random(11)
    conc = mat("concrete", "#34363b", rough=0.95)
    conc_dark = mat("concrete_dark", "#1b1c20", rough=0.95)
    seam_c, seam_r = glow("cyan", 4), glow("red", 5)
    lamp = mat("lamp", "#000000", emit="#ffcf8a", strength=3)
    b = Builder()
    b.cyl(None, conc, (0, 0, -1), (0, 0, 0), 9, 9, 24)
    b.cyl(None, conc_dark, (0, 0, -5), (0, 0, -1), 8, 4, 12)
    b.torus(None, seam_c, (0, 0, 0.02), 8.8, 0.04, 48, 3, gaps=4)
    b.torus(None, seam_r, (0, 0, 0.02), 3.0, 0.03, 32, 3, gaps=6)
    for k in range(12):
        a = k / 12 * math.tau
        h = rng.uniform(2, 9)
        b.box(None, conc_dark, (math.cos(a) * 12, math.sin(a) * 12, h / 2 - 1), (1.2, 1.2, h), rot=(0, 0, a))
        if k % 3 == 0:
            b.box(None, lamp, (math.cos(a) * 11.35, math.sin(a) * 11.35, h * 0.6), (0.2, 0.2, 0.8), rot=(0, 0, a))
    for k in range(30):
        a, d = rng.uniform(0, math.tau), rng.uniform(25, 80)
        h = rng.uniform(30, 120)
        b.box(None, conc_dark, (math.cos(a) * d, math.sin(a) * d, rng.uniform(-60, -20) + h / 2), (rng.uniform(3, 10), rng.uniform(3, 10), h))
    ob = b.to_object("arena")
    export("arena", [ob])


# ----------------------------------------------------------------------------

BUILD = {
    "sable": sable, "wisp": wisp, "hex": hex_,
    "saint": lambda: saint("saint"), "saint_ghost": lambda: saint("saint_ghost", ghost=True),
    "wraith": wraith, "moth": moth, "warden": warden, "props": props, "level": level, "arena": arena,
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    todo = [a for a in argv if a in BUILD] or list(BUILD)
    for name in todo:
        print("building", name)
        BUILD[name]()
