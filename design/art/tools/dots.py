#!/usr/bin/env python3
"""Tečky na kostkách 1–10 pro počítání: složí mřížky dots-* z předlohy, kterou nakreslil model.

  python3 design/art/tools/dots.py      # originals/pics/dots-base.png → originals/pics/dots-<n>.png

Model počty teček neudrží, proto kreslí jen prázdnou stěnu kostky a tři puntíky
(`pics-dots-base` v prompts.json) a rozmístění dělá tenhle skript podle klasické hrací kostky.
7–10 jsou dvě kostky vedle sebe (5+2, 4+4, 5+4, 5+5). Výstup je mřížka 2×2 na purpurové jako
od modelu, takže ji dál zpracuje process.py stejně jako ostatní slovník.
"""
import json
import random
import sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from process import ART, key_magenta, split_by_components  # noqa: E402

CANVAS = 1024
CELL = CANVAS // 2
MAGENTA = (255, 0, 255)
PIPS = {"TL": (.26, .26), "TR": (.74, .26), "ML": (.26, .5), "C": (.5, .5), "MR": (.74, .5),
        "BL": (.26, .74), "BR": (.74, .74)}
FACES = {1: ["C"], 2: ["TR", "BL"], 3: ["TR", "C", "BL"], 4: ["TL", "TR", "BL", "BR"],
         5: ["TL", "TR", "C", "BL", "BR"], 6: ["TL", "ML", "BL", "TR", "MR", "BR"]}

def crop(rgba):
    box = rgba.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    return rgba.crop(box) if box else rgba

def sprites():
    base = key_magenta(Image.open(ART / "originals" / "pics" / "dots-base.png"))
    parts = [crop(split_by_components(base, q)) for q in range(4)]
    return parts[0], parts[1:]

def face(tile, dots, n, side, rng):
    """Jedna stěna kostky s n puntíky, čtverec side×side."""
    im = tile.resize((side, side), Image.LANCZOS)
    d = round(side * 0.2)
    for pos in FACES[n]:
        dot = crop(rng.choice(dots).rotate(rng.uniform(0, 360), Image.BICUBIC, expand=True)).resize((d, d), Image.LANCZOS)
        x, y = PIPS[pos]
        x += rng.uniform(-.012, .012); y += rng.uniform(-.012, .012)
        im.alpha_composite(dot, (round(x * side - d / 2), round(y * side - d / 2)))
    return im

def cell(tile, dots, spec, rng):
    """`dots:3` = jedna kostka, `dots:5+2` = dvě vedle sebe. Vrací průhlednou buňku CELL×CELL."""
    counts = [int(c) for c in spec.removeprefix("dots:").split("+")]
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    if len(counts) == 1:
        side = round(CELL * 0.62)
        out.alpha_composite(face(tile, dots, counts[0], side, rng), ((CELL - side) // 2,) * 2)
    else:
        side, gap = round(CELL * 0.45), round(CELL * 0.03)
        x0 = (CELL - 2 * side - gap) // 2; y = (CELL - side) // 2
        for i, n in enumerate(counts):
            out.alpha_composite(face(tile, dots, n, side, rng), (x0 + i * (side + gap), y))
    return out

def main():
    tile, dots = sprites()
    pics = json.loads((ART / "pics.json").read_text(encoding="utf-8"))
    rng = random.Random(7)
    for g in pics:
        if g.get("compose") != "dots":
            continue
        grid = Image.new("RGBA", (CANVAS, CANVAS), MAGENTA + (255,))
        for q, it in enumerate(g["items"]):
            grid.alpha_composite(cell(tile, dots, it["subject"], rng), ((q % 2) * CELL, (q // 2) * CELL))
        dest = ART / "originals" / "pics" / f"{g['grid']}.png"
        grid.convert("RGB").save(dest)
        print("OK", dest.relative_to(ART))

if __name__ == "__main__":
    main()
