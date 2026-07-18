# Guida al deploy di Coralyn su VPS — passo per passo

> Prima messa online, pensata per impararlo facendolo tu. Ogni passo spiega **cosa**
> fai e **perché**. I file di configurazione sono già pronti nel repo (li ho scritti
> io); tu esegui i comandi. Tempo stimato la prima volta: **1,5–2 ore**.

## Cosa stiamo per costruire

Un solo server (VPS) con Docker che fa girare tutto Coralyn dietro HTTPS:

```
Internet
   │  https://
   ▼
┌──────────────────── VPS (Docker) ────────────────────┐
│  caddy  ── termina HTTPS, instrada per sottodominio   │
│    ├─ app.tuodominio       → web (staff)              │
│    ├─ platform.tuodominio  → web-platform            │
│    └─ my.tuodominio        → web-customer            │
│                                                       │
│  ogni web-app ha un nginx interno che inoltra /api ──►│ api (NestJS)
│                                                    ┌──┘  │
│  api ── applica le migrazioni Prisma all'avvio ────┤     │
│                                                    ▼     │
│  db (postgres 16, RLS) ── NON esposto su Internet       │
└─────────────────────────────────────────────────────────┘
```

Costo indicativo: **~16 €/mese** (VPS ~15 + dominio ~1). Email e backup offsite nei piani gratuiti.

## Prerequisiti (account da creare, gratis dove non indicato)

| Servizio | A cosa serve | Costo |
|---|---|---|
| **Hetzner Cloud** (o simile) | il VPS | ~15 €/mese |
| **Cloudflare** (o Porkbun) | comprare il dominio + gestire i DNS | ~10 €/anno |
| **Resend** (o Postmark) | inviare le email (inviti, credenziali) | free tier |
| Un client SSH | connetterti al VPS | incluso (Windows: `ssh` in PowerShell) |

I file già pronti nel repo che userai:
- [`docker-compose.prod.yml`](../../docker-compose.prod.yml) — l'orchestrazione di produzione
- [`deploy/Caddyfile`](../../deploy/Caddyfile) — il reverse proxy + HTTPS
- [`deploy/.env.prod.example`](../../deploy/.env.prod.example) — template dei segreti
- [`deploy/backup-db.sh`](../../deploy/backup-db.sh) — backup del DB
- [`init.prod/01-app-role.sh`](../../init.prod/01-app-role.sh) — ruolo RLS in produzione
- [`apps/api/prisma/bootstrap-superuser.ts`](../../apps/api/prisma/bootstrap-superuser.ts) — primo login

---

## Passo 1 — Comprare il dominio e prepararlo

1. Su **Cloudflare Registrar** (o Porkbun) compra un dominio, es. `coralyn.it`. Evita
   GoDaddy & co.: rinnovi gonfiati. Con Cloudflare hai DNS e anti-DDoS gratis nello stesso posto.
2. Non impostare ancora i record DNS: lo faremo al **Passo 5**, quando avrai l'IP del VPS.
3. Decidi i 3 sottodomini (puoi tenere questi):
   - `app.coralyn.it` → operatori dei lidi (web-staff)
   - `platform.coralyn.it` → la tua console (web-platform)
   - `my.coralyn.it` → clienti finali (web-customer) — **qui puntano i QR/link degli inviti**

**Perché 3 sottodomini e non 3 domini:** un dominio, tre app, zero CORS (ognuna proxa
`/api` allo stesso backend). È lo schema standard e il più semplice da certificare.

---

## Passo 2 — Creare il VPS e metterlo in sicurezza

### 2.0 — Generare la chiave SSH (fallo sul tuo PC, una volta sola)

Una chiave SSH è una coppia di file: una parte **privata** (resta solo sul tuo PC, è la
tua identità — non condividerla MAI) e una parte **pubblica** (la incolli su Hetzner). Chi
possiede la privata entra nel server senza password. È più sicuro e più comodo di una
password.

