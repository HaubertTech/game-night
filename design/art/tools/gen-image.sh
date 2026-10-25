#!/usr/bin/env bash
# Vygeneruje jeden obrázek přes Codex CLI (vestavěný image_gen na přihlášení ChatGPT).
#   gen-image.sh <výstup.png> "<zadání anglicky>" [vstupní obrázky…]
# Zadání musí stát PŘED -i (codex -i bere víc souborů). < /dev/null brání visení na stdin.
set -u
out="$1"; prompt="$2"; shift 2
args=()
for f in "$@"; do args+=(-i "$(realpath "$f")"); done
dir="$(realpath -m "$(dirname "$out")")"; name="$(basename "$out")"
mkdir -p "$dir"
if [ "${REF_KIND:-model}" = "style" ]; then
  refnote="Attached images (if any) are STYLE REFERENCES from our own illustration set: match their drawing style, ink line, watercolor texture and palette exactly, but do NOT copy their subjects."
else
  refnote="Attached images (if any) are character model sheets of our own original characters: keep their look identical (species, face, colors, clothing) and the same drawing style."
fi
full="Use the built-in image generation tool (image_gen). Generate exactly ONE image according to the brief below. $refnote Copy the resulting PNG from where the tool saved it into the current directory as $name (overwrite if it exists). Do nothing else.

BRIEF:
$prompt"
codex exec --skip-git-repo-check -C "$dir" "$full" "${args[@]}" < /dev/null > "$dir/.log-$name.txt" 2>&1
if test -f "$dir/$name"; then
  echo "OK $out"; rm -f "$dir/.log-$name.txt"
  python3 - "$dir/$name" "$prompt" "$@" <<'PY'
import json, sys
from datetime import date
from PIL import Image
out, prompt, *inputs = sys.argv[1:]
size = list(Image.open(out).size)
json.dump({"file": out.rsplit("/",1)[-1], "prompt": prompt, "inputs": [i.rsplit("/",1)[-1] for i in inputs],
           "size": size, "generated": date.today().isoformat(), "engine": "codex image_gen"},
          open(out.rsplit(".",1)[0] + ".meta.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
PY
else
  echo "FAIL $out"; tail -5 "$dir/.log-$name.txt"
fi
