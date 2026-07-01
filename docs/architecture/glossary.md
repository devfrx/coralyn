# Glossario del dominio (Ubiquitous Language)

Definizioni canoniche dei termini di dominio del progetto. I termini di dominio restano
in **italiano nella UI a video e nella documentazione**, ma **codice e DB usano
l'identificatore inglese** (colonna "Codice/DB EN", vedi
[ADR-0030](decisions/0030-codice-e-db-in-inglese.md) che supera
[ADR-0003](decisions/0003-language-convention.md)).

Regola: prima di introdurre un nuovo concetto di dominio nel codice, definirlo qui con il
suo identificatore inglese.

| Termine (IT) | Codice/DB (EN) | Definizione | Note / relazioni |
|---|---|---|---|
| **Stabilimento** | `Establishment` | Il lido balneare nel suo complesso: l'unità gestita dal cliente del SaaS. | Radice della multi-tenancy: ogni dato appartiene a uno stabilimento (FK `establishmentId`). Il *meccanismo* di isolamento resta `tenant` (`tenantId`/`forTenant`). |
| **Settore** | `Sector` | Raggruppamento di File in cui è organizzata la spiaggia (es. zona, area). Ambito naturale del prezzo insieme alla Fila. | Contiene più File; usato anche per le **aree speciali** ([ADR-0016](decisions/0016-tipologia-ombrellone.md)). |
| **Fila** | `Row` | Riga di postazioni parallela alla battigia. La distanza dal mare incide sul prezzo. | Appartiene a un Settore; contiene più Ombrelloni/Postazioni. |
| **Ombrellone / Postazione** | `Umbrella` | L'unità prenotabile sulla spiaggia, tipicamente ombrellone + lettini/sdraio. Identificato dall'**`label`** = numero fisico reale (stringa libera, unica per Stabilimento). | Appartiene a una Fila; ha una **Tipologia**. È la risorsa centrale della mappa. |
| **Tipologia (ombrellone)** | `UmbrellaType` | Classe di ombrellone definita dallo Stabilimento (es. Normale, Mini‑palma, Palma), ortogonale alla posizione. | Per display, scelta cliente e disponibilità per tipo; **non** è una dimensione di prezzo nell'MVP ([ADR-0016](decisions/0016-tipologia-ombrellone.md)). |
| **Cabina** | `Cabin` (futuro) | Spogliatoio/deposito assegnabile, spesso abbinato a un abbonamento. | Risorsa separata dall'ombrellone; **fuori MVP**, rimandata ([D-012](deferred.md)). |
| **Prenotazione** | `Booking` | Impegno di un Ombrellone per una Fascia in un periodo definito. | Tipi (`type`): giornaliera/periodica/abbonamento, **tutti e tre implementati** (giornaliera slice A1; periodica e abbonamento slice A4.1, intervallo esplicito o = Stagione, server-autoritativo). `Booking.packageId` nullable, FK; **selettore Pacchetto implementato** (A3.2). Stato `confirmed`/`cancelled`. `previousBookingId` esiste ma resta **inutilizzato fino ad A4.2** (rinnovo). |
| **Pacchetto** | `Package` | Dotazione prenotabile offerta dallo Stabilimento (es. Standard, Famiglia, Premium): numero lettini, sdraio, ecc. | Dimensione **opzionale** della `Rate` (wildcard se null); `Booking.packageId` nullable (`null` = tariffa base, nessun pacchetto). **Selettore nel modale e lista `GET /api/packages` implementati** (A3.2). |
| **Incasso (base)** | `paymentStatus` / `amountCollected` / `paymentMethod` / `collectionDate` | Stato e dettagli del pagamento di una Prenotazione: stato `unpaid`/`partial`/`paid`, importo incassato, metodo (`cash`/`card`/`transfer`/`other`), data dell'incasso. | Vive sulla `Booking` ([ADR-0011](decisions/0011-incasso-base-nel-core.md)); **`paymentStatus` è derivato server-side** da importo vs totale (slice A2). La Cassa completa (ricevute/acconti/storni) è rimandata ([D-009](deferred.md)). |
| **Abbonamento** | `Booking.type='subscription'` | Prenotazione di lungo periodo con durata = l'intera Stagione attiva e tariffa dedicata (`unit=period`). | **Implementato** (slice A4.1): non è un'entità separata, è un `Booking` con `type=subscription`; il server risolve la Stagione da `startDate` e impone `endDate=season.endDate` (durata server-autoritativa, client non la specifica). |
| **Rinnovo** | `Renewal` (futuro) | Creazione dell'abbonamento di una nuova Stagione a partire da quello precedente (stesso cliente/ombrellone), col nuovo listino. | Catena via `previousBookingId` (campo esistente, **inutilizzato fino ad A4.2**); base per anzianità e prelazione. |
| **Anzianità** | `seniority` (futuro) | Da quante stagioni consecutive un cliente è abbonato a un posto. | Derivata dalla catena dei Rinnovi ([A4.2](../plans/)). |
| **Tariffa** | `Rate` | Regola di prezzo multi-dimensione: {tipo, posizione (settore/fila), pacchetto, fascia, periodo}. Ogni dimensione è nullable (wildcard). | Definita nel Listino; risolta dal pricing engine (`resolvePrice`) secondo la precedenza esplicita ([ADR-0032](decisions/0032-pricing-engine-precedenza.md)). |
| **Unità tariffa** | `RateUnit` | Unità di calcolo del prezzo: `day` (importo × giorni, estremi inclusi) oppure `period` (forfait per l'intero intervallo). | Enum DB. `daily` → sempre 1 giorno → `totalPrice = price`. |
| **Listino** | `Pricing` | Insieme delle Tariffe valide per uno Stabilimento in una stagione (`seasonId` FK). | Una `Pricing` per `Season` nell'MVP; le `Rate` del listino includono obbligatoriamente una catch-all (tutte le dimensioni null). |
| **Cliente** | `Customer` | Il bagnante/anagrafica che effettua prenotazioni o sottoscrive abbonamenti. | Da non confondere con il *cliente del SaaS* (lo Stabilimento/gestore). |
| **Stagione** | `Season` | Arco temporale operativo dello stabilimento (es. apertura–chiusura estiva). Le stagioni non si sovrappongono per tenant (invariante). | Contesto temporale di listini e abbonamenti ([ADR-0031](decisions/0031-fuso-orario-e-date-operative.md)). |
| **Utente / Staff** | `User` | Operatore che usa il gestionale per lo stabilimento. | Soggetto a ruoli/permessi (enum `Role`: admin/staff/superuser). |
| **Fascia** | `TimeSlot` | Slot temporale prenotabile di una giornata (es. Giornata intera, Mattina, Pomeriggio), configurabile per Stabilimento. | Unità di disponibilità = (Ombrellone, data, Fascia). Stati slot `SlotState`: `free`/`season`/`daily`/`booked`. |
| **Audit log** | `AuditLog` (futuro) | Registro persistito degli eventi di dominio (chi/cosa/quando), taggati per tenant. | Consultabile dal Superuser. |
| **Superuser (di piattaforma)** | `Role.superuser` | Ruolo dell'operatore del SaaS, sopra i tenant, con visibilità cross-stabilimento (sola lettura nella console). | Distinto dai ruoli tenant (admin/staff). |

> Disambiguazione importante: **"cliente"** è sovraccarico. Nel codice distinguiamo
> `Customer` (il bagnante, entità di dominio) dal *tenant* (lo `Establishment`, cliente
> commerciale del SaaS). Mai usare "customer" per indicare il tenant.