1. Apri **PowerShell** sul tuo PC e controlla se ne hai già una:
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
   ```
   Se stampa una riga che inizia con `ssh-ed25519 ...`, **ce l'hai già**: salta al punto 4.
   Se dà errore "file non trovato", creala (punto 2).
2. Genera la coppia di chiavi (algoritmo `ed25519`, il consigliato oggi):
   ```powershell
   ssh-keygen -t ed25519 -C "coralyn-deploy"
   ```
   - Alla domanda *"Enter file in which to save the key"* → premi **Invio** (usa il
     percorso di default `C:\Users\<tu>\.ssh\id_ed25519`).
   - Alla *"passphrase"* → puoi mettere una password che protegge la chiave privata
     (consigliato: se ti rubano il PC, la chiave non è usabile senza) oppure premere
     **Invio** due volte per non metterla. La prima volta va bene anche senza.
3. Sono stati creati due file in `C:\Users\<tu>\.ssh\`:
   - `id_ed25519` → **privata** (segreta, non si tocca)
   - `id_ed25519.pub` → **pubblica** (questa la condividi)
4. Copia la chiave **pubblica** negli appunti (ti serve tra un attimo su Hetzner):
   ```powershell
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
   ```
   È una singola riga tipo: `ssh-ed25519 AAAAC3Nza...tuocommento`.

> **Perché ed25519 e non RSA:** chiavi più corte, più veloci, sicurezza equivalente o
> migliore. `-C "coralyn-deploy"` è solo un'etichetta per riconoscerla in futuro.
> **Se metti una passphrase** e non vuoi ridigitarla ad ogni connessione, avvia l'agente:
> `Start-Service ssh-agent; ssh-add $env:USERPROFILE\.ssh\id_ed25519`.

### 2.1 — Creare il server

1. Su Hetzner crea un server: **CX32** (4 vCPU / 8 GB) va benissimo per partire e regge
   già decine di lidi. Immagine: **Ubuntu 24.04**. Nella sezione **SSH keys** della
   creazione, clicca *"Add SSH key"* e **incolla la chiave pubblica** copiata al punto 2.0.4
   (quella che inizia con `ssh-ed25519`). Così il server nasce già con il tuo accesso, senza
   password iniziali via email.
2. Annota l'**IP pubblico** del server (es. `203.0.113.10`).
3. Connettiti dal tuo PC (PowerShell):
   ```powershell
   ssh root@203.0.113.10
   ```
4. **Hardening di base** (da eseguire sul VPS, come root). Copia-incolla a blocchi:
   ```bash
   # a) Crea un utente non-root con sudo (non lavorare da root)
   adduser coralyn          # scegli una password
   usermod -aG sudo coralyn
   rsync --archive --chown=coralyn:coralyn ~/.ssh /home/coralyn   # riusa la tua chiave SSH

   # b) Firewall: apri SOLO ssh + web
   apt update && apt install -y ufw
   ufw allow OpenSSH
   ufw allow 80/tcp
   ufw allow 443/tcp
   ufw --force enable

   # c) Installa Docker + plugin compose (script ufficiale)
   curl -fsSL https://get.docker.com | sh
   usermod -aG docker coralyn
   ```
5. Esci (`exit`) e rientra come utente normale, per usare Docker senza `sudo`:
   ```powershell
   ssh coralyn@203.0.113.10
   docker run --rm hello-world     # verifica che Docker funzioni senza sudo
   ```

**Perché:** non esporre nulla oltre 22/80/443, non lavorare da root, e non lasciare
Postgres aperto al mondo sono le tre regole che separano un deploy serio da uno bucato.

---

## Passo 3 — Portare il codice sul VPS

Sul VPS (utente `coralyn`):
```bash
# Se il repo è su GitHub/GitLab privato, configura prima una deploy key o usa https+token.
git clone <URL_DEL_REPO_CORALYN> coralyn
cd coralyn
git checkout main
```
Se il repo non è online, in alternativa puoi copiarlo dal tuo PC con `scp -r` o `rsync`,
ma il flusso `git pull` è quello che userai per gli aggiornamenti (Passo 9), quindi
conviene averlo su un remoto.

---

## Passo 4 — Configurare i segreti (`.env.prod`)

Sempre sul VPS, nella root del repo:
```bash
cp deploy/.env.prod.example .env.prod
```
Genera i segreti forti (esegui e incolla i valori nel file):
```bash
openssl rand -base64 48   # -> JWT_SECRET
openssl rand -base64 24   # -> POSTGRES_PASSWORD
openssl rand -hex 24      # -> APP_DB_PASSWORD (solo lettere/numeri: va anche nel DATABASE_URL)
```
Apri `.env.prod` (`nano .env.prod`) e compila **tutto**. Punti a cui fare attenzione:

- `DOMAIN_STAFF/PLATFORM/CUSTOMER` e `ACME_EMAIL` → i tuoi domini reali e la tua email.
- `APP_DB_PASSWORD` **deve comparire identica** dentro `DATABASE_URL`
  (`postgresql://coralyn_app:<QUI>@db:5432/coralyn_prod?schema=public`). Se non combaciano,
  l'API non si connette.
- `PLATFORM_SUPERUSER_EMAIL/PASSWORD` → il tuo primo account (lo attivi al Passo 7).
- `MAIL_*` → li riempi al Passo 6 (email). Per ora lascia i placeholder: il primo avvio
  funziona lo stesso, solo l'invio email non parte finché non li configuri.
