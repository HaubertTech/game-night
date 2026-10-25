#!/usr/bin/env python3
"""Originály (design/art/originals) → web (static/art/<skupina>/<název>.webp) + manifest.json.

  python3 design/art/tools/process.py             # vše z originálů
  python3 design/art/tools/process.py --variants  # jen menší varianty (srcset) ze static/art

Mřížky 2×2 na purpurové #FF00FF: rozřízne na kvadranty, odklíčuje purpurovou do alfy
(s potlačením purpurového lemu), ořízne na obsah, vycentruje do čtverce 512×512.
Scény: ořez na cílový poměr stran + zmenšení. Popisy a alt texty: ITEMS níže.
"""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageFilter

ART = Path(__file__).resolve().parent.parent
ROOT = ART.parent.parent
STATIC = ROOT / "static" / "art"
Q = 82

# klíč: (skupina, název, zdroj, kvadrant|None, cílová velikost, alt)
ITEMS = [
  ("mascot", "sova-mava", "mascot/mascot-poses.png", 0, (512, 512), "Sova Moderátorka v pletené vestě mává na pozdrav"),
  ("mascot", "sova-otazka", "mascot/mascot-poses.png", 1, (512, 512), "Sova Moderátorka drží kartičku s otázkou"),
  ("mascot", "sova-slavi", "mascot/mascot-poses.png", 2, (512, 512), "Sova Moderátorka radostně slaví"),
  ("mascot", "sova-premysli", "mascot/mascot-poses.png", 3, (512, 512), "Sova Moderátorka přemýšlí"),
  ("hero", "uvod", "hero/hero.png", None, (1920, 1080), "Rodina večer u stolu hraje karty a kvíz, na kredenci sedí sova"),
  ("cards", "kvizovna", "cards/kvizovna.png", None, (1200, 900), "Hospodský kvíz: sova za výčepem čte otázku, týmy píšou odpovědi"),
  ("cards", "rekni-ukaz-nakresli", "cards/rekni-ukaz-nakresli.png", None, (1200, 900), "Rodina v obýváku předvádí, kreslí a hádá"),
  ("cards", "mesto-jmeno-zvire", "cards/mesto-jmeno-zvire.png", None, (1200, 900), "Rodina u stolu píše Město, jméno, zvíře"),
  ("cards", "prsi", "cards/prsi.png", None, (1200, 900), "Děda s dětmi hraje Prší pod pergolou, venku prší"),
  ("cards", "zoliky", "cards/zoliky.png", None, (1200, 900), "Dospělí na chatě hrají žolíky, teta drží žolíka"),
  ("cards", "liga", "cards/liga.png", None, (1200, 900), "Nástěnka rodinné ligy s výsledky, jezevčík připíná nový list"),
  ("cards", "sachy", "cards/sachy.png", None, (1200, 900), "Děda s vnukem hrají šachy v obýváku, sova přihlíží"),
  ("cards", "trenink", "cards/trenink.png", None, (1200, 900), "Sova učí holčičku karty u kuchyňského stolu"),
  ("cards", "vecery", "cards/vecery.png", None, (1200, 900), "Večerní stůl po hře: zápisník, kalendář a karty"),
  ("cards", "hraci", "cards/hraci.png", None, (1200, 900), "Nástěnka s portréty zvířátek-hráčů"),
  ("cards", "nastaveni", "cards/nastaveni.png", None, (1200, 900), "Domácí kout u dveří s klíči a bločkem"),
  ("cards", "clovece", "cards/clovece.png", None, (1200, 900), "Rodina u kuchyňského stolu hraje Člověče, nezlob se, sova dělá rozhodčí"),
  ("levels", "hospoda", "grids/levels.png", 0, (512, 512), "Hospoda – úroveň pro dospělé: pivo a odpovědní lístek"),
  ("levels", "lavice", "grids/levels.png", 1, (512, 512), "Lavice – úroveň pro školáky: školní lavice se sešitem"),
  ("levels", "piskoviste", "grids/levels.png", 2, (512, 512), "Pískoviště – úroveň pro předškoláky: kyblík a bábovička"),
  ("levels", "vsichni", "grids/levels.png", 3, (512, 512), "Stůl se židlemi pro velké i malé – hraje celá rodina"),
  ("themes", "priroda-zvirata", "grids/themes-1.png", 0, (512, 512), "Příroda a zvířata: ježek pod dubovým listem"),
  ("themes", "cesko-svet", "grids/themes-1.png", 1, (512, 512), "Česko a svět: glóbus a hrad na kopci"),
  ("themes", "lide-telo-veda", "grids/themes-1.png", 2, (512, 512), "Lidé, tělo a věda: lupa nad srdcem a baňka"),
  ("themes", "pohadky-film-hudba", "grids/themes-1.png", 3, (512, 512), "Pohádky, film a hudba: koruna, kamera a noty"),
  ("themes", "sport-hry", "grids/themes-2.png", 0, (512, 512), "Sport a hry: míč, kostka a hokejka"),
  ("themes", "jidlo-piti", "grids/themes-2.png", 1, (512, 512), "Jídlo a pití: chleba, hrnek a knedlík"),
  ("themes", "cisla-logika", "grids/themes-2.png", 2, (512, 512), "Čísla a logika: počítadlo a hlavolam"),
  ("themes", "slova-jazyk", "grids/themes-2.png", 3, (512, 512), "Slova a jazyk: kniha, pero a bublina"),
  ("themes", "dejiny-vynalezy", "grids/themes-3.png", 0, (512, 512), "Dějiny a vynálezy: rytířská helma, žárovka a ozubené kolo"),
  ("ui", "karticky-otazek", "grids/themes-3.png", 1, (512, 512), "Svazek kartiček s otázkami"),
  ("ui", "presypaci-hodiny", "grids/themes-3.png", 2, (512, 512), "Přesýpací hodiny"),
  ("ui", "zvonek", "grids/themes-3.png", 3, (512, 512), "Mosazný zvonek"),
]
AVATARS = [("liska", "Liška"), ("jezek", "Ježek"), ("medved", "Medvěd"), ("zajic", "Zajíc"),
           ("kocour", "Kocour"), ("koza", "Koza"), ("mys", "Myš"), ("zaba", "Žába"),
           ("veverka", "Veverka"), ("jezevec", "Jezevec"), ("kos", "Kos"), ("kapr", "Kapr"),
           ("krava", "Kráva"), ("cap", "Čáp"), ("vydra", "Vydra"), ("ovce", "Ovce")]
