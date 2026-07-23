# Handoff — `retiredFrom` nello storico prenotazioni (backlog D-055)

> **Data:** 2026-07-23 · **Autore sessione:** agente typecheck+D-058 (stessa sessione, terza feature).
> **TL;DR:** chiuso il follow-up più utile del backlog D-055: lo storico della Scheda cliente non
> mostra più «— · 12» per un ombrellone **ritirato**, ma la **posizione storica** («Centro · Fila 1 · 12»,
> snapshot congelato al ritiro) con **badge «Ritirato»**. Branch `feat/retiredfrom-storico-d055`,
> 6 commit da `4a71738`: spec → piano → 3 task subagent-driven (reviewer per task, tutti Approved al
> primo giro) → **review finale whole-branch (fable): READY TO MERGE, 0 Critical / 0 Important** →
> 2 Minor cosmetici chiusi. Verde di prima mano: api unit **268/268** · api e2e **393/393** ·
> web-staff **541/541** · web-customer 25/25 · web-platform 17/17 · `pnpm -r typecheck` 0.
> **MERGIATO FF su `main` (`0bb8d9e`) e pushato con ok esplicito**, branch eliminato.

## 1. La decisione (e le due alternative scartate)

Spec: [`2026-07-23-retiredfrom-storico-prenotazioni-design.md`](../superpowers/specs/2026-07-23-retiredfrom-storico-prenotazioni-design.md) ·
Piano: [`2026-07-23-retiredfrom-storico-prenotazioni.md`](../superpowers/plans/2026-07-23-retiredfrom-storico-prenotazioni.md).

`sectorName` è proiettato da `umbrella.row?.sector.name`: un ritirato ha `rowId = null` (ADR-0053),
quindi il campo resta assente e il chip rendeva «— · label» in tre punti della Scheda cliente.

Scelta (criterio utente: «la più professionale, senza debiti»): **due campi nuovi opzionali**
(`umbrellaRetiredAt`, `umbrellaRetiredFrom`) invece di riciclare `sectorName`.

- **Scartato il fallback dentro `sectorName`** (una riga sola): metterebbe una stringa storica
  «Settore · Fila» in un campo documentato come «nome del Settore» vivo — il chip mostrerebbe un
  livello di dettaglio diverso dai vivi senza che nessuno sappia perché.
- **Scartato il riempimento senza marca**: l'operatore vedrebbe una posizione normale e non
  capirebbe perché quell'ombrellone non è più sulla mappa.
- **Due campi e non uno**: ritirato-senza-snapshot è possibile a contratto (`retiredFrom` è
  nullable), e la *marca* non deve sparire se manca lo snapshot.

## 2. Cosa è stato fatto

1. **Contratto + projection** (`b9b11d3`) — `CustomerBookingDTO` += `umbrellaRetiredAt?`/
   `umbrellaRetiredFrom?` (blocco «arricchimenti server-side»); `CustomerBookingEnrichment` e
   `toCustomerBookingDTO` li propagano. `sectorName` **invariato**.
2. **Enrichment API** (`bd021a8`) — in `listByCustomer`, due righe con **gate esplicito su
   `retiredAt`** (`umbrellaRetiredFrom` presente solo se ritirato: l'invariante è nel codice, non
   nella fiducia). **Zero query nuove** — l'`include` di `umbrella` non usa `select`, quindi gli
   scalari erano già caricati (verificato dal reviewer). Il canale cliente
   (`listSubscriptionsForCustomer`) eredita gratis riusando `listByCustomer`.
3. **FE web-staff** (`53ec8f6`) — helper puro `positionLabel()` +
   `Badge tone="neutral"` «Ritirato» in `CustomerHistoryCard`, `CustomerSubscriptionsCard`,
   `CustomerPaymentsCard`. Il chip era **triplicato** in quei tre punti: l'helper **riduce** la
   duplicazione invece di aggiungerci anche il ramo condizionale nuovo.
4. **Rifiniture post-review** (`d5e6372`) — test D-055 spostato dalla describe «disdetta (D-013)»
   a una propria; assert e2e su `umbrellaRetiredAt` da `typeof === 'string'` a regex ISO.

Nessuna migration (i campi DB esistono dal branch D-055) e nessun breaking: i campi sono opzionali,
gli handler MSW e `web-customer` (che usa solo `umbrellaLabel`) restano validi.

## 3. Verifica

| Suite | Esito |
|---|---|
| api unit | **268/268** (48 suite) — era 266 |
| api e2e | **393/393** (35 suite) — era 392 |
| web-staff | **541/541** (84 file) — era 533 |
| web-customer · web-platform | 25/25 · 17/17 (consumano `contracts`) |
| `pnpm -r typecheck` | exit 0 |

Review per task: 3/3 Approved al primo giro, nessun fix-loop. Review finale whole-branch (fable):
READY TO MERGE. I due Minor cosmetici sono stati chiusi; il terzo rilievo è diventato **D-060**.

## 4. Cosa ha trovato la review finale che nessun reviewer per-task poteva vedere

**[D-060](../architecture/deferred.md)** — `useEntityLabels().umbrellaLabel` (web-staff) costruisce la
mappa id→label dalla **day-map viva**: un ritirato non ha fila, quindi in `BookingsView` e
`RenewalsView` una prenotazione su ombrellone ritirato perde la **label intera** («—»), che è peggio
del caso appena risolto. Il punto interessante: **lo stesso identico problema è già risolto in quel
file per i pacchetti archiviati** — il commento in testa spiega che `packageName` usa
`useAllPackages()` proprio perché è un percorso di *risoluzione storica*; la regola non era mai stata
estesa agli ombrelloni perché il ritiro non esisteva ancora. Tracciata, non fixata: fuori dallo scope
dichiarato di questo branch (solo Scheda cliente).

## 5. Stato e prossimi passi

- **`origin/main = 0bb8d9e`** (FF di 7 commit da `4a71738`, pushato con ok esplicito; branch
  eliminato, working tree pulito). Prima del merge le due suite dei pacchetti toccati dal commit di
  rifinitura `d5e6372` sono state rilanciate **intere** sull'head reale (api e2e 393/393,
  web-staff 541/541): il fix subagent aveva girato solo quelle focalizzate.
- Baseline sul mergiato: api unit **268** · api e2e **393** (35 suite) · web-staff **541** (84 file) ·
  web-customer 25 · web-platform 17 · `pnpm -r typecheck` 0.
- Backlog D-055 rimanente: reason `UMBRELLA_RETIRED` nel quote · guardia su `update`/`remove` dei
  ritirati · canary sull'indice unico parziale di `Umbrella` (modello pronto:
  `apps/api/test/rate-fk-restrict.e2e-spec.ts`).
- Altre voci aperte: **D-059** (FK opzionali residue + erasure↔noleggi), **D-060** (sopra).
- Ledger: `.superpowers/sdd/progress.md`, sezione «retiredfrom-storico» (scratch `task-sf-N`;
  prossimo prefisso libero: `task-sg-N`).
- Handoff precedente della sessione: [`2026-07-23-typecheck-api-d058.md`](2026-07-23-typecheck-api-d058.md).
