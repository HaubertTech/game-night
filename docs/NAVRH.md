# Domácí liga — návrh (v1, 25. 10. 2026)

Webová aplikace na domácí herní večery. Hrají se různé hry, výsledky se sčítají do ligy
a dlouhodobého žebříčku. První hra je hospodský kvíz.

> Pracovní název. Varianty jsou v § 9; složka i repo se dají přejmenovat, dokud nemají remote.

## 1. Pro koho a jak se hraje

- **Rodina a přátelé doma**, 2–12 hráčů, od 4 let po dospělé.
- **Sdílená obrazovka + mobily.** Televize nebo notebook je „moderátor“: ukazuje otázky,
  odpočet, pořadí. Hráči se připojí z mobilu přes QR kód / čtyřmístný kód místnosti a odpovídají
  z něj (jako Kahoot).
- **Režim jednoho zařízení** pro malé děti a večery bez mobilů: tablet koluje po stole nebo
  odpovídá kapitán týmu na sdílené obrazovce.
- Aplikace běží jako PWA (instalovatelná, funguje na iPadu), hraje se v lokální síti nebo přes
  Tailscale; veřejný provoz až později.

## 2. Úrovně

| Úroveň | Pro koho | Jak vypadá otázka |
|---|---|---|
| **Hospoda** | dospělí a starší děti | text, 4 možnosti / otevřená odpověď / odhad čísla |
| **Lavice** | 1. stupeň ZŠ (6–11 let) | kratší text, 3–4 možnosti, často s obrázkem; látka podle RVP (prvouka, čeština, matematika) |
| **Pískoviště** | předškoláci (4–6 let) | obrázky, předčítání hlasem (čeština v prohlížeči), 2–3 obrázkové možnosti, bez čtení |

**Smíšený stůl je hlavní scénář.** Každý hráč má svou úroveň v profilu a v jednom kole dostane
otázku své úrovně ze stejné kategorie („Zvířata“ → dospělý dostane otázku o netopýrech, předškolák
pozná ježka podle obrázku). Body se počítají stejně, takže dítě může vyhrát nad tátou poctivě.
Úroveň se dá u hráče kdykoli změnit; navrhne se podle roku narození.

## 3. Hospodský kvíz — pravidla (MVP)

- **Večer = 4–6 kol po 6–10 otázkách**, každé kolo jedna kategorie. Výběr kategorií losem,
  hlasováním nebo ručně.
- **Typy otázek:** výběr z možností · otevřená odpověď (kontrola s tolerancí překlepů a diakritiky,
  sporné potvrdí moderátor) · odhad čísla (nejbližší bere) · obrázková · seřazení (později).
- **Žolík:** každý tým jednou za večer zdvojnásobí body v kole, které si vybere předem.
- **Rychlost** volitelně: bonus za rychlou správnou odpověď (vypnuto pro Pískoviště).
- **Hraje se po týmech nebo jednotlivě.** Tým se skládá na místě z profilů; body jdou týmu
  i do statistik každého člena.
- Na konci: pořadí, nej odpověď večera, kdo jak vedl v kategoriích.

## 4. Otázky — český dataset

**Kategorie Hospoda:** Česko a regiony · Dějiny · Zeměpis · Příroda · Věda a technika · Sport ·
Film a seriály · Hudba · Knihy a jazyk · Jídlo a pití · Slavní Češi · Odhadovačka · Mix.

**Kategorie Lavice:** Zvířata · Příroda kolem nás · Lidské tělo · Pohádky a večerníčky · Česko ·
Vesmír · Slova a písmenka · Počítání a logika · Sport.

**Kategorie Pískoviště:** Zvířata a jejich zvuky · Barvy a tvary · Počítání do 10 · Ovoce
a zelenina · Pohádkové postavy · Co k čemu patří · Roční období.

**Zdroje:**

1. **Generátor z Wikidat** (licence CC0) — fakta, která se dají vygenerovat a zkontrolovat
   strojově: krajská města, řeky a hory ČR, hlavní města, prezidenti, roky vzniku, rozlohy pro
   odhadovačku. Každá otázka nese odkaz na zdroj.
2. **Koncepty z AI** (přes `claude -p`) pro kategorie, kde Wikidata nestačí (pohádky, jazyk,
   prvouka). Každá má stav `koncept` a do hry jde až po kontrole: druhý průchod AI proti zdroji
   + ruční schválení v editoru.
3. **Vlastní a rodinné otázky** — editor v aplikaci, autorem může být i dítě („moje otázka“).
4. **Obrázky pro děti:** vlastní ilustrace ve stylu her (Bob a Bobek, viz
   `Wiki/1 Projects/1.1 Domov/Hry/_vizual.md`), dočasně volné fotky z Wikimedia Commons
   s uvedenou licencí.

