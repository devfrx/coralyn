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
| **Prenotazione** | `Booking` (futuro) | Impegno di un Ombrellone (con Pacchetto) per una Fascia in un periodo definito. | Tipi: giornaliera, periodica, abbonamento. |
| **Abbonamento** | `Subscription` (futuro) | Prenotazione di lungo periodo (es. stagionale, mensile) con tariffa dedicata. | Sottocaso/variante di Prenotazione di lungo periodo. |
| **Rinnovo** | `Renewal` (futuro) | Creazione dell'abbonamento di una nuova Stagione a partire da quello precedente (stesso cliente/ombrellone), col nuovo listino. | Catena via `previousBookingId`; base per anzianità e prelazione. |
| **Anzianità** | `seniority` (futuro) | Da quante stagioni consecutive un cliente è abbonato a un posto. | Derivata dalla catena dei Rinnovi. |
| **Tariffa** | `Rate` (futuro) | Regola di prezzo multi-dimensione: {tipo, posizione (settore/fila), pacchetto, fascia, periodo}. | Definita nel Listino; risolta dal pricing engine. |
| **Listino** | `Pricing` (futuro) | Insieme delle Tariffe valide per uno Stabilimento in una stagione. | |
| **Cliente** | `Customer` | Il bagnante/anagrafica che effettua prenotazioni o sottoscrive abbonamenti. | Da non confondere con il *cliente del SaaS* (lo Stabilimento/gestore). |
| **Stagione** | `Season` (futuro) | Arco temporale operativo dello stabilimento (es. apertura–chiusura estiva). | Contesto temporale di listini e abbonamenti. |
| **Utente / Staff** | `User` | Operatore che usa il gestionale per lo stabilimento. | Soggetto a ruoli/permessi (enum `Role`: admin/staff/superuser). |
| **Fascia** | `TimeSlot` | Slot temporale prenotabile di una giornata (es. Giornata intera, Mattina, Pomeriggio), configurabile per Stabilimento. | Unità di disponibilità = (Ombrellone, data, Fascia). Stati slot `SlotState`: `free`/`season`/`daily`/`booked`. |
| **Audit log** | `AuditLog` (futuro) | Registro persistito degli eventi di dominio (chi/cosa/quando), taggati per tenant. | Consultabile dal Superuser. |
| **Superuser (di piattaforma)** | `Role.superuser` | Ruolo dell'operatore del SaaS, sopra i tenant, con visibilità cross-stabilimento (sola lettura nella console). | Distinto dai ruoli tenant (admin/staff). |

> Disambiguazione importante: **"cliente"** è sovraccarico. Nel codice distinguiamo
> `Customer` (il bagnante, entità di dominio) dal *tenant* (lo `Establishment`, cliente
> commerciale del SaaS). Mai usare "customer" per indicare il tenant.
