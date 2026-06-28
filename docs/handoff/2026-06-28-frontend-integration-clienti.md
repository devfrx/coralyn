# Delega — Integrazione Frontend ↔ Backend reale per `/api/clienti` (Plan 1)

> **Cos'è questo documento.** Messaggio di delega **autosufficiente** per una **sessione dedicata**
> che collega il **frontend** (`apps/web-staff`, già mergiato) al **backend reale** appena completato
> (`apps/api`, Plan 1, su `main`), limitatamente all'endpoint del Plan 1: **`/api/clienti`**.
> La mappa (`/api/mappa`) **resta mockata** (è di un piano successivo). Tutto ciò che serve è qui sotto.

---

## 0. Il tuo compito in una frase

Far sì che il frontend, nel **browser in dev**, legga e scriva i Clienti dal **backend reale**
(`GET/POST /api/clienti`) invece che dal mock, **senza rompere** né `/api/mappa` (ancora mock) né i
test FE. È un intervento **piccolo e chirurgico**: una correzione del **proxy Vite** + verifica
d'integrazione. Niente auth (l'header tenant provvisorio resta), niente modifiche al backend.

## 1. Skill e metodo (obbligatorio)

- A inizio sessione applica **`superpowers:using-superpowers`**.
- Il lavoro è piccolo e tecnico: niente brainstorming. Applica **TDD** dove tocchi logica, e chiudi
  con **`superpowers:verification-before-completion`**: nessun "fatto" senza l'evidenza (FE nel
  browser che parla col backend reale + test FE verdi).
- **Decision rubric [ADR-0002]**: ogni scelta motivata, raccomandazioni nette. Un **ADR** per ogni
  decisione architetturale (prossimo libero: **0023**); rinvii in `deferred.md`. Lingua: codice EN,
  dominio IT, docs IT. Commit atomici, messaggi in inglese, ognuno col trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. **Comunica in italiano.**

## 2. Stato attuale (il tuo punto di partenza)

- Branch **`main`**, working tree pulita. Node 24, pnpm 11.9.0, Docker. OS Windows (PowerShell + Bash).
- **Backend Plan 1 FATTO e su `main`** (`apps/api`): NestJS che espone
  - `GET /health` → `{ status: 'ok' }` (a **root**, NON sotto `/api`),
  - `GET /api/clienti` → `ClienteDTO[]`, `POST /api/clienti` `{nome,cognome}` → `ClienteDTO` (**201**),
  - isolamento multi-tenant via header **`X-Stabilimento-Id`** + RLS PostgreSQL. Senza header valido → **400**.
  - **Verificato empiricamente** (curl, 2026-06-28): `/health`→ok; `/api/clienti` 200/201; tenant
    diverso → `[]` (isolato); `/clienti` (senza prefix) → **404**; senza header → 400.
- **Frontend già predisposto** (`apps/web-staff`, Vue 3 + Vite + TanStack Query + Pinia + MSW):
  - [`src/lib/http.ts`](../../apps/web-staff/src/lib/http.ts) — `BASE = '/api'`, header `X-Stabilimento-Id` (riga 10).
  - [`src/stores/session.ts`](../../apps/web-staff/src/stores/session.ts) — `stabilimentoId` inizializzato a
    `TENANT_DEV = '00000000-0000-0000-0000-000000000001'` (riga 5; commento "provvisorio, Piano 2 → JWT").
  - [`src/features/clienti/useClienti.ts`](../../apps/web-staff/src/features/clienti/useClienti.ts) —
    `useClienti()` (GET, query key `['clienti', tenantId]`) e `useCreaCliente()` (POST `{nome,cognome}`,
    invalida la lista). Consumati da `features/clienti/ClientiView.vue`.
  - **MSW**: [`src/mocks/handlers.ts`](../../apps/web-staff/src/mocks/handlers.ts) mocka **solo `/api/mappa`**.
    [`src/main.ts`](../../apps/web-staff/src/main.ts) avvia il worker con `onUnhandledRequest: 'bypass'`
    (riga 13): nel browser **`/api/clienti` NON è mockato → passa al backend reale via proxy**.
    [`src/mocks/server.ts`](../../apps/web-staff/src/mocks/server.ts) (solo per i **test** Vitest/Node)
    mocka anche `/api/clienti` GET/POST.
- **Il dev tenant `00000000-…-0001` esiste già nel DB** come `Stabilimento` (seed del backend), quindi
  il `POST /api/clienti` con quell'header passa il vincolo di FK.

## 3. Documenti da leggere (prima di toccare codice)

1. **Questo handoff.**
2. [Plan 1 — Core Foundation](../plans/2026-06-28-core-foundation.md) (cosa fa il backend) e
   [ADR-0022](../architecture/decisions/0022-base-path-api.md) (perché `/api` con `/health` a root).
3. [contracts](../../packages/contracts/src/index.ts) — `ClienteDTO = { id, nome, cognome }` (condiviso).
4. Il codice FE elencato in §2 (http.ts, session.ts, useClienti.ts, mocks/, vite.config.ts).

## 4. IL FIX CENTRALE — il proxy Vite (incoerenza confermata)

In [`apps/web-staff/vite.config.ts`](../../apps/web-staff/vite.config.ts) il dev server ha:

```ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
  },
},
```

