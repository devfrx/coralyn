# Spec di design — Core operativo (MVP)

- **Data:** 2026-06-27
- **Status:** Approvato (2026-06-28)
- **Modulo:** 1 di 5 (vedi [architettura](../architecture/README.md))

## 1. Obiettivo

Costruire il **cuore operativo** del gestionale: lo strumento che lo staff di uno
stabilimento balneare usa ogni giorno per gestire la mappa degli ombrelloni, le
prenotazioni e gli abbonamenti, i clienti e il listino. È il modulo da cui dipendono
tutti gli altri (Cassa, Booking online, Report).

L'MVP è costruito **tenant-aware** dal modello dati, così la multi-tenancy completa
(modulo 3) sarà un'evoluzione, non una riscrittura.

## 2. Scope

### In scope
- **Mappa ombrelloni** interattiva (Settori → File → Ombrelloni), con stati per data;
  **setup strutturato** della struttura ([ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)).
  Ombrelloni con **etichetta = numero fisico reale** e **Tipologia** (Normale/Mini‑palma/Palma…),
  speciali fuori griglia come Settore dedicato ([ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)).
- **Anagrafica Clienti** (il bagnante).
- **Pacchetti** personalizzabili (dotazione: lettini/sdraio…).
- **Listino e Tariffe** per Stagione + **pricing engine** multi-dimensione.
- **Prenotazioni** unificate a intervallo: giornaliera, periodica, abbonamento.
- **Disponibilità a slot** (giornata intera / mezza giornata, configurabile per
  stabilimento) con invariante anti-overlap per fascia ([ADR-0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md)).
- **Lista d'attesa minima** (coda + promozione manuale).
- **Accesso staff minimo** (utenti con ruolo admin/staff, contesto tenant).
- **Incasso base**: stato di pagamento (non_pagato/parziale/saldato), importo, metodo
  e data sulla Prenotazione ([ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)).
- **Abbonamenti**: assegnazione stagionale, **rinnovo in un clic** dalla stagione
  precedente e **storico/anzianità** ([ADR-0012](../architecture/decisions/0012-gestione-abbonamenti.md)).
- **Osservabilità**: logging strutturato, **audit log** e **console superuser** in-app
  (cross-tenant, sola lettura, eventi sanificati) + ruolo superuser di piattaforma
  ([ADR-0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md)).

### Fuori scope (rimandato, vedi [deferred.md](../architecture/deferred.md))
**Cassa completa**: ricevute, chiusura giornaliera, **fiscale** (modulo 2, [D-004](../architecture/deferred.md)) ·
Entità `Pagamento` completa: acconti/ricevute/storni ([D-009](../architecture/deferred.md)) ·
Multi-tenancy completa + billing (D-002) · Booking online (modulo 4) · Editor
planimetria (D-005) · Liste d'attesa avanzate: hold+notifiche (D-006) · Wrapper
Electron (D-007) · Offline-sync completo (D-008) · i18n (D-003) · Prelazione abbonamenti completa (D-011) ·
Cabina e servizi accessori (D-012) · Sospensione/cessione/disdetta abbonamento (D-013) ·
Gestione personale/turni (D-014) · Disponibilità a orari arbitrari (D-015) · Streaming
log tecnici live (D-016) · Prezzo per tipologia di ombrellone (D-018) · Ombrellone
standalone senza fila (D-019).

> Nota: la **registrazione incasso base** *è* in scope ([ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md));
> qui sopra è esclusa solo la cassa *completa* (ricevute/chiusura/fiscale/processing).

## 3. Vincoli e decisioni di riferimento

| Tema | Decisione | ADR |
|---|---|---|
| Lingua | Codice EN, dominio IT, docs IT | [0003](../architecture/decisions/0003-language-convention.md) |
| Delivery | Web app + PWA (desktop + tablet) | [0004](../architecture/decisions/0004-form-factor-e-delivery.md) |
| Mappa | Settori/File/Ombrelloni, posizione logica ≠ presentazione | [0005](../architecture/decisions/0005-modello-mappa.md) |
| Prenotazioni & pricing | Prenotazione unica a intervallo, ombrellone-pacchetto, listino a regole | [0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) |
| Architettura | Monolite modulare, API-first, multi-tenant-aware, IA come servizio | [0007](../architecture/decisions/0007-stile-architetturale.md) |
| Stack & layout | Vue 3+TS / NestJS / PostgreSQL / Prisma / monorepo | [0008](../architecture/decisions/0008-stack-e-layout.md) |
| Multi-tenant (DB) | Shared schema + RLS, escape hatch silo | [0010](../architecture/decisions/0010-isolamento-multi-tenant.md) |
| Incasso base | Stato pagamento sulla Prenotazione; cassa completa al modulo 2 | [0011](../architecture/decisions/0011-incasso-base-nel-core.md) |
| Gestione abbonamenti | Rinnovo in un clic + storico (self-link); prelazione/cabine rimandate | [0012](../architecture/decisions/0012-gestione-abbonamenti.md) |
| Granularità disponibilità | Slot configurabili (intera/mezza giornata); orari arbitrari rimandati | [0013](../architecture/decisions/0013-granularita-disponibilita-a-slot.md) |
| Setup mappa | Strutturato per form; editor planimetria rimandato (D-005) | [0014](../architecture/decisions/0014-setup-mappa-strutturato.md) |
| Tipologia & numerazione ombrelloni | Etichetta = numero fisico reale; Tipologia ortogonale (classificazione, non prezzo); speciali come Settore dedicato | [0016](../architecture/decisions/0016-tipologia-ombrellone.md) |
| Osservabilità | Logging + audit log + console superuser (ruolo di piattaforma) | [0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md) |

