# Člověče, nezlob se (`clovece`)

Digitální deskovka pro 2–4 hráče: na jednom tabletu (`/clovece`), proti počítači a v místnosti
televize + mobily (`/tv`, adaptér `src/lib/server/games/clovece.ts`). Dohraná hra jde do ligy jako
`gameType: 'clovece'` (počítače se nezapisují, pořadí lidí zůstává podle celého stolu, takže prohra
s počítačem není výhra). Hráč bez telefonu (malé dítě) se v nastavení označí „📺 na TV“: když je na
tahu, hostitel za něj hází a vybírá figurku přímo na televizi, se sovou, má-li zapnuté nápovědy.

| Soubor | Co dělá |
|---|---|
| `engine.ts` | pravidla jako čistý reducer (`applyClovece` s `by`/`now`), seeded kostka přes `engine/rng.ts`, `viewFor`, `toMatchResult`, `replayClovece` |
| `ai.ts` | počítač ve 3 úrovních + `adviseClovece` (nápověda „Poraď“ s větou proč), `autoplayClovece` pro testy |
| `lessons.ts` | výuková lekce se sovou: krok po kroku kostka, nasazení, pohyb, vyhození, domeček |

UI: `src/lib/ui/clovece/` (plán v SVG, kostka, figurky), stránky `/clovece`, `/clovece/lekce`,
živá místnost `src/lib/ui/live/Clovece{Tv,Phone,Setup}.svelte`.

## Pravidla (výchozí)

- Plán: okruh **40 polí**, každá barva má 4 figurky ve **startovním domečku**, své **startovní pole**
  na okruhu (barvy po 10 polích po směru hodinových ručiček) a **4 pole cílového domečku**.
  Dva hráči sedí naproti sobě (červená a zelená).
- Na tahu se hází jednou. **Šestka nasazuje** figurku ze startovního domečku na startovní pole
  a **po šestce se hází znovu** (každý hod se táhne zvlášť, nesčítá se).
- **Tři pokusy:** kdo nemá žádnou figurku na okruhu, hází až třikrát, dokud nepadne šestka.
- Figurka jde o tolik polí, kolik padlo. Vlastní figurky na okruhu **přeskakovat smí**, na pole
  s vlastní figurkou **stoupnout nesmí**.
- **Vyhození:** kdo skončí na poli se soupeřovou figurkou, pošle ji zpět do jejího startovního
  domečku (platí i při nasazení na startovní pole).
- **Do cíle přesným hodem:** do domečku se vchází jen přesným počtem; přes vlastní figurky
  v domečku se nepřeskakuje. Když hod nejde využít, tah propadá.
- **Tah je povinný**, ale hráč si vybírá, kterou figurkou (nasazení po šestce povinné není).
- Kdo první dostane všechny figurky domů, vyhrál; ostatní **hrají o další pořadí**, hra končí,
  když zbývá poslední hráč.

### Volitelné varianty (`CloveceSettings`)

| Volba | Výchozí | Varianta |
|---|---|---|
| `capture` | vyhazuje se | **bez vyhazování** pro malé děti — figurky se na poli snesou |
| `enterOnOne` | jen šestka | **nasazení i jedničkou** (jednička ale neopakuje hod) |
| `pawns` | 4 figurky | **kratší hra** se 2 figurkami |
| `threeTries` | ano | jen jeden hod i bez figurky na okruhu |

### Zdroje

- Návod ke hře Člověče, nezlob se! (Bonaparte, magnetická verze, Alza): nasazení jen šestkou, každá
  šestka opravňuje k dalšímu hodu, vlastní figurky se přeskakují, na vlastní stoupnout nelze,
  vyhození zpět na záložní pole, cílová pole jen přesným hodem, ostatní hrají dál —
  <https://dwn.alza.cz/manual/41385>
- Wikipedie, Člověče, nezlob se!: tři hody, když hráč nemá nasazenou figurku; vyhození; cílový
  domeček ze čtyř polí; rodinné varianty — <https://cs.wikipedia.org/wiki/%C4%8Clov%C4%9B%C4%8De,_nezlob_se!>
- Domácí pravidla (pilsfree.net): tři hody bez figurky ve hře, šestka nasazuje a hází se znovu —
  <https://hosting.pilsfree.net/tonny/navody-manualy/clovece%20nezlob%20se%20-%20vylepsena%20pravidla.pdf>

Pravidla se v krabicích liší. Zvolili jsme nejběžnější rodinnou sadu: tři pokusy (Wikipedie,
domácí pravidla), přesný hod do cíle (návod Bonaparte). Zákaz přeskakování v domečku přebíráme
z oficiálních pravidel německé předlohy *Mensch ärgere Dich nicht* (Schmidt Spiele); české zdroje ho
neuvádějí, proto se dá snadno změnit v `legalMoves`.

## Počítač

1. **Začátečník** — náhodný legální tah (volbu určuje stav kostky, takže seed hru zopakuje).
2. **Hráč** — vyhoď, uteč z ohrožení, dojdi do domečku, nasaď, jinak nejdál vpředu.
3. **Opatrný** — jako 2, ale počítá všechny soupeře, kteří by na cílové pole mohli dohodit,
   a figurky drží mimo jejich dosah.