for i, (k, n) in enumerate(AVATARS):
    ITEMS.append(("avatars", k, f"grids/avatars-{i//4+1}.png", i % 4, (512, 512), f"Avatar hráče: {n}"))
ITEMS += [
  ("rewards", "vitez-vecera", "grids/rewards-1.png", 0, (512, 512), "Vítěz večera: pohár s vavřínem a měsícem"),
  ("rewards", "sampion-sezony", "grids/rewards-1.png", 1, (512, 512), "Šampion sezóny: velký pohár s věncem"),
  ("rewards", "misto-1", "grids/rewards-1.png", 2, (512, 512), "1. místo: zlatá medaile"),
  ("rewards", "misto-2", "grids/rewards-1.png", 3, (512, 512), "2. místo: stříbrná medaile"),
  ("rewards", "misto-3", "grids/rewards-3.png", 0, (512, 512), "3. místo: bronzová medaile"),
  ("rewards", "serie", "grids/rewards-3.png", 1, (512, 512), "Série správných odpovědí: tři stoupající hvězdy"),
  ("rewards", "prvni-vecer", "grids/rewards-3.png", 2, (512, 512), "První odehraný večer: nový balíček karet s mašlí"),
  ("rewards", "nejlepsi-kreslir", "grids/rewards-3.png", 3, (512, 512), "Nejlepší kreslíř: tužka a křída ve vavřínu"),
  ("empty", "zadne-vecery", "grids/rewards-2.png", 2, (512, 512), "Zatím žádné večery: prázdný stůl a spící kočka"),
  ("empty", "zadni-hraci", "grids/rewards-2.png", 3, (512, 512), "Zatím žádní hráči: prázdné židle"),
  ("env", "lobby-tv", "env/lobby-tv.png", None, (1920, 1080), "Klidné pozadí čekárny na televizi se sovou na kredenci"),
  ("env", "lobby-mobil", "env/lobby-mobile.png", None, (1080, 1920), "Pozadí čekárny na mobilu: okno s večerní oblohou a spícím jezevčíkem"),
]

def key_magenta(im):
    """Purpurová #FF00FF → alfa, bez numpy (jen PIL)."""
    r, g, b = im.convert("RGB").split()
    m = ImageChops.subtract(ImageChops.darker(r, b), g)  # o kolik R i B převyšují G
    alpha = m.point(lambda v: 255 if v <= 60 else (0 if v >= 150 else int(255 - (v - 60) * 255 / 90)))
    alpha = alpha.filter(ImageFilter.MedianFilter(3))
    # despill: kde je znát purpurový nádech (R i B nad G o víc než 12), stáhni R a B na G + 12.
    # Teplá paleta kresby (hlína, šalvěj, šedomodrá) tuhle podmínku nesplní, takže se jí to nedotkne.
    cap = g.point(lambda v: min(255, v + 12))
    edge = m.point(lambda v: 255 if v > 12 else 0)
    r2 = Image.composite(ImageChops.darker(r, cap), r, edge)
    b2 = Image.composite(ImageChops.darker(b, cap), b, edge)
    alpha = alpha.filter(ImageFilter.MinFilter(3))  # o pixel dovnitř: lem zmizí, kontura zůstane
    res = Image.merge("RGBA", (r2, g, b2, alpha))
    return res

