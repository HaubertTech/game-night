#!/usr/bin/env python3
"""Kontaktní arch všech obrázků ze static/art/manifest.json → design/art/contact-sheet.png.
Průhledné obrázky leží na šachovnici (tady je to záměr: ukazuje alfu) a pod nimi je náhled 64 px.

  python3 design/art/tools/contact-sheet.py                     # všechno → contact-sheet.png
  python3 design/art/tools/contact-sheet.py pics.tecky pics.dum  # jen klíče s těmito prefixy
                                                                  # → contact-sheet-part.png
"""
import sys
import json
from pathlib import Path
from PIL import Image, ImageDraw

ART = Path(__file__).resolve().parent.parent
STATIC = ART.parent.parent / "static" / "art"
CELL = 260

def checker(size, s=16):
    im = Image.new("RGBA", size, (230, 230, 230, 255)); d = ImageDraw.Draw(im)
    for y in range(0, size[1], s):
        for x in range(0, size[0], s):
            if (x // s + y // s) % 2: d.rectangle([x, y, x + s - 1, y + s - 1], fill=(200, 200, 200, 255))
    return im

def main(prefixes=()):
    man = json.loads((STATIC / "manifest.json").read_text(encoding="utf-8"))
    keys = [k for k in man if not prefixes or k.startswith(tuple(prefixes))]
    cols = 8; rows = (len(keys) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * CELL, rows * (CELL + 40)), (244, 238, 226))
    d = ImageDraw.Draw(sheet)
    for i, k in enumerate(keys):
        e = man[k]; im = Image.open(STATIC / e["path"].removeprefix("/art/")).convert("RGBA")
        im.thumbnail((CELL - 20, CELL - 90 if e["transparent"] else CELL - 20))
        x, y = (i % cols) * CELL + 10, (i // cols) * (CELL + 40) + 10
        bg = checker(im.size) if e["transparent"] else Image.new("RGBA", im.size)
        bg.alpha_composite(im); sheet.paste(bg.convert("RGB"), (x, y))
        if e["transparent"]:
            small = Image.open(STATIC / e["path"].removeprefix("/art/")).convert("RGBA").resize((64, 64), Image.LANCZOS)
            pb = Image.new("RGBA", (64, 64), (251, 248, 241, 255)); pb.alpha_composite(small)
            sheet.paste(pb.convert("RGB"), (x, y + CELL - 85))
        d.text((x, y + CELL - 15), k, fill=(59, 51, 43))
    name = "contact-sheet-part.png" if prefixes else "contact-sheet.png"
    sheet.save(ART / name)
    print(name, len(keys))

if __name__ == "__main__":
    main(sys.argv[1:])
