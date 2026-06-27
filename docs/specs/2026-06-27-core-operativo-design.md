# Spec di design — Core operativo (MVP)

- **Data:** 2026-06-27
- **Status:** In revisione
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
- **Mappa ombrelloni** interattiva (Settori → File → Ombrelloni), con stati per data.
- **Anagrafica Clienti** (il bagnante).
- **Pacchetti** personalizzabili (dotazione: lettini/sdraio…).
- **Listino e Tariffe** per Stagione + **pricing engine** multi-dimensione.
- **Prenotazioni** unificate a intervallo: giornaliera, periodica, abbonamento.
- **Disponibilità** con invariante anti-overlap.
- **Lista d'attesa minima** (coda + promozione manuale).
- **Accesso staff minimo** (utenti con ruolo admin/staff, contesto tenant).

### Fuori scope (rimandato, vedi [deferred.md](../architecture/deferred.md))
Cassa/pagamenti (modulo 2) · Multi-tenancy completa + billing (D-002) · Booking
online (modulo 4) · Editor planimetria (D-005) · Liste d'attesa avanzate:
hold+notifiche (D-006) · Wrapper Electron (D-007) · Offline-sync completo (D-008) ·
i18n (D-003) · Fiscale/scontrino (D-004).

## 3. Vincoli e decisioni di riferimento

| Tema | Decisione | ADR |
|---|---|---|
| Lingua | Codice EN, dominio IT, docs IT | [0003](../architecture/decisions/0003-language-convention.md) |
| Delivery | Web app + PWA (desktop + tablet) | [0004](../architecture/decisions/0004-form-factor-e-delivery.md) |
| Mappa | Settori/File/Ombrelloni, posizione logica ≠ presentazione | [0005](../architecture/decisions/0005-modello-mappa.md) |
| Prenotazioni & pricing | Prenotazione unica a intervallo, ombrellone-pacchetto, listino a regole | [0006](../architecture/decisions/0006-dominio-prenotazioni-e-pricing.md) |
| Architettura | Monolite modulare, API-first, multi-tenant-aware, IA come servizio | [0007](../architecture/decisions/0007-stile-architetturale.md) |
| Stack & layout | Vue 3+TS / NestJS / PostgreSQL / Prisma / monorepo | [0008](../architecture/decisions/0008-stack-e-layout.md) |

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
Entità: Stabilimento, Settore, Fila, Ombrellone, Pacchetto, Cliente, Stagione,
Listino, Tariffa, Prenotazione, Lista_attesa, Utente. Ogni entità di business porta
`stabilimento_id`.

## 6. Moduli del Core (confini e responsabilità)

Ogni modulo ha una responsabilità singola, espone un'interfaccia esplicita e dipende
solo da ciò che è dichiarato. Questo abilita test in isolamento e basso accoppiamento.

| Modulo | Responsabilità | Espone | Dipende da |
|---|---|---|---|
| `core` | Contesto tenant, tipi base, utilità trasversali | TenantContext, base entities | — |
| `identita` | Utenti staff, login, ruolo, risoluzione tenant | Auth/guards, utente corrente | `core` |
| `mappa` | Settori, File, Ombrelloni; struttura della spiaggia | CRUD struttura, query ombrelloni | `core` |
| `clienti` | Anagrafica Cliente | CRUD clienti, ricerca | `core` |
| `catalogo` | Pacchetti, Stagioni, Listini, Tariffe + **pricing engine** | calcolaPrezzo(...), CRUD listino | `core`, `mappa` (ambito posizione) |
| `prenotazioni` | Prenotazione, disponibilità (anti-overlap), lista d'attesa | crea/annulla/promuovi, disponibilità per data | `core`, `mappa`, `clienti`, `catalogo` |

Regola: le dipendenze vanno in una sola direzione (niente cicli). `prenotazioni` è il
modulo orchestratore; `catalogo` non conosce `prenotazioni`.

