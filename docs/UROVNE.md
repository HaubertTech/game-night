# Úrovně hráčů a kontrakt datasetu (v2, 25. 10. 2026)

Zdroj: rodinný test 25. 10. 2026 a epic #7 — otázky Pískoviště byly pro 3,5leté moc snadné,
některé otázky Lavice byly pro šestiletého prvňáka těžké, chybí úroveň pro nejmenší, kdy rodič
předčítá. Obrázkový systém a zajímavosti po otázce se osvědčily.

## Úrovně (od nejmladších)

| id | Název | Věk | Kdo čte | Jak se odpovídá |
|---|---|---|---|---|
| `kocarek` | Kočárek | 2–3 roky | **rodič předčítá** a vede | ukáže obrázek (`point`), napodobí zvuk nebo pohyb (`imitate`, rodič potvrdí ✓/✗) |
| `piskoviste` | Pískoviště | 3,5–5 let (školka) | předčítá aplikace (TTS), dítě nečte | obrázkové možnosti 3–4 (`choice`), jednoduchá úvaha |
| `prvnacek` | Prvňáček | 6–7 let (1. třída) | předčítá aplikace, krátký text si může přečíst | 3 možnosti s obrázkem (`choice`) |
| `lavice` | Lavice | 8–11 let (2.–5. třída) | čte sám | 3–4 možnosti (`choice`) |
| `hospoda` | Hospoda | dospělí a teenageři | čte sám | `choice`, `estimate`, `open` |

Pořadí úrovní pro fallbacky a mapování (nižší → vyšší): `kocarek`, `piskoviste`, `prvnacek`, `lavice`, `hospoda`.
Existující hráči v DB s úrovní `piskoviste`/`lavice` zůstávají; úroveň si rodič změní v profilu.

## Typy otázek

Stávající `choice`, `estimate`, `open` beze změny. Nové pro `kocarek`:

- `point` — „Ukaž pejska.“ `options` = 2–4 obrázkové možnosti (emoji + slovo, např. „🐶 Pejsek“), `answer` = jedna z nich.
  Dítě ťukne na obrázek (nebo ukáže a ťukne rodič).
- `imitate` — „Jak dělá koza?“ bez možností; `answer` = vzor („Mééé“), `image` povinný. Rodič vidí
  vzor a potvrdí ✓/✗ (jako otevřená otázka). Body jako ostatní (1).

Pole jako dnes (`src/lib/types.ts`): `id`, `level`, `theme`, `type`, `text`, `options?`, `answer`,
`fact`, `difficulty`, `image?`, `source?`, `status`. Pro `kocarek`, `piskoviste` a `prvnacek` je
`image` povinný a každá možnost `choice`/`point` začíná emoji.

## Zajímavost (`fact`) — povinná u každé otázky

Jedna až dvě krátké věty, které **něco přidají** (proč to tak je, něco překvapivého, souvislost),
neopakují otázku. Přiměřeně věku: u `kocarek` a `piskoviste` věta, kterou rodič přečte dítěti
(„Kozí mláďatům se říká kůzlátka.“), u dospělých klidně zajímavost s číslem nebo příběhem.

## Témata podle úrovní

Všech 9 témat (`THEMES`) mají `prvnacek`, `lavice`, `hospoda`.
`piskoviste`: `priroda`, `cesko-svet`, `veda-telo`, `pohadky-film-hudba`, `sport-hry`, `jidlo`, `cisla-logika` (+ volitelně `slova-jazyk` — rýmy, první hláska).
`kocarek`: `priroda` (zvířata a zvuky), `veda-telo` (části těla), `jidlo`, `cisla-logika` (barvy, tvary, malý/velký, kolik — do 3), `sport-hry` (hračky, pohyb), `pohadky-film-hudba` (písničky, postavy).
Chybí-li úrovni téma kola, engine vezme otázku jiného tématu téže úrovně (dnešní PRESCHOOL fallback, zobecněný).

## Cílové počty (ověřené otázky)

**v2.1 (25. 10. 2026): zdvojnásobení** — kocarek 240, piskoviste 360, prvnacek 400, lavice 540 (9 × 60),
hospoda 1080 (9 × 120). Tabulka níže je první krok (v2).

| Úroveň | Cíl | Poznámka |
|---|---|---|
| `kocarek` | 120 | nové |
| `piskoviste` | 180 | přepracované: těžší než dosud (3–4 možnosti, „co nepatří“, „čeho je víc“, povolání, roční období, pohádky); příliš snadné dosavadní otázky přejdou do `kocarek` |
| `prvnacek` | 200 | nové + snazší otázky z dosavadní `lavice` |
| `lavice` | 270 (9 × 30) | těžší polovina dosavadní + nové pro 2.–5. třídu |
| `hospoda` | 540 (9 × 60) | dosavadních 269 + nové |

Přesun otázky mezi úrovněmi = nové `id` podle cílové úrovně (`<level>-<theme>-NNN`); staré id zmizí.
