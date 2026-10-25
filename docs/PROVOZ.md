# Provoz – Domácí liga

## Spuštění

**Vývoj**

```bash
cp .env.example .env     # doplň hesla a HOUSEHOLD_COOKIE_SECRET
npm run db:up            # Postgres v Dockeru, 127.0.0.1:5437
npm run db:migrate
npm run dev
```

**Produkce (Docker)**

```bash
docker compose up -d db                          # jen databáze
docker compose --profile prod up -d --build app  # app; při startu sama spustí migrace
docker compose logs -f app
```

`docker compose up -d db` službu `app` nespouští (profil `prod`).

### Propojení app a db

Na stroji došly docker adresní pooly, nová compose síť nejde vytvořit, proto `db` běží na
výchozím `bridge` a publikuje `127.0.0.1:5437`. Služba `app` má `network_mode: host`: připojí se
na `127.0.0.1:5437` (stejné `DATABASE_URL` jako ve vývoji) a poslouchá přímo na hostu na `PORT`.
Za reverse proxy nastav `HOST=127.0.0.1`, aby app nebyla vidět zvenku. `ports:` se u host
networku nepoužívá. Entrypoint (`scripts/docker-entrypoint.sh`) spustí migrace; selžou-li,
kontejner skončí.

## Proměnné prostředí (`.env`)

| Proměnná | Význam |
|---|---|
| `DATABASE_URL` | Připojení k DB, např. `postgres://domaci_liga:HESLO@127.0.0.1:5437/domaci_liga` |
| `DATABASE_URL_TEST` | Testovací DB (název musí obsahovat `_test`); jen pro Vitest |
| `POSTGRES_USER`, `POSTGRES_PASSWORD` | Údaje DB kontejneru (a záloh) |
| `HOUSEHOLD_COOKIE_SECRET` | Podpis cookie domácnosti, min. 16 znaků: `openssl rand -hex 32` |
| `PUBLIC_ORIGIN` | Veřejná adresa, např. `https://liga.example.cz`. Odkazy v e-mailech, kontrola Origin (CSRF, WebSocket), Secure cookie |
| `ORIGIN` | adapter-node; za proxy nastav stejně jako `PUBLIC_ORIGIN` |
| `TRUST_PROXY` | `1` za reverse proxy: věří `X-Forwarded-For` / `X-Forwarded-Proto`. `XFF_DEPTH` (výchozí 1) |
| `PORT`, `HOST` | Port (výchozí 3000) a adresa; za proxy `HOST=127.0.0.1` |
| `BODY_SIZE_LIMIT` | adapter-node, výchozí 512K; pro import z tabletu doporučeno `2M` |
| `SMTP_URL` | `smtps://user:heslo@smtp.example.cz:465` nebo `smtp://user:heslo@host:587` (STARTTLS). Bez něj se e-maily ukládají do souborů |
| `MAIL_FROM` | např. `Domácí liga <liga@example.cz>` |
| `MAIL_OUTBOX_DIR` | Výchozí `data/outbox`; bez SMTP sem ConsoleMailer ukládá e-maily (ve vývoji odtud vezmeš ověřovací odkaz). V kontejneru je to volume `app-outbox` |

Hodnoty z `.env` nikam nekopíruj ani nevypisuj.

## Záloha a obnova

```bash
./scripts/backup-db.sh
```

Dump (`pg_dump --format=custom`) jde do `~/backups/domaci-liga/domaci_liga-YYYYmmdd-HHMMSS.dump`
(adresář 700, soubor 600, zápis atomicky přes `.tmp`), dumpy starší 14 dní se mažou.
Parametry přes env: `DB_CONTAINER` (domaci-liga-db-1), `POSTGRES_USER`, `DB_NAME`, `BACKUP_DIR`, `KEEP_DAYS`.

Kontrola dumpu: `docker exec -i domaci-liga-db-1 pg_restore --list < soubor.dump | head`

**Obnova do běžící DB** (přepíše data; nejdřív zastav app: `docker compose stop app`):

```bash
docker exec -i domaci-liga-db-1 pg_restore -U domaci_liga -d domaci_liga \
  --clean --if-exists --no-owner < ~/backups/domaci-liga/SOUBOR.dump
```

**Obnova do nové DB (test)**

```bash
docker exec domaci-liga-db-1 createdb -U domaci_liga domaci_liga_restore
docker exec -i domaci-liga-db-1 pg_restore -U domaci_liga -d domaci_liga_restore --no-owner < SOUBOR.dump
# po kontrole: docker exec domaci-liga-db-1 dropdb -U domaci_liga domaci_liga_restore
```

**Plánování (návrh, nic není nainstalováno).** Cron denně ve 3:30:

```
30 3 * * * /cesta/k/repu/scripts/backup-db.sh >> $HOME/backups/domaci-liga/backup.log 2>&1
```

Nebo systemd user timer: `domaci-liga-backup.service` (`Type=oneshot`, `ExecStart=/cesta/k/repu/scripts/backup-db.sh`)
a `domaci-liga-backup.timer` (`OnCalendar=*-*-* 03:30:00`, `Persistent=true`), `systemctl --user enable --now domaci-liga-backup.timer`.
Dump zůstává na stejném stroji; pro skutečnou zálohu ho kopíruj i mimo něj.

## Úklid

