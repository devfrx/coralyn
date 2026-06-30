# ADR-0030: Codice e DB interamente in inglese (supera ADR-0003)

- **Status:** Accepted
- **Data:** 2026-06-30
- **Decisori:** Team di progetto
- **Supera:** [ADR-0003](0003-language-convention.md) (codice EN, **dominio IT**)
- **ADR correlati:** [glossario](../glossary.md), [data-model](../design/data-model.md)

## Context

[ADR-0003](0003-language-convention.md) aveva fissato il *code-mixing*: codice tecnico in
inglese ma **entità e attributi di dominio in italiano** (ubiquitous language DDD:
`Ombrellone`, `Stabilimento`, `Cliente`…), inclusi i **nomi di tabelle e colonne** del DB.
Alla verifica pratica questa scelta è risultata indesiderata: si vogliono **codice e database
interamente in inglese**, senza identificatori italiani e senza layer di mappatura
(`@@map`/`@map`). I termini italiani restano solo nella **lingua di prodotto** (UI a video) e
nella **documentazione**.

## Decision

- **Tutti gli identificatori di codice e DB sono in inglese**: nomi di model Prisma, tabelle,
  colonne, enum, DTO/interfacce condivise (`@coralyn/contracts`), classi/variabili/funzioni,
  file e cartelle, rotte FE, token CSS.
- **Nomi DB nativi**: il nome inglese dell'identificatore di codice è **direttamente** il nome
  della tabella/colonna (1:1, nessun `@@map`/`@map`).
- **UI a video resta in italiano** (prodotto per utenti italiani): label, testi, sottotitoli.
  L'eventuale i18n resta un tema separato.
- **Documentazione (ADR, spec, README, handoff) resta in italiano.** Gli ADR storici sono
  record immutabili e **mantengono** la terminologia del loro tempo; l'autorità corrente è
  questo ADR + il [glossario](../glossary.md) (che ora mappa termine-di-dominio IT →
  identificatore EN) + il [data-model](../design/data-model.md) (aggiornato ai nomi EN).
- Il concetto **tecnico** di isolamento multi-tenant resta `tenant` (`tenantId`, `forTenant`,
  `TenantContext`, GUC `app.current_tenant`): è il *meccanismo*, distinto dall'entità di
  business `Establishment`.

### Tabella di mapping (dominio IT → identificatore EN)

**Entità / enum**

| IT | EN |
|---|---|
| Stabilimento | Establishment |
| Cliente | Customer |
| Utente | User |
| Settore | Sector |
| Fila | Row |
| Ombrellone | Umbrella |
| Tipologia | UmbrellaType |
| Fascia | TimeSlot |
| Prenotazione (futura) | Booking |
| Listino (futuro) | Pricing |
| Ruolo (enum) | Role (valori `admin`/`staff`/`superuser` invariati) |
| Mappa (vista) | Map (`MappaGiornoDTO` → `DayMapDTO`) |

**Attributi / campi**

| IT | EN |
|---|---|
| nome (Customer) / cognome | firstName / lastName |
| nome (altre entità) | name |
| telefono / email / note | phone / email / notes |
| ordine | sortOrder |
| etichetta | label |
| oraInizio / oraFine | startTime / endTime |
| ordineLogico | logicalOrder |
| posizionePresentazione | presentationPosition |
| icona | icon |
| stabilimentoId | establishmentId |
| settoreId / filaId / tipologiaId / fasciaId | sectorId / rowId / umbrellaTypeId / timeSlotId |
| statoPerFascia | stateBySlot |
| dataAttiva / nomeStabilimento (FE) | activeDate / establishmentName |

**Stati slot** (`StatoSlot` → `SlotState`): `libero→free`, `abbonato→season`,
`giornaliero→daily`, `prenotato→booked`.

**File/cartelle & UI (codice)**

