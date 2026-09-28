"""
Package jrpg/ as a single-page artifact bundle (claude.ai Artifacts, or any
host that can't serve .glb files): the GLB models are embedded base64 in
js/models.js and index.html is reduced to page content (no doctype/head).

    python3 pipeline/build_artifact.py OUT_DIR
"""
import base64
import os
import re
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SRC = os.path.join(ROOT, "jrpg")


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "dist-artifact")
    shutil.rmtree(out, ignore_errors=True)
    for d in ("js", "css", "data", "vendor"):
        shutil.copytree(os.path.join(SRC, d), os.path.join(out, d))
    models = os.path.join(SRC, "assets", "models")
    lines = ["window.VESTIGE_MODELS = {"]
    for f in sorted(os.listdir(models)):
        if f.endswith(".glb"):
            data = base64.b64encode(open(os.path.join(models, f), "rb").read()).decode()
            lines.append(f'  "{f[:-4]}": "{data}",')
    lines.append("};")
    open(os.path.join(out, "js", "models.js"), "w").write("\n".join(lines))

    html = open(os.path.join(SRC, "index.html")).read()
    head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
    body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
    head = re.sub(r'\s*<meta charset[^>]*>|\s*<meta name="viewport"[^>]*>', "", head)
    body = body.replace('<script type="module" src="js/main.js"></script>',
                        '<script src="js/models.js"></script>\n  <script type="module" src="js/main.js"></script>')
    style = "<style>:root { color-scheme: dark; } html, body { background: #050608; }</style>"
    open(os.path.join(out, "index.html"), "w").write(head.strip() + "\n  " + style + "\n" + body)
    print("artifact bundle:", out)


if __name__ == "__main__":
    main()