## 4. Architettura

Monolite modulare NestJS, API REST (OpenAPI), frontend Vue 3 PWA, monorepo con
contratti condivisi. Dettagli: [ADR-0007](../architecture/decisions/0007-stile-architetturale.md)
e [ADR-0008](../architecture/decisions/0008-stack-e-layout.md).

```
apps/
  api/         # NestJS — moduli del Core
  web-staff/   # Vue 3 + PWA — app dello staff
packages/
  contracts/   # tipi/DTO condivisi FE/BE (fonte del contratto API)
```

## 5. Modello dati

Diagramma ER e invarianti: [docs/design/data-model.md](../design/data-model.md).
Entità: Stabilimento, Settore, Fila, Ombrellone, **Tipologia**, Pacchetto, Cliente, Stagione,
Listino, Tariffa, **Fascia**, Prenotazione, Lista_attesa, Utente, **AuditLog**. Ogni
entità di business porta `stabilimento_id` (nullable per Utente `superuser` e per gli
eventi globali di AuditLog).

## 6. Moduli del Core (confini e responsabilità)

Ogni modulo ha una responsabilità singola, espone un'interfaccia esplicita e dipende
solo da ciò che è dichiarato. Questo abilita test in isolamento e basso accoppiamento.

| Modulo | Responsabilità | Espone | Dipende da |
|---|---|---|---|
| `core` | Contesto tenant, tipi base, utilità trasversali | TenantContext, base entities | — |
| `identita` | Utenti staff, login, ruolo, risoluzione tenant; **superuser di piattaforma** | Auth/guards, utente corrente | `core` |
| `mappa` | Settori, File, Ombrelloni, **Tipologia**; **setup strutturato** e numerazione reale | CRUD struttura, generazione ombrelloni, query | `core` |
| `clienti` | Anagrafica Cliente | CRUD clienti, ricerca | `core` |
| `catalogo` | Pacchetti, Stagioni, **Fasce**, Listini, Tariffe + **pricing engine** (dimensione fascia) | calcolaPrezzo(...), CRUD listino/fasce | `core`, `mappa` (ambito posizione) |
| `prenotazioni` | Prenotazione, disponibilità **per slot** (anti-overlap), lista d'attesa, stato di pagamento (incasso base), rinnovo abbonamenti e storico | crea/annulla/promuovi, disponibilità per data+fascia, registra incasso, rinnova abbonamento | `core`, `mappa`, `clienti`, `catalogo` |
| `audit` | Logging strutturato, audit log, console superuser | registra evento, query audit (superuser) | `core`, `identita` |

Regola: le dipendenze vanno in una sola direzione (niente cicli). `prenotazioni` è il
modulo orchestratore; `catalogo` non conosce `prenotazioni`.

## 7. Pricing engine (parte delicata)

Calcola il prezzo di una Prenotazione risolvendo la `Tariffa` applicabile.

- **Input**: tipo prenotazione, Ombrellone (→ Fila/Settore = ambito posizione),
  Pacchetto, **fascia** (slot), periodo (date).
- **Risoluzione**: tra le Tariffe del Listino della Stagione attiva, seleziona quelle
  compatibili e sceglie la **più specifica** secondo una precedenza esplicita e
  documentata (es. match esatto fila > settore > generico; periodo specifico >
  generico).
- **Output**: prezzo totale + dettaglio (unità giorno/periodo, righe extra).
- **Testabilità**: motore puro e deterministico, coperto da test su casi limite
  (sovrapposizione di regole, periodo a cavallo di fasce, pacchetto con extra).

## 8. Funzionalità per area

- **Setup** (admin): crea Stabilimento, Settori/File/Ombrelloni (con etichette reali e
  Tipologie), Pacchetti, Stagione, Listino, Tariffe.