def quadrant(im, q):
    w, h = im.size
    x, y = (q % 2) * w // 2, (q // 2) * h // 2
    return im.crop((x, y, x + w // 2, y + h // 2))

def clean_components(rgba, grid=160, min_share=0.002):
    """Odstraní ze čtvrtiny cizí kusy: komponenty dotýkající se okraje (přesah sousední
    buňky mřížky) a drobné tečky. Konfety uvnitř buňky zůstanou."""
    a = rgba.getchannel("A")
    small = a.resize((grid, grid), Image.BILINEAR).point(lambda v: 1 if v > 40 else 0)
    px = list(small.getdata()); seen = [0] * len(px); keep = [0] * len(px)
    total = sum(px) or 1
    for start in range(len(px)):
        if not px[start] or seen[start]: continue
        stack = [start]; seen[start] = 1; comp = []; edge = False
        while stack:
            i = stack.pop(); comp.append(i); x, y = i % grid, i // grid
            if x in (0, grid - 1) or y in (0, grid - 1): edge = True
            for nx, ny in ((x+1,y),(x-1,y),(x,y+1),(x,y-1),(x+1,y+1),(x-1,y-1),(x+1,y-1),(x-1,y+1)):
                if 0 <= nx < grid and 0 <= ny < grid:
                    j = ny * grid + nx
                    if px[j] and not seen[j]: seen[j] = 1; stack.append(j)
        big = len(comp) / total
        if (edge and big < 0.25) or big < min_share: continue
        for i in comp: keep[i] = 255
    mask = Image.new("L", (grid, grid)); mask.putdata(keep)
    mask = mask.filter(ImageFilter.MaxFilter(5)).resize(rgba.size, Image.BILINEAR)
    rgba.putalpha(ImageChops.multiply(a, mask))
    return rgba

def fit_square(rgba, size, pad=0.06):
    rgba = clean_components(rgba)
    bbox = rgba.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox: rgba = rgba.crop(bbox)
    w, h = rgba.size
    side = int(max(w, h) * (1 + 2 * pad))
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(rgba, ((side - w) // 2, (side - h) // 2))
    return canvas.resize(size, Image.LANCZOS)

def fit_cover(im, size):
    tw, th = size; w, h = im.size
    s = max(tw / w, th / h)
    im = im.convert("RGB").resize((round(w * s), round(h * s)), Image.LANCZOS)
    w, h = im.size
    return im.crop(((w - tw) // 2, (h - th) // 2, (w - tw) // 2 + tw, (h - th) // 2 + th))

# Menší varianty pro srcset: ikony (průhledné čtverce) a scény. Malé obrazovky a malé ikony
# tak nestahují 512px nebo 1200px originál.
VARIANT_WIDTHS = {"square": (128, 256), "cards": (600,), "hero": (960,), "env": (540, 960)}

def variant_widths(group, transparent):
    if transparent:
        return VARIANT_WIDTHS["square"]
    return VARIANT_WIDTHS.get(group, ())

def add_variants(manifest):
    for entry in manifest.values():
        src = STATIC.parent / entry["path"].lstrip("/")
        widths = [w for w in variant_widths(entry["group"], entry["transparent"]) if w < entry["width"]]
        variants = []
        with Image.open(src) as im:
            for w in widths:
                h = round(entry["height"] * w / entry["width"])
                dest = src.with_name(f"{src.stem}-{w}.webp")
                im.resize((w, h), Image.LANCZOS).save(dest, "WEBP", quality=Q, method=6)
                variants.append({"width": w, "path": entry["path"].replace(".webp", f"-{w}.webp")})
        if variants:
            entry["variants"] = variants
        else:
            entry.pop("variants", None)

def write_manifest(manifest):
    (STATIC / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def variants_only():
    """Jen přegeneruje menší varianty ze static/art bez sahání na originály."""
    manifest = json.loads((STATIC / "manifest.json").read_text(encoding="utf-8"))
    add_variants(manifest)
    write_manifest(manifest)
    print(len(manifest), "obrázků, varianty hotové")

def main():
    manifest = {}
    for group, name, src, q, size, alt in ITEMS:
        p = (ART / "originals" / src).resolve()
        if not p.exists():
            print("chybí", src); continue
        im = Image.open(p)
        if q is None:
            out = fit_cover(im, size); transparent = False
        else:
            out = fit_square(key_magenta(quadrant(im, q)), size); transparent = True
        dest = STATIC / group / f"{name}.webp"
        dest.parent.mkdir(parents=True, exist_ok=True)
        out.save(dest, "WEBP", quality=Q, method=6)
        manifest[f"{group}.{name}"] = {"path": f"/art/{group}/{name}.webp", "width": size[0], "height": size[1],
                                       "alt": alt, "group": group, "transparent": transparent}
    add_variants(manifest)
    write_manifest(manifest)
    print(len(manifest), "obrázků")

if __name__ == "__main__":
    import sys
    variants_only() if "--variants" in sys.argv else main()
