# Glossario del dominio (Ubiquitous Language)

Definizioni canoniche dei termini di dominio del progetto. I termini qui elencati
sono mantenuti **in italiano** anche nel codice (vedi
[ADR-0003](decisions/0003-language-convention.md)).

Regola: prima di introdurre un nuovo concetto di dominio nel codice, definirlo qui.

| Termine (IT) | Definizione | Note / relazioni |
|---|---|---|
| **Stabilimento** | Il lido balneare nel suo complesso: l'unità gestita dal cliente del SaaS. | Radice della multi-tenancy: ogni dato appartiene a uno stabilimento. |
| **Settore** | Raggruppamento di File in cui è organizzata la spiaggia (es. zona, area). Ambito naturale del prezzo insieme alla Fila. | Contiene più File; usato anche per le **aree speciali** ([ADR-0016](decisions/0016-tipologia-ombrellone.md)). |
| **Fila** | Riga di postazioni parallela alla battigia. La distanza dal mare incide sul prezzo. | Appartiene a un Settore; contiene più Ombrelloni/Postazioni. |
| **Ombrellone / Postazione** | L'unità prenotabile sulla spiaggia, tipicamente ombrellone + lettini/sdraio. Identificato dall'**`etichetta`** = numero fisico reale (stringa libera, unica per Stabilimento). | Appartiene a una Fila; ha una **Tipologia**. È la risorsa centrale della mappa. |
| **Tipologia (ombrellone)** | Classe di ombrellone definita dallo Stabilimento (es. Normale, Mini‑palma, Palma), ortogonale alla posizione. | Per display, scelta cliente e disponibilità per tipo; **non** è una dimensione di prezzo nell'MVP ([ADR-0016](decisions/0016-tipologia-ombrellone.md)). |
| **Cabina** | Spogliatoio/deposito assegnabile, spesso abbinato a un abbonamento. | Risorsa separata dall'ombrellone; **fuori MVP**, rimandata ([D-012](deferred.md)). |
| **Prenotazione** | Impegno di un Ombrellone (con Pacchetto) per una Fascia in un periodo definito. | Tipi: giornaliera, periodica, abbonamento. |
| **Abbonamento** | Prenotazione di lungo periodo (es. stagionale, mensile) con tariffa dedicata. | Sottocaso/variante di Prenotazione di lungo periodo. |
| **Rinnovo** | Creazione dell'abbonamento di una nuova Stagione a partire da quello precedente (stesso cliente/ombrellone), col nuovo listino. | Catena via `prenotazione_precedente_id`; base per anzianità e prelazione. |
| **Anzianità** | Da quante stagioni consecutive un cliente è abbonato a un posto. | Derivata dalla catena dei Rinnovi. |
| **Tariffa** | Regola di prezzo multi-dimensione: {tipo, posizione (settore/fila), pacchetto, fascia, periodo}. | Definita nel Listino; risolta dal pricing engine. |
| **Listino** | Insieme delle Tariffe valide per uno Stabilimento in una stagione. | |
| **Cliente** | Il bagnante/anagrafica che effettua prenotazioni o sottoscrive abbonamenti. | Da non confondere con il *cliente del SaaS* (lo Stabilimento/gestore). |
| **Stagione** | Arco temporale operativo dello stabilimento (es. apertura–chiusura estiva). | Contesto temporale di listini e abbonamenti. |
| **Bagnino / Staff** | Operatore che usa il gestionale per lo stabilimento. | Soggetto a ruoli/permessi (modulo multi-tenancy). |
| **Fascia** | Slot temporale prenotabile di una giornata (es. Giornata intera, Mattina, Pomeriggio), configurabile per Stabilimento. | Unità di disponibilità = (Ombrellone, data, Fascia). |
| **Audit log** | Registro persistito degli eventi di dominio (chi/cosa/quando), taggati per tenant. | Consultabile dal Superuser. |
| **Superuser (di piattaforma)** | Ruolo dell'operatore del SaaS, sopra i tenant, con visibilità cross-stabilimento (sola lettura nella console). | Distinto dai ruoli tenant (admin/staff). |

> Disambiguazione importante: **"cliente"** è sovraccarico. Nel codice distinguiamo
> `Cliente` (il bagnante, entità di dominio) dal *tenant* (lo Stabilimento, cliente
> commerciale del SaaS). Mai usare "cliente" per indicare il tenant.
