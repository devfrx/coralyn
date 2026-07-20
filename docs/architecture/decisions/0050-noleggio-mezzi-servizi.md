# ADR-0050: Noleggio mezzi/servizi come bounded context (catalogo + tariffe stagionali + banco a tempo reale)

- **Status:** Accepted
- **Data:** 2026-07-20
- **Decisori:** Team di progetto (decisioni di dominio risolte in brainstorming con l'utente 2026-07-20)
- **ADR correlati:**
  - **Distinto da** [ADR-0006](0006-dominio-prenotazioni-e-pricing.md) (dominio prenotazioni/pricing) e
    [ADR-0032](0032-pricing-engine-precedenza.md) (motore `Rate` a precedenze): il noleggio ha dimensioni di prezzo proprie
    (articolo + durata) e **non** passa dal motore `Rate` (settore/fila/pacchetto/fascia non si applicano a un pedalò).
  - **Distinto da** [ADR-0036](0036-equipment-catalogo-e-composizione.md) (`EquipmentType`/`Package`): quella è la dotazione
    **inclusa** in una prenotazione (non venduta a parte, non prezzata per voce); il noleggio è un prodotto **venduto al banco**.
  - **Additivo su** [ADR-0011](0011-incasso-base-nel-core.md): il `Rental` **riusa** i campi incasso e `resolvePayment`
    (stato derivato server-side), senza un modello cassa dedicato.
  - **Additivo su** [ADR-0031](0031-fuso-orario-e-date-operative.md): stagione risolta su `todayInRome()`; date `@db.Date`,
    istanti timestamptz.
  - Spec: [2026-07-20-rentals-noleggio-mezzi-servizi-design.md](../../specs/2026-07-20-rentals-noleggio-mezzi-servizi-design.md).

## Context

Un lido non vende solo l'ombrellone: noleggia **mezzi e servizi** a tempo (pedalò, canoe, SUP, babysitting…), tipicamente a
un cliente **al banco**, in modo indipendente dalla postazione. Il dominio non aveva alcun concetto di noleggio: `Package` +
`EquipmentType` modellano la dotazione *inclusa* in una prenotazione (ADR-0036), e il motore `Rate` prezza gli **ombrelloni**
su dimensioni (tipo/settore/fila/pacchetto/fascia/periodo) che non si applicano a un pedalò.

Serve decidere come modellare (a) **cosa** si noleggia, (b) **come** si prezza, (c) la **transazione** al banco con il suo
tempo, l'incasso e la disponibilità — senza forzare il noleggio dentro il dominio prenotazioni/pricing.

**Chiarimento di dominio (utente 2026-07-20):** cabine e posti auto **non si noleggiano** in questo lido — restano un
concetto diverso (assegnazione a periodo, [D-012](../deferred.md)), fuori da questo bounded context. Il discrimine non è
"custom/cliente/stagionale" (comune a più concetti) ma la **semantica di occupazione**: il noleggio è **merce fungibile**
presa e resa al banco, senza esclusiva anti-overlap.

## Decision

Il noleggio è un **bounded context dedicato**, additivo e disgiunto, con tre entità tenant-scoped (RLS FORCE):

1. **`RentalItem`** — catalogo di ciò che si noleggia. Fungibile (si conta una scorta, non si identifica l'esemplare),
   archiviabile, con **scorta opzionale** `stock Int?` (null = non tracciata).
2. **`RentalTariff`** — opzioni di prezzo di un articolo, **season-scoped** (`seasonId` FK, **immutabile**): `label` libera
   (non unica), `price Decimal(10,2)`, `durationMinutes` opzionale, `sortOrder`. La stagionalità allinea il noleggio al resto
   del listino (storicizzazione) senza replicare il motore `Rate` né il wrapper `Pricing`/catch-all.
3. **`Rental`** — la transazione al banco: `rentalItemId` + `rentalTariffId` + `customerId?` (opzionale) + `units` (conteggio
   fisico) + `startAt`/`returnedAt` (uscita/rientro **reali**) + `cancelledAt` (void) + incasso (ADR-0011).

Principi (risolti in brainstorming):
- **Prezzo a scaglione fisso, snapshot:** `totalPrice = tariff.price × units`, scritto al checkout; `returnedAt` serve a
  disponibilità/storia ma **non** ricalcola il prezzo (niente billing al minuto → [D-053](../deferred.md)).
- **Stato derivato dai timestamp** (`cancelled > returned > active`): nessun enum di stato ridondante.
- **Disponibilità opzionale e informativa:** `available = stock − Σ units attivi`, clamp ≥0, `null` se `stock` è null;
  **mai** un blocco al checkout (nessun vincolo DB anti-overlap — a differenza degli ombrelloni).
- **Cliente opzionale, mai Ombrellone:** chi noleggia può essere un walk-in senza postazione; un pedalò non sta "su" un
  ombrellone.
- **Riuso, non reimplementazione:** stagione attiva via `CatalogService.resolveSeasonWithin`; incasso via `resolvePayment`
  (mappa `OVER_TOTAL`/`METHOD_REQUIRED` → 422). `onDelete`: `RentalTariff→RentalItem` Cascade; `Rental→item/tariff` Restrict
  (archivia-prima-di-eliminare, guard su hard-delete).

Regole di stato: return **idempotente** (409 se annullato); cancel **409 se `amountCollected > 0`** (storna prima; rimborso
ricco = [D-009](../deferred.md)); payment **409 se annullato**, ammesso su attivo e rientrato.

## Conseguenze

- **Positive:** modello coerente col dominio reale del banco; zero impatto su prenotazioni/pricing/dotazione; incasso e fuso
  riusati senza debito; storicizzazione prezzi per stagione; disponibilità utile senza rigidità.
- **Costi/limiti dichiarati:** `units` è un conteggio → rientro **tutto-o-niente** e nessun esemplare numerato
  ([D-052](../deferred.md)); prezzo a scaglione → niente overtime automatico ([D-053](../deferred.md)); i ricavi noleggio nei
  report sono una slice successiva (join via `Rental → RentalTariff.seasonId`). La finestra-giorno di `GET /rentals?date=`
  usa confini UTC su `startAt` (MVP), da allineare a Roma se emergesse scostamento a mezzanotte.
- **Superficie:** modulo `rentals` (BE) + feature `rentals` (web-staff: banco + configurazione catalogo/tariffe); voci di
  navigazione "Noleggi" e "Listino noleggi".
