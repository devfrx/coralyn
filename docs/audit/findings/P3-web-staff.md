# P3 — apps/web-staff (105/105 file non-spec letti integralmente)

## P3-001 — `CustomerAccessCard` congela `bookingId`: può provisionare l'accesso del cliente SBAGLIATO — ALTO (correttezza)
- `CustomerAccessCard.vue:7-12` legge `props.bookingId` UNA VOLTA in setup (valore, non getter) e lo passa a 3 composable.
- Padre `CustomerDetailView.vue:77-80,180`: `accessBookingId` è un `computed`; il `v-if` resta vero → il componente NON viene ricreato quando l'id cambia.
- Endpoint `/bookings/:id/customer-access` risolve il cliente DAL BOOKING → genera/revoca l'accesso di un ALTRO bagnante, mostrando QR+PIN che l'operatore crede del cliente a schermo. **Mutazione su dati altrui.**
- Riproduzione: cliente con 2 abbonamenti → cedi sub#1 con `TransferSubscriptionModal` → invalida `customerBookings` → `accessBookingId` diventa sub#2 ma la card muta ancora sub#1, ora del subentrante.
- RADICE: in `useCustomers.ts` TUTTI i composable prendono l'id per valore; `useRates.ts:8` e `useRentalTariffs.ts:9` prendono **thunk** e documentano il perché. Due convenzioni per lo stesso problema nella stessa app.
- FIX: uniformare al thunk `getBookingId: () => string`. Mitigazione immediata (non risolutiva): `:key="accessBookingId"`.

## P3-002 — Gli errori di query resi come «vuoto»: la Mappa mostra spiaggia deserta invece di errore — ALTO (correttezza)
- Viste che NON consultano mai `isError` (9): `MapView.vue:19,302-436`, `BookingsView.vue:17,60`, `CustomersView.vue:16,72-73`, `PricingView.vue:78,540,558`, `RentalsView.vue:21,133-138`, `RentalCatalogView.vue:92,268`, `RenewalsView.vue:29-30,123,145`, `ReportView.vue:13,33-36` (KPI a €0,00/0% in errore), `EstablishmentStructureView.vue:138` (errore e vuoto collassati).
- Gestiscono correttamente solo 3/12: `EstablishmentView.vue:134`, `OnboardingView.vue:53`, `CustomerDetailView.vue:128`.
- In MapView se `/map` fallisce: `map` undefined + `isLoading` false → ramo `v-else` → scena con `sectors=[]`, «0 postazioni», nessun messaggio.
- RADICE: `queryResource` (`lib/useQueryResource.ts:14`) espone tutto, ma nessuna convenzione su come si rende l'errore; `DataTable` non ha superficie d'errore (solo `loading`/`empty-message`) → la via più corta è non gestirlo. Anche i nomi divergono: `isPending` vs `isLoading`.
- Collegato: `lib/http.ts:10` il fallback di `ApiError` espone il path interno all'utente nel toast.
- FIX: `QueryBoundary` (o slot `#error` in DataTable + `ErrorState` in ui-kit); fissare `isLoading` canonico.