- `SEED_ON_START=false` → **non toccare**. In produzione niente lido demo.

> `.env.prod` è già in `.gitignore`: non finirà mai nel repo. Custodiscilo (è la chiave di casa).

---

## Passo 5 — Puntare i DNS al VPS

Su Cloudflare, nella zona del dominio, crea **3 record A** verso l'IP del VPS:

| Tipo | Nome | Valore | Proxy |
|---|---|---|---|
| A | `app` | `203.0.113.10` | **DNS only** (nuvola grigia) |
| A | `platform` | `203.0.113.10` | DNS only |
| A | `my` | `203.0.113.10` | DNS only |

**Importante:** tieni il proxy Cloudflare **disattivato (grigio)** al primo avvio, così
Caddy può completare la sfida Let's Encrypt e ottenere i certificati. Potrai riattivarlo
dopo, se vorrai la CDN/WAF di Cloudflare davanti.

Aspetta che i DNS si propaghino (di solito pochi minuti). Verifica dal tuo PC:
```powershell
nslookup app.coralyn.it     # deve rispondere l'IP del VPS
```

---

## Passo 6 — Email transazionale (Resend)

Senza questo, gli inviti "imposta password" e le credenziali cliente non partono (o
finiscono in spam).

1. Crea un account su **Resend**, aggiungi il tuo dominio e segui la procedura: ti dà
   alcuni **record DNS** (SPF/DKIM, tipo TXT/CNAME) da inserire su Cloudflare. Servono a
   dimostrare che sei autorizzato a inviare per `@tuodominio` — senza, sei spam.
2. Crea una **API key**.
3. Nel `.env.prod` imposta:
   ```
   MAIL_HOST=smtp.resend.com
   MAIL_PORT=587
   MAIL_SECURE=false
   MAIL_USER=resend
   MAIL_PASS=<la tua API key>
   MAIL_FROM=Coralyn <no-reply@tuodominio.it>
   ```
   (Attenzione al nome esatto: la variabile è `MAIL_PASS`, non `MAIL_PASSWORD`.)

---

## Passo 7 — Primo avvio 🚀

Sul VPS, nella root del repo:
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
La prima volta builda le immagini (qualche minuto). Cosa succede in automatico:
- `db` parte e l'init crea il ruolo RLS `coralyn_app`;
- `api` aspetta il DB, poi **applica le migrazioni Prisma** (`migrate deploy`) e avvia;
- le 3 web-app e `caddy` partono; Caddy ottiene i certificati HTTPS (serve che il Passo 5 sia fatto).

Controlla che sia tutto su:
```bash
docker compose -f docker-compose.prod.yml ps          # tutti "running"/"healthy"
docker compose -f docker-compose.prod.yml logs -f api  # cerca "avvio API su :3000"; Ctrl-C per uscire
docker compose -f docker-compose.prod.yml logs caddy   # cerca "certificate obtained"
```

**Crea il tuo primo superuser** (una tantum — legge `PLATFORM_SUPERUSER_*` dal `.env.prod`):
```bash
docker compose -f docker-compose.prod.yml exec api \
  pnpm --filter @coralyn/api db:bootstrap-superuser
```
Deve stampare `superuser pronto: super@tuodominio.it`.

---

## Passo 8 — Verifiche post-deploy (fai tutte queste)

1. **Health API** (dal VPS): dovrebbe rispondere `{"status":"ok"}`:
   ```bash
   docker compose -f docker-compose.prod.yml exec api \
     node -e "require('http').get('http://localhost:3000/health',r=>{r.pipe(process.stdout)})"
   ```
2. **HTTPS + login piattaforma:** apri `https://platform.coralyn.it` dal browser. Il
   lucchetto dev'essere valido (certificato Let's Encrypt). Accedi con le credenziali
   `PLATFORM_SUPERUSER_*`. Da qui crei il primo lido reale e il suo admin.
3. **App staff:** `https://app.coralyn.it` deve caricare e mostrare il login.
4. **App cliente:** `https://my.coralyn.it` deve rispondere (schermata di attivazione/login).
5. **Email:** dalla console, prova a generare un accesso/credenziale che invia una mail e
   verifica che arrivi. Se non arriva, controlla `docker compose ... logs api` e i record
   DNS su Resend.
6. **Postgres non esposto (controllo di sicurezza):** dal tuo PC, `Test-NetConnection 203.0.113.10 -Port 5432`
   deve **fallire** (nessuna porta 5432 aperta). Se risponde, hai un problema.

