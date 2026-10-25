# Design systém — Rodinný herní večer (v1, 25. 10. 2026)

Jak hra vypadá, zní a chová se. Hodnoty žijí v `src/app.css`, ilustrace v `static/art/`
(manifest `static/art/manifest.json`), živý přehled je na stránce **`/design`** (bez přihlášení,
neindexuje se). Když se tento dokument a kód rozcházejí, platí kód — a dokument se opraví.

## 1. Principy

1. **Rodinná hra, ne aplikace.** Večer u stolu, papír, karty, sova jako moderátorka. Teplá
   papírová paleta, ručně kreslené ilustrace, mírně nepravidelné rohy. Žádné neony, gradienty
   ani „herní“ efekty.
2. **Velké dotykové plochy.** Každý ovládací prvek má aspoň **44 px** (`--tap-min`), běžné
   tlačítko **60 px** (`--tap`), hlavní akce a odpovědi dětí **76 px** (`--tap-big`). Tablet
   drží dítě, telefon někdo jednou rukou na gauči.
3. **Čitelnost z gauče.** Obrazovka TV se čte ze tří metrů: text otázky `--text-tv`,
   kód místnosti `--text-tv-title`, nic menšího než `--text-lg`. Kontrast textu aspoň 4,5 : 1,
   na TV radši 7 : 1.
4. **Děti nečtou.** Na úrovních Kočárek, Pískoviště a Prvňáček nese význam **obrázek**, text je
   jen pro rodiče a čtečku. Otázku předčítá aplikace (TTS) nebo rodič. Barva nikdy není jediný
   nositel informace (správně/špatně má i ikonu ✓/✗ a slovo).
5. **Klid.** Jedna věc na obrazovce, krátké věty, pohyb jen tam, kde něco oznamuje.

## 2. Tokeny

Tři vrstvy v `src/app.css`:

| Vrstva | Příklad | Kdy použít |
|---|---|---|
| Základní paleta | `--sage-dark`, `--clay-light`, `--mustard` | jen v tokenech a ilustračních SVG (karty, šachovnice) |
| Sémantické role | `--color-primary`, `--color-error-bg` | **v nových komponentách vždy** |
| Škály | `--space-4`, `--text-xl`, `--radius`, `--z-modal`, `--dur` | rozměry, typografie, vrstvy, pohyb |

Starší jména (`--good`, `--bad`, `--good-bg`, `--bad-bg`, `--surface`, `--on-dark`) zůstávají
jako aliasy rolí, aby nic nespadlo. V novém kódu piš role (`--color-success`, `--color-error`…).

### Barvy

| Paleta | Světlá / základ / tmavá | Charakter |
|---|---|---|
| Papír | `--cream` #f4eee2 · `--paper` #fbf8f1 · `--surface` #fff · `--line` #ddd2c0 | pozadí, karty, okraje |
| Inkoust | `--ink` #3b332b · `--ink-soft` #6d6257 | text |
| Šalvěj | `--sage-light` · `--sage` · `--sage-dark` #56664b · `--sage-edge` | hlavní akce, správně |
| Hlína | `--clay-light` · `--clay` #b5835f · `--clay-dark` | druhá akce, hospoda |
| Břidlice | `--slate-light` · `--slate` · `--slate-dark` | informace, focus, lavice |
| Hořčice | `--mustard-light` · `--mustard` #e2b33c · `--mustard-dark` | pozor, prvňáček, akcent TV |
| Růže | `--rose-light` · `--rose` · `--rose-dark` | kočárek |
| Cihla | `--brick-light` · `--brick` #8c4f3c | chyba, špatná odpověď |
| Noc | `--night` #2b2622 · `--night-soft` | TV a čekárna |