| IT | EN |
|---|---|
| `clienti/` · `ClientiView` · `ClienteDettaglioView` · `useClienti` | `customers/` · `CustomersView` · `CustomerDetailView` · `useCustomers` |
| `mappa/` · `MappaView` · `useMappaGiorno` | `map/` · `MapView` · `useDayMap` |
| `stabilimento/` · `StabilimentoView` | `establishment/` · `EstablishmentView` |
| `prenotazioni/` · `PrenotazioniView` | `bookings/` · `BookingsView` |
| `listino/` · `ListinoView` | `pricing/` · `PricingView` |
| `auth/RegistrazioneView` | `auth/RegisterView` |
| `identita/` · `IdentitaService` · `IdentitaModule` (api) | `identity/` · `IdentityService` · `IdentityModule` |
| `OmbrelloneCell` (ui-kit) | `UmbrellaCell` |
| token CSS `--color-state-{libero,abbonato,giornaliero,prenotato}` · `--color-state-normale-mark` | `--color-state-{free,season,daily,booked}` · `--color-state-normal-mark` |

**Rotte FE**: `/mappa→/map`, `/clienti→/customers`, `/prenotazioni→/bookings`,
`/listino→/pricing`, `/stabilimento→/establishment`, `/registrazione→/register`
(`/login`, `/report`, `/console` invariate).

## Consequences

### Positive
- Codebase e schema uniformi in inglese, senza code-mixing né indirezione `@@map`.
- Allineamento alle convenzioni internazionali; meno attrito con tooling/librerie.

### Negative / Trade-off
- **Rename trasversale** una tantum di tutto il repo (incluse entità preesistenti
  `Cliente`/`Stabilimento`/`Utente`). Mitigato: pre-release, nessun dato di produzione.
- **DB pre-release**: la storia delle migrazioni viene **azzerata in un unico `init`** inglese
  (le 5 vecchie migrazioni non hanno valore di migrazione: nessun ambiente deployato). Evita
  una fragile migrazione di RENAME su FK/indici/policy RLS.
- Lieve perdita dell'ubiquitous language nel codice: mitigata dal **glossario** IT↔EN.

## Alternatives considered
- **Mantenere ADR-0003** (dominio IT nel DB/codice) — scartata: è ciò che si vuole cambiare.
- **Solo nomi fisici DB via `@@map`** (codice IT, DB EN) — scartata: non soddisfa "codice in
  inglese" e introduce un layer di mappatura.
- **Migrazione di RENAME additiva** (preserva storia/dati) — scartata: complessa ed
  error-prone su FK/indici/policy RLS; il progetto è pre-release senza dati → squash più pulito.

## Nota — applicazione alla documentazione (2026-06-30)

Per evitare ambiguità su "cosa va in inglese" nei `.md`:

- **Identificatori di codice/DB** (endpoint `/api/map`, simboli `DayMapDTO`/`MapView`,
  colonne `establishmentId`/`umbrellaTypeId`, accessor `tx.customer`…) → **inglese**.
- **Termini di dominio in prosa italiana** ("l'ombrellone", "il cliente", "la fascia" come
  parole) → restano **in italiano**: sono lingua di documentazione, non identificatori. Il
  ponte parola↔identificatore è il [glossario](glossary.md).
- **Documenti autoritativi/viventi** — [glossario](glossary.md),
  [data-model](../design/data-model.md), `README.md`, [architettura](README.md),
  [deferred](deferred.md) — sono **allineati ai nomi inglesi**: descrivono lo stato corrente e
  devono combaciare col codice.
- **Documenti storici datati** (handoff, piani e spec in `docs/handoff|plans|specs/`, ADR
  superati come [ADR-0003](0003-language-convention.md)) sono **record immutabili**: gli
  snippet riflettono la nomenclatura del loro tempo e **non** vengono riscritti (riscriverli
  falserebbe la cronologia e rischierebbe errori). La nomenclatura corrente è questo ADR + il
  glossario; un lettore mappa i nomi storici tramite la tabella sopra.

La **fonte di verità** della nomenclatura è: questo ADR + il [glossario](glossary.md) + il
[data-model](../design/data-model.md).

## Rubric check
1. **Professionalità** — schema/codebase uniformi in inglese, scelta convenzionale.
2. **Convenzioni** — inglese ovunque nel codice; UI/doc nella lingua di prodotto/team.
3. **Modularità** — il glossario centralizza la mappatura IT↔EN.
4. **Zero debito** — niente code-mixing né `@@map`; baseline DB unica e pulita; ADR-0003
   esplicitamente superato (nessuna scelta silenziosa).
</content>
