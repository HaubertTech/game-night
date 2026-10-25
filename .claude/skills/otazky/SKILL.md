---
name: otazky
description: Tvorba, úprava a ověřování otázek do Kvízovny (data/questions/**) — pro všechny úrovně od Kočárku po Hospodu. Použij vždy, když se píšou nové otázky, rozšiřuje dataset, přesouvají otázky mezi úrovněmi nebo ověřují koncepty. Obsahuje pravidla úrovní, psaní zajímavostí, češtinu, obrázky, zdroje, postup psaní → ověření a seznam chyb, které ověřování opakovaně nachází.
---

# Otázky do Kvízovny

Kontrakt dat: `docs/UROVNE.md` (úrovně, typy, cílové počty) a `src/lib/types.ts`. Validátor:
`node scripts/check-questions.ts` (pravidla v `scripts/question-rules.ts`). Do hry jdou jen otázky
se `status: "verified"`.

## Postup — vždy dva oddělené kroky

1. **Psaní** — autor píše otázky se `status: "draft"`, ověřuje fakta webem (WebSearch/WebFetch)
   a pouští validátor. Nové id pokračují v číslování (`<level>-<theme>-NNN`); stávající id se
   nemění, přesun mezi úrovněmi = nové id.
2. **Ověření** — **jiný agent / jiná osoba než autor**. Projde každý draft proti zdrojům a proti
   tomuto skillu: drobné vady opraví, neopravitelné na jisté **odstraní** (nikdy nepíše náhradu
   odhadem), prošlým nastaví `verified`. Verified otázky jiných autorů nemění.
3. Validátor 0 chyb → commit s `Refs:` na issue.

Autor neověřuje sám sebe — dosavadní ověřování našlo v každé dávce 5–15 % vadných otázek.

## Úrovně (stručně, detail v docs/UROVNE.md)

| Úroveň | Věk | Kdo čte | Typy | Text | Možnosti |
|---|---|---|---|---|---|
| Kočárek `kocarek` | 2–3 | rodič | `point`, `imitate` | ≤ 50 zn. | 2–4 obrázky |
| Pískoviště `piskoviste` | 3,5–5 | aplikace nahlas | `choice` | ≤ 70 zn. | 3–4 obrázky |
| Prvňáček `prvnacek` | 6–7 | aplikace / dítě | `choice` | ≤ 90 zn. | 3, s emoji |
| Lavice `lavice` | 8–11 | dítě | `choice` | ≤ 110 zn. | 3–4 |
| Hospoda `hospoda` | dospělí | sám | `choice` (4), `estimate`, `open` | ≤ 160 zn. | 4 |

**Přiměřenost věku je nejčastější chyba.** Rodinný test ukázal: Pískoviště bylo pro 3,5leté moc
snadné, některé otázky Lavice byly pro šestiletého prvňáka těžké. Ptej se: zvládne to dítě
*na spodní hranici věku* bez nápovědy dospělého? Prvňáček umí jen začátky čtení a počítá do 20.

## Otázka

- **Jednoznačná odpověď.** Žádná jiná možnost nesmí být obhajitelná (čtverec *je* obdélník; tučňáci
  nežijí jen na ledu; „první“ vynálezce bývá sporný → ptej se na doložitelné „kdo si nechal
  patentovat“).
- **Neprozrazuje odpověď** — ani slovem v otázce („vinné“ → „víno“), ani obrázkem (`image` nesmí
  být tatáž věc jako odpověď; u mláďat neukazuj v možnostech dospělé zvíře, na které se ptáš),
  ani zajímavostí jiné otázky.
- **Stabilní fakt.** Žádná aktuální politika, aktuální rekordy, žijící držitelé titulů, počty
  obyvatel bez roku. U čísel (`estimate`) jen hodnota, kterou zdroje uvádějí shodně (rozdíl do
  ~5 %, letopočty přesně). Letopočty mají toleranci ±10 let, odhad dává max 1 bod.
- **Krátce a česky** (viz Čeština). Žádné dvojí zápory, chytáky ani „Která z možností NENÍ…“ u dětí.
- Možnosti: stejný gramatický tvar a přibližně stejná délka; správná odpověď na různých pozicích.
- `open`: odpověď 1–3 slova, varianty pravopisu do `accept`.
- Neopisuj otázky z TV soutěží ani ze sad Hospodského kvízu.

## Zajímavost (`fact`) — povinná, rodina ji má nejradši

- Jedna až dvě věty, které **něco přidají**: proč to tak je, souvislost, překvapení, příběh.
  **Nikdy neopakuje otázku** ani odpověď jinými slovy.
- Musí být **pravdivá a doložená**. Anekdoty „prý / podle tradice“ jen tehdy, když je tradice sama
  doložená — jinak vynech. Ověřování opakovaně odstraňuje: neexistující hitparády, přibarvené
  „první na světě“, data posunutá o rok, instituce, které v daném roce ještě neexistovaly
  (Česká televize vznikla 1992).
- Přiměřeně věku: u Kočárku a Pískoviště věta, kterou rodič přečte dítěti („Kozím mláďatům se
  říká kůzlátka.“); u Prvňáčka a Lavice srozumitelná dítěti; u Hospody klidně s číslem nebo
  příběhem. Do ~220 znaků.

## Obrázky (Kočárek, Pískoviště, Prvňáček)

- `image` povinný; každá možnost `choice`/`point` začíná emoji („🐶 Pejsek“). Emoji se mapují na
  ilustrace (`static/art/pics-emoji.json`) — preferuj emoji, které v knihovně mají ilustraci.
- **Jednoznačně rozpoznatelné malým dítětem.** Nepoužívej abstraktní nebo nové emoji (♨️, 🛞,
  🐦‍⬛ se nemusí zobrazit), vlajky jako nápovědu, ani emoji, které prozradí odpověď.
- Popis musí sedět k emoji (🥄 je lžíce, ne vařečka).

## Čeština

Řiď se zásadami čtivé češtiny (v project-hub skill `cestina`; pro tenhle repozitář platí shrnutí):
- přirozený slovosled, žádné doslovné překlady z angličtiny, žádný úřední styl;
- u dětí tykání, krátké věty, slova, která dítě zná (Prvňáček: žádná cizí slova bez vysvětlení);
- typografie: české uvozovky „…“, pomlčka –, nedělitelné mezery netřeba, čísla s mezerou po tisících
  (letopočty bez mezery);
- pravopis kontroluj zvlášť (ze/z, s/z, i/y, velká písmena u názvů: Krkonoše, Karlův most, Velká
  pardubická);
- zvuky zvířat po česku: kráva bú, koza mééé, ovce bééé, pes haf, kočka mňau, kohout kykyryký,
  kachna kvák, prase chro.

## Zdroje

`source`: URL (Wikipedie cs/en, oficiální stránky, encyklopedie); „obecná znalost“ jen u
triviálních faktů, „RVP ZV“ u školní látky. Odkaz musí vracet 200. Jeden turistický web nestačí
pro „největší / nejstarší / jediný“.

## Obsah, který nepatří

Nic strašidelného pro malé děti, násilí, nemoci a smrt jako téma otázky pro děti, reklama a
značky (kromě kulturně ikonických), žijící soukromé osoby, politika, náboženské spory, stereotypy.

## Kontrolní seznam ověřovatele

- [ ] odpověď správná a jediná možná (ověřeno ve zdroji)
- [ ] přiměřené spodní hranici věku úrovně
- [ ] otázka ani obrázek neprozrazují odpověď
- [ ] `fact` pravdivá, doložená, něco přidává, neopakuje otázku
- [ ] obrázek jednoznačný a popis k němu sedí
- [ ] čeština bez chyb, krátce, přirozeně
- [ ] není duplicitní (stejný text ani stejný fakt jinými slovy — i napříč úrovněmi)
- [ ] `source` funguje
