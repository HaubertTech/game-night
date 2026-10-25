#!/usr/bin/env python3
"""Dávka obrázků z design/art/prompts.json přes tools/gen-image.sh (Codex image_gen).

  python3 tools/gen-batch.py [-j 3] [--only id1 id2]   # chybějící obrázky
  FORCE=1 python3 tools/gen-batch.py --only hero         # přegenerovat

Skládání promptu podle `kind`: sheet/scene = style + prompt + notext,
grid = grid + magenta + style + prompt + notext (2×2 na purpurové, rozřeže tools/process.py).
Úlohy s `refs` počkají, až referenční soubor existuje.
"""
import argparse, json, os, subprocess, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ART = Path(__file__).resolve().parent.parent
GEN = ART / "tools" / "gen-image.sh"

def build(cfg, j):
    parts = []
    if j["kind"] == "grid":
        parts += [cfg["grid"], cfg["magenta"]]
    parts += [cfg["style"], j["prompt"], cfg["notext"]]
    return "\n".join(parts)

def run(cfg, j):
    out = ART / j["out"]
    if out.exists() and not os.environ.get("FORCE"):
        return f"skip {j['id']}"
    refs = [ART / r for r in j.get("refs", [])]
    for _ in range(120):
        if all(r.exists() for r in refs): break
        time.sleep(10)
    t = time.time()
    r = subprocess.run([str(GEN), str(out), build(cfg, j)] + [str(p) for p in refs],
                       text=True, capture_output=True)
    return f"{(r.stdout or r.stderr).strip()} ({int(time.time()-t)} s)"

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("-j", type=int, default=3); ap.add_argument("--only", nargs="*")
    a = ap.parse_args()
    cfg = json.loads((ART / "prompts.json").read_text(encoding="utf-8"))
    jobs = [j for j in cfg["jobs"] if not a.only or j["id"] in a.only]
    with ThreadPoolExecutor(a.j) as ex:
        for msg in ex.map(lambda j: run(cfg, j), jobs):
            print(msg, flush=True)