> ⚠️ Da verificare col primo cliente reale: il refresh-token dell'app cliente
> (`web-customer`) e i cookie "Secure" dietro HTTPS. Caddy termina l'HTTPS e parla in
> HTTP interno ai container: se noti che il login cliente "non ricorda" la sessione,
> segnalamelo — si sistema con un header (`X-Forwarded-Proto`, già passato dall'nginx
> interno) o con la config cookie lato API. Non è bloccante per staff/piattaforma
> (che usano Bearer token), solo un check mirato sul canale cliente.

---

## Passo 9 — Backup automatici (il pezzo che rende tutto "professionale")

1. Prova il backup a mano:
   ```bash
   ./deploy/backup-db.sh          # crea /var/backups/coralyn/coralyn-<data>.sql.gz
   ```
   Se `/var/backups` dà "permission denied", crea la cartella una volta:
   `sudo mkdir -p /var/backups/coralyn && sudo chown coralyn:coralyn /var/backups/coralyn`.
2. **Schedulalo ogni notte** con cron:
   ```bash
   crontab -e
   # aggiungi (adatta il percorso assoluto del repo):
   0 3 * * * /home/coralyn/coralyn/deploy/backup-db.sh >> /var/log/coralyn-backup.log 2>&1
   ```
3. **Offsite** (consigliato): configura `rclone config` verso Backblaze B2 o Cloudflare R2
   (pochi centesimi/mese) e decommenta la riga `rclone copy` in fondo a `backup-db.sh`.
   Un backup solo sul VPS muore col VPS.
4. **Prova il restore almeno una volta** (fallo su un DB di prova, non in produzione):
   ```bash
   gunzip -c /var/backups/coralyn/coralyn-<data>.sql.gz | \
     docker compose -f docker-compose.prod.yml exec -T db psql -U coralyn -d coralyn_prod
   ```
   Un backup mai ripristinato è solo una speranza.

---

## Passo 10 — Aggiornamenti futuri

Quando fai avanzare il codice (nuova feature mergiata su `main`):
```bash
cd ~/coralyn
git pull
docker compose -f docker-compose.prod.yml up -d --build
```
Le migrazioni Prisma girano da sole all'avvio dell'api. **Prima di un update importante,
lancia un backup** (`./deploy/backup-db.sh`). Più avanti, quando ti stufi di farlo a mano,
si automatizza con una GitHub Action — ma non serve ora.

---

## Troubleshooting rapido

| Sintomo | Probabile causa / rimedio |
|---|---|
| Caddy non ottiene il certificato | DNS non ancora propagati, o proxy Cloudflare **arancione** (mettilo grigio), o porta 80 chiusa nel firewall. `docker compose ... logs caddy`. |
| `api` in loop / non healthy | `DATABASE_URL` non combacia con `APP_DB_PASSWORD`/`POSTGRES_DB`, oppure migrazione fallita. `docker compose ... logs api`. |
| Login superuser "credenziali errate" | Non hai eseguito `db:bootstrap-superuser`, o hai cambiato la password nel `.env.prod` senza rilanciarlo (è idempotente: rilancialo). |
| Le email non arrivano | Record SPF/DKIM mancanti su DNS, `MAIL_PASS` errata, o dominio non verificato su Resend. |
| Ho cambiato `.env.prod` e non ha effetto | Riavvia i servizi: `docker compose -f docker-compose.prod.yml up -d` (ricarica le env). |

## Checklist di sicurezza finale (prima di dare l'indirizzo a clienti veri)

- [ ] `JWT_SECRET`, password DB e superuser sono valori casuali forti (non i placeholder).
- [ ] `SEED_ON_START=false` (nessun lido demo in produzione).
- [ ] Porta 5432 non raggiungibile da Internet (verificata al Passo 8.6).
- [ ] Firewall attivo (solo 22/80/443).
- [ ] HTTPS valido su tutti e 3 i sottodomini.
- [ ] Backup notturno schedulato **e restore provato una volta**.
- [ ] Email di invito verificata end-to-end.
- [ ] `.env.prod` custodito in un posto sicuro (è la chiave di tutto).

---

## Nota sulla crescita (quando avrai molti lidi)

Questa configurazione (VPS singolo, DB condiviso con RLS) è lo **scaglione 1** e regge
comodamente decine di lidi. Quando crescerai:
- **Scaglione 2:** sposti Postgres su un managed (Neon / Hetzner managed) e scali l'API
  orizzontalmente (è stateless: basta più di un container `api` dietro Caddy).
- **Scaglione 3:** un singolo lido molto grande può essere promosso a un **DB dedicato**
  senza toccare il codice — è l'escape hatch già previsto in
  [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md) (deferred D-010).

Il lavoro che cresce non è l'infrastruttura del DB, ma **onboarding self-service e billing**
ai clienti (deferred D-002): sarà il prossimo grande modulo quando avrai clienti paganti.
