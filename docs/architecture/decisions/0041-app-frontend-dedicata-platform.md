# ADR-0041: App frontend dedicata `apps/web-platform` per la Console distributore

- **Status:** Accepted
- **Data:** 2026-07-05
- **ADR correlati:** [0008](0008-stack-e-layout.md), [0015](0015-osservabilita-e-console-superuser.md), [0024](0024-strategia-auth.md), [0033](0033-astrazione-componenti-frontend.md)
- **Spec:** [2026-07-05-platform-console-superuser-design.md](../../superpowers/specs/2026-07-05-platform-console-superuser-design.md)

## Context

La Platform Console ([ADR-0015](0015-osservabilita-e-console-superuser.md)) serve il **distributore**
(ruolo `superuser`): gestione lidi, provisioning, metriche cross-tenant. È un'audience e un dominio di
sicurezza **diversi** da quelli dell'app operatore `apps/web-staff` (staff/admin del singolo lido).

Va deciso *dove* vive il frontend: una **sezione di route** dentro `web-staff` (con landing-per-ruolo),
oppure una **SPA separata**. La prima è meno lavoro immediato; la seconda separa i due prodotti.

## Decision

La Console distributore è una **SPA dedicata `apps/web-platform`**, separata da `web-staff`, che
**riusa i package condivisi** del monorepo (`@coralyn/ui-kit`, `@coralyn/contracts`). Ha la propria
`LoginView` (brand "Coralyn Platform") che colpisce la **stessa** `POST /api/auth/login`
([ADR-0024](0024-strategia-auth.md)): auth condivisa sul backend, frontend separati.

## Consequences

### Positive
- **Isolamento del blast radius:** il codice superuser (route, viste, logica cross-tenant) **non viene
  mai spedito** ai browser dello staff-lido, e viceversa. Nessun rischio di esporre viste privilegiate
  per un `v-if`/guard di rotta sbagliato.
- **Deploy e versioning indipendenti:** la console si rilascia senza toccare l'app operatore.
- **Modularità reale:** due prodotti per due audience, confine già presente nel dominio; i package
  condivisi evitano duplicazione di UI e contratti.

### Negative / Trade-off
- **Più infrastruttura ora:** nuovo scaffold Vite, propria `LoginView`, Dockerfile, nginx, pipeline CI.
  È il prezzo accettato del "meno pigro / zero debito".

## Alternatives considered

- **Sezione `/platform/*` dentro `web-staff` con landing-per-ruolo** — meno lavoro immediato, ma
  spedisce il codice superuser al bundle del tenant (blast radius) e accoppia due audience/prodotti in
  un unico deploy e router. Estrarla in seguito (router condiviso, stato, auth-branch) è oneroso.
  Scartata.

## Rubric check

1. **Professionalità** — separazione per audience/dominio di sicurezza è la scelta senior; non è
   over-engineering perché il confine è reale, non speculativo.
2. **Convenzioni** — monorepo pnpm con più app che condividono package è prassi standard
   ([ADR-0008](0008-stack-e-layout.md)); riusa l'astrazione componenti ([ADR-0033](0033-astrazione-componenti-frontend.md)).
3. **Modularità** — app isolata, contratti/UI condivisi via package, auth condivisa sul BE.
4. **Zero debito** — isolamento dal giorno uno evita l'estrazione dolorosa futura; nessuna duplicazione
   di logica di dominio.