- **Mappa** (staff): vista per data con stati (libero/abbonato/giornaliero/prenotato);
  clic → drawer contestuale.
- **Prenotazione**: da drawer → cliente (esistente/nuovo) + pacchetto + periodo →
  prezzo calcolato → conferma (con controllo disponibilità).
- **Abbonamento**: assegnazione di un Ombrellone a un Cliente per l'intera Stagione;
  **rinnovo** in un clic dalla stagione precedente (prezzo sul nuovo listino, link allo
  storico). Flusso: [docs/design/flows.md](../design/flows.md) §4.
- **Lista d'attesa**: accodamento su pieno; promozione manuale a Prenotazione.
- **Clienti**: anagrafica e ricerca.
- **Listino**: gestione Pacchetti e Tariffe.

Flussi completi: [docs/design/flows.md](../design/flows.md).

## 9. UI/UX

App a sezioni (menù: Mappa, Prenotazioni, Clienti, Listino, Report) con la **Mappa
come home** e drawer contestuale. Responsive desktop + tablet, PWA. Snapshot:
[docs/design/mockups/main-screen.html](../design/mockups/main-screen.html).

Setup mappa **strutturato per form** ([ADR-0014](../architecture/decisions/0014-setup-mappa-strutturato.md)).
**Console superuser** come sezione separata, visibile solo al ruolo `superuser`.

## 10. Multi-tenancy nell'MVP

- Modello dati **tenant-aware** (`stabilimento_id` ovunque) e scoping applicativo di
  ogni query fin da subito.
- **Isolamento** ([ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)):
  shared DB/schema con scoping centrale (guard NestJS + middleware Prisma) e
  **Row-Level Security** PostgreSQL come rete di sicurezza. Una migrazione e un backup
  per tutti; onboarding = inserire uno Stabilimento + admin; promozione a DB dedicato
  possibile in futuro senza toccare il codice ([D-010](../architecture/deferred.md)).
- Signup self-service, billing e hardening avanzato **non** nell'MVP
  ([D-002](../architecture/deferred.md)): l'MVP opera di fatto su uno stabilimento
  configurato, ma il codice non assume mai un tenant singolo.

## 11. Accesso e ruoli (MVP)

- Utenti staff con ruolo `admin` (configura struttura e listino) o `staff` (operativo).
- **Superuser di piattaforma**: ruolo sopra i tenant (l'operatore del SaaS), con
  accesso cross-tenant in **sola lettura** alla console di osservabilità
  ([ADR-0015](../architecture/decisions/0015-osservabilita-e-console-superuser.md)).
- RBAC granulare e gestione account multi-tenant → modulo 3.

## 12. Rischi e questioni aperte

- **Pricing engine**: la parte a maggior rischio; mitigato da motore puro + test su
  casi limite.
- **ORM (Prisma)**: scelta rivedibile se emergono limiti su query complesse
  (disponibilità) — da validare in fase di piano.
- **Offline in spiaggia**: l'MVP assume connettività (offline-light); il rischio è
  tracciato in [D-008](../architecture/deferred.md).
- **Disponibilità a slot**: l'anti-overlap diventa per (ombrellone, data, fascia); il
  caso mezza giornata va testato con cura. Orari arbitrari esclusi ([D-015](../architecture/deferred.md)).
- **Console superuser**: l'accesso cross-tenant è una superficie sensibile; va protetto
  (autorizzazione dedicata, audit degli accessi superuser, eventi sanificati).

## 13. Definition of Done dell'MVP

- Un admin configura da zero uno stabilimento (struttura + listino).
- Lo staff crea i tre tipi di prenotazione dalla mappa, con prezzo calcolato
  automaticamente e disponibilità garantita (no overlap).
- Abbonamento assegnabile per la stagione; lista d'attesa con promozione manuale.
- Rinnovo di un abbonamento dalla stagione precedente in un clic, con storico collegato.
- Lo staff può segnare una prenotazione come pagata (stato, importo, metodo, data).
- Più stabilimenti isolati nello stesso DB (scoping + RLS), verificato che un tenant
  non veda i dati di un altro.
- Disponibilità a mezza giornata funzionante (mattina/pomeriggio non confliggono sullo
  stesso ombrellone/giorno).
- Audit log popolato dagli eventi di dominio; il superuser consulta la console
  cross-tenant in sola lettura.
- Contratti FE/BE condivisi; pricing engine coperto da test; diagrammi in
  `docs/design/` aggiornati.

## 14. Riferimenti

- [Architettura viva](../architecture/README.md) · [ADR](../architecture/decisions/) ·
  [Decisioni rimandate](../architecture/deferred.md) ·
  [Glossario](../architecture/glossary.md) · [Design](../design/)
