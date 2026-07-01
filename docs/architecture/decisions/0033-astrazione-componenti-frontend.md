# ADR-0033: Astrazione dei componenti frontend e fedeltà ai mock

- **Status:** Accepted
- **Data:** 2026-07-01
- **Decisori:** Team di progetto
- **ADR correlati:** [ADR-0017](0017-design-system-frontend.md) (design system frontend),
  [ADR-0018](0018-linguaggio-visivo.md) + [ADR-0027](0027-coralyn-linguaggio-visivo.md) (linguaggio visivo),
  [ADR-0009](0009-documentazione-di-design.md) (mockup come snapshot), [ADR-0030](0030-codice-e-db-in-inglese.md)

## Context

Le viste di `web-staff` (A1→A4.2) sono state costruite in modo pragmatico: molte
condividono markup e logica **duplicati** — risoluzione entità (`customerName`,
`umbrellaLabel`, `packageName`, `initials`) in 3-4 viste, celle di tabella scritte a mano
attorno a `DataTable`, coppie di bottoni nel footer dei modali, empty-state, formattazione
`€ x.toFixed(2)`, mappe stato→badge. Inoltre `ui-kit` **ha già** `Field`/`Input`/`Textarea`
ma diverse viste **non li usano** (form scritti a mano inline). Alcune viste sono ancora
**mock** (`PricingView`, `ConsoleView`, parti di altre): dati statici in attesa del backend.

Serve una convenzione esplicita su **cosa** astrarre, **dove** collocarlo (design system vs
app), e su come farlo **senza cambiare la resa visiva** — perché lo stile a video è già
validato dai mock ([ADR-0009](0009-documentazione-di-design.md):
`docs/design/mockups/*.html`) e non va toccato.

## Decision

### 1. Confine di collocazione

- **`@coralyn/ui-kit`** ospita i componenti **generici**, senza alcuna conoscenza del dominio
  o dei dati (nessun import di `@coralyn/contracts` di dominio, nessuna query): primitive di
  layout e UI (`EmptyState`, `Select`, `ModalFooter`, `PageToolbar`, `DataTable`), utility di
  **formattazione pure** (`formatEuro`, `initials`, `dateRange`).
- **`web-staff` (shared)** ospita le astrazioni **che conoscono il dominio**: composable di
  risoluzione entità (`useEntityLabels`), mappe stato→presentazione (`statusMaps`), factory
  dei composable server-state (`useQueryResource`). Vivono in `apps/web-staff/src/lib/` (o
  `src/shared/`), non in `ui-kit`.

Regola: se un componente/funzione dovrebbe conoscere `Customer`/`Booking`/`Umbrella` per
funzionare, **non** va in `ui-kit`.

### 2. Fedeltà visiva (vincolo ferreo)

L'astrazione di una vista esistente è **puramente strutturale**: il componente estratto
**emette le identiche classi** e lo stesso DOM di prima. **Zero regressione visiva** è un
requisito, non un auspicio. La verifica è duplice: (a) gli spec di vista esistenti restano
verdi; (b) confronto **screenshot before/after** su viste rappresentative.

Lo **stile è derivato solo** dai token di `packages/ui-kit/src/styles/theme.css` e dai
**mock** (`docs/design/mockups/*.html`), che restano la fonte di verità del linguaggio
visivo ([ADR-0018](0018-linguaggio-visivo.md)/[ADR-0027](0027-coralyn-linguaggio-visivo.md)).
Anche le viste ancora **mock** vanno rifattorizzate a usare i componenti condivisi
**mantenendosi pixel-identiche**, così continueranno a seguire il mock quando riceveranno i
dati reali.

### 3. Retro-compatibilità e adozione incrementale

I componenti potenziati (in particolare `DataTable` reso *data-driven*) **mantengono l'API
esistente** funzionante: l'adozione avviene **vista per vista**, senza un big-bang. Ogni
passo è verde e reversibile.

### 4. Componenti futuri

Nuovi componenti si creano **quando servono** (YAGNI), collocati secondo §1, con stile da
§2, e **ciascuno con il proprio spec** (Vitest, come `Icon.spec`). Non si anticipano
componenti "che potrebbero servire".

## Consequences

### Positive

- Meno duplicazione: una modifica allo stile/label si fa in un punto solo.
- Confine chiaro design-system vs app: `ui-kit` resta riusabile e privo di dominio.
- La fedeltà ai mock è protetta da un vincolo esplicito e verificabile.
- Base pulita per i componenti futuri delle viste ancora mock.

### Negative / Trade-off

- Il refactor tocca molte viste: rischio di regressione visiva mitigato da
  retro-compatibilità, adozione incrementale e verifica screenshot.
- `DataTable` data-driven aggiunge un'API in più (coesiste con quella a slot finché tutte le
  viste non migrano).

## Alternatives considered

- **Lasciare la duplicazione** — scartata: debito che cresce a ogni nuova vista.
- **Astrarre tutto in `ui-kit`** (anche `useEntityLabels`/`statusMaps`) — scartata: porterebbe
  dominio e dati nel design system, violando la sua riusabilità.
- **Ridisegnare mentre si astrae** — scartata: introdurrebbe regressioni visive rispetto ai
  mock validati; l'astrazione è strutturale, il redesign è un'altra decisione.

## Rubric check

1. **Professionalità** — design system con confine esplicito e componenti testati è prassi
   consolidata; la fedeltà pixel è la scelta sicura su una UI già validata.
2. **Convenzioni** — collocazione per genericità, stile dai token/mock, componente = +spec.
3. **Modularità** — unità piccole, interfaccia definita, testabili in isolamento; `ui-kit`
   senza dipendenze di dominio.
4. **Zero debito** — rimuove duplicazione tracciata; retro-compatibilità e adozione
   incrementale evitano il big-bang; i componenti futuri seguono la stessa regola.