| Role | Hodnota | Použití |
|---|---|---|
| `--color-bg` | cream | pozadí stránky |
| `--color-surface` / `-raised` | paper / bílá | karta / pole, řádek tabulky, odpověď |
| `--color-border` | line | okraje karet a polí |
| `--color-text` / `-muted` / `-on-dark` | ink / ink-soft / paper | text |
| `--color-primary` (+`-edge`, `-soft`) | sage | „Hrát“, „Další“, vybraná volba |
| `--color-accent` (+`-edge`, `-soft`) | clay | druhá akce, zvýraznění |
| `--color-success` / `-bg` | sage | správná odpověď |
| `--color-error` / `-bg` | brick | špatná odpověď, chyba |
| `--color-warning` / `-bg` | mustard | upozornění, připojení |
| `--color-info` / `-soft` | slate | nápověda, informace |
| `--color-focus` | slate | obrys focusu (3 px) |

**Úrovně** mají dvojici barva + pozadí `--level-<id>` / `--level-<id>-bg` a třídu `.badge.<id>`:
kočárek = růže, pískoviště = šalvěj, prvňáček = hořčice, lavice = břidlice, hospoda = hlína.

**Tmavé téma TV** (`.theme-tv` na kořeni obrazovky) přemapuje `--color-bg`, `--color-text`,
`--color-text-muted` a `--color-border` na `--tv-*`. Komponenty se nemění. Akcent na tmavé je
`--tv-accent` (hořčice), karty a kód místnosti na `--tv-surface`.

### Typografie

- Písmo `--font`: zaoblené systémové (`ui-rounded`, SF Pro Rounded, Nunito, system-ui). Emoji
  `--font-emoji` přes třídu `.emoji`. Žádné webové fonty — hra musí běžet hned i offline.
- Základ `html { font-size: 18px }`, takže **1rem = 18 px**.
- Škála: `--text-xs` 0,85 · `--text-sm` 0,95 · `--text-md` 1 · `--text-lg` 1,15 · `--text-xl` 1,4 ·
  `--text-2xl` 1,8 · `--text-3xl` 2,4 · `--text-4xl` 3,5 rem; TV `--text-tv`, `--text-tv-title` (clamp).
- Řádkování `--leading-tight` 1,15 (nadpisy), `--leading` 1,4 (text), `--leading-loose` 1,6 (delší čtení).
- Tučnost `--weight-normal` 400, `--weight-medium` 650 (popisky, chipy), `--weight-bold` 700
  (tlačítka), `--weight-heavy` 800 (nadpisy, skóre).
- Čísla v tabulkách `font-variant-numeric: tabular-nums`.

### Prostor, tvar, stín, vrstvy, pohyb

- Mezery po 4 px: `--space-1` 4 · `-2` 8 · `-3` 12 · `-4` 16 · `-5` 20 · `-6` 24 · `-8` 32 ·
  `-10` 40 · `-12` 48 · `-16` 64. Uvnitř karty `--space-4`–`--space-6`, mezi sekcemi `--space-4`.
- Rohy jsou schválně nepravidelné (ručně stříhaný papír): `--radius-sm` (tlačítka, pole),
  `--radius` (karty), `--radius-lg` (velké panely, TV), `--radius-pill` (chipy, odznaky).
  Okraj `--border` 2 px.
- Stíny jsou ploché, posunuté dolů jako papírový výstřižek: `--shadow` (karta),
  `--shadow-press` / `--shadow-pressed` (tlačítko před a po stisku), `--shadow-lift` (zvednutá
  karta, šachová figurka), `--shadow-overlay` (dialog). Ztmavení pod dialogem `--scrim`.
- Vrstvy: `--z-raised` 1 · `--z-nav` 10 · `--z-sticky` 20 · `--z-overlay` 30 · `--z-sheet` 40 ·
  `--z-modal` 50 · `--z-toast` 60. Nová čísla nevymýšlej.
