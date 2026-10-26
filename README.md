# Herní večer (Game Night)

Webová aplikace na domácí herní večery pro rodinu a přátele: hry pro dospělé i malé děti u jednoho
stolu, dlouhodobá liga a statistiky. Televize ukazuje hru, každý hraje ze svého mobilu. Stejné hry
jdou hrát i na jednom tabletu.

Repo patří studiu Games Haubert Tech (games.haubert.tech). Kód je pod MIT, obsah pod CC BY 4.0.

## Hry

| Hra | Kde | Popis |
|---|---|---|
| **Kvízovna** (hospodský kvíz) | `/tv`, `/tablet` | 5 úrovní od Kočárku (rodič předčítá „Ukaž pejska“) po Hospodu, přes 2 500 ověřených otázek se zajímavostí, obrázky místo emoji |
| **Řekni – ukaž – nakresli** | `/tv` | Activity: vysvětlování, pantomima, kreslení na mobilu |
| **Město – jméno – zvíře** | `/tv` | na mobilech, o sporných odpovědích se hlasuje, poslední slovo má hostitel |
| **Šachy** | `/sachy`, `/tv` | proti počítači, dva na tabletu, každý na svém mobilu; lekce a úlohy |
| **Prší, žolíky** | `/karty`, `/trenink`, `/tv` | zápis bodů pro hru s fyzickými kartami i digitální hra s nápovědou a lekcemi |
| **Člověče, nezlob se** | `/clovece`, `/tv` | tablet, počítač, TV s mobily, lekce se sovou; dítě bez telefonu hraje na TV |

Hry se skládají do **večerů** a **sezón ligy** (body 10–7–5–3–2–1 a za účast, rating OpenSkill
pro každou hru zvlášť). Domácnost má účet (e-mail + heslo), hráči jsou profily bez hesla.

## Jak spustit

Potřebuješ Node ≥ 22.18 (spouští `.ts` přímo) a Docker.

```bash
cp .env.example .env          # vyplň hesla a HOUSEHOLD_COOKIE_SECRET
npm ci
npm run db:up                 # Postgres 16 v Dockeru na 127.0.0.1:5437
npm run db:migrate && npm run db:migrate:test
npm run dev:share             # vite na 0.0.0.0:5173 (macmini přes Tailscale http://100.66.23.17:5173)
```

| Příkaz | Co dělá |
|---|---|
| `npm run check` | svelte-check (typy, Svelte) |
| `npm test` | Vitest: enginy, místnosti, liga, služby proti `domaci_liga_test` |
| `npm run test:e2e` | Playwright: tablet (iPad na šířku i na výšku) a živé místnosti TV + mobily; poprvé `npx playwright install chromium` |
| `npm run check:questions` | validace `data/questions/**` a souhrn proti cílům úrovní |
| `npm run build` + `npm start` | produkční build (adapter-node) + `server.ts` s WebSocketem |
| `npm run backup:db` | záloha DB (`docs/PROVOZ.md`) |

## Dokumentace

| Soubor | O čem |
|---|---|
| [docs/ARCHITEKTURA.md](docs/ARCHITEKTURA.md) | jak je aplikace postavená: enginy, místnosti, protokol, DB, liga, jak přidat hru |
| [docs/UROVNE.md](docs/UROVNE.md) | úrovně otázek a jejich kontrakt, cíle datasetu |
| [docs/DESIGN.md](docs/DESIGN.md) | design systém, ilustrace (Codex), sova, komponenty; živě na `/design` |
| [docs/PROVOZ.md](docs/PROVOZ.md) | provoz, `.env`, zálohy, účty, bezpečnost, nasazení s doménou |
| [docs/NAVRH.md](docs/NAVRH.md) | původní návrh z 25. 10. 2026 (historie rozhodnutí) |
| `src/lib/games/*/README.md` | pravidla a zdroje jednotlivých her |
| `.claude/skills/otazky/SKILL.md` | jak psát a ověřovat otázky |
| [AGENTS.md](AGENTS.md) | pravidla pro AI agenty v tomto repu |

## Licence

Kód je pod licencí MIT, obsah (otázky, slova, lekce a ilustrace) pod CC BY 4.0. Podrobnosti
v [LICENSE](LICENSE) a [LICENSE-CONTENT](LICENSE-CONTENT).
