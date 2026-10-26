# AGENTS.md — Herní večer

Pravidla pro AI agenty (Claude Code, Codex a další) v tomto repozitáři. Co aplikace dělá a jak je
postavená: `README.md` a `docs/ARCHITEKTURA.md`. Tenhle soubor říká, jak tu pracovat.

## Kontext

- Osobní projekt Tomáše Hauberta pod studiem Games Haubert Tech, **veřejné repo** (MIT + CC BY 4.0).
  Do repa nepatří tajemství, osobní údaje, jména dětí ani obsah, který nesmíme licencovat.
- Hraje se v češtině. **UI, obsah a dokumentace česky**, kód, identifikátory a commity anglicky.
- Cíl provozu: veřejně s registrací domácností. Teď běží na macmini (`npm run dev:share`,
  `http://100.66.23.17:5173`, jen přes Tailscale), doména a server přijdou později (issues #1–#6).

## Rozhodnutí, která drž

- **Odhad čísla dává nejvýš 1 bod**, i když je přesný (jinak je to nespravedlivé vůči dětským
  úrovním). Letopočty mají toleranci ±10 let, přesnost ±3 roky jen pochválíme.
- Každá otázka má **zajímavost** po odpovědi. Do hry jdou jen otázky `status: "verified"`.
- **Žolíky, domácí pravidla:** zavření = 0 bodů, kdo zavře z ruky, ostatním ×2, pevný počet kol
  (výchozí 10), body z ruky zapisuje hráč jako součet.
- **Hra proti počítačům v lize:** zapisují se jen lidé, ale se skutečným místem u celého stolu.
- Hráč bez telefonu hraje **na TV** a hostitel za něj odpovídá nebo táhne.
- Úrovně: Kočárek, Pískoviště, Prvňáček, Lavice, Hospoda (`docs/UROVNE.md`). Smíšený stůl je
  hlavní scénář: každý dostane otázku své úrovně ze stejného tématu.
- Studio se neškatulkuje jako „rodinné hry“; rodinný je jen Herní večer.

## Jak pracovat

- **Vývoj ve worktree**, hlavní adresář zůstává na `main`, protože z něj běží dev server na 5173,
  na kterém rodina hraje. Nerestartuj ho bez potřeby; po merge serverového kódu ho restartuj
  a ověř `/api/health`.
  ```bash
  git worktree add ~/Documents/Dev/.worktrees/game-night-<slug> -b <typ>/<issue>-<popis> main
  ln -s ~/Documents/Dev/game-night/node_modules ~/Documents/Dev/.worktrees/game-night-<slug>/node_modules
  cp .env ~/Documents/Dev/.worktrees/game-night-<slug>/
  ```
  `.gitignore` má `node_modules` bez lomítka, aby se symlink nedostal do commitu. Přesto před
  commitem zkontroluj `git status`: symlink v merge kdysi smazal skutečný `node_modules`.
- **Práce žije v GitHub issues** tohoto repa. Commit `<typ>(<rozsah>): popis` + `Refs: GH#<issue>`.
- **Testy:** `npm run check`, `npm test`, `npm run test:e2e` (a `npm run check:questions`, když
  sáhneš na otázky). Vitest i e2e běží jen proti DB s `_test` v názvu (`DATABASE_URL_TEST`),
  nikdy proti `domaci_liga`. Nová funkce = nový test; u živé hry test v `tests/live/` a e2e.
  E2e karetní hry proti počítači občas spadne při zátěži celé sady; samostatně projde.
- **Enginy zůstávají čisté:** stav jako JSON, náhoda jen ze seedu, čas v akci, žádné DOM ani síť.
  Tajné údaje (odpovědi, karty soupeřů, RNG) filtruje `viewFor`, ne UI.
- **Migrace** jen přidáním dalšího `db/migrations/NNN_*.sql`; existující neupravuj. Nový typ hry
  = rozšířit CHECK na `game_type` a `GAME_TYPES` v `league/types.ts`.
- **Závislosti:** jen s výslovným souhlasem, přesně připnuté (`"x": "1.2.3"`), verze starší než
  14 dní.
- **Otázky a obsah:** postup ve skillu `.claude/skills/otazky/SKILL.md` (návrh → nezávislé
  ověření jiným agentem → `verified`, zdroje, srozumitelná čeština, obrázek nesmí prozradit
  odpověď). Cíle počtů v `scripts/question-rules.ts`.
- **Ilustrace** přes Codex CLI podle `docs/DESIGN.md` § 3; originály zůstávají lokálně
  (`design/art/originals/`, gitignorované), do repa jdou jen webové verze ve `static/art/`.
- **Nová hra:** postup v `docs/ARCHITEKTURA.md` § Jak přidat novou hru a checklist v
  `docs/DESIGN.md` § 9. Pravidla s odkazy na zdroje do README hry.
- Vizuální změnu ověř screenshotem (Playwright) na TV (1600×900), mobilu a iPadu.
- Na konci: merge do `main` (`--no-ff`), celé testy, push, úklid worktree a větve, komentář
  a zavření issue.
