"""
PixVerse sheets → Blender apparition cards (.glb).

For every character/enemy sprite sheet listed in jrpg/assets/pixverse/index.json,
build a camera-facing card in Blender: a plane UV-mapped to the first sheet
cell, the sheet embedded as its texture, and a baked "apparition" animation
(slow levitation, breathing scale, a sway, and a glitch-twitch every few
seconds). The game plays the baked animation with an AnimationMixer and steps
the sheet frames by offsetting the texture — grid/fps travel in the node extras.

Run after process.py (it calls this automatically):

    python3 pipeline/blender/pixverse_cards.py
    blender -b -P pipeline/blender/pixverse_cards.py
"""
import json
import math
import os

import bpy  # noqa: I001 (bpy must load before bmesh/mathutils)
import bmesh

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PIX = os.path.join(ROOT, "jrpg", "assets", "pixverse")
FPS = 30


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS


def card(asset_id, entry):
    reset()
    cols, rows = entry["grid"]
    cw, ch = entry.get("cell", [1, 1])
    height = 3.4 if entry["kind"] == "enemy" else 2.4
    width = height * cw / ch

    me = bpy.data.meshes.new(asset_id)
    bm = bmesh.new()
    # plane standing on the ground, facing -Y (glTF +Z, toward the camera)
    vs = [bm.verts.new(p) for p in ((-width / 2, 0, 0), (width / 2, 0, 0), (width / 2, 0, height), (-width / 2, 0, height))]
    f = bm.faces.new(vs)
    uv = bm.loops.layers.uv.new("UVMap")
    # first cell = top-left of the sheet (Blender UV origin is bottom-left)
    u1, v0 = 1 / cols, 1 - 1 / rows
    for loop, (u, v) in zip(f.loops, ((0, v0), (u1, v0), (u1, 1), (0, 1))):
        loop[uv].uv = (u, v)
    bm.to_mesh(me)
    bm.free()

    ob = bpy.data.objects.new(asset_id + "_card", me)
    bpy.context.scene.collection.objects.link(ob)

    m = bpy.data.materials.new(asset_id + "_sheet")
    if not m.node_tree:
        m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(os.path.join(PIX, entry["sheet"]))
    tex.interpolation = "Closest"
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.6
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    me.materials.append(m)

    # extras read by the game
    ob["pix_id"] = asset_id
    ob["pix_grid"] = [cols, rows]
    ob["pix_frames"] = entry["frames"]
    ob["pix_fps"] = entry.get("fps", 12)

    # baked apparition motion (4 s loop)
    ob.animation_data_create()
    act = bpy.data.actions.new("apparition")
    ob.animation_data.action = act
    loop = 4 * FPS
    for fr in range(0, loop + 1, 5):
        t = fr / loop
        ob.location = (math.sin(t * 2 * math.pi) * 0.08, 0, 0.25 + math.sin(t * 4 * math.pi) * 0.12)
        ob.rotation_euler = (0, math.sin(t * 2 * math.pi) * 0.04, math.sin(t * 2 * math.pi + 1) * 0.05)
        s = 1 + math.sin(t * 4 * math.pi + 0.5) * 0.025
        ob.scale = (s, s, s)
        ob.keyframe_insert("location", frame=fr + 1)
        ob.keyframe_insert("rotation_euler", frame=fr + 1)
        ob.keyframe_insert("scale", frame=fr + 1)
    # glitch twitch: a two-frame horizontal jump + squash
    for fr, dx, sx in ((58, 0.0, 1.0), (60, 0.35, 1.25), (62, -0.2, 0.85), (64, 0.0, 1.0)):
        ob.location = (dx, 0, 0.25)
        ob.scale = (sx, 1, 1 / sx)
        ob.keyframe_insert("location", frame=fr)
        ob.keyframe_insert("scale", frame=fr)

    os.makedirs(os.path.join(PIX, "cards"), exist_ok=True)
    out = os.path.join(PIX, "cards", asset_id + ".glb")
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    kw = dict(filepath=out, export_format="GLB", use_selection=True, export_animations=True,
              export_animation_mode="ACTIONS", export_extras=True, export_yup=True)
    try:
        bpy.ops.export_scene.gltf(export_image_format="WEBP", **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print("  card:", os.path.relpath(out, ROOT))
    return "cards/" + asset_id + ".glb"


def main():
    index_path = os.path.join(PIX, "index.json")
    if not os.path.exists(index_path):
        print("no jrpg/assets/pixverse/index.json yet — run pipeline/pixverse/process.py first")
        return
    index = json.load(open(index_path))
    for asset_id, entry in index["assets"].items():
        if entry.get("sheet") and entry["kind"] in ("enemy", "character"):
            entry["card"] = card(asset_id, entry)
    json.dump(index, open(index_path, "w"), indent=2)


if __name__ == "__main__":
    main()
