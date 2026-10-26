# Architektura — Herní večer

Stav k 26. 10. 2026. Jak je aplikace poskládaná a kudy vede nová hra.

## Stack

SvelteKit 3 (konfigurace ve `vite.config.ts`, `ssr = false`, adapter-node), Svelte 5 (runes),
TypeScript, Node ≥ 22.18 spouští `.ts` přímo. Importy přes `#lib/*`. Postgres 16 (`pg`),
WebSocket (`ws`), `openskill`, `qrcode`, `chess.js`. Testy Vitest + Playwright.

## Vrstvy

```
data/                     obsah: otázky po úrovních a tématech, slova Activity, kategorie MJZ, šachové úlohy, karetní lekce
src/lib/engine/           kvíz: quiz.ts (tablet, pass-and-play), live.ts (TV + mobily), select.ts (losování), rng.ts
src/lib/games/<hra>/      ostatní hry: engine.ts (+ ai.ts, lessons/learn); každá má README s pravidly a zdroji
src/lib/cards/            zápis prší a žolíků (fyzické karty)
src/lib/league/           čistá logika ligy: body, tabulka, OpenSkill, statistiky
src/lib/live/             protokol klient ↔ server (protocol.ts, verze 2), stavy stolních místností (table-games.ts)
src/lib/live-client/      klient místnosti v prohlížeči (připojení, hodiny serveru, tokeny)
src/lib/server/           rooms.ts (RoomManager), games/*.ts (adaptéry her), ws.ts, repo/ (SQL), services/ (doménová logika), auth, security
src/lib/ui/               komponenty; ui/live/ obrazovky TV a mobilu pro každou hru
src/routes/               stránky (/tv, /m/[kod], /tablet, /liga, /vecery, /hraci …) a api/
db/migrations/            SQL migrace (NNN_nazev.sql), runner scripts/migrate.ts
```

## Enginy her

Každá hra je **čistý reducer**: `applyX(state, { ...command, by, now })` vrací nový stav nebo chybu.
Stav je serializovatelný JSON, náhoda jen ze seedu (`mulberry32` v `engine/rng.ts`), čas přichází
v akci. Díky tomu stejný kód běží na tabletu i na serveru, hra se dá přehrát a testovat bez sítě.

`viewFor(state, viewer)` vrací, co smí vidět jedna obrazovka. Správné odpovědi, karty v ruce
soupeřů a stav generátoru náhody server nepošle. Počítačoví hráči (`ai.ts`) jsou deterministické
funkce stavu a úrovně.

## Živé místnosti (TV + mobily)

- TV založí místnost (`POST /api/rooms`, tělo podle hry v `services/game-rooms.ts`) a dostane
  4znakový kód a hostitelský token. Mobily se připojí přes `/m/[kod]` (QR na TV) a vyberou si místo.
- `RoomManager` (`server/rooms.ts`) je bez sítě: klienty, čas a plánovač dostává zvenku, takže ho
  testy řídí stejně jako `ws.ts`. Drží autoritativní stav, ověřuje, kdo smí co poslat, a plánuje
  serverové kroky (časovače, tahy počítače) přes `adapter.timeoutAt` / `timeout`.
- Každá hra má **adaptér** `server/games/<hra>.ts` (rozhraní `GameAdapter` v `types.ts`):
  `apply`, `message` (pohled pro obrazovku), `seats` (místa pro mobily), `isFinished`,
  `recordInput` (výsledek do ligy). Registrují se v `server/games/index.ts`.
- Stav místnosti se ukládá do `matches.state` (`room-store-db.ts`), po restartu serveru se místnosti
  obnoví. Mobil i TV se po výpadku připojí znovu a dostanou aktuální stav.
- Kdo nemá telefon, hraje „na TV“ a hostitel za něj odpovídá nebo táhne (kvíz `onTv`, Člověče
  `TableSeat.onTv`).
- V dev běží WebSocket přes Vite plugin, v produkci `server.ts` nad `build/handler.js`.

## Data a liga

- Migrace 001–006: domácnosti a účty, hráči, týmy, sezóny, večery, partie (`matches`,
  `match_participants`), odpovědi kvízu, viděné otázky, ratingy, kola žolíků; typy her přibývají
  migracemi (CHECK constraint na `game_type`).
- Dohraná partie jde přes `services/results.ts::recordMatch`: ligové body podle místa (tabulka
  sezóny, výchozí 10–7–5–3–2–1, ostatní bod za účast), OpenSkill zvlášť pro každý typ hry,
  viděné otázky. Volání je idempotentní.
- **Hra proti počítačům:** do ligy se zapisují jen lidé, ale se skutečným místem u celého stolu
  (`league/points.ts`, `games/card-table.ts::humanParticipants`). Prohra s počítačem není výhra.
- Tablet (`/tablet`, hry na jednom zařízení) ukládá do `localStorage` prohlížeče; liga je jen
  v DB.

## Bezpečnost (stručně)

Účet domácnosti: e-mail + heslo (scrypt), ověření e-mailem, zařízení se dá přihlásit PINem.
Cookie podepsaná `HOUSEHOLD_COOKIE_SECRET`, kontrola `Origin` (CSRF i WebSocket), CSP, HSTS,
rate limit v paměti, limity místností na domácnost. Detail a otevřené body: `docs/PROVOZ.md`
a issues #1–#6.

## Jak přidat novou hru

1. `src/lib/games/<hra>/engine.ts` jako čistý reducer + `viewFor` + `toMatchResult`; README
   s pravidly a zdroji; testy v `tests/games/<hra>/`.
2. Typ hry do ligy: `league/types.ts` (`GAME_TYPES`) + migrace rozšiřující CHECK na `game_type`.
3. Živá místnost: stav/příkazy v `live/` (protokol v2, parser příkazu), adaptér
   `server/games/<hra>.ts`, registrace v `index.ts`, založení v `services/game-rooms.ts`
   a `routes/api/rooms/+server.ts`; testy v `tests/live/`.
4. UI: `ui/live/<Hra>{Setup,Tv,Phone}.svelte`, volba hry na `/tv`, případně tabletová stránka.
5. Vizuál podle checklistu v `docs/DESIGN.md` § 9 (ilustrace přes Codex, sova, přístupnost).
6. e2e: `e2e/live-<hra>.spec.ts` (TV + mobil, dohraná hra, výsledek v testovací DB).