- Pohyb: `--dur-press` 80 ms (stisk), `--dur-fast` 150 ms (výběr), `--dur` 250 ms (přechod),
  `--dur-slow` 450 ms (odhalení odpovědi), `--dur-celebrate` 900 ms (oslava); křivky `--ease`,
  `--ease-bounce` (jen oslava). **`prefers-reduced-motion: reduce`** nastaví všechny délky na nulu
  a globálně zkrátí animace i přechody — stav se změní okamžitě, nic nelétá.

## 3. Ilustrace a ikony

### Styl

Česká knižní ilustrace tuší a akvarelem: živá nepravidelná hnědá kontura, ploché akvarelové
plochy, tlumená přírodní paleta (šalvěj, olivová, hlína, břidlice, krémový papír, pudrová růžová,
okr; vzácně cihlová a hořčicová). Žádné gradienty, lesky, 3D ani vektorová plochost. Postavy
jednodušší než pozadí. Přesné znění je `style` v `design/art/prompts.json`.

### Skupiny v manifestu

| Skupina | Formát | Obsah |
|---|---|---|
| `mascot` | průhledný čtverec 512 | Sova Moderátorka ve 4 pózách |
| `hero`, `cards`, `env` | scéna 16:9 / 4:3 / 9:16 | úvod, karty her, pozadí čekáren |
| `levels` | průhledný čtverec 512 | ikony úrovní (kočárek, pískoviště, prvňáček, lavice, hospoda, všichni) |
| `themes`, `ui` | průhledný čtverec 512 | témata kvízu, drobnosti rozhraní |
| `avatars` | průhledný čtverec 512 | 16 zvířátek-hráčů |
| `rewards`, `empty` | průhledný čtverec 512 | medaile, poháry, prázdné stavy |
| `pics` | průhledný čtverec 512 | **obrázkový slovník** pro dětské otázky (210 položek) |

Průhledné obrázky mají varianty 128 a 256 px (`-128.webp`, `-256.webp`), scény 600/960 px.
Komponenty si samy vyberou nejmenší ostrou (`pathFor`, `srcset`).

### Pravidla

- **Bez textu.** Žádná písmena, číslice, nápisy ani loga — hra je česká a dítě nečte.
- **Průhlednost** se nedělá z modelu (dodá ji jen občas, jinak nakreslí šachovnici). Generuje se
  na **purpurové #FF00FF**, odklíčuje v `process.py`. Mřížka s fialovou nebo růžovou kresbou
  (barevné kostky) používá klíčování podle vzdálenosti (`"key": "distance"` v `pics.json`).
- **Jeden předmět, celý, typický pohled** (slovník): silná silueta, žádné pozadí ani rekvizity,
  mláďata zjevně menší a kulatější. Kontrola: **ve 128 px ho pozná tříleté dítě.**
- **Alt texty česky**, krátké, popisují obsah („Sova Moderátorka drží kartičku s otázkou“).
  Vedle textu, který říká totéž, je obrázek dekorativní (`decorative` → `alt=""`, `aria-hidden`).
- **Velikosti**: ikona v textu 1,6 em (`.medal-icon`), avatar 48–64 px (TV víc), ikona úrovně
  96 px, obrázková odpověď 96–128 px (tablet), na TV až 192 px.

### Jak generovat (Codex)

Pipeline v `design/art/` — obrázky kreslí Codex CLI (`image_gen` na přihlášení ChatGPT, bez API klíče).

```bash
# 1. Zadání: design/art/prompts.json (styl + jobs); slovník: design/art/tools/pics-src.py → pics.json
python3 design/art/tools/pics-src.py                       # pics.json (mřížky, alt, emoji)
# 2. Generování (~45 s na mřížku 2×2, 3 souběžně); FORCE=1 přegeneruje
python3 design/art/tools/gen-batch.py -j 3 --only pics-animals-1
# 3. Rozřezání, klíčování, 512 px + varianty, manifest a mapa emoji
python3 design/art/tools/process.py pics levels.kocarek     # jen vybrané skupiny / klíče
python3 design/art/tools/contact-sheet.py                   # kontaktní arch → design/art/contact-sheet.png
```

