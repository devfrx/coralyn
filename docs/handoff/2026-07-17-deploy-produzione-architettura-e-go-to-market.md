# Handoff — Deploy di produzione, doc d'architettura e go-to-market (deploy + landing + pricing)

> **Data:** 2026-07-17 · **Tipo:** infra / go-to-market (NON una feature D-xxx).
> **TL;DR:** Preparati (nel repo, **non committati**) gli **artefatti di deploy di produzione**
> (compose prod + Caddy + init RLS prod + backup + bootstrap superuser), una **guida di deploy
> passo-passo** e un **runbook di manutenzione**, più il **doc d'architettura di sistema**
> (`docs/design/architecture.md`). In parallelo, in `../coralyn-lp` (cartella **separata, non git**)
> è stata costruita la **landing page** — handoff dedicato lì: [`../coralyn-lp/HANDOFF.md`](../../../coralyn-lp/HANDOFF.md).
> Discusso e definito il **pricing** (non ancora formalizzato in ADR). Coerenza doc↔codice verificata.

---

## 1. Stato git

**Tutto NON committato** (working tree, branch `main`). File toccati:

```
 M .gitignore                              (eccezione per versionare deploy/.env.prod.example)
 M apps/api/package.json                   (+ script "db:bootstrap-superuser")
?? apps/api/prisma/bootstrap-superuser.ts
?? deploy/                                 (Caddyfile, .env.prod.example, backup-db.sh)
?? docker-compose.prod.yml
?? init.prod/01-app-role.sh
?? docs/deploy/                            (README.md, MANUTENZIONE.md)
?? docs/design/architecture.md
```

- `.env.prod` (segreti reali) **resta ignorato**; solo `deploy/.env.prod.example` è tracciato
  (verificato con `git check-ignore`).
- **Modifica collaterale in un ALTRO repo:** `alice/.claude/launch.json` ha una nuova config
  `coralyn-lp` (python http.server :5500) per servire la landing nel preview pane. Innocua.

**Prima di committare:** `pnpm --filter @coralyn/api build` (typecheck di `bootstrap-superuser.ts`,
scritto ma **non ancora compilato/testato**) + review. Vedi §4.

## 2. Cosa è stato fatto

**Stack di produzione** (single-VPS + Docker):
- **`docker-compose.prod.yml`** — DB **non esposto** (niente `ports`), segreti da `.env.prod`
  (`env_file`), `SEED_ON_START=false`, reverse proxy **Caddy** davanti (HTTPS automatico
  Let's Encrypt), 3 SPA + api interni. Usa `-f docker-compose.prod.yml` esplicito → l'override dev
  (gitignored) NON viene caricato.
- **`deploy/Caddyfile`** — 3 sottodomini (`DOMAIN_STAFF/PLATFORM/CUSTOMER`) → i 3 container web.
  L'api resta interna (ogni web-app proxa `/api` col suo nginx).
- **`init.prod/01-app-role.sh`** — crea il ruolo RLS `coralyn_app` in prod. È uno **`.sh`** (non
  `.sql` come `init/01-app-role.sql` dev) perché deve leggere `$APP_DB_PASSWORD`/`$POSTGRES_DB`
  dall'env (l'init `.sql` dev ha password e nome DB **hardcoded** `coralyn_dev` → inutilizzabile
  in prod). `coralyn_app` resta **NOBYPASSRLS**.
- **`apps/api/prisma/bootstrap-superuser.ts`** + script `db:bootstrap-superuser` — vedi GOTCHA §3.1.
- **`deploy/backup-db.sh`** — `pg_dump` gzip + ritenzione 14gg + gancio offsite (rclone commentato).

**Documentazione:**
- **`docs/deploy/README.md`** — guida passo-passo (10 passi: dominio → VPS+SSH → segreti → DNS →
  email → primo avvio → bootstrap superuser → verifiche → backup → aggiornamenti). Include un
  **tutorial SSH keygen** (Windows/PowerShell) al Passo 2.0.
- **`docs/deploy/MANUTENZIONE.md`** — runbook operativo (14 sezioni: cadenze, salute, update,
  DB, backup+restore drill, TLS, disaster recovery, scaling, incidenti).
- **`docs/design/architecture.md`** — vista di sistema (4 diagrammi Mermaid: deployment, moduli
  backend, frontend, sequenza isolamento RLS). Complementare a `data-model.md`/`flows.md`, non ridondante.

## 3. GOTCHA (leggere prima di toccare)