Neověřené účty se mažou po 30 dnech. Server to dělá sám jednou denně. Ručně:

```bash
node --disable-warning=ExperimentalWarning scripts/purge-unverified.ts
docker compose exec app node --disable-warning=ExperimentalWarning scripts/purge-unverified.ts
```

## Nasazení s doménou

Reverse proxy, např. Caddy (automatické HTTPS, WebSocket na `/ws` proxuje sám):

```
liga.example.cz {
    reverse_proxy 127.0.0.1:3000
}
```

Nastav v `.env`: `PUBLIC_ORIGIN=https://liga.example.cz`, `ORIGIN=https://liga.example.cz`,
`TRUST_PROXY=1`, `HOST=127.0.0.1`, `BODY_SIZE_LIMIT=2M`, `SMTP_URL`, `MAIL_FROM`.
DNS: A/AAAA záznam na server. Firewall: otevřené jen 80/443 (a SSH); Postgres zůstává jen na
`127.0.0.1:5437`.

### Kontrolní seznam před veřejným spuštěním

- [ ] `HOUSEHOLD_COOKIE_SECRET` je vygenerovaný (`openssl rand -hex 32`), ne z `.env.example`
- [ ] `PUBLIC_ORIGIN` / `ORIGIN` odpovídají veřejné adrese, `TRUST_PROXY=1`
- [ ] SMTP test: registrace testovacího účtu, ověřovací e-mail dorazí a odkaz vede na správnou doménu
- [ ] Záloha proběhla, dump prošel `pg_restore --list`, naplánovaný cron/timer
- [ ] `/podminky` a `/soukromi`: provozovatel a kontakt jsou zatím placeholder, zkontrolovat a doplnit
- [ ] `curl https://liga.example.cz/api/health` vrací 200
- [ ] Firewall: z internetu nejde na 5437 ani na 3000

## Bezpečnostní vlastnosti a omezení

- Rate limit je in-memory: provozuj **jedinou instanci**; restart ho vynuluje.
- Kontrola Origin u mutací i WebSocketu, podepsaná cookie, Secure cookie za HTTPS.
- Aplikační kontejner běží jako non-root (`node`).
- `/api/health` (200/503, bez cache) slouží i jako Docker HEALTHCHECK.
- Bezpečnostní hlavičky (CSP s nonce pro skripty, `X-Content-Type-Options`, `Referrer-Policy: same-origin`,
  `Permissions-Policy` s vypnutým mikrofonem a kamerou, `X-Frame-Options: DENY`, HSTS za HTTPS) nastavuje
  aplikace v `src/hooks.server.ts`; CSP jen v produkčním buildu (`vite.config.ts`). Statické soubory
  servíruje adapter-node bez hooků — hlavičky pro ně doplň v reverse proxy, pokud je chceš i tam.
- Limity: tělo JSON 256 kB (import z tabletu 2 MB), zpráva WebSocketu 4 kB, nejvýš 4 rozehrané
  živé místnosti na domácnost, nejvýš 4 správci a 5 otevřených pozvánek.

## Účty a přihlášení

- **Správce** se přihlašuje e-mailem a heslem (min. 10 znaků, scrypt). Session cookie platí 30 dní;
  po změně nebo obnově hesla přestanou platit ostatní session účtu.
- **PIN domácnosti** (4–8 číslic) nastaví správce v *Nastavení domácnosti*. Funguje jen na zařízení,
  kde se správce jednou přihlásil (cookie `dl_device`, 1 rok) — typicky TV nebo tablet. PIN smí jen hrát;
  export, mazání, pozvánky, PIN a heslo jsou jen pro přihlášení heslem. Po 5 chybných PINech se PIN
  zamkne na 15 minut (při dalších chybách déle).
- **Domácnost z doby před účty** (založená PINem při prvním spuštění) dál funguje: zařízení zůstanou
  přihlášená a na novém zařízení jde přihlásit názvem + PINem („Domácnost bez účtu…“). Na úvodní
  stránce svítí výzva *Doplnit účet*; po doplnění e-mailu a hesla se přihlášení názvem + PINem vypne.
- **Rate limit** (klouzavé okno, po IP a po e-mailu/domácnosti): přihlášení heslem 20/IP a 8/účet za
  15 min, PIN 20/IP a 10/domácnost za 15 min, registrace 5/IP za hodinu, obnova hesla a nový ověřovací
  odkaz 5/IP a 3/e-mail za hodinu, odkazy z e-mailů 30/IP za hodinu. Hodnoty: `src/lib/server/rate-limit.ts`.
- **E-maily**: ověření adresy (odkaz platí 48 h), nové heslo (60 min), pozvánka dalšího správce (7 dní).
  V DB je jen sha256 tokenu. Bez `SMTP_URL` jdou e-maily do `MAIL_OUTBOX_DIR` a odkaz je i v logu.
  `SMTP_URL` používá vestavěného minimálního SMTP klienta (`src/lib/server/mailer.ts`, bez závislosti):
  `smtps://` = TLS od začátku (465), `smtp://` = vyžaduje STARTTLS (587), `?starttls=0` jen pro lokální
  relay. AUTH PLAIN. Před spuštěním pošli zkušební registraci; kdyby poskytovatel potřeboval víc
  (OAuth, DKIM na straně aplikace), je čas na `nodemailer`.
