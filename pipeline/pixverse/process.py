"""
PixVerse → game asset processor.

Takes the videos you downloaded from PixVerse (pipeline/pixverse/raw/<id>.mp4)
and turns them into what the three.js game loads from jrpg/assets/pixverse/:

  * character / enemy / fx clips  → green-screen keyed, cropped, lightly
    glitched sprite sheet (.webp with alpha) + poster frame
  * environment clips             → seamless ping-pong loop (.mp4, H.264)
                                    + poster frame
  * index.json                    → what exists, grid sizes, frame rates

Then (unless --no-blender) it runs pipeline/blender/pixverse_cards.py, which
builds animated apparition cards (.glb) from the sheets.

    pip install pillow numpy imageio-ffmpeg
    python3 pipeline/pixverse/process.py              # everything in raw/
    python3 pipeline/pixverse/process.py hero_sable   # just one asset
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import zlib

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "jrpg", "assets", "pixverse")
VIDEO_EXT = (".mp4", ".mov", ".webm", ".mkv")


def ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"ffmpeg failed:\n{' '.join(cmd)}\n{r.stderr[-2000:]}")
    return r


def duration(path):
    import imageio_ffmpeg
    _, secs = imageio_ffmpeg.count_frames_and_secs(path)
    return secs


def find_raw(raw_dir, asset_id):
    for ext in VIDEO_EXT:
        p = os.path.join(raw_dir, asset_id + ext)
        if os.path.exists(p):
            return p
    return None


# --------------------------------------------------------------------------- frames

def extract_frames(src, n, height):
    """n evenly spaced RGB frames, scaled to `height` px."""
    secs = max(0.5, duration(src))
    tmp = tempfile.mkdtemp(prefix="pix_")
    run([ffmpeg(), "-v", "error", "-i", src, "-vf", f"fps={n / secs:.4f},scale=-2:{height}:flags=lanczos",
         "-frames:v", str(n), os.path.join(tmp, "f_%03d.png")])
    files = sorted(f for f in os.listdir(tmp) if f.endswith(".png"))
    frames = [np.asarray(Image.open(os.path.join(tmp, f)).convert("RGB")).astype(np.float32) / 255 for f in files]
    for f in files:
        os.remove(os.path.join(tmp, f))
    os.rmdir(tmp)
    return frames


def chroma_key(rgb, key="green", lo=0.08, hi=0.28):
    """Soft key: alpha from how much the key channel dominates, then despill."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    if key == "green":
        dom = g - np.maximum(r, b)
    else:  # blue
        dom = b - np.maximum(r, g)
    a = 1 - np.clip((dom - lo) / (hi - lo), 0, 1)
    out = rgb.copy()
    if key == "green":
        out[..., 1] = np.minimum(g, np.maximum(r, b) * 1.05)
    else:
        out[..., 2] = np.minimum(b, np.maximum(r, g) * 1.05)
    # shave the 1px fringe
    a = np.minimum(a, np.pad(a, 1, mode="edge")[:-2, 1:-1])
    return np.dstack([out, a])