**Co nepoužijeme:** otázky z televizních soutěží ani sady Hospodského kvízu (hospodskykviz.cz) —
autorská práva a hlavně je lidé znají.

**Cíl pro první hraní:** 600 otázek Hospoda, 300 Lavice, 150 Pískoviště (s obrázky). Systém si
pamatuje, kdo kterou otázku viděl, a půl roku mu ji znovu nedá.

## 5. Platforma: hry, večery, liga

```
Domácnost ─┬─ Hráči (profil, avatar, úroveň, rok narození)
           ├─ Týmy (stálé nebo na jeden večer)
           └─ Sezóny ── Večery ── Partie (kvíz | prší | žolíky | …) ── Výsledky
```

- **Hra je modul** se svým typem: *digitální* (kvíz — aplikace hraje) nebo *zapisovací*
  (prší, žolíky — hraje se fyzickými kartami, aplikace počítá body a pořadí). Žolíky mají
  zápis po kolech se součty, prší jen pořadí hráčů v partii.
- **Večer** spojí víc partií: třeba dvě partie prší, pak kvíz. Každá partie dá **ligové body
  za umístění** (např. 10–7–5–3–1), aby šly sčítat různé hry dohromady.
- **Liga / sezóna:** tabulka za období (měsíc, školní rok), nejlepší hráč a tým sezóny.
- **Dlouhodobý žebříček:** rating pro každou hru zvlášť (OpenSkill — umí víc hráčů i týmy)
  a celkový podle ligových bodů.
- **Statistiky:** úspěšnost po kategoriích, nejsilnější a nejslabší téma, série, vzájemné
  souboje, historie večerů, „rekordy domácnosti“.

## 6. Technika (návrh, k odsouhlasení)

| Vrstva | Volba | Proč |
|---|---|---|
| Aplikace | **SvelteKit + TypeScript**, PWA | jeden projekt pro web i server, malý bundle na mobily |
| Real-time | **WebSocket** (místnost = hra) | odpovědi z mobilů a stav na obrazovce okamžitě |
| DB | **PostgreSQL** v Dockeru, Drizzle ORM | stejné jako ve tvých ostatních projektech |
| Testy | Vitest + Playwright (hra se 3 virtuálními telefony) | ověří celý průběh večera |
| Provoz | Docker na `tomat-dev`, přístup přes Tailscale | žádný veřejný provoz v MVP |

Přihlášení: účet má jen domácnost (e-mail nebo odkaz), hráči jsou profily bez hesla — děti
nepotřebují e-mail. Mobily se do hry připojují kódem místnosti.

## 7. Etapy

| Etapa | Obsah | Hotovo, když |
|---|---|---|
| **1. Kvíz** | domácnost a profily, místnost + připojení mobilů, kvíz se 3 úrovněmi a týmy, 1 050 otázek, výsledky a statistiky hráče | odehrajeme doma celý večer bez zásahu do kódu |
| **2. Liga** | večery, sezóny, ligové body, žebříček OpenSkill, zápis prší a žolíků | sezóna listopad–prosinec má tabulku |
| **3. Obsah** | editor otázek, rodinné otázky, obrázkové kolo, hudební kolo, balíčky otázek | děti přidávají vlastní otázky |
| **4. Další hry** | další zapisovací i digitální hry, případně sdílení mimo domácnost | — |

## 8. Co zatím vědomě neděláme

Veřejná registrace a hraní přes internet s cizími · digitální karty (prší a žolíky se hrají
skutečnými kartami) · monetizace · hlasový moderátor s AI.

## 9. Názvy

**Platforma:**

| Název | Poznámka |
|---|---|
| **Domácí liga** | přesně říká, co to je; doporučuji |
| Kulatý stůl | rodinné, ale méně jasné |
| Hrací večer | popisné, obecné |
| Stolovka | hravé, krátké |
| Bodovačka | o zápisu bodů, sedí i ke kartám |

**Kvíz:**

| Název | Poznámka |
|---|---|
| **Kvízovna** | krátké, funguje pro všechny úrovně; doporučuji |
| Chytrá hlava | srozumitelné i dětem |
| Kvíz u stolu | sedí k platformě |
| Sovička | jen jako název dětské úrovně |
| ~~Hospodský kvíz~~ | zavedená značka jiné firmy — nepoužít |

Úrovně: **Hospoda · Lavice · Pískoviště**.

Před zveřejněním ověřit názvy v databázi ochranných známek ÚPV a obsazenost domén.
