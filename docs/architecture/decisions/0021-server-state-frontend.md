# ADR-0021: Server-state e data-fetching del frontend — TanStack Query + Pinia

- **Status:** Accepted
- **Data:** 2026-06-28
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0008](0008-stack-e-layout.md) (stack FE: Vue 3 + Pinia), [ADR-0017](0017-design-system-frontend.md) (TanStack Table già adottato), [ADR-0010](0010-isolamento-multi-tenant.md) (tenant via header), [ADR-0007](0007-stile-architetturale.md) (API-first), [D-021](../deferred.md) (validazione runtime rimandata)

## Context

Il frontend (`apps/web-staff`) deve leggere e scrivere dati da un'API REST
([ADR-0007](0007-stile-architetturale.md)/[ADR-0008](0008-stack-e-layout.md)): nel primo
slice, **Clienti** su API reale (`GET/POST /clienti`) e **Mappa** su API mockata (MSW). Questi
sono **stato del server** — remoto, condiviso, soggetto a cache, scadenza, refetch, stati di
caricamento/errore e invalidazione dopo le mutazioni — concettualmente diverso dallo **stato UI/
client** (selezione corrente, data attiva, apertura del drawer).

[ADR-0008](0008-stack-e-layout.md) fissa **Pinia** come libreria di stato, ma Pinia è uno store
*client-side*: non offre di per sé caching per-query, deduplica delle richieste, refetch in
background, gestione di `stale`/`error`/`loading` né invalidazione dopo mutazione. Va deciso
**come** il FE gestisce lo stato del server, in modo coerente e riusabile da tutte le sezioni
(Clienti ora; Prenotazioni, Listino, Report poi). La decisione è trasversale: per questo è un ADR
e non una scelta tattica di piano.

## Decision

Adottiamo una **separazione esplicita tra stato del server e stato del client**:

- **Stato del server → [TanStack Query](https://tanstack.com/query) (`@tanstack/vue-query`).**
  Tutte le letture/scritture verso l'API passano da query e mutation: caching per chiave,
  deduplica, `isLoading`/`isError`/`data`, refetch e **invalidazione** dopo le mutation.
- **Stato del client/UI → Pinia** ([ADR-0008](0008-stack-e-layout.md)): data attiva della mappa,
  selezione, stato del drawer, contesto di sessione (incl. il tenant, vedi sotto), preferenze UI.
- **Confine netto:** i componenti non chiamano `fetch` direttamente. Ogni risorsa ha i suoi
  **composable** (`useClienti`, `useCreaCliente`, `useMappaGiorno`, …) che incapsulano
  query/mutation e **consumano i DTO di `@driftly/contracts`**; le **query key** sono centralizzate.
- **Tenant:** un client HTTP unico inietta l'header provvisorio `X-Stabilimento-Id`
  ([ADR-0010](0010-isolamento-multi-tenant.md)); l'id tenant vive nello stato client (Pinia) e
  fa parte delle query key (così cambiare stabilimento invalida correttamente la cache).
- **Validazione runtime dei payload:** **non** introdotta ora — i `contracts` sono tipi TS
  (compile-time). Rinviata e tracciata in [D-021](../deferred.md).

## Consequences

### Positive

- **Niente data-layer fatto a mano:** cache, refetch, dedup, stati e invalidazione sono forniti,
  testati e con devtools — meno codice e meno bug rispetto a riscriverli su Pinia.
- **Coerenza di famiglia:** stessa "famiglia" headless di **TanStack Table**, già adottata
  ([ADR-0017](0017-design-system-frontend.md)); API e mentalità comuni.
- **Confine pulito server/client:** Pinia resta snello (solo stato UI), le risorse remote sono
  isolate nei composable → testabili e riusabili da tutte le sezioni.
- **Pronto per le mutation:** "crea cliente", "nuova prenotazione" ecc. invalidano le query
  giuste senza orchestrazione manuale.

### Negative / Trade-off

- **Una dipendenza in più** e un concetto da apprendere (query/mutation/cache). Mitigato:
  superficie piccola, ottima documentazione, allineata a TanStack Table.
- Due "luoghi" di stato (Query per il server, Pinia per il client): va tenuta la disciplina del
  confine — esplicitata qui e verificata in review.

### Neutre / Note

- In test, le query sono pilotate da **MSW** (stessa rete mockata dei DTO), senza mockare la
  libreria; gli store Pinia si testano in isolamento.
- La validazione runtime ([D-021](../deferred.md)) è additiva: si potrà inserire `zod` ai bordi
  (parse dei DTO nei composable) senza cambiare i componenti.

## Alternatives considered

- **Solo Pinia + composable `useFetch`** — scartata: reimplementeremmo a mano caching,
  deduplica, refetch, invalidazione e stati di errore — esattamente ciò che TanStack Query
  fornisce; debito crescente man mano che si aggiungono sezioni.
- **`fetch` nativo + `ref` locali nei componenti** — scartata: nessuna astrazione di data-layer,
  duplicazione tra componenti, non scala oltre il prototipo.
- **Solo TanStack Query (anche per lo stato UI)** — scartata: la libreria è per lo stato del
  server; lo stato UI/client resta più naturale e già convenzionale in Pinia
  ([ADR-0008](0008-stack-e-layout.md)).

## Rubric check

1. **Professionalità** — gestione del server-state robusta (cache, refetch, mutation, devtools)
   come nei FE seri, invece di un data-layer artigianale.
2. **Convenzioni** — TanStack Query è lo standard de-facto per il server-state in Vue;
   coerente con TanStack Table già scelto ([ADR-0017](0017-design-system-frontend.md)) e con
   Pinia per il client ([ADR-0008](0008-stack-e-layout.md)).
3. **Modularità** — confine esplicito server/client; risorse remote isolate in composable che
   consumano `@driftly/contracts`; query key centralizzate.
4. **Zero debito** — niente cache/fetch reinventati; l'unico compromesso (validazione runtime) è
   **tracciato** in [D-021](../deferred.md) con rientro additivo, non silenzioso.
