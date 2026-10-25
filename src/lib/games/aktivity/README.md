# Řekni, ukaž, nakresli

Česká rodinná hra na vysvětlování slov. Logika je v `engine.ts` (čistý reducer, stav je JSON),
data v `data/aktivity/<úroveň>.json`, kontrola dat `node --disable-warning=ExperimentalWarning scripts/check-aktivity.ts`.

## Pravidla

- **Týmy:** hrají 2–4 týmy, každý aspoň se dvěma hráči (dvojice = tým o dvou). Týmy se střídají
  v pevném pořadí, uvnitř týmu se postupně vystřídají všichni hráči.
- **Tah:** na tahu je jeden hráč týmu (vysvětlující). Na obrazovce tahu zvolí obtížnost **3 / 4 / 5**
  a spustí čas. Hra mu vylosuje slovo a způsob vysvětlení:
  - **Řekni** – popisuje slovy, nesmí říct slovo ani jeho příbuzné tvary; u hospody navíc
    nesmí použít zakázaná slova z karty.
  - **Ukaž** – pantomima, beze slov a zvuků.
  - **Nakresli** – kreslí na papír, bez písmen a číslic.
  Karta s `mode: "any"` dostane způsob losem ze seedu.
- **Kdo co vidí:** slovo vidí jen vysvětlující na svém mobilu. TV (hostitel) a spoluhráči vidí
  tým, vysvětlujícího, způsob, obtížnost a odpočet. Slovo se ukáže všem až po konci tahu.
- **Čas:** 60 s, nastavitelné před začátkem hry (10–300 s).
- **Hádání:** tým vysvětlujícího hádá nahlas. Hostitel nebo vysvětlující ťukne **„Uhodli“**
  (ještě 1,5 s po vypršení času se počítá) nebo **„Vzdáváme / přeskočit“**. Po vypršení času
  server pošle `timeout`, tah končí bez bodů.
- **Body:** uhodnuté slovo dá týmu tolik bodů, jakou má obtížnost karty (3/4/5). Když v balíčku
  zvolená obtížnost dojde, hra vezme nejbližší jinou a body jsou podle skutečné karty.
- **Všichni hádají:** volitelně (`allPlayChance`, 0–1) je tah označený „všichni hádají“ –
  hádají všechny týmy a body bere tým, který slovo uhodl první (hostitel ho při „Uhodli“ označí).
- **Konec:** hraje se buď do cílového počtu bodů, nebo daný počet kol (kolo = každý tým jednou
  vysvětloval). Hra končí vždy až na konci kola, aby měly všechny týmy stejně tahů. Hostitel může
  hru ukončit dřív; rozehraný tah se nezapočítá.
- **Úroveň slova** se řídí vysvětlujícím hráčem:
  - **hospoda** – dospělí, se zakázanými slovy pro „řekni“,
  - **lavice** – děti 1. stupně ZŠ,
  - **pískoviště** – předškoláci (nečtou): jen **ukaž** a **nakresli**, karta má velké emoji.
    Slovo jim přečte dospělý z týmu (`helperId` – první hráč úrovně hospoda, jinak lavice), který
    proto slovo vidí také a sám nehádá.
  - **kočárek** – jako pískoviště (jen ukaž a nakresli, s pomocníkem),
  - **prvňáček** – všechny tři způsoby.
  - Úroveň bez vlastních karet bere karty nejbližší úrovně (`cardLevelFor` → `nearestLevel`, při shodě
    mladší): kočárek → pískoviště, prvňáček → pískoviště, dokud nemá vlastní `data/aktivity/prvnacek.json`.
- **Bez opakování:** karta ani stejné slovo (i z jiné úrovně) se během hry nezopakuje. Karty, které
  domácnost už hrála (`seen`), jdou na konec balíčku.

## Stav a akce

Fáze: `setup → turnIntro → playing → result → turnIntro … → finished`.

| Akce | Kdo | Fáze |
|---|---|---|
| `configure {timerSeconds?, goal?, allPlayChance?}` | hostitel | setup |
| `start` | hostitel | setup |
| `chooseDifficulty {difficulty}` | hostitel, vysvětlující, pomocník | turnIntro |
| `startTurn {difficulty?}` | hostitel, vysvětlující, pomocník | turnIntro |
| `guessed {teamId?}` | hostitel, vysvětlující, pomocník | playing |
| `skip` | hostitel, vysvětlující, pomocník | playing |
| `timeout` | systém (`now ≥ deadline`) | playing |
| `next` | hostitel | result |
| `end` | hostitel | kromě finished |

Každá akce nese `by` (`host` / `contestant` / `system`) a `now` (epoch ms). Čas ani náhoda
nepochází z hodin: vše se odvozuje ze `seed` (mulberry32), takže hra jde přehrát.

`viewFor(state, viewer)` vrací to, co smí vidět jedna obrazovka; `aktivityToMatchResult` vrací
výsledek pro ligu (`gameType: 'aktivity'`, každý tým je jedno místo).

## Data

`{ id: "<úroveň>-NNN", level, word, mode: "rekni"|"ukaz"|"nakresli"|"any", difficulty: 3|4|5, image?, forbidden? }`

- `image` (emoji) je povinné pro pískoviště, jinde volitelné.
- `forbidden` jen pro hospodu (zakázaná slova pro „řekni“).
- Bez jmen žijících soukromých osob, přiměřené věku.

## Integrace (TV + mobily, liga)

- Místnost: `src/lib/server/games/aktivity.ts` (adaptér pro `RoomManager`, karty z `data/aktivity` přes `node:fs`,
  `AKTIVITY_DIR` přepíše adresář). Zakládá `POST /api/rooms` s `game: 'aktivity'` (`services/game-rooms.ts`):
  týmy z hráčů (`teams: [{ player_ids }]` nebo `{ team_id }`), `timer_seconds`, `goal`, `all_play_chance`, `night_id`.
  Tým z hráčů znovu použije tým domácnosti se stejnými členy, jinak ho založí.
- Id v místnosti: tým `t<teamId>`, hráč `p<playerId>`. Protokol v2: akce `{ type: 'action', game: 'aktivity', action }`,
  stav `{ type: 'gameState', game: 'aktivity', view }`.
- Po konci zapíše `room-store-db.ts` partii (`game_type = 'aktivity'`, každý tým jedno místo) a odehrané karty
  do `seen_questions` všem hráčům u stolu.
- UI: `/tv?hra=aktivity` → `AktivitySetup`, `/tv/<kód>` → `AktivityTv`, `/m/<kód>` → `AktivityPhone`.
