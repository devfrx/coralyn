# ADR-0022: Base path API `/api` con `/health` a root

- **Status:** Accepted
- **Data:** 2026-06-28
- **Decisori:** Team di progetto (esecuzione Plan 1 — backend)
- **ADR correlati:** [ADR-0008](0008-stack-e-layout.md), [ADR-0010](0010-isolamento-multi-tenant.md), [ADR-0021](0021-server-state-frontend.md)
- **Aggiornamento (2026-06-30):** il dettaglio sull'header `X-Stabilimento-Id` (§Context) è superato dall'auth JWT ([ADR-0024](0024-strategia-auth.md)/[ADR-0026](0026-identita-rls-utente.md)): il FE invia ora `Authorization: Bearer` e il tenant è dedotto dal token. La decisione sul **base path `/api`** (con `/health` a root) resta invariata.

## Context

Il frontend (slice 1, già mergiato su `main`) parla col backend su base path **`/api`**:
`apps/web-staff/src/lib/http.ts` fissa `const BASE = '/api'` e invia l'header
`X-Stabilimento-Id` su ogni richiesta; i mock MSW servono `/api/clienti` e `/api/mappa`,
e `main.ts` del FE lascia **passare `/api/clienti` al backend reale** (mocka solo la mappa).

Il [Plan 1](../../plans/2026-06-28-core-foundation.md) descriveva invece i controller senza
prefisso (`@Controller('clienti')` → `/clienti`, `@Controller('health')` → `/health`). Senza
un allineamento, il backend reale risponderebbe su `/clienti` mentre il FE chiama `/api/clienti`:
contratto rotto. Serve far combaciare la superficie HTTP del backend col contratto FE **già in
produzione**, senza penalizzare le probe infrastrutturali (`/health`).

L'handoff di delega segnalava esplicitamente questo punto come "piccola deviazione di
allineamento col contratto, da registrare": questo ADR è quella registrazione.

## Decision

Si adotta un **prefisso globale `/api`** per tutte le route di business, con **`/health`
escluso** dal prefisso:

```ts
// src/main.ts
app.setGlobalPrefix('api', { exclude: ['health'] });
```

- Le route applicative vivono sotto `/api` (es. `GET/POST /api/clienti`), combaciando col
  contratto FE.
- **`/health` resta a root** (non `/api/health`): è una liveness/readiness probe per
  l'infrastruttura (load balancer, orchestratore di container), che non deve conoscere il
  prefisso applicativo; combacia inoltre con la DoD del Plan 1 (`GET /health → { status: 'ok' }`).
- I controller restano **agnostici al prefisso** (`@Controller('clienti')`): un unico punto
  (`main.ts`) governa il base path.
- I test e2e applicano lo **stesso** `setGlobalPrefix('api', { exclude: ['health'] })` nel
  bootstrap dell'app di test, perché `Test.createTestingModule` non esegue `main.ts`; così i
  path testati (`/api/clienti`) combaciano col runtime reale.

## Consequences

### Positive
- Contratto FE↔BE coerente: il FE già consuma `/api/*`, il backend ora lo serve.
- Separazione netta tra **superficie API** (versionabile, sotto `/api`) e **probe infra**
  (`/health` a root, stabile e indipendente).
- Governo centralizzato del prefisso: un solo punto di modifica, controller invariati.

### Negative / Trade-off
- Il prefisso va **replicato nel setup e2e** (duplicazione inerente a NestJS, documentata qui
  e in linea nel test).
- `/health` diventa un'**eccezione esplicita** all'`exclude`: va ricordata se in futuro altre
  route dovranno restare a root.
- Il versioning esplicito (`/api/v1`) non è introdotto ora: sarà un'evoluzione naturale di
  questa convenzione quando servirà (rinviato).

## Alternatives considered

- **Nessun prefisso (route a root)** — scartata: romperebbe il FE già mergiato, che chiama
  `/api/*`. Sposterebbe il debito sul frontend in produzione.
- **`/health` sotto prefisso (`/api/health`)** — scartata: le probe infrastrutturali non
  dovrebbero dipendere dal prefisso applicativo, e la DoD del Plan 1 richiede `GET /health`.
- **Prefisso via reverse-proxy (rewrite `/api` → `/`)** — scartata per ora: sposta la
  convenzione fuori dall'applicazione, complica il dev locale e i test, e disaccoppia il
  contratto dal codice che lo possiede. L'app possiede il proprio contratto HTTP.

## Rubric check

1. **Professionalità** — un base path API esplicito è prassi standard; la probe a root è
   convenzione infra consolidata.
2. **Convenzioni** — `setGlobalPrefix` è il meccanismo idiomatico di NestJS; la scelta allinea
   il backend al contratto FE esistente.
3. **Modularità** — un unico punto di controllo (`main.ts`); i controller restano agnostici al
   prefisso.
4. **Zero debito** — elimina la divergenza FE↔BE; l'unica duplicazione (prefisso nel test e2e)
   è strutturale di NestJS ed è documentata; il percorso verso il versioning resta aperto.