Il `rewrite` **strippa `/api`**: una richiesta del browser a `/api/clienti` viene inoltrata a
`http://localhost:3000/clienti`. Ma il backend (ADR-0022) **serve `/api/clienti`, non `/clienti`** →
**404** (provato con curl: `/clienti`→404, `/api/clienti`→200). Il proxy era stato scritto assumendo un
backend senza prefisso; il backend invece monta tutto sotto `/api` (così in **produzione**, senza il
proxy Vite, il FE chiama `/api/clienti` direttamente sul backend).

**Fix raccomandato (netto):** rimuovere il `rewrite`, così `/api` arriva intatto:

```ts
'/api': { target: 'http://localhost:3000', changeOrigin: true },
```

Ora `/api/clienti` (browser) → `http://localhost:3000/api/clienti` (backend) → 200. Aggiorna il commento
accanto. Questa è **l'unica modifica di codice FE necessaria** per l'integrazione runtime.

> Nota: il backend ascolta su `process.env.PORT ?? 3000`. Il target `localhost:3000` è corretto.

## 5. I test FE NON vanno rotti (e non serve toccarli)

I test (`vitest`) girano in **Node con MSW `server.ts`**, che mocka `/api/clienti` in memoria con
`onUnhandledRequest: 'error'` ([`src/test/setup.ts`](../../apps/web-staff/src/test/setup.ts)). Il cambio
del **proxy** riguarda **solo il runtime browser (dev)**, non i test. Quindi:
- **NON rimuovere** i mock `/api/clienti` da `server.ts`: servono ai test unit/component
  ([`features/clienti/ClientiView.spec.ts`](../../apps/web-staff/src/features/clienti/ClientiView.spec.ts)).
- Dopo il fix del proxy, esegui `pnpm --filter @driftly/web-staff test` e verifica che resti **verde**.

Se decidi di aggiungere un test d'integrazione *reale* (browser ↔ backend), fallo come prova manuale o
e2e separato — **non** sostituendo i mock unit (che devono restare deterministici e senza DB).

## 6. Come avviare e verificare (l'evidenza richiesta)

```bash
# 1) Database (porta 5433 su questa macchina via docker-compose.override.yml gitignored; 5432 altrove)
docker compose up -d
pnpm dlx dotenv-cli -e .env -- pnpm --filter @driftly/api exec prisma migrate deploy   # dev
pnpm dlx dotenv-cli -e .env -- pnpm --filter @driftly/api exec prisma db seed           # Stabilimento dev 00..001

# 2) Backend (porta 3000). In dev, watch:
pnpm dlx dotenv-cli -e .env -- pnpm --filter @driftly/api exec nest start
#   (oppure build + node: il bundle è in apps/api/dist/src/main.js — NON dist/main.js)

# 3) Frontend (Vite, porta 5173)
pnpm --filter @driftly/web-staff dev
```

**Verifica nel browser** (`http://localhost:5173`): apri la vista Clienti →
- la lista arriva dal **backend reale** (inizialmente vuota per il tenant dev),
- crea un cliente → `POST` reale → compare nella lista (TanStack invalida `['clienti', tenantId]`),
- la mappa continua a funzionare **mockata** (`/api/mappa` via MSW).

Conferma anche, da terminale (sanity): `curl -H "X-Stabilimento-Id: 00000000-0000-0000-0000-000000000001"
http://localhost:3000/api/clienti` → 200.

## 7. Scope (blindato)

- **SÌ**: fix del proxy Vite + verifica integrazione `/api/clienti` + test FE verdi.
- **NO**: non toccare `/api/mappa` (resta mock), non implementare auth/JWT (l'header dev resta), non
  modificare `apps/api`, non rinominare/rimuovere export di `@driftly/contracts` (solo additivo).
- **Coerenza del contratto: già verificata** — `ClienteDTO {id,nome,cognome}`, `POST {nome,cognome}`→201,
  header `X-Stabilimento-Id`, dev tenant `00..001` (seedato): **nessun mismatch**. L'unico disallineamento
  era il proxy (§4).

## 8. Ownership

Possiedi **`apps/web-staff`** (e, se serve un tipo nuovo, **solo aggiunte** a `packages/contracts`).
**NON toccare** `apps/api`. Branch: lavora su `main` o un breve `feat/web-integration` mergiato a `main`
(niente worktree).

## 9. Definition of Done

- Proxy Vite corretto; nel browser la vista Clienti legge/scrive dal backend reale; `/api/mappa` ancora mock.
- `pnpm --filter @driftly/web-staff test` verde; `pnpm lint` pulito.
- Se prendi una decisione di design non coperta → **ADR-0023** o **deferred**, mai silenziosa.
- Tutto committato, working tree pulita. Aggiorna `MEMORY.md` se cambia lo stato.

## 10. Trappole

- **Backend giù / DB giù** → la vista Clienti mostra errore (apiFetch lancia su `!res.ok`). Avvia DB+backend prima.
- **Porta 5433**: su questa macchina il DB è mappato a 5433 (la 5432 è occupata) via
  `docker-compose.override.yml` (gitignored). Su una macchina pulita è 5432: i file versionati usano 5432.
- **`/health` è a root**, non `/api/health` (il FE comunque non lo chiama).
- **Non rompere i mock dei test** (§5): runtime browser ≠ ambiente test.
