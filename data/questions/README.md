# Otázky

Jeden soubor na úroveň a téma: `data/questions/<level>/<theme>.json`, obsah je pole otázek podle
typu `Question` v `src/lib/types.ts`. Do hry jdou jen otázky se `status: "verified"`.

## Úrovně

| Level | Pro koho | Typy | Pravidla textu |
|---|---|---|---|
| `hospoda` | dospělí | `choice` (4 možnosti), `estimate`, `open` | do 160 znaků; mix obtížnosti 1–3 |
| `lavice` | 1. stupeň ZŠ, 6–11 let | `choice` (3–4 možnosti) | do 100 znaků; látka prvouky, češtiny, matematiky; slovní zásoba dítěte |
| `piskoviste` | předškoláci, 4–6 let | `choice` (2–3 možnosti) | do 60 znaků, čte se nahlas; `image` povinný; každá možnost začíná emoji („🦔 Ježek“); žádné čtení ani počty nad 10 |

## Rozsah

- `hospoda`: 9 témat × 30 (v každém tématu ~22 `choice`, ~4 `estimate`, ~4 `open`) a navíc jsou
  odhadovačky rozptýlené v tématech — celkem 270.
- `lavice`: 9 témat × 15 = 135.
- `piskoviste`: témata `priroda`, `cesko-svet`, `veda-telo`, `pohadky-film-hudba`, `sport-hry`,
  `jidlo`, `cisla-logika` × 12 = 84.

## Zásady

- České prostředí: české reálie, osobnosti, pohádky a večerníčky, geografie ČR — ale ne výhradně.
- Jednoznačná odpověď. Žádné „podle zdroje“, žádná fakta, která se rychle mění (aktuální rekordy,
  počty obyvatel bez roku, žijící držitelé titulů).
- `fact` je jedna krátká věta, která něco přidá, ne zopakuje otázku.
- `source`: URL (Wikipedie apod.) u faktů, „obecná znalost“ jen u triviálních.
- Neopisovat otázky z televizních soutěží ani ze sad Hospodského kvízu.
- `estimate`: kladné číslo, kde je rozumný odhad (výška Sněžky, rok založení UK, počet krajů…).
- `open`: krátká odpověď jedním–třemi slovy; varianty pravopisu do `accept`.
