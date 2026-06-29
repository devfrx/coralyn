# ADR-0023: Contatti del Cliente come colonne tipizzate (non `json`)

- **Status:** Accepted
- **Data:** 2026-06-29
- **Decisori:** Team di progetto (esecuzione Incremento 1 — scheda cliente)
- **ADR correlati:** [ADR-0003](0003-language-convention.md), [ADR-0010](0010-isolamento-multi-tenant.md), [ADR-0022](0022-base-path-api.md)
- **Decisioni rinviate correlate:** [D-022](../deferred.md) (validazione input — risolta da questo ADR), [D-024](../deferred.md) (privacy/GDPR — aperta)

## Context

L'Incremento 1 della scheda cliente porta l'anagrafica del `Cliente` (il bagnante)
da `{nome, cognome}` a `{nome, cognome, telefono, email, note}`, end-to-end
(schema → API → frontend), isolata per tenant.

Il [data-model](../design/data-model.md) prevedeva i contatti come singolo campo
`contatti json`. La spec ([2026-06-28-scheda-cliente-design.md](../../specs/2026-06-28-scheda-cliente-design.md), §7.4)
ha segnalato la necessità di una decisione esplicita: i contatti del bagnante
nell'MVP sono **pochi e noti** (un telefono, una email), più una `note` di servizio
(annotazione libera dello staff). Un blob `json` opaco non è la forma giusta per dati
con questa struttura, soprattutto perché vogliamo **validarli** server-side (formato
email) — l'occasione per affrontare [D-022](../deferred.md).

## Decision

I contatti del `Cliente` sono modellati come **colonne tipizzate nullable**, non come
`json contatti`:

```prisma
model Cliente {
  id             String       @id @default(uuid()) @db.Uuid
  stabilimentoId String       @db.Uuid
  nome           String
  cognome        String
  telefono       String?   // contatto
  email          String?   // contatto
  note           String?   // annotazione libera dello staff (text), non un contatto
  stabilimento   Stabilimento @relation(fields: [stabilimentoId], references: [id])

  @@index([stabilimentoId])
}
```

- `telefono` ed `email` sono **colonne `text` nullable** (additive: non toccano i dati
  esistenti, le righe pregresse restano valide con `NULL`).
- `note` è una **colonna `text` separata**: è un'annotazione dello staff, semanticamente
  distinta da un contatto. Non finisce in un eventuale value-object "contatti".
- La validazione server-side è realizzata con **DTO `class-validator`** (`@IsEmail` su
  `email`, `@IsString`/`@IsOptional` sugli altri) + `ValidationPipe({ whitelist, transform })`
  globale. Email malformata → **400** (non più un 500). Questo **risolve [D-022](../deferred.md)**.
- Il confine FE/BE resta `@driftly/contracts`: `ClienteDTO` espone i campi come
  `telefono?/email?/note?` (additivo), `CreaClienteInput`/`ModificaClienteInput` per gli input.
- La proiezione DTO nel service mappa `null → undefined` in **tutti** i metodi
  (`list`, `getById`, `create`, `update`), così il confine tipizzato non espone `null`.

Questa è una **divergenza consapevole** dal [data-model](../design/data-model.md)
(che indicava `contatti json`): il data-model viene **aggiornato** di conseguenza.

## Consequences

### Positive

- **Validazione**: `@IsEmail` a livello di DTO è diretta e dichiarativa; con un `json`
  servirebbe validazione custom dentro il blob.
- **Query e indici puliti**: telefono/email sono colonne prime-classe, interrogabili e
  indicizzabili in futuro (ricerca cliente per telefono/email) senza estrarre da `json`.
- **Tipi netti FE/BE**: i contratti espongono campi opzionali tipizzati, niente blob opaco
  da interpretare lato frontend.
- **Additivo e non-breaking**: colonne nullable + campi DTO opzionali; nessun consumer si
  rompe, RLS invariata (policy su `stabilimentoId`, non sui nuovi campi).

### Negative / Trade-off

- **Migrazione per nuovi contatti**: aggiungere un terzo canale di contatto (es. secondo
  telefono, PEC) richiederà una migration di colonna, non un semplice campo nel `json`.
  Accettabile: i contatti rilevanti sono pochi e cambiano di rado; quando emergerà un set
  ricco/variabile si potrà introdurre un'entità `Contatto` dedicata (additivo).
- **`note` come `text` libero**: nessuna struttura imposta; è intenzionale (campo di servizio).

## Alternatives considered

- **`contatti json` (come da data-model originale)** — scartata: blob opaco, validazione
  email scomoda, query/indici impraticabili. Adatto a contatti molti/variabili, non al caso MVP.
- **Entità `Contatto` separata (1-a-molti)** — scartata ora (YAGNI): sovradimensionata per
  un telefono + una email. Resta la via di evoluzione se i canali si moltiplicheranno.
- **Validazione custom su `json`** — scartata: reintroduce a mano ciò che `class-validator`
  offre dichiarativamente su colonne tipizzate.

## Rubric check

1. **Professionalità** — colonne tipizzate + validazione dichiarativa sono prassi standard
   per dati strutturati e noti; email validata al bordo dell'API.
2. **Convenzioni** — Prisma per lo schema, `class-validator` + `ValidationPipe` idiomatici in
   NestJS; confine FE/BE su `@driftly/contracts` come per le altre entità.
3. **Modularità** — la proiezione `toDTO` centralizza il mapping `null→undefined`; i DTO di
   validazione isolano le regole di input dal service.
4. **Zero debito** — risolve [D-022](../deferred.md) (validazione) invece di rinviarla;
   la divergenza dal data-model è registrata qui e il data-model è aggiornato; l'evoluzione
   verso un'entità `Contatto` resta aperta e additiva. La privacy/cancellazione è tracciata
   esplicitamente come [D-024](../deferred.md).
</content>
