# Digitální prší a žolíky (`karty-hra`)

Trénink pro děti: hra proti počítači na tabletu, nápovědy a průvodce pravidly se Sovou. Cílem je,
aby se děti naučily hrát a pak hrály se skutečnými kartami (ty se dál zapisují archy
`src/lib/cards/{prsi,zoliky}.ts` na `/karty/**`).

| Soubor | Co dělá |
|---|---|
| `cards.ts` | mariášové karty (32) a francouzské (2 × 52 + 4 žolíci), id jako řetězce, seeded míchání |
| `prsi-engine.ts` | prší jako čistý reducer (`applyPrsi` s `by`/`now`), `viewFor`, `toMatchResult` (`prsi`) |
| `zoliky-melds.ts` | postupky, trojice, žolík, hodnoty, první vyložení, přikládání, výměna žolíka, hledání rozkladu ruky |
| `zoliky-engine.ts` | žolíky jako čistý reducer (`applyZoliky`), `viewFor`, `toMatchResult` (`zoliky`) |
| `ai/` | počítačoví soupeři ve 3 úrovních + `autoplay.ts` (kroky počítače, celé hry pro testy) |
| `learn/lessons.ts` | výukový mód, úkoly kontroluje skutečný engine; texty `data/karty-hra/lessons-*.json` |

UI: `src/lib/ui/karty-hra/`, stránky `/trenink`, `/trenink/{prsi,zoliky}`, `…/lekce`, `…/hra`.
Rozehraná hra a nastavení jsou v `localStorage` (`karty-hra:*`).

## Prší — pravidla

- 32 mariášových karet (srdce, listy/zelené, žaludy, kule; 7, 8, 9, 10, spodek, svršek, král, eso),
  2–5 hráčů, každý **4 karty**, jedna karta se otočí nahoru.
- Na kartu nahoře se dává karta **stejné barvy nebo stejné hodnoty**. Kdo nemá co dát (nebo nechce),
  **lízne jednu kartu** a tah končí.
- **Sedma**: další bere 2 karty; přebít se dá jen sedmou, trest se sčítá (2, 4, 6, 8). Po braní je
  sedma „vybitá“ a hraje se na ni normálně.
- **Eso**: další stojí; přebít se dá jen esem. Po stání je eso vybité.
- **Svršek** jde na cokoli kromě platné sedmy/esa a hráč zvolí barvu (lze i vlastní).
- Otočená sedma/eso na začátku platí proti prvnímu hráči (`firstCardActive`), svršek na začátku
  platí svou barvou.
- Došlý balíček: odhazovací hromádka bez horní karty se zamíchá (seeded).
- Kdo se první zbaví karet, vyhrál; ostatní hrají dál o pořadí. Více partií (`deals`) se zapisuje na
  arch `cards/prsi.ts` (součet míst).
- Volby: `oberOnOber` (svršek na svrška, výchozí ano), `drawPerSeven` (2), `handSize` (4), `deals`.
- Nezavedené varianty (regionální): červená sedma vrací, zelený král, spodek měnič, rychlé prší.

## Žolíky — pravidla

- 2 balíčky × 52 + 4 žolíci = 108 karet, 2–5 hráčů. Rozdání: 2 hráči 15, 3 hráči 14, 4+ hráči 13
  karet; začínající (vlevo od rozdávajícího) má o kartu víc a začne odhozením (`handSize` nastavitelné).
- Tah: karta z balíčku **nebo** horní z odhozených → vykládání / přikládání / výměna žolíka →
  **odhození jedné karty**.
- **Postupka**: 3+ karty po sobě v jedné barvě; eso pod dvojkou (A-2-3) i nad králem (Q-K-A), ne přes
  roh. **Trojice/čtveřice**: stejná hodnota, různé barvy.
- **Žolík** zastoupí libovolnou kartu; ve skupině musí být aspoň **dvě pravé karty**.
- **První vyložení**: aspoň **42 bodů** (`openingMin`) a **čistá postupka** bez žolíka
  (`requirePureRun`); může jít o víc skupin naráz. Body ve vyložení: 2–10 podle čísla, J/Q/K 10,
  eso 10 (pod dvojkou 1), žolík za kartu, kterou zastupuje.
- **Z odhozených**: kdo ještě nevyložil, smí si kartu vzít jen tehdy, když ji v tomtéž tahu vyloží
  při prvním vyložení. Vzatou kartu nelze hned odhodit.
- Po vyložení lze **přikládat** k libovolné skupině na stole a **vyměnit žolíka**: v postupce za
  kartu, kterou zastupuje; v trojici za karty všech chybějících barev.
- **Zavření**: kdo vyloží vše a odhodí poslední kartu. Jedna karta musí vždy zůstat na odhození.
- Došlý balíček: odhozené (bez horní) se otočí a jsou novým balíčkem.

**Domácí pravidla Tomášovy rodiny** (výchozí, nastavitelné; zápis přes arch `cards/zoliky.ts`):
kdo zavře, má **0**; **zavření z ruky** (bez dřívějšího vyložení, vše v jednom tahu) → ostatním
body **×2**; hraje se **10 kol**, vyhrává **nejmenší součet**. Body v ruce: 2–10 podle čísla,
J/Q/K/eso 10, **žolík 50** (`values`).

Nezavedeno: omezení „vykládat až od 3. kola“, sejmutí 3 karet na začátku, ponechání žolíka do další hry.

## Počítač

| Úroveň | Prší | Žolíky |
|---|---|---|
| 1 Začátečník | náhodná hratelná karta, náhodná barva | jen z balíčku, přikládá jen ke svým, náhodné odhození |
| 2 Hráč | šetří svršky, přebíjí sedmy/esa, drží barvu, které má nejvíc | prohledává rozklad ruky, bere z odhozených po vyložení, odhazuje nejméně užitečnou vysokou kartu |
| 3 Mistr | navíc: sedma/eso na hráče s málo kartami, v duelu agresivně, pamatuje si barvy, které soupeř neměl | navíc: bere z odhozených k prvnímu vyložení, mění žolíky, čeká na zavření z ruky, počítá vyhozené karty, nekrmí dalšího hráče |

Měřeno (seedované hry 1 na 1): prší L2 vs L1 ≈ 58 % výher, L3 vs L2 ≈ 52 % (hra je hodně o štěstí);
žolíky L2 vs L1 85 % kol, L3 vs L2 63 % kol a zhruba třetinu trestných bodů. Vše deterministické podle seedu.

## Zdroje

- Prší: [cs.wikipedia.org/wiki/Prší](https://cs.wikipedia.org/wiki/Pr%C5%A1%C3%AD) (rozdání,
  sedma a přebíjení, eso, svršek „kromě sedmy či esa“, varianty);
  [en.wikipedia.org/wiki/Prší](https://en.wikipedia.org/wiki/Pr%C5%A1%C3%AD) (česká verze: 4 karty,
  kumulace sedem, eso = stání, svršek ne na sedmu/eso).
- Žolíky: [cs.wikipedia.org/wiki/Žolíky](https://cs.wikipedia.org/wiki/%C5%BDol%C3%ADky) (108 karet,
  rozdání 15/14/13 + předák o kartu víc, 42/51 bodů a čistá postupka, braní z odhozených jen s
  vyložením, výměna žolíka, zavření, hodnoty karet, žolík 50).
- Domácí pravidla: Tomáš, 25. 10. 2026 (viz i `src/lib/cards/zoliky.ts`).