- Prompt **anglicky**, se zákazem textu (`notext`) a pozadím `magenta`; mřížka 2×2 (`grid`) drží
  čtyři obrázky jedné sady ve stejném stylu.
- `refs` + `"ref_kind": "style"` pošle hotový obrázek jako **stylovou předlohu** (např.
  `originals/grids/themes-2.png`), bez něj jako model sheet postavy (sova, jezevčík).
- Originály (`design/art/originals/`, ~60 MB) jsou gitignorované; `process.py` zpracuje jen to,
  k čemu originál existuje, a ostatní záznamy manifestu nechá.
- **Každý obrázek prohlédni okem** v kontaktním archu a na `/design` ve 128 px. Vadný (text,
  dvojí předmět, nejasná silueta, useknutý okraj) přegeneruj s upraveným `subject`.

### Obrázkový slovník (`pics`)

- Zdroj: `design/art/tools/pics-src.py` (klíč, alt, emoji, anglický popis), výstup
  `static/art/pics/<klíč>.webp` + mapa **`static/art/pics-emoji.json`** (`"🐐": "koza"`).
- V mapě jsou jen **jednoznačná** emoji. ⚪/⚫ (barvy, ne tvary), 🍂 (list, ne podzim) a abstraktní
  symboly (🔤 🔢 ➕ 🟰 ✨ 🎉 🗣) záměrně chybí — u nich zůstane emoji, nebo data uvedou klíč obrázku
  přímo. ⚽ a 🏀 mají vlastní obrázek konkrétního míče, obecný `mic` zůstává bez emoji.
- **Číslice 1️⃣–🔟 jsou tečky na hrací kostce** (`tecky-1` … `tecky-10`; 7–10 dvě kostky vedle sebe:
  5+2, 4+4, 5+4, 5+5). Počet teček model neudrží, proto nakreslí jen předlohu `pics-dots-base`
  (prázdná stěna kostky + puntíky) a mřížky `dots-*` složí `tools/dots.py`; pak běží `process.py`.
- Nové mřížky: přidej je do `pics-src.py`, ten zapíše `pics.json` a doplní chybějící úlohy `pics-*`
  do `prompts.json`. Kontaktní arch jen vybraných klíčů: `contact-sheet.py pics.dum pics.tecky`
  (→ `design/art/contact-sheet-part.png`, necommituje se).
- Komponenta `src/lib/ui/art/Pic.svelte`:

  ```svelte
  <Pic emoji="🐐" size={112} />                 <!-- ilustrace kozy, jinak emoji -->
  <Pic key="kuzle" size={96} alt="Kůzle" />      <!-- přímo klíč (mláďata nemají emoji) -->
  <Pic emoji={splitEmoji(option).emoji} size={112} decorative />  <!-- vedle textu možnosti -->
  ```

  Props: `emoji`, `key?` (má přednost), `size` (px, výchozí 96), `alt?` (výchozí jméno obrázku),
  `decorative?`, `class?`. Obrázek i emoji zabírají stejný čtverec, rozvržení neposkočí.
  Pomocníci v `art.ts`: `picKeyFor(emoji)`, `picArt(key)`, `splitEmoji("🐶 Pejsek")`,
  `PIC_KEYS`, `PICS_EMOJI`.

## 4. Sova Moderátorka

Tawny sova s kulatými brýlemi, šalvějová pletená vesta s krémovým cikcakem, cihlová mašle.
Komponenta `Owl.svelte` (póza + bublina, `aria-live="polite"`, `compact` pro telefon).

| Póza | Klíč | Kdy |
|---|---|---|
| mává | `mascot.sova-mava` | uvítání, čekárna, začátek kola, prázdné stavy s výzvou |
| otázka | `mascot.sova-otazka` | čte otázku, nápověda, pravidla |
| přemýšlí | `mascot.sova-premysli` | čeká na odpovědi, počítání bodů, načítání |
| slaví | `mascot.sova-slavi` | správná odpověď, vítěz kola a večera |

