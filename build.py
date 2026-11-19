#!/usr/bin/env python3
"""Build the single-file app: inlines the converter, the sample document and the PDF fonts
into src/index.src.html and writes index.html at the repo root.

Usage: python3 build.py
"""
import base64, json, pathlib

root = pathlib.Path(__file__).resolve().parent
src = root / "src"

page = (src / "index.src.html").read_text(encoding="utf-8")
fonts = {f.name: base64.b64encode(f.read_bytes()).decode() for f in sorted((src / "fonts").glob("*.ttf"))}
page = page.replace("/*FONTS*/", "window.MDPRESS_FONTS = " + json.dumps(fonts) + ";")
page = page.replace("/*CONVERT*/", (src / "convert.js").read_text(encoding="utf-8"))
sample = json.dumps((src / "sample.md").read_text(encoding="utf-8")).replace("</", "<\\/")
page = page.replace('/*SAMPLE*/""', sample)

html = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
    'body{margin:0;font:14px system-ui,-apple-system,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n'
    "</head>\n<body>\n" + page + "\n</body>\n</html>\n"
)
(root / "index.html").write_text(html, encoding="utf-8")
print(f"Wrote index.html ({len(html.encode()) / 1e6:.2f} MB, {len(fonts)} fonts)")
