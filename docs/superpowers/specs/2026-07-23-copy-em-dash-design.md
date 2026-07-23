# 5.5 — Rimozione degli em dash dal testo utente

- **Data:** 2026-07-23 · **Branch:** `fix/copy-em-dash` (impilato su `fix/d060-label-ombrelloni-ritirati`,
  che tocca le stesse celle)
- **Origine:** handoff 2026-07-23 §5.5. Decisioni prese dall'utente in brainstorming.

## 1. Decisioni (dell'utente, vincolanti)

1. **Perimetro**: solo testo visibile all'utente — sorgenti UI delle app (`apps/*/src`, `.vue`/`.ts`,
   spec escluse salvo quelle che asseriscono la copy toccata) e messaggi in `apps/api/src`.
   **Fuori perimetro**: commenti di codice, `packages/contracts`, `docs/`, fixture dei test,
   nomi di `describe`/`it` (test code, non UI).
2. **Prosa**: riscrittura mirata frase per frase (virgole, due punti, parentesi), nessun segno
   sostitutivo meccanico.
3. **Placeholder di cella `'—'`** (dato assente): diventa **`'–'` (en dash)** ovunque. Non è
   punteggiatura ma segnaposto dati; l'en dash è già in uso nel repo come separatore di intervallo
   (`MapView` riga ~283).

## 2. Inventario verificato (grep U+2014 sul branch base)

**Placeholder → `'–'`** (~25 occorrenze): `web-platform` EstablishmentsListView/EstablishmentDetailView/
CreateEstablishmentModal (fallback date); `web-staff` RentalsView (74, 142), RentalCatalogView (103),
RenewalsView (130, 152), BookingsView (67, 69×2), EstablishmentView (30), PricingView (364, 365),
CustomerDetailView (143, 144, 175, 176, 177), CustomersView (79, 80), CustomerSubscriptionsCard (51),
CustomerAccessModal (15), `positionLabel.ts` (9); `api` reports.service.ts (105, `umbrellaLabel` DTO).

**Prosa/separatori riscritti**: RenewalsView (77, inciso → parentesi), RentalsView (178, label—prezzo
→ `·`), MapView (288 `·`, 352 due punti, 476 `·`), StructureScene (114 due punti),
SectorCreatePanel/SectorPanel/StepStructure (option kind settore, `—` → due punti, tre file
allineati), StepSummary (54, `— facoltativo` → `(facoltativo)`).

**Spec aggiornate nello stesso task** (dichiarazione del cambio, non rincorsa dei test):
`positionLabel.spec.ts` (2 assert + 2 nomi che citano il valore reso), `CustomerHistoryCard.spec.ts`
(26, `not.toContain('— ·')`), `PricingView.spec.ts` (380, 395, `not.toContain`), nome test in
`BookingsView.spec.ts` (47). I fixture ui-kit (`HoverCard.spec`/`Popover.spec`) restano: contenuto
arbitrario di test, non copy del prodotto.

**Restano em dash nei commenti** dei medesimi file: fuori perimetro per scelta esplicita. Unica
eccezione: il commento di RentalsView riga 71, che cita testualmente il valore reso — aggiornato per
accuratezza, non per stile.

## 3. Verifica

Suite complete (una alla volta) di web-staff, web-platform, web-customer, api unit + e2e; typecheck
monorepo; grep finale U+2014 sul perimetro = solo commenti. Nessun cambio di contratto o dominio.