## P3-003 — NESSUN `Select` dell'app ha un nome accessibile — ALTO (accessibilità)
- **32 `<Select>` in 22 file, tutti senza nome accessibile.** Via `<Field label>`: SettlePaymentModal:84, SettleRentalPaymentModal:85, RentalsView:169,175,184, TransferSubscriptionModal:86, EstablishmentView:247, LegalProfileModal:83, UmbrellaGeneratorForm:43, BeachPanel:78, MultiPanel:41, RowCreatePanel:68, SectorCreatePanel:36, SectorPanel:44, UmbrellaPanel:51, UmbrellaCreatePanel:37, PricingView:657,665,675,683, StepRates:57, StepStructure:70,83,95. Via `<label>` fratello senza `for`: MapView:494,503,521, RenewalsView:88,94. **Senza alcuna etichetta**: PricingView:400,585, RentalCatalogView:259, BeachPanel:111.
- Più: 5 `<SegmentedControl role="radiogroup">` senza `aria-label`; 11 `<label>` senza `for` (0 con `for` in tutta l'app).
- CAUSA: `ui-kit/Select.vue:22` rende un `SelectTrigger` reka-ui = `<button role="combobox">`. `Field.vue:5` avvolge in `<label>`. Un `<button>` NON è etichettabile → il nome deriva solo da `SelectValue`, cioè il VALORE. Screen reader dice «Contanti, casella combinata», mai «Metodo».
- WCAG 4.1.2. Caso peggiore: modale Nuova prenotazione (3 combobox consecutivi), PricingView:657-688 (4 combobox che annunciano tutti «Tutti»/«Nessuno»).
- RADICE: l'API di `ui-kit/Select` non ha mai previsto l'etichettatura; `Field` progettato per `<input>` e riusato per widget custom. `Select` fa `v-bind="$attrs"` sul trigger → il canale esiste, nulla lo impone.
- FIX: `Field` genera `id` e lo passa via provide/inject; `Select` accetta `labelledBy`/`aria-labelledby` sul trigger (o `aria-label` obbligatorio nel tipo props). Test che asserisce il nome accessibile di ogni combobox.

## P3-004 — La ricerca in Mappa costruisce un selettore CSS con l'etichetta grezza — MEDIO (correttezza)
- `MapView.vue:83-97`: `document.querySelector(`[aria-label^="Ombrellone ${first.label},"]`)`. `label` è testo libero (`create-umbrella.dto.ts:8-11`: solo `@IsString @IsNotEmpty @MaxLength(20)`).
- (a) Etichetta con doppio apice (`A"1`, creabile dal Cantiere) → `SyntaxError` dentro watcher async → **unhandled rejection**, ricerca rotta per TUTTI gli ombrelloni finché l'etichetta esiste.
- (b) Contratto implicito col formato di `ariaLabel()` 30 righe sopra: se diventa «Postazione…» lo scroll smette in silenzio.
- RADICE: il DOM usato come indice di ricerca; `UmbrellaCell` non espone aggancio.
- FIX: `data-umbrella-id` su `UmbrellaCell` + `CSS.escape(first.id)` (UUID).

## P3-005 — Il Listino legge il catalogo struttura dalla mappa-GIORNO, e ha due fonti per le fasce nello stesso file — MEDIO (architettura)
- `PricingView.vue:19,91,154-156,365-378`: usa `useDayMap()` (`GET /map?date=${session.activeDate}`) per `sectorOptions`, `timeSlotOptions`, `slotName`, `sectorName`, `rowName`.
- Ma la rotta `/pricing` ha `usesDate:false` (`router/index.ts:15`): il selettore data non è visibile, eppure le opzioni dipendono da `session.activeDate` impostata ALTROVE.
- Doppia fonte per le fasce nello STESSO componente: `slots` (da `/time-slots`) per l'editor, `dayMap.timeSlots` per il modale. Convergono solo grazie a `invalidateSlotsAndMap` (`useTimeSlots.ts:16-22`).
- Costo: scarica l'intera occupazione del giorno per leggere 4 nomi.
- RADICE: manca un read-model «catalogo struttura» consumabile fuori dal Cantiere. `useEstablishmentStructure()` è esattamente questo ma è trattato come privato di `establishment`.
- FIX: sostituire con `useEstablishmentStructure()`; usare `slots` anche per `timeSlotOptions`/`slotName`; promuovere in `lib/`.

## P3-006 — `PricingView` = 710 righe, 5 entità CRUD; D-040 traccia un'estrazione GIÀ FATTA — MEDIO (manutenibilità)
- `PricingView.vue` 710 righe: stagioni, pacchetti, tipi dotazione, fasce, tariffe + 6 modali + ConfirmDialog multi-tipo. `RentalCatalogView.vue` 354 righe, stessa forma.
- `EstablishmentStructureView.vue` oggi è **165 righe** + `InspectorPanels.vue` + `panels/` (8 file): **l'estrazione di D-040 è stata eseguita** (commit `98f0bae`, `3dfe15e`, `5894492`, `e851a37`, `e7f6e78`). `SectorKind` è già esportato da contracts; resta inline solo la union icone (`BeachPanel.vue:22,80`).
- Ma D-040 risulta **interamente aperta** nel registro, e nessuna voce copre `PricingView` = **1,75×** la dimensione che fece scattare D-040, con un'entità in più.
- Namespace appiattito a prefissi: `sName`/`pName`/`iName`/`tLabel`/`eqtName`/`slotNameField`, `rType`/`rSector`/`rPackage`/`rSlot`.
- FIX: aggiornare D-040 allo stato reale + aprire voce per PricingView/RentalCatalogView; estrarre sezione per entità riusando il pattern già validato dal Cantiere.

## P3-007 — Le 7 modali-form riscrivono lo stesso scheletro; 5 bypassano `ModalFooter` — MEDIO (manutenibilità)
- `inputClass` identica in **10 file**; `clampDate` identica in **5**; `const submitting = ref(false)`+try/finally in **8**; scala `409/422/generico` in **7** modali (10 confronti); footer a mano `<div class="flex justify-end gap-2…">` in **12 file**, `ModalFooter` usato solo in 4.
- Danno concreto: `submitting` duplica `mutation.isPending`; le copie a mano usano `rounded-[11px]` e `focus:outline-none` **senza anello di focus** — a differenza di `ui-kit/Input.vue` (`ring-focus`). → **fuoco invisibile** in tutte e 5 le modali abbonamento. Footer fuori dallo slot scorre col contenuto.
- RADICE: `ui-kit` dà i mattoni ma non il pattern «modale di form con mutation». 7 usi reali ⇒ non è YAGNI.
- FIX: usare `<Input>`/`<Textarea>` di ui-kit; `clampDate` in `lib/dates.ts`; `useMutationForm({mutation, mapError})` in `lib/`; footer nello slot `#footer`.

## P3-008 — Mappe stato→presentazione e util data duplicate fuori da `lib/`, contro ADR-0033 §1 — MEDIO (coerenza)
- `TYPE_LABEL` in **3** posti: `lib/statusMaps.ts:14`, `MapView.vue:42-44` (benché il file importi già da statusMaps alla riga 7), `PricingView.vue:158-160`.
- `STATE_LABEL: Record<SlotState,string>` verbatim in **2**: `MapView.vue:38-41`, `ReportView.vue:9` — in nessuno dei due `lib/statusMaps.ts`.
- `SlotState→colore` in 3 forme: `MapView.vue:33-37`, `lib/chartColors.ts:3-6`, `ui-kit/UmbrellaCell.vue`.
- `todayIso()` reimplementata in **4** file oltre a `lib/dates.ts:12`: SettlePaymentModal:24, SettleRentalPaymentModal:25, StepRates:14, StepSeasons:18 — le copie omettono le opzioni `year/month/day` esplicite, corrette solo perché `en-CA` formatta ISO di default.
- `initials()` reimplementata inline in `ReportView.vue:57`, tronca male i nomi composti.
- FIX: `SLOT_STATE_LABEL`/`SLOT_STATE_VAR` in statusMaps (unificando chartColors), rimuovere copie locali, import da lib.

## P3-009 — Tre mutation invalidano con prefissi scritti a mano, aggirando `queryKeys` — MEDIO (manutenibilità)
- `useRenewals.ts:25` `[['subscriptions'],['map'],['renewalCampaign']]`, `:44`, `:52`; `useTimeSlots.ts:19` `['map', session.establishmentId]`.
- Ogni altro composable usa `queryKeys.*`. Rinominare in `queryKeys.ts` non rompe questi letterali: continuano a compilare e smettono di corrispondere → tabella rinnovi che non si aggiorna, silenziosamente.
- RADICE: `queryKeys` espone solo chiavi COMPLETE, non prefissi.
- FIX: aggiungere prefissi tipizzati (`renewalCampaigns:(t)=>['renewalCampaign',t] as const`, ecc.).

## P3-010 — «Stagione attiva» decisa in 4 modi diversi — MEDIO (correttezza)
1. `lib/useActiveSeason.ts:12` → `overview.activeSeason.name` (server)
2. `RentalsView.vue:32-36` → stagione che copre `activeDate`, else `seasons[0]`
3. `PricingView.vue:30-32` + `RentalCatalogView.vue:29-31` → `watchEffect` → `seasons[0]`
4. `RenewalsView.vue:21-27` → contiene activeDate else `seasons[0]`; `StepRates.vue:15-23` → prima con `endDate>=oggi`
- **Conseguenza contabile**: il banco noleggi applica le tariffe della stagione che copre `activeDate` (2), l'editor catalogo apre sulla prima della lista (3). Con 2 stagioni (il seed mock ne ha 2: `se-1` 2026, `se-2` 2027) l'operatore modifica le tariffe di una stagione mentre il banco addebita quelle dell'altra, **senza segnale**. `seasons[0]` dipende da un ordinamento che nessun contratto fissa.
- RADICE: `lib/useActiveSeason` nato per la sola Sidebar (espone solo `name`), API troppo stretta per essere riusata.
- FIX: allargare a `{season, seasonId, name}` con UNA regola, usarlo come default nelle 5 viste.

## P3-011 — 83 doppi cast `as unknown as`, imposti dall'API non generica di `DataTable` — MEDIO (manutenibilità)
- 83 occorrenze in 7 file: BookingsView (~16), CustomersView, CustomerPaymentsCard, PricingView, RenewalsView (~20), RentalsView, RentalCatalogView.
- Radice in `ui-kit/DataTable.vue:10,15`: `type Row = Record<string, unknown>`.
- `as unknown as X` AZZERA ogni verifica. Zero `eslint-disable`/`@ts-expect-error` in tutta l'app proprio perché questo idioma li rende superflui: è un `@ts-ignore` travestito ripetuto 83 volte, che nessuna regola intercetta (flat config senza `no-unnecessary-type-assertion` né plugin Vue).
- FIX: `DataTable` generico (`generic="T extends object"`), retro-compatibile.

## P3-012 — «Cedi» e «Segnala assenza» governate dal predicato di SOSPENSIONE; `canTerminate`≡`canSuspend` — MEDIO (manutenibilità)
- `CustomerSubscriptionsCard.vue:22-33,60-64`: due nomi, espressione identica byte per byte. `v-if="canSuspend(b)"` su «Cedi» (:61) e `canSuspend(b) && consentActive(b)` su «Segnala assenza» (:63).
- 4 azioni di dominio pilotate da 2 predicati, uno usato per 3 significati. `hasActions` (:32-33) non menziona né cessione né assenza.
- FIX: `features/customers/subscriptionActions.ts` con 5 funzioni nominate, ciascuna col proprio corpo anche se oggi coincidono.

## P3-013 — «Annulla prenotazione» è l'UNICA azione irreversibile senza conferma — MEDIO (coerenza)
- `MapView.vue:231-233,467`: `onCancel()` chiama direttamente `cancelBooking.mutate`. Nessun `ConfirmDialog`.
- TUTTE le altre azioni distruttive ne hanno uno: PricingView:701, **RentalsView:206 (annullo noleggio = stessa semantica)**, RentalCatalogView:345, CustomerDetailView:184, CustomerAccessCard:63, SectorPanel:58, RowPanel:78, UmbrellaPanel:68,70, MultiPanel:60, BeachPanel:125.
- Superficie a più alta densità di click, su tablet in spiaggia, bottone adiacente a «Registra incasso».
- FIX: ConfirmDialog in MapView + scrivere la regola in ADR-0045.

## P3-014 — `SettleRentalPaymentModal` clone verbatim di `SettlePaymentModal` — BASSO (manutenibilità)
- 102 vs 101 righe, identici salvo tipo, hook, eyebrow e una stringa d'errore. Il commento lo dichiara («Mirror di SettlePaymentModal … D-052») ma non è tracciato.
- FIX: unico modale parametrizzato. Da fare insieme a P3-007.

## P3-015 — Difetti minori localizzati — BASSO
**a)** `BeachPanel.vue:46,111-114`: `restoreRowByUmbrella` parte da `undefined`, `ui-kit/Select.vue:15-18` mappa a sentinella solo `''` → il placeholder «Fila di destinazione…» non compare MAI.
**b)** `MapView.vue:184`: `liveU = computed(() => selUmbrella.value ?? sel.value!.u)` lancia se `sel` è null; salvo solo perché tutti e 5 i chiamanti ripetono la guardia. Un sesto che la dimentichi lancia in render.
**c)** Commenti/config superati: `vite.config.ts:35` cita l'enum `Ruolo` che non esiste più (è `Role`); `RegisterView.vue:6-8` cita D-017 come aperta ma è **risolta** da ADR-0029; `package.json:42-46` ha `"msw": {"workerDirectory":["public"]}` vestigiale (nessun `mockServiceWorker.js` in `public/`, e `main.ts:10-28` de-registra i SW); `styles/main.css:7` e `StructureScene.vue:7` importano lo stesso CSS con due convenzioni; `mocks/server.ts:173` unico handler su 89 con prefisso `*`.
**d)** `terminationRefund.ts:3-6`, `suspensionRefund.ts:3-6`, `cessionRefund.ts:3-6`: `dayDiff`/`round2`/`clamp` identici. Il clamp finale differisce: `round2(amountCollected − refundedAmount)` in termination vs `Math.max(…, 0)` senza round2 negli altri due — stessa quantità, due arrotondamenti.