Sova **nikdy nekárá** — u špatné odpovědi přemýšlí nebo povzbudí, neslaví. Mluví v bublině
krátce (do ~12 slov), na dětských úrovních totéž říká TTS.

## 5. Komponenty

| Komponenta | Kde | Pravidla |
|---|---|---|
| **Tlačítko** `.btn` | všude | `primary` = hlavní akce (jedna na obrazovce), `clay` = druhá akce, výchozí = zpět/vedlejší, `ghost` = přeskočit, `danger` = ukončit/smazat (s potvrzením). `big` pro hlavní akci na tabletu a TV, `small` jen v hustých seznamech (stále ≥ 44 px). Popisek je sloveso („Hrát“, „Další otázka“). |
| **Karta** `.card` | panely, sekce | papír, okraj 2 px, `--radius`, `--shadow`. Nevnořuj karty do karet. |
| **Karta hry** `GameCard` | domů, výběr hry na TV, večer | ilustrace `cards.*`, název ze `GAME_NAMES`, krátký popis; výběr = `pressed` (aria-pressed). |
| **Výběr úrovně** | profil hráče, start kvízu | dlaždice s ikonou `levels.*` (96 px), názvem a věkem z `LEVEL_LABELS`/`LEVEL_AGES`, barvy `--level-*`; ikona nese význam pro děti. |
| **Otázka** `QuestionCard`, `LiveQuestion` | tablet, TV, telefon | text otázky `--text-xl` (TV `--text-tv`), obrázek `Pic` nad textem, na dětských úrovních tlačítko „Přečíst znovu“ (TTS). |
| **Odpovědi** | tamtéž | dlaždice ≥ `--tap-big`, na dětských úrovních obrázek `Pic` 96–128 px + slovo; po odhalení správná `--color-success-bg` + ✓, zvolená špatná `--color-error-bg` + ✗; ostatní ztlumené. Pořadí odpovědí se nemění. |
| **Žolík** (karta Žolíky, `Card.svelte`) | karetní hry | jediné místo s fialovou; karty kreslené v SVG s vlastní paletou. |
| **Pořadí** `Standings`, tabulky ligy | konec kola, liga | medaile `rewards.misto-1..3` (`.medal-icon`), čísla `tabular-nums`, vlastní tým/hráč zvýrazněný `--color-primary-soft`. |
| **Avatar** `Avatar` | hráči, pořadí, čekárna | zvířátko `art:<klíč>` nebo emoji; vedle jména dekorativní, ve výběru s `label`. |
| **Odměny** `rewards.*`, `Celebrate` | konec večera, profil | jen za skutečný výkon (vítěz, série, první večer); oslava `--dur-celebrate`, sova slaví. |
| **Prázdný stav** `.empty-state` | seznamy bez dat | ilustrace `empty.*` 120 px + jedna věta, co udělat dál, a tlačítko. |
| **TV lobby** | `/tv/[kod]` | pozadí `env.lobby-tv`, kód místnosti `--text-tv-title`, QR, avatary připojených; čte se ze 3 m. |
| **Mobilní čekárna** | `/m/[kod]` | pozadí `env.lobby-mobil`, jméno + avatar, stav připojení `ConnectionBadge`, jedna velká akce dole (palec). |
| **Sova** `Owl` | návody, otázky, prázdné stavy | viz kapitola 4. |

## 6. Rozvržení

- **Tablet (hlavní zařízení, na výšku i na šířku):** obsah max. 1100 px (`.page`), odpovědi
  v mřížce 2×2, hlavní akce dole na dosah palce. Bezpečné okraje přes `env(safe-area-inset-*)`.