## 7. Pricing engine (parte delicata)

Calcola il prezzo di una Prenotazione risolvendo la `Tariffa` applicabile.

- **Input**: tipo prenotazione, Ombrellone (→ Fila/Settore = ambito posizione),
  Pacchetto, periodo (date).
- **Risoluzione**: tra le Tariffe del Listino della Stagione attiva, seleziona quelle
  compatibili e sceglie la **più specifica** secondo una precedenza esplicita e
  documentata (es. match esatto fila > settore > generico; periodo specifico >
  generico).
- **Output**: prezzo totale + dettaglio (unità giorno/periodo, righe extra).
- **Testabilità**: motore puro e deterministico, coperto da test su casi limite
  (sovrapposizione di regole, periodo a cavallo di fasce, pacchetto con extra).

## 8. Funzionalità per area

- **Setup** (admin): crea Stabilimento, Settori/File/Ombrelloni, Pacchetti, Stagione,
  Listino, Tariffe.
- **Mappa** (staff): vista per data con stati (libero/abbonato/giornaliero/prenotato);
  clic → drawer contestuale.
- **Prenotazione**: da drawer → cliente (esistente/nuovo) + pacchetto + periodo →
  prezzo calcolato → conferma (con controllo disponibilità).
- **Abbonamento**: assegnazione di un Ombrellone a un Cliente per l'intera Stagione.
- **Lista d'attesa**: accodamento su pieno; promozione manuale a Prenotazione.
- **Clienti**: anagrafica e ricerca.
- **Listino**: gestione Pacchetti e Tariffe.

Flussi completi: [docs/design/flows.md](../design/flows.md).

## 9. UI/UX

App a sezioni (menù: Mappa, Prenotazioni, Clienti, Listino, Report) con la **Mappa
come home** e drawer contestuale. Responsive desktop + tablet, PWA. Snapshot:
[docs/design/mockups/main-screen.html](../design/mockups/main-screen.html).

## 10. Multi-tenancy nell'MVP

- Modello dati **tenant-aware** (`stabilimento_id` ovunque) e scoping applicativo di
  ogni query fin da subito.
- Signup self-service, isolamento avanzato e billing **non** nell'MVP
  ([D-002](../architecture/deferred.md)): l'MVP opera di fatto su uno stabilimento
  configurato, ma il codice non assume mai un tenant singolo.

## 11. Accesso e ruoli (MVP)

- Utenti staff con ruolo `admin` (configura struttura e listino) o `staff` (operativo).
- RBAC granulare e gestione account multi-tenant → modulo 3.

## 12. Rischi e questioni aperte

- **Pricing engine**: la parte a maggior rischio; mitigato da motore puro + test su
  casi limite.
- **ORM (Prisma)**: scelta rivedibile se emergono limiti su query complesse
  (disponibilità) — da validare in fase di piano.
- **Offline in spiaggia**: l'MVP assume connettività (offline-light); il rischio è
  tracciato in [D-008](../architecture/deferred.md).
- **Granularità anti-overlap**: confermare se la disponibilità è per giorno (scelta
  MVP) o per fasce orarie (non previsto ora).

## 13. Definition of Done dell'MVP

- Un admin configura da zero uno stabilimento (struttura + listino).
- Lo staff crea i tre tipi di prenotazione dalla mappa, con prezzo calcolato
  automaticamente e disponibilità garantita (no overlap).
- Abbonamento assegnabile per la stagione; lista d'attesa con promozione manuale.
- Contratti FE/BE condivisi; pricing engine coperto da test; diagrammi in
  `docs/design/` aggiornati.

## 14. Riferimenti

- [Architettura viva](../architecture/README.md) · [ADR](../architecture/decisions/) ·
  [Decisioni rimandate](../architecture/deferred.md) ·
  [Glossario](../architecture/glossary.md) · [Design](../design/)
