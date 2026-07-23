# D-060 — Label degli ombrelloni ritirati in Prenotazioni e Rinnovi

- **Data:** 2026-07-23 · **Branch:** `fix/d060-label-ombrelloni-ritirati`
- **Origine:** [deferred.md D-060](../../architecture/deferred.md), scoperta dalla review finale di
  D-055-storico. Decisione presa in brainstorming con l'utente (criterio delegato: «la soluzione
  più professionale, senza debiti, coerente e meno pigra»).

## 1. Problema

`useEntityLabels().umbrellaLabel` ([useEntityLabels.ts](../../../apps/web-staff/src/lib/useEntityLabels.ts))
costruisce la mappa id→label attraversando la day-map viva (settori → file → ombrelloni). Un
ombrellone ritirato (ADR-0053) è sganciato dalla fila e non compare nella day-map, quindi:

- `BookingsView` (cella «Ombrellone»): una prenotazione passata su ombrellone poi ritirato mostra «—»;
- `RenewalsView` (due tabelle): abbonamenti della stagione origine su ombrellone ritirato → «—».

Nello stesso file il problema è **già risolto per i pacchetti archiviati**: `packageName` usa
`useAllPackages()` (archiviati inclusi) perché è un percorso di **risoluzione storica**, non un
selettore. La stessa regola non è mai stata estesa agli ombrelloni perché il ritiro non esisteva.

## 2. Decisione

**Estendere la regola di risoluzione storica agli ombrelloni, lato FE, aprendo la fonte allo staff.**

1. **API — `GET /establishment/umbrellas/retired` diventa Admin+Staff.** Oggi l'intero
   `UmbrellasController` è `@Roles(Role.Admin)` a livello di classe. Il decoratore scende sui
   singoli handler: tutte le mutazioni e il CRUD restano admin-only, la sola `GET retired` diventa
   `@Roles(Role.Admin, Role.Staff)` (il `RolesGuard` usa `getAllAndOverride`, quindi il metodo
   vince sulla classe — qui la classe non dichiara più nulla). `RetiredUmbrellaDTO` è pura
   struttura (id, label, tipologia, `retiredAt`, `retiredFrom`): zero PII, e lo staff vede già
   tutte le label attive dalla day-map.
2. **FE — `useEntityLabels` fonde i ritirati.** Il composable consuma anche `useRetiredUmbrellas()`
   (già esistente in `useEstablishmentStructure.ts`, con query key invalidata da retire/restore) e:
   - `umbrellaLabel`: mappa fusa attivi + ritirati (id→label);
   - nuovo `retiredUmbrellaIds: ComputedRef<Set<string>>` per il badge nelle viste.
   Il commento di testa del file (il «perché» di `useAllPackages`) si estende agli ombrelloni.
3. **Viste — badge «Ritirato» come la Scheda cliente.** Nelle celle «Ombrellone» di `BookingsView`
   e `RenewalsView` (entrambe le tabelle), accanto alla label risolta compare
   `Badge tone="neutral"` «Ritirato» quando l'id è nel set: spiega perché l'ombrellone non esiste
   in mappa, coerente con `CustomerHistoryCard`/`CustomerPaymentsCard`/`CustomerSubscriptionsCard`.

### Alternativa rigettata

Arricchire `BookingDTO`/`RenewalWindowItemDTO`/`SubscriptionListItemDTO` con `umbrellaLabel`
calcolata in projection (come `CustomerBookingDTO`): nessun cambio ruoli, ma cambia il contratto di
più endpoint di lista e crea una **seconda fonte di verità** per le label che il FE risolve già via
`useEntityLabels` per tutto il resto (ADR-0033 §5.1). È la via che duplica, cioè il debito.

## 3. Dettagli d'implementazione

- **e2e**: `establishment-umbrellas-retire.e2e-spec.ts` asserisce oggi `403 per staff su
  retire/restore/retired`. L'aggiornamento è **deliberato**: staff → `200` con shape corretta sulla
  GET, `403` confermato su retire/restore. È il punto in cui si dichiara il cambio di superficie.
- **MSW**: l'handler `GET /api/establishment/umbrellas/retired` esiste già in `mocks/server.ts`
  (risponde `[]`): gli spec che esercitano il caso ritirato lo overridano con `server.use(...)`.
- **Spec FE da toccare**: `useEntityLabels.spec.ts` (risoluzione ritirato + set),
  `BookingsView.spec.ts` e `RenewalsView.spec.ts` (label risolta + badge).
- **Nessuna migration, nessun contratto nuovo** (`RetiredUmbrellaDTO` esiste).
- Fuori scope: la reason `UMBRELLA_RETIRED` nel quote (backlog D-055, con vincolo
  `computeSetupStatus` ADR-0054) e ogni altra vista.

## 4. Piano (item singolo, TDD diretto)

1. API: discesa `@Roles` sui handler + `GET retired` Admin+Staff; e2e aggiornata (prima rossa, poi
   verde); full e2e api.
2. FE: test rosso su `useEntityLabels` (ritirato risolto + `retiredUmbrellaIds`) → implementazione;
   test badge nelle due viste → implementazione; full suite web-staff.
3. Typecheck monorepo; review finale del branch; deferred.md aggiornata (D-060 → risolta) nello
   stesso branch.
