# Herní večer (Game Night)

Webová aplikace na domácí herní večery: hospodský kvíz pro dospělé i děti, zápis karetních her, liga a dlouhodobý žebříček.

Stav: návrh — viz [docs/NAVRH.md](docs/NAVRH.md).

## Kvízovna — jak spustit

Potřebuješ Node 22 (`node -v` ≥ 22.18, kvůli spouštění `.ts` skriptů přímo v Node).

```bash
npm install
npm run dev:share        # vite na 0.0.0.0:5173 — z iPadu přes Tailscale http://100.66.23.17:5173
npm run dev              # jen lokálně
```

Ostatní skripty:

| Příkaz | Co dělá |
|---|---|
| `npm run check` | svelte-check (typy, Svelte) |
| `npm test` | Vitest — engine, validátor otázek, načítání datasetu |
| `npm run test:e2e` | Playwright (Chromium, iPad na šířku i na výšku) proti `tests/fixtures/questions`; poprvé `npx playwright install chromium` |
| `npm run check:questions` | validace `data/questions/**/*.json` a souhrn počtů; exit 1 při chybě (volitelně cesta k jiné složce) |
| `npm run build` / `node build` | produkční build (adapter-node) a jeho spuštění |

- Do hry jdou jen otázky `status: "verified"`. Při `npm run dev` lze koncepty zapnout přes `/?draft=1`.
- `VITE_QUESTIONS=fixtures` načte místo datasetu malé testovací otázky (používá e2e).
- `/?seed=123` zopakuje stejné losování otázek.
- Profily, historie her, viděné otázky a rozehraná hra jsou v `localStorage` prohlížeče; export
  historie do JSON je na úvodní stránce („Stáhnout (JSON)“).

### Struktura

- `src/lib/engine/` — čistý reducer hry (stav je JSON, náhoda jen ze seedu), později poběží i na serveru
- `src/lib/questions.ts`, `src/lib/storage.ts`, `src/lib/tts.ts` — dataset, localStorage, předčítání cs-CZ
- `src/routes/+page.svelte` (příprava), `src/routes/hra/+page.svelte` (průběh), komponenty `src/lib/ui/`
- `scripts/question-rules.ts` (pravidla datasetu) + `scripts/check-questions.ts` (CLI)
