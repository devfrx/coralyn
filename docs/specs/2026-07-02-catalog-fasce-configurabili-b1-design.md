# Consolidamento Catalogo — Slice B1 "Fasce configurabili" — Design Spec

- **Data:** 2026-07-02
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-02.
- **Origine:** roadmap Catalogo post-slice "Conferme & Rinnovi" (mergiato su `main`). Sequenza decisa con l'utente:
  **B1 fasce configurabili** (questo doc) → **B2 provenienza-prezzo** (spec propria, §8) → Slice C equipment.
- **ADR di riferimento:** [ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) (disponibilità a
  slot/fasce — questo slice ne realizza il livello di *configurazione*), [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md)
  (date/orari: round-trip UTC, `@db.Time`), [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md)
  (una Rate = un prezzo; la fascia è una dimensione della Rate), [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md)
  (componenti ui-kit condivisi — riuso `ConfirmDialog`/`Modal`), [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow).
- **Convenzione:** codice/DB inglese; UI/doc italiano. Baseline test da NON regredire (post-slice Conferme&Rinnovi,
  verificata live): **api unit 84 · api e2e 114 · web-staff 128 (globa ui-kit) · ui-kit standalone 55.**
- **Nessun nuovo ADR** (incremento su ADR-0013, che già prevede la fascia "configurabile"). Prossimo ADR libero resta **0035**.

---

## 1. Situazione attuale (verificata leggendo il codice)

- **`TimeSlot` esiste a schema** (`schema.prisma:95-107`): `name`, `startTime`/`endTime` (`@db.Time(0)`, oggi con
  commento "not exposed in the DTO (ADR-0013)"), `sortOrder`, relazioni `bookings`/`rates`. Oggi le fasce sono solo
  **seedate** (`SEED_ON_START`), non c'è alcun CRUD.
- **FE**: le fasce compaiono come **pill di sola lettura** nella vista Listino (`PricingView.vue:296-301`), popolate da
  `useDayMap().timeSlots`; nella modale prenotazione (`MapView.vue`) come `SegmentedControl` delle fasce libere.
- **Il backend è già "slot-aware" e overlap-aware** (ADR-0013, realizzato negli slice precedenti):
  - `slotsOverlap(a, b)` (`booking.availability.ts:8`) — intervalli **semiaperti [start,end)**; c'è già uno spec che
    copre *Giornata intera sovrappone Mattina e Pomeriggio* (`booking.availability.spec.ts:16-17`).
  - **Anti-overlap in scrittura** (`bookings.service.ts:138-141`): confronto per **overlap orario**
    (`slotsOverlap(b.timeSlot, p.slot)`), non per id uguale → una prenotazione *Giornata intera* blocca *Mattina* e
    *Pomeriggio* sullo stesso ombrellone/giorno (409 "Fascia non disponibile"), e viceversa *Mattina* blocca *Giornata*
    ma **non** *Pomeriggio*.
  - **Proiezione mappa** (`map.projection.ts:52`): `stateBySlot` di ogni fascia è calcolato via
    `slotsOverlap(bookedSlot, slot)` → una prenotazione *Giornata intera* segna occupate **entrambe** le metà.
  - **Pricing engine** (`pricing.engine.ts`): la fascia è una dimensione della Rate (`timeSlotId`), con precedenza
    esplicita (ADR-0032). Nessun cambiamento richiesto dal *modello*.
- **Conseguenza**: il caso "Giornata intera **oltre** Mattina e Pomeriggio" (3 fasce sovrapposte) è **già supportato**
  da disponibilità, prezzo e proiezione mappa. Mancano solo: (a) la **configurazione** (CRUD) delle fasce, (b)
  l'**esposizione degli orari** nel DTO, (c) l'adattamento del **rendering della cella mappa** (oggi assume 2 metà per
  indice `[0]/[1]`).

## 2. Obiettivo e scope

Dare all'operatore il **controllo delle fasce** (crearle/rinominarle/ritimarle/eliminarle) dalla vista Listino,
esponendo gli orari, senza regredire disponibilità/prezzo/mappa e supportando il pattern *Giornata intera + Mattina +
Pomeriggio*. Quattro layer coesi (ordine di commit):