def glitch(rgba, seed, strength=1.0):
    """Mild house-style pass: RGB split + a few torn rows. The game's shader adds the rest."""
    rng = np.random.default_rng(seed)
    h, w = rgba.shape[:2]
    out = rgba.copy()
    s = max(1, int(2 * strength))
    out[..., 0] = np.roll(rgba[..., 0], s, axis=1)
    out[..., 2] = np.roll(rgba[..., 2], -s, axis=1)
    for _ in range(int(rng.integers(0, 4) * strength)):
        y = int(rng.integers(0, h - 4))
        hh = int(rng.integers(2, max(3, h // 30)))
        out[y:y + hh] = np.roll(out[y:y + hh], int(rng.integers(-w // 20, w // 20)), axis=1)
    return out


def crop_union(frames, pad=6):
    """Crop every frame to the union of their alpha bounds so the sheet cells stay aligned."""
    alpha = np.max(np.stack([f[..., 3] for f in frames]), axis=0)
    ys, xs = np.where(alpha > 0.05)
    if not len(xs):
        return frames
    h, w = alpha.shape
    y0, y1 = max(0, ys.min() - pad), min(h, ys.max() + pad)
    x0, x1 = max(0, xs.min() - pad), min(w, xs.max() + pad)
    return [f[y0:y1, x0:x1] for f in frames]


def to_image(arr):
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8), "RGBA" if arr.shape[2] == 4 else "RGB")


def build_sheet(frames, grid):
    cols, rows = grid
    ch, cw = frames[0].shape[:2]
    sheet = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames[: cols * rows]):
        sheet.paste(to_image(f), ((i % cols) * cw, (i // cols) * ch))
    return sheet, (cw, ch)


# --------------------------------------------------------------------------- per kind

def process_sheet(asset, src, args):
    n = asset.get("frames", 24)
    grid = asset.get("grid", [6, 4])
    height = asset.get("cell_height", 320 if asset["kind"] != "fx" else 256)
    frames = extract_frames(src, n, height)
    if asset.get("chroma", True):
        frames = [chroma_key(f, asset.get("key", "green")) for f in frames]
        frames = crop_union(frames)
    else:
        frames = [np.dstack([f, np.ones(f.shape[:2], np.float32)]) for f in frames]
    if not args.no_glitch:
        frames = [glitch(f, i + zlib.crc32(asset["id"].encode()) % 1000, 0.8 if asset["kind"] != "fx" else 0.4) for i, f in enumerate(frames)]
    sheet, cell = build_sheet(frames, grid)
    name = f"{asset['id']}.webp"
    sheet.save(os.path.join(OUT, name), "WEBP", quality=88, method=6)
    poster = f"{asset['id']}_poster.webp"
    to_image(frames[len(frames) // 3]).save(os.path.join(OUT, poster), "WEBP", quality=90)
    return {"kind": asset["kind"], "sheet": name, "poster": poster, "grid": grid, "frames": len(frames),
            "fps": asset.get("fps", 12), "cell": list(cell)}


def process_video(asset, src, args):
    name = f"{asset['id']}.mp4"
    dst = os.path.join(OUT, name)
    vf = "scale=-2:720:flags=lanczos,fps=24,eq=saturation=0.8:contrast=1.08"
    if asset.get("loop", True):
        # ping-pong so the backdrop loops without a visible cut
        filt = f"[0:v]{vf},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]"
        cmd = [ffmpeg(), "-y", "-v", "error", "-i", src, "-filter_complex", filt, "-map", "[v]"]
    else:
        cmd = [ffmpeg(), "-y", "-v", "error", "-i", src, "-vf", vf]
    run(cmd + ["-an", "-c:v", "libx264", "-crf", "26", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", dst])
    poster = f"{asset['id']}_poster.jpg"
    run([ffmpeg(), "-y", "-v", "error", "-ss", "1", "-i", src, "-frames:v", "1", "-vf", "scale=-2:720", "-q:v", "3", os.path.join(OUT, poster)])
    return {"kind": asset["kind"], "video": name, "poster": poster}


# --------------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="asset ids to process (default: every asset with a raw file)")
    ap.add_argument("--raw", default=os.path.join(HERE, "raw"), help="folder with the downloaded PixVerse videos")
    ap.add_argument("--no-glitch", action="store_true", help="skip the RGB-split / torn-row pass on sheets")
    ap.add_argument("--no-blender", action="store_true", help="skip building apparition cards in Blender")
    args = ap.parse_args()

    manifest = json.load(open(os.path.join(HERE, "manifest.json")))
    os.makedirs(OUT, exist_ok=True)
    index_path = os.path.join(OUT, "index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {"assets": {}}

    done = 0
    for asset in manifest["assets"]:
        if args.ids and asset["id"] not in args.ids:
            continue
        src = find_raw(args.raw, asset["id"])
        if not src:
            print(f"  -  {asset['id']:<22} no raw video yet ({os.path.relpath(args.raw, ROOT)}/{asset['id']}.mp4)")
            continue
        entry = process_video(asset, src, args) if asset["kind"] == "environment" else process_sheet(asset, src, args)
        index["assets"][asset["id"]] = entry
        done += 1
        print(f"  ✓  {asset['id']:<22} → {', '.join(v for k, v in entry.items() if k in ('sheet', 'video', 'poster'))}")

    json.dump(index, open(index_path, "w"), indent=2)
    print(f"processed {done} asset(s); index: {os.path.relpath(index_path, ROOT)}")

    if done and not args.no_blender:
        script = os.path.join(ROOT, "pipeline", "blender", "pixverse_cards.py")
        try:
            import bpy  # noqa: F401  (pip install bpy)
            cmd = [sys.executable, script]
        except ImportError:
            cmd = ["blender", "-b", "-P", script]
        print("building apparition cards:", " ".join(cmd))
        r = subprocess.run(cmd)
        if r.returncode:
            print("  (Blender step failed; the game still works with the raw sheets)")


if __name__ == "__main__":
    main()