- **Mobil (≤ 560 px):** jeden sloupec, navigace se posouvá vodorovně, `--space-4` okraje,
  žádné tabulky širší než displej (`.table-scroll`).
- **TV (16:9, 1080p+):** celá obrazovka bez navigace (`bare` v layoutu), nic menšího než
  `--text-lg`, otázka `--text-tv`, rozestupy `--space-8` a víc, žádné hover stavy, nic se
  neovládá na TV — ovládá se z tabletu nebo telefonu.

## 7. Přístupnost

- **Kontrast** textu 4,5 : 1 (velký text 3 : 1). Ověřené dvojice: `--ink`/`--paper` 11,7 ·
  `--ink-soft`/`--paper` 5,6 · `--on-dark`/`--sage-dark` 5,8 · úrovně `--level-*`/`--level-*-bg`
  4,6–5,5 · `--color-error`/`-bg` 4,9 · TV `--tv-text`/`--tv-bg` 14,1, `--tv-text-muted` 8,7.
  `--on-dark` na `--clay` má jen 3,1 — hodí se jen pro tučný text ≥ 1,15rem (tlačítko `.btn.clay`).
  Barevné pozadí odpovědí vždy s ikonou a slovem.
- **Focus**: viditelný obrys 3 px `--color-focus` s odsazením 2 px (`:focus-visible`), nikdy ho nevypínej.
- **ARIA**: volby jako `aria-pressed`, živé hlášky (sova, výsledek) `aria-live="polite"`,
  dekorativní obrázky `alt=""` + `aria-hidden`, obrázek odpovědi bez textu má české `alt`.
- **TTS**: dětské úrovně předčítají otázku i možnosti (`src/lib/tts.ts`); text pro čtení je
  čeština bez emoji a zkratek.
- **Pohyb**: respektuj `prefers-reduced-motion` (globálně v `app.css`; vlastní animace
  komponenty navíc vypni ve stejném media query).
- **Dotyk**: ≥ 44 px, mezery mezi cíli ≥ 8 px, žádná akce jen na dlouhý stisk nebo hover.

## 8. Hlas a tón

- Čeština, krátce, věcně a vlídně. Jedna myšlenka na větu.
- **V dětských hrách tykáme** („Ukaž pejska“, „Výborně!“), rodičům a v nastavení **vykáme
  neutrálně, nebo píšeme bez oslovení** („Přidat hráče“, „Večer je uložený“).
- Tlačítka jsou slovesa, chyby říkají, co dělat dál („Připojení kolísá, zkus to znovu.“), ne kód.
- Žádné anglicismy ani marketing („epický“, „level up“). Názvy her a úrovní jen podle
  `GAME_NAMES` a `LEVEL_LABELS`.
- Pravidla pro texty otázek a zajímavostí: `docs/UROVNE.md` a `data/questions/README.md`.

## 9. Checklist pro novou hru

- [ ] Název v `GAME_NAMES`, ilustrace karty `cards.<id>` (scéna 4:3 ve stylu, bez textu) v `prompts.json` + `process.py`.
- [ ] Obrazovky jen z tokenů (`--color-*`, `--space-*`, `--text-*`), žádné nové barvy natvrdo.
- [ ] Ovládání ≥ 44 px, hlavní akce `btn primary big`, funguje na tabletu na výšku i mobilu.
- [ ] TV obrazovka čitelná ze 3 m (`--text-tv`), tmavá varianta přes `.theme-tv`, pokud je to čekárna.
- [ ] Dětská varianta: obrázky `Pic` místo textu, TTS, sova vede; žádné čtení nutné ke hře.
- [ ] Prázdné stavy s ilustrací a výzvou, sova ve správné póze.
- [ ] Přístupnost: focus, `aria-pressed`/`aria-live`, české alt texty, `prefers-reduced-motion`.
- [ ] Texty česky, tykání u dětí, slovesa na tlačítkách; projít `/design` a screenshot na tabletu, mobilu a TV.
