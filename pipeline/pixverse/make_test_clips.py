"""
Generate stand-in clips so the PixVerse pipeline can be tested end to end
before any real generations exist. These are crude procedural placeholders,
NOT game art — write them somewhere disposable and point process.py at it:

    python3 pipeline/pixverse/make_test_clips.py /tmp/pix_test
    python3 pipeline/pixverse/process.py --raw /tmp/pix_test
"""
import json
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
SIZES = {"9:16": (360, 640), "1:1": (480, 480), "16:9": (640, 360)}


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def frame(asset, w, h, t):
    chroma = asset.get("chroma")
    img = Image.new("RGB", (w, h), (0, 255, 0) if chroma else (6, 10, 14))
    d = ImageDraw.Draw(img)
    cx, cy = w / 2, h / 2
    if not chroma:  # corridor of slabs drifting toward the camera
        for i in range(14):
            z = ((i / 14) - t * 0.15) % 1
            s = 1 / (0.15 + z)
            x0, x1 = cx - 60 * s, cx + 60 * s
            shade = int(20 + 40 * (1 - z))
            d.rectangle([x0, cy - 90 * s, x1, cy + 40 * s], outline=(shade, shade + 30, shade + 40), width=2)
        d.ellipse([w * 0.7, h * 0.1, w * 0.78, h * 0.1 + w * 0.08], fill=(200, 205, 210))
    else:  # a swaying dark figure with a glowing halo
        sway = math.sin(t * 2 * math.pi) * 8
        d.polygon([(cx - 40 + sway, cy + h * 0.35), (cx + 40 + sway, cy + h * 0.35), (cx + 18 + sway * 0.5, cy - h * 0.15), (cx - 18 + sway * 0.5, cy - h * 0.15)], fill=(20, 18, 24))
        d.ellipse([cx - 22 + sway * 0.3, cy - h * 0.25, cx + 22 + sway * 0.3, cy - h * 0.13], fill=(200, 190, 180))
        r = 40 + 4 * math.sin(t * 9)
        d.ellipse([cx - r, cy - h * 0.34 - 10, cx + r, cy - h * 0.34 + 10], outline=(255, 42, 74), width=4)
    a = np.asarray(img).copy()
    rows = np.random.default_rng(int(t * 100)).integers(0, h, 3)
    for y in rows:
        a[y:y + 3] = np.roll(a[y:y + 3], 12, axis=1)
    return Image.fromarray(a)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/pix_test"
    os.makedirs(out, exist_ok=True)
    manifest = json.load(open(os.path.join(HERE, "manifest.json")))
    for asset in manifest["assets"]:
        w, h = SIZES.get(asset.get("aspect_ratio", "16:9"), (640, 360))
        fps, secs = 24, 3
        p = subprocess.Popen([ffmpeg(), "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{w}x{h}", "-r", str(fps),
                              "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", os.path.join(out, asset["id"] + ".mp4")], stdin=subprocess.PIPE)
        for i in range(fps * secs):
            p.stdin.write(frame(asset, w, h, i / (fps * secs)).tobytes())
        p.stdin.close()
        p.wait()
        print("  test clip:", asset["id"])


if __name__ == "__main__":
    main()
