# Město, jméno, zvíře (`mjz`)

Česká klasika pro TV + mobily. Logika je čistý reducer (`engine.ts`), co smí vidět která
obrazovka, řeší `view.ts`, nápověda pro hodnocení `hints.ts` + `data/mjz/hints/*.json`.

## Průběh hry

`setup` → `letter` → `writing` → `review` → `roundEnd` → (`letter` …) → `finished`

1. **Nastavení (`setup`)** — hostitel zvolí počet kol, čas, kategorie, „Ch“ a dětský bonus.
2. **Písmeno (`letter`)** — vylosuje se písmeno. Losuje se ze seedu, takže pořadí je
   opakovatelné, a vylosované písmeno se ve hře už nezopakuje. Hostitel může písmeno
   přelosovat (třeba když se s ním dětem nedá hrát).
   - Abeceda: A B C D E F G H I J K L M N O P R S T U V Z — bez Q, W, X, Y a bez písmen
     s háčkem a čárkou.
   - **Ch** jako samostatné písmeno je volitelné (`includeCh`). Když je zapnuté, slova na „Ch“
     patří jen k Ch, ne k C.
3. **Psaní (`writing`)** — každý píše na mobilu do kategorií. Kolo končí:
   - když někdo zmáčkne **Stop!** (musí mít vyplněno všechno) — ostatním pak běží ještě 10 s,
   - nebo když vyprší čas (výchozí 90 s),
   - nebo když všichni odevzdají (`done`), případně psaní ukončí hostitel.
4. **Hodnocení (`review`)** — TV ukazuje odpovědi po kategoriích. Sporné odpovědi se řeší
   hlasováním, hostitel má poslední slovo (viz níže).
5. **Konec kola (`roundEnd`)** — body za kolo a průběžné pořadí. Po posledním kole `finished`.

## Kategorie

- Dospělí (výchozí): Město, Jméno, Zvíře, Věc, Rostlina, Řeka/Hora.
- Děti: Jméno, Zvíře, Věc, Jídlo, Barva/Hračka.
- Sady jsou v `data/mjz/categories.json` (a jako konstanty `ADULT_CATEGORIES`, `KIDS_CATEGORIES`).

## Úrovně hráčů

| Úroveň | Výchozí pravidlo |
|---|---|
| hospoda (dospělí) | základní čas |
| lavice (1. stupeň) | +30 s; volitelně méně kategorií (`levelRules.lavice.categoryIds`) |
| piskoviste (předškoláci) | +60 s; nepíšou sami — list za ně vyplní dospělý (hostitel smí psát za `assisted` hráče) |

## Platnost odpovědi

1. Prázdná odpověď → 0.
2. Odpověď začíná jiným písmenem → **automaticky 0**, nedá se napadnout ani přehlasovat.
   Čárka a kroužek nedělají jiné písmeno (Ábel platí pro A), háček ano (Čáslav neplatí pro C).
3. Ostatní odpovědi platí, dokud je někdo nenapadne. Napadnout smí kdokoli kromě autora
   (napadající tím hlasuje „neplatí“), hlasují ostatní hráči kromě autora.
   **Většina rozhodne**, při remíze odpověď platí.
4. **Hostitel má poslední slovo** — jeho rozhodnutí přebíjí hlasování (a dá se vzít zpět).
5. Nápověda z `data/mjz/hints/` jen zvýrazní „známé“ vs. „neověřené“ odpovědi. Neplatnost
   z ní nikdy neplyne.

## Body

| Situace | Body |
|---|---|
| platnou odpověď v kategorii napsal jen jeden hráč | 20 |
| unikátní platná odpověď | 10 |
| platná odpověď shodná s někým | 5 |
| prázdná nebo neplatná | 0 |

Shoda se porovnává bez diakritiky, velikosti písmen, mezer a pomlček („Ústí nad Labem“ =
„usti nad labem“). Volitelný **dětský bonus** (`kidsBonus`): hráčům lavice se body za kolo
násobí 1,5 a zaokrouhlí nahoru.

## Akce

Každá akce nese `by` (`host` / `contestant` / `system`) a `now` (epoch ms). Hráč smí psát jen
do svého listu, hostitel řídí průběh. `timeout` posílá server, až uplyne `deadline`.

| Akce | Kdo | Fáze |
|---|---|---|
| `configure`, `start` | hostitel | setup |
| `redraw`, `startWriting` | hostitel | letter |
| `write`, `stop`, `done` | hráč (hostitel za `assisted`) | writing |
| `closeWriting` | hostitel | writing |
| `timeout` | system | writing |
| `challenge` | hráč, hostitel | review |
| `vote` | hráč (ne autor) | review |
| `rule`, `focus` | hostitel | review |
| `next` | hostitel | review, roundEnd |
| `end` | hostitel | setup, roundEnd |
| `kick` | hostitel | kdykoli před koncem |