1. **Contratti + backend CRUD** (`TimeSlotsController`/`Service`, DTO orari "HH:MM", delete-guard 409).
2. **Esposizione orari nel DTO mappa** (`TimeSlotDTO` con `startTime`/`endTime`) + adattamento **proiezione/uso**.
3. **FE editor fasce** nella vista Listino (lista + modale add/edit + delete via `ConfirmDialog`).
4. **FE mappa**: due metà **derivate dagli orari** (robuste al caso 3 fasce).

- **Fuori scope (→ Slice B2, §8):** provenienza del prezzo (mostrare la `Rate` vincente nella modale prenotazione e
  spiegare la precedenza nell'editor). È un dominio distinto (trasparenza prezzo) con spec/piano propri.
- **Fuori scope:** orari arbitrari come feature UI a sé (D-015) — di fatto **sbloccati** da questo slice (gli orari
  sono liberi HH:MM), ma non introduciamo un editor "a turni liberi N": l'editor è orientato ai pattern reali
  (Giornata intera / Mattina+Pomeriggio / tutti e tre). Nessun cap rigido a schema; vedi §5 Decisione 4.

## 3. Layer 1 — Contratti + backend CRUD

### 3.1 Contratti (`packages/contracts/src/index.ts`)
- `TimeSlotDTO` acquisisce **`startTime`/`endTime`** (stringhe **"HH:MM"**). Additivo: i consumatori esistenti
  (`useDayMap`, pill) continuano a funzionare col solo `name`.
- Nuovi `CreateTimeSlotInput { name; startTime; endTime; sortOrder? }` e
  `UpdateTimeSlotInput { name?; startTime?; endTime?; sortOrder? }` (campi opzionali = patch).
  Orari sempre **"HH:MM"** (semiaperti [start,end)).

### 3.2 Backend (`CatalogModule`) — pattern `SeasonsController`/`RatesController`
- **`TimeSlotsController`** (`@Controller('time-slots')`): `GET` (list ordinata per `sortOrder`), `POST` (create),
  `PATCH /:id` (update), `DELETE /:id`. **`TimeSlotsService`** con `list/create/update/remove` dentro
  `prisma.forTenant` (RLS).
- **Round-trip orari (ADR-0031):** "HH:MM" → `new Date('1970-01-01T${hh}:${mm}:00Z')` in scrittura; in lettura
  `formatTime(date)` estrae **UTC** (`getUTCHours/getUTCMinutes`, mai metodi locali) → "HH:MM". Estrarre entrambe in un
  helper `common/time.ts` (`toDbTime`/`formatDbTime`), col suo unit-spec, riusando l'approccio già usato dal seed.
- **Validazione DTO:** `name` non vuoto; `startTime`/`endTime` matchano `^([01]\d|2[0-3]):[0-5]\d$` (nuovo validator
  `@IsClockTime()` in `common/`, gemello di `@IsCalendarDate`); regola **`startTime < endTime`** (lessicografica su
  "HH:MM" = cronologica) → 400/422 se violata. `sortOrder` intero ≥ 0 opzionale (default: append in coda).
- **Overlap fra fasce AMMESSO** (ADR-0013, intenzionale): nessuna validazione anti-overlap in create/update. Giornata
  intera *può* sovrapporsi a Mattina/Pomeriggio: è il caso d'uso.
- **Delete-guard (409), specchio di `deletePackage`** (`catalog.service.ts:161-177`): pre-check nella stessa
  transazione — `rate.count({where:{timeSlotId:id}})` **e** `booking.count({where:{timeSlotId:id}})`; se `>0` →
  **409** "Fascia in uso da tariffe o prenotazioni: non eliminabile." (necessario perché `Rate.timeSlotId` è
  **ON DELETE SET NULL** → altrimenti azzererebbe silenziosamente il `timeSlotId` della tariffa; `Booking.timeSlotId`
  è **ON DELETE RESTRICT** → fallirebbe comunque a DB). 404 se la fascia non esiste (anche cross-tenant, RLS).
- **Ultima fascia non eliminabile:** se resta **una sola** fascia nel tenant → **409** "Deve esistere almeno una
  fascia." (una prenotazione richiede sempre una fascia).
- **Nessuna migrazione:** `startTime`/`endTime`/`sortOrder` e le FK esistono già (`schema.prisma:95-107`,
  `Booking_timeSlotId_fkey` RESTRICT, `Rate_timeSlotId_fkey` SET NULL). Verifica in fase di piano che
  `prisma migrate status` sia pulito.
- **Modulo:** registrare controller/service in `CatalogModule` accanto a Seasons/Rates.
- **e2e (`time-slots.e2e-spec.ts`, nuovo):** CRUD felice; `startTime>=endTime` → 422; delete referenziata (rate o
  booking) → 409; delete ultima fascia → 409; delete inesistente/cross-tenant → 404; overlap ammesso in create.

## 4. Layer 2 — Esposizione orari nel DTO mappa

- `map.projection.ts:37`: `timeSlots` mappati con anche `startTime`/`endTime` (via il nuovo `formatDbTime`). Il
  `TimeSlotDTO` esposto dalla mappa e dal `GET /time-slots` è lo **stesso tipo** (name + orari + sortOrder).
- Nessun cambiamento alla logica `stateBySlot` (già overlap-aware). Adeguare `map.projection.spec.ts` e il seed della
  mappa nei test se assertano la forma dei `timeSlots`.
- `useDayMap` / `PricingView` pill: ora possono mostrare gli orari accanto al nome (es. "Mattina · 08:00–13:00").

## 5. Layer 3 — FE editor fasce (vista Listino)

- Nella `PricingView` la sezione pill fasce (`:296-301`) diventa un **editor**: lista delle fasce (nome + orari) con
  azioni modifica/elimina e un bottone "Nuova fascia".
- **Modale add/edit** (riuso `Modal`): campi `name`, `startTime`, `endTime` (input `type="time"` → valore "HH:MM"),
  `sortOrder` implicito (ordine di creazione; riordino fuori scope MVP). Submit → `POST`/`PATCH`.
- **Delete** → **`ConfirmDialog`** (di L1 dello slice precedente): "Eliminare la fascia? …". Errore 409 → toast globale
  (Slice A) col messaggio server ("Fascia in uso…", "Deve esistere almeno una fascia.").
- Nuovo composable `useTimeSlots.ts` (`queryResource`/`mutationResource`, pattern `useSeasons`/`useRates`); invalida
  le query `['map']` e la propria lista dopo mutazioni (le fasce cambiano la mappa e le opzioni tariffa/prenotazione).
- **Test (`PricingView.spec.ts` / nuovi):** crea fascia → compare; edit orari → si aggiornano; delete con conferma;
  409 su fascia in uso → toast; MSW handler `time-slots` in `mocks/server.ts`.

## 6. Layer 4 — FE mappa: due metà derivate dagli orari

Oggi la cella (`MapView.vue`) usa `timeSlots[0]`/`[1]` per Mattina/Pomeriggio: con una 3ª fascia (Giornata intera) gli
indici saltano. **Decisione:** le due metà si **derivano dagli orari**, non dagli indici.

- **Regola di derivazione (FE, deterministica):**
  1. Calcola la finestra giornaliera dalle fasce esposte: `dayStart = min(startTime)`, `dayEnd = max(endTime)`.
  2. Individua l'eventuale **fascia "piena"** = quella il cui intervallo copre l'intera finestra
     (`start == dayStart && end == dayEnd` con più di una fascia presente). Non è una metà: le sue prenotazioni
     riempiono **entrambe** le metà (già garantito dalla proiezione via overlap).
  3. Le **due metà** = le fasce **non-piene**, ordinate per `startTime`: la prima → Mattina, l'ultima → Pomeriggio.
     Se le metà sono esattamente due contigue (Mattina|Pomeriggio) è il caso tipico. Con **una sola** fascia (solo
     Giornata intera) la cella mostra **uno stato uniforme** (entrambe le metà = lo stato di quella fascia).
  4. Lo stato di ciascuna metà si legge da `stateBySlot[<fasciaMetà>.id]` (già corretto lato proiezione, inclusi gli
     effetti di una prenotazione Giornata intera via overlap).
- **Fallback documentato:** configurazioni che non rientrano nel pattern (es. molte fasce non tilanti) → la cella
  mostra le prime due metà per `startTime`; le fasce ulteriori restano prenotabili dalla **modale** (che elenca tutte
  le fasce libere) ma non hanno una propria "metà" sulla mappa. Rendering N-slot arbitrario = **D-015**, rimandato.
- **Test (`MapView.spec.ts`):** con seed a 3 fasce (Giornata/Mattina/Pomeriggio) — prenotazione Giornata intera →
  entrambe le metà occupate; prenotazione Mattina → solo la metà mattutina; la modale elenca le fasce libere corrette.

## 7. Rischi e mitigazioni
- **Round-trip orari UTC:** unico punto di conversione in `common/time.ts` con spec dedicato (giorni-limite non
  applicabili agli orari, ma i metodi UTC evitano lo slittamento di ADR-0031).
- **Delete-guard SET NULL vs RESTRICT:** la guardia applicativa 409 precede il DB; l'unit/e2e coprono rate-ref,
  booking-ref e ultima-fascia. Non affidarsi al solo FK (SET NULL sulle rate sarebbe silenzioso).
- **Derivazione metà mappa:** deterministica e coperta da test sul pattern a 3 fasce; il fallback è esplicito e
  logga/degrada, non rompe.
- **Contratti toccati:** dopo `TimeSlotDTO`, ricordare `pnpm --filter @coralyn/contracts build` + `rm -rf
  apps/web-staff/node_modules/.vite` prima dei test FE.

## 8. Slice B2 "Provenienza prezzo" (prossimo — spec e piano propri)
Documentato qui per continuità; **non** implementato in B1. `resolvePrice` **restituisce già** la `Rate` vincente
(`pricing.engine.ts:28` `{ ok, totalPrice, rate }`); oggi `priceWithin`/`quote` la scartano. B2:
- estende `BookingQuoteDTO` con la **provenienza** (dimensioni combacianti della Rate vincente + prezzo/unità) — es.
  `matchedRate?: { timeSlotId?, packageId?, sectorId?, rowId?, type?, periodStart?, periodEnd?, price, unit }`;
- **MapView**: nella modale "+Nuova prenotazione" mostra *quale* tariffa ha prodotto il prezzo (es. "Tariffa:
  Pomeriggio · Standard — 40 €/g") invece del solo importo; il messaggio "listino non configurato" (`MapView.vue:319`) resta;
- **Editor Listino**: spiega la **precedenza** (ordine di specificità ADR-0032) quando più tariffe potrebbero applicarsi.
- Fai brainstorming+spec dedicati per B2 prima di pianificare (workflow ADR-0009).

## 9. Decisioni (risolte in brainstorming 2026-07-02)
1. **Split B1/B2:** fasce configurabili ora (B1); provenienza-prezzo come slice successivo (B2), documentato §8.
2. **Modello fasce:** overlap ammesso; supportato il pattern **Giornata intera + Mattina + Pomeriggio** (già retto da
   anti-overlap/pricing/proiezione, tutti overlap-aware per orario).
3. **Orari liberi HH:MM** (semiaperti [start,end), round-trip UTC). D-015 (turni arbitrari come feature UI) resta
   concettualmente sbloccato ma non è oggetto di editor dedicato ora.
4. **Nessun cap rigido** al numero di fasce a schema; l'editor è orientato ai pattern reali. Vincoli applicativi:
   `startTime<endTime`, delete referenziata → 409, **ultima fascia non eliminabile**.
5. **Mappa:** due metà **derivate dagli orari** (§6); Giornata intera riempie entrambe via overlap; N-slot arbitrario
   → D-015 rimandato.
6. **Nessuna migrazione, nessun nuovo ADR** (incremento su ADR-0013).

## 10. Impatto test (atteso, da non regredire)
Baseline: api unit 84 · api e2e 114 · web-staff 128 · ui-kit 55. Attesi in crescita: +api (TimeSlots CRUD unit +
`common/time` spec + e2e), +web-staff (editor fasce, mappa 3 fasce, MSW handler). Nessun test rimosso. Prossimo ADR
libero: **0035**.