## COPERTURA
Letti INTEGRALMENTE tutti i 105 file non-spec di `apps/web-staff/src`. NON letti: `mocks/server.ts` righe 120-699 (letti seed + elenco 89 handler via grep), `styles/map-scene.css`, `styles/structure-scene.css`, i 62 `*.spec.ts` (altra partizione).
Verificato e NON segnalato perché documentato: `/privacy` vs `/legale/*`, `privacyPreviewUrl`, `strictPort`, 401 via onError (D-037), i18n (D-003), validazione runtime (D-021), union icone (D-040), reka-ui in ui-kit, `@source`, `useEntityLabels`, erasure GDPR.

## RADICI
- **R1 — Le astrazioni condivise sono nate troppo strette e non sono state allargate.** `useActiveSeason` solo `name`→P3-010; `statusMaps` solo Booking/Rental→P3-008; `queryKeys` solo chiavi complete→P3-009; `lib/dates` senza `clampDate`→P3-007. Pattern costante: **quando l'API del modulo condiviso non copre il caso, violarla costa meno che estenderla.** Radice con più ricadute.
- **R2 — `ui-kit` dà mattoni, non pattern; il conto lo paga web-staff.** DataTable non generico→83 cast (P3-011); Select/Field senza etichettatura→32 combobox anonimi (P3-003); nessun contenitore modale-form→7 scheletri + 10 input senza anello di fuoco (P3-007); nessun ErrorState→9 viste che rendono l'errore come vuoto (P3-002). Il design system si è fermato al componente visivo, non è salito all'interazione.
- **R3 — Reattività persa per convenzione incoerente sugli id.** Thunk (useRates/useRentalTariffs) vs valore piatto (tutto useCustomers). → P3-001.
- **R4 — La Mappa è la vista più vecchia e non è stata ripassata.** Unica con TYPE_LABEL/STATE_LABEL locali, `<label>` orfani, azione irreversibile senza conferma, DOM indicizzato per stringa. Le convenzioni nascono nelle feature nuove e non retro-propagano.
- **R5 — Il registro deferred si è disallineato dal codice.** D-040 descrive un'estrazione già eseguita; il componente-fiume peggiore non è tracciato. ADR-0002 filtro 4 funziona solo se il registro è vero.