### 3.1 — Bootstrap del primo login in produzione (il buco che abbiamo chiuso)
`apps/api/prisma/seed.ts` ha un **blocco duro** su `NODE_ENV=production` (riga 11) **e** semina un
lido demo con dati finti → **inadatto alla produzione**. Ma il bootstrap del superuser di piattaforma
viveva dentro quel seed. Con `SEED_ON_START=false` (obbligatorio in prod) non ci sarebbe **nessun
modo di fare il primo login**. Soluzione: **`bootstrap-superuser.ts`** — crea SOLO il superuser
cross-tenant (`establishmentId=null`, ADR-0026) da `PLATFORM_SUPERUSER_*`, idempotente, nessun dato
demo. Gira via `ts-node` (le devDeps **sono presenti** nell'immagine prod: il Dockerfile installa
senza `--prod`). Esecuzione: `docker compose -f docker-compose.prod.yml exec api pnpm --filter @coralyn/api db:bootstrap-superuser`.

### 3.2 — Altri gotcha deploy
- **Postgres non esposto** in prod (nessun `ports:`) — è una decisione di sicurezza, non dimenticanza.
- **Nome env esatto: `MAIL_PASS`** (non `MAIL_PASSWORD`). Verificato leggendo i `configService.get`.
- **Caveat cookie/HTTPS (da verificare al primo cliente reale):** Caddy termina l'HTTPS e parla in
  **http interno** ai container. Il refresh-token dell'app **web-customer** con cookie `Secure`
  potrebbe non “ricordare” la sessione dietro il proxy. **Non bloccante** per staff/platform (Bearer
  token). Se emerge: header `X-Forwarded-Proto` (già passato dall'nginx interno) o config cookie lato
  API. Annotato in `docs/deploy/README.md` Passo 8.
- **DNS proxy Cloudflare grigio (DNS only)** al primo avvio, altrimenti Caddy non completa la sfida ACME.

## 4. Decisioni aperte / prossimi passi

1. **Review + typecheck + commit** degli artefatti deploy (`pnpm --filter @coralyn/api build` per
   `bootstrap-superuser.ts`). È codice nuovo dell'app: va nel ciclo qualità del repo prima del commit.
2. **ADR per lo stack di deploy?** L'introduzione di **Caddy** (nuova dipendenza) + compose di
   produzione è una decisione strutturale: la skill `design-docs` suggerirebbe un ADR (prossimo
   libero **0050**). **Deferito**, da valutare con l'utente. Non l'ho scritto per non fare un fatto
   compiuto (dev-communication).
3. **Andare online**: comprare dominio (Cloudflare/Porkbun) + VPS Hetzner CX32 → guida Passo 1-2.
   Email reale (Resend) + SPF/DKIM.
4. **Pricing — DEFINITO ma non formalizzato.** Fasce a stagione: **Riva €390 / Baia €590 / Golfo €890**
   (IVA escl.), fee onboarding opzionale €100-200. Wedge competitivo = **prezzo pubblico + zero
   commissioni** contro Spiagge.it (leader, prezzo nascosto + commissioni). Costo di gestione ~97%
   di margine (infra ~16€/mese fino a decine di lidi). Valore asset: rifacimento ~€80-180k
   (16k righe prod + 14k test), 2-4× ARR con clienti. → Candidabile a un doc/ADR se si vuole fissarlo.

## 5. Metodo/principi usati

- **Ogni claim verificato sul codice reale** prima di scriverlo (moduli, `PrismaService.forTenant`,
  nomi env, ruolo RLS, blocco seed) — niente assunzioni.
- Skill: `design-docs` (diagrammi in `docs/design/`), `dev-communication` (decisioni strutturali
  esposte, non nascoste in consegna).
- **Coerenza doc↔codice verificata** a fine sessione: tutti i link relativi risolvono (corretti 3
  link rotti in `README.md`: erano `../` invece di `../../deploy/`), tutti i link ADR validi.

## 6. Riferimenti

- Guida: [docs/deploy/README.md](../deploy/README.md) · Runbook: [docs/deploy/MANUTENZIONE.md](../deploy/MANUTENZIONE.md)
- Architettura: [docs/design/architecture.md](../design/architecture.md)
- Landing (repo separato non-git): [`../coralyn-lp/HANDOFF.md`](../../../coralyn-lp/HANDOFF.md)
- Isolamento multi-tenant: [ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md) ·
  Auth: [ADR-0024](../architecture/decisions/0024-strategia-auth.md)/[0026](../architecture/decisions/0026-identita-rls-utente.md)
