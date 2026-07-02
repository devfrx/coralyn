# Consolidamento Catalogo — Slice "Conferme coerenti & Rinnovi leggibili" — Design Spec

- **Data:** 2026-07-02
- **Stato:** Approvato (design) — decisioni risolte con l'utente in brainstorming il 2026-07-02.
- **Origine:** brainstorming post-Slice A (consolidamento Catalogo). Slice A "Scritture sicure & leggibili"
  COMPLETO e mergiato (`main` = `c414328`). Questo è il seguito UX, propedeutico a Slice B (fasce) e C (equipment).
- **ADR di riferimento:** [ADR-0009](../architecture/decisions/0009-documentazione-di-design.md) (workflow),
  [ADR-0031](../architecture/decisions/0031-fuso-orario-e-date-operative.md) (date/stagioni),
  [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md) (componenti ui-kit condivisi),
  [ADR-0034](../architecture/decisions/0034-prelazione-finestre-lazy.md) (prelazione: `RenewalCampaign` unico stato),
  [ADR-0032](../architecture/decisions/0032-pricing-engine-precedenza.md) (motore prezzo — solo per contesto §7).
- **Convenzione:** codice/DB inglese; UI/doc italiano. Baseline test da NON regredire (post-Slice A, verificata live):
  **api unit 83 · api e2e 112 · web-staff 119 (la suite globa ui-kit) · ui-kit standalone 49.**

---

## 1. Situazione attuale (verificata leggendo il codice)

### 1.1 Conferme distruttive incoerenti
- Delete-stagione e delete-pacchetto usano **`window.confirm` nativo** del browser (`PricingView.vue:36-40`
  `confirmDeleteSeason`, `:49-52` `confirmDeletePackage` — quest'ultimo aggiunto in Slice A). Nessun componente
  nostro; look off-brand.
- Delete-**tariffa** (`PricingView.vue:293`, `deleteRate.mutate(r.id)`) è **senza conferma** (scelta Slice A:
  basso rischio). Incoerente col resto.
- `ui-kit` non ha un primitivo di conferma: solo `Modal` (`packages/ui-kit/src/components/Modal.vue`) e
  `ModalFooter`.

### 1.2 `MapView` — unhandled rejection sulle mutation di prenotazione
`apps/web-staff/src/features/map/MapView.vue`: `confirmBooking` (`:125-137`) e `onCancel` (`:138-140`) fanno
`await createBooking.mutateAsync(...)` / `cancelBooking.mutateAsync(...)` **senza try/catch**. Con Slice A
(commit `c440dca`) l'errore ora produce un toast globale (buono), ma `mutateAsync` **rigetta comunque**: la riga
successiva (`modalBooking.value = false`, `:136`) viene saltata e il rigetto emerge come **unhandled promise
rejection** nel click handler. È l'**unica** vista rimasta con questo pattern: `PricingView` e `RenewalsView`
usano `.mutate()` fire-and-forget con l'`onError` globale. Segnalato dalla review whole-branch di Slice A come
rough edge pre-esistente, fuori scope di quello slice.

### 1.3 Rinnovi: etichette "Stagione" ma controlli data; traduzione implicita data↔stagione
`RenewalsView.vue`:
- Le due caselle etichettate **"Stagione di origine/destinazione"** (`:59-66`) sono `<input type="date">`:
  l'operatore sceglie una **data**, e il backend deduce quale stagione la contiene. Mismatch etichetta↔controllo.
- La `deadline` (`:70-73`) è un date-picker (corretto: è una scadenza di calendario).
- Backend: `OpenRenewalCampaignDto` (`originDate`/`destinationDate`/`deadline`, tutti `@IsCalendarDate`),
  `RenewalCampaignQueryDto` (`destinationDate`), `RenewBookingInput` (`startDate`) — tutti risolti a stagione via
  `CatalogService.resolveSeasonWithin(tx, date)` (`renewal-campaigns.service.ts:24,26,54`;
  `bookings.service.ts:274`). Il `renew` usa poi comunque `season.startDate`/`endDate` (`bookings.service.ts:287-288`).
- `RenewalCampaign` **persiste già** `originSeasonId`/`destinationSeasonId` (schema): le date servono solo come
  chiave d'ingresso, poi si lavora per stagione. La traduzione data→stagione è quindi un **debito nascosto**.
- L'elenco abbonati (`GET /bookings/subscriptions?date=`, `bookings.controller.ts:20-23` →
  `listSubscriptions(resolveDate(query.date))`, `bookings.service.ts:296`) è anch'esso guidato da una data.
  **Nota:** il DTO `BookingsQueryDto` è **condiviso** con `GET /bookings` (lista del giorno) → non va modificato;
  serve un DTO dedicato per le subscriptions.

### 1.4 Rinnovi/campagne poco esplicite
La vista non spiega cos'è una "campagna di prelazione", cosa comporta aprirla/chiuderla, cosa significano i badge
(Aperta/Rinnovato/Scaduta, `RenewalsView.vue:49-53`), né perché "Rinnova" sia disabilitato. Le CTA sono nude.

## 2. Obiettivo e scope

Rendere **coerenti le conferme distruttive** e **leggibili i rinnovi**, chiudendo il debito data↔stagione, come
base pulita per Slice B/C. Quattro layer coesi (ordine di commit):

1. `ConfirmDialog` (ui-kit) + conferme su tutti i delete distruttivi.
2. `MapView`: coerenza error-handling (`.mutate()`, niente unhandled rejection).
3. Rinnovi **season-native** (contratti + backend `seasonId` + FE dropdown stagioni).
4. Rinnovi: **microcopy/affordance** (spiegazione campagne, legenda badge, empty state; niente ridisegno).

- **Fuori scope (→ Slice B):** provenienza del prezzo (mostrare *quale* `Rate` ha prodotto il prezzo nella modale
  "+Nuova prenotazione" e spiegare la precedenza nell'editor). Richiede che `BookingQuoteDTO`/l'engine espongano
  la `Rate` combaciata: è lavoro nel dominio pricing, **lo stesso** dello "spiegare la precedenza nell'editor" già
  destinato a B. Accorparlo in B è modulare e non-duplicato. Il messaggio attuale "listino non configurato"
  (`MapView.vue:316`) resta.
- **Fuori scope:** wizard rinnovi, ristrutturazione `DataTable`, i18n (D-003), refactor non correlati.

## 3. Layer 1 — `ConfirmDialog` (ui-kit)

Nuovo componente **presentazionale** costruito su `Modal` esistente (riuso, ADR-0033). API:

```vue
<ConfirmDialog
  v-model:open="open"
  title="Eliminare la stagione?"
  description="L'operazione è irreversibile e rimuove anche tutte le tariffe."
  confirm-label="Elimina"
  cancel-label="Annulla"          // opzionale, default "Annulla"
  tone="danger"                    // 'danger' | 'default' (default 'default')
  @confirm="..."                   // emesso al click su conferma
  @cancel="..."                    // emesso al click su annulla / chiusura
/>
```

- `tone="danger"` colora il bottone di conferma col token `--color-danger`; `default` usa lo stile primario.
- Slot `#default` opzionale per un corpo custom (oltre alla `description`).
- Chiudendo (overlay/ESC/X di `Modal`) emette `cancel` e chiude.
- **Non** gestisce l'azione: il chiamante ascolta `@confirm` e lancia la mutation.

**Usi** (sostituzione `window.confirm`):
- `PricingView`: delete-stagione, delete-pacchetto → `ConfirmDialog` (stato `open` + target corrente).
- `PricingView`: delete-**tariffa** → **nuova** conferma (oggi assente).
- `RenewalsView`: **Chiudi campagna** (rilascia gli hold) → conferma via `ConfirmDialog`.

**Pattern chiamante** (una sola istanza per vista, con ref al target): `askDelete(target)` apre il dialog e
memorizza il target; `@confirm` esegue `mutation.mutate(target.id)` e chiude. Il feedback errore resta il toast
globale (Slice A).

**Test** (ui-kit spec): render con `title`/`description`; emette `confirm` al click conferma; emette `cancel` al
click annulla; `tone="danger"` applica la classe token danger sul bottone di conferma; `aria`/describedby via
`Modal` (già coperto). Export da `packages/ui-kit/src/index.ts`.

## 4. Layer 2 — `MapView` error-handling coerente

- `confirmBooking` e `onCancel` passano da `await …mutateAsync(...)` a **`.mutate(...)`** con callback:
  - creazione: `createBooking.mutate(input, { onSuccess: () => { modalBooking.value = false } })`. Su errore, il
    modale **resta aperto** (l'operatore corregge) e il toast globale mostra il messaggio server. Nessun
    `await`, nessun unhandled rejection.
  - annullamento: `cancelBooking.mutate(currentBooking.value.id)` (fire-and-forget; il toast copre l'errore).
- Coerente col pattern di `PricingView`/`RenewalsView`.
- **Test** (`MapView.spec.ts`): con override msw che ritorna 409 sulla create, il click "Conferma prenotazione"
  (a) mostra il messaggio server come toast (`useToasts().items`), (b) **non** chiude il modale, (c) non produce
  unhandled rejection (output pristine).

## 5. Layer 3 — Rinnovi season-native (contratti + backend + FE)

Principio: **nessuna data tradotta a stagione** nella vista Rinnovi. Tutti gli ingressi diventano `seasonId`;
la `deadline` resta una data.

### 5.1 Contratti (`packages/contracts/src/index.ts`)
- `OpenRenewalCampaignInput`: `originDate`/`destinationDate` → **`originSeasonId`/`destinationSeasonId`**;
  `deadline` invariata (ISO date).
- `RenewBookingInput`: `startDate` → **`destinationSeasonId`**.
- L'elenco abbonati (`GET /bookings/subscriptions`) non ha un tipo di input nei contratti: il `seasonId` viaggia
  come query param, validato solo dal DTO backend (§5.2). Nessun nuovo tipo `contracts` per questo.
- Aggiornare i commenti dei tipi toccati (`RenewBookingInput`, `OpenRenewalCampaignInput`) rimuovendo i
  riferimenti a "una data dentro la stagione".

### 5.2 Backend (NestJS)
- `OpenRenewalCampaignDto`: `originSeasonId`/`destinationSeasonId` con `@Matches(UUID_SHAPE)` (da
  `common/uuid`); `deadline` resta `@IsCalendarDate`.
- `RenewalCampaignsService.open`: risolve `origin`/`dest` per **id** invece di `resolveSeasonWithin(date)`. Nuovo
  helper `CatalogService.resolveSeasonById(tx, id)` (mirror di `resolveSeasonWithin`, ritorna `{ok, id, startDate,
  endDate}` o `{ok:false}`); 422 "Stagione non trovata" se assente. Restano i controlli
  `origin.id !== dest.id` (→ "Origine e destinazione devono differire") e `dest.startDate > origin.startDate`
  (→ "La stagione di destinazione deve seguire quella di origine"). Il vincolo unique/`P2002` → 409 invariato.
- `GET /renewal-campaigns`: nuovo `RenewalCampaignQueryDto` con **`destinationSeasonId`** (`@Matches(UUID_SHAPE)`).
  `getByDestinationSeasonId(seasonId)`: `findFirst({ where: { destinationSeasonId: seasonId } })` diretto (niente
  `resolveSeasonWithin`); il resto (finestre, seniority, stato `open/exercised/expired`) invariato.
- `POST /bookings/:id/renew`: `RenewBookingDto` con **`destinationSeasonId`**. `BookingsService.renew`: risolve la
  stagione per id (`resolveSeasonById`), mantiene il check "il rinnovo deve puntare a una stagione diversa"
  (confronta con la stagione della sorgente) e usa `season.startDate`/`endDate` come oggi.
- `GET /bookings/subscriptions`: nuovo **`SubscriptionsQueryDto`** (dedicato, NON riusa `BookingsQueryDto`
  condiviso con `GET /bookings`) con **`seasonId`** (`@Matches(UUID_SHAPE)`, obbligatorio → 400 se assente/malf.,
  coerente con la scelta `GET /rates` di Slice A). `listSubscriptions(seasonId)` risolve per id.
- e2e aggiornati: `renewal-campaigns.e2e-spec.ts`, `bookings.e2e-spec.ts` (subscriptions + renew) passano `seasonId`
  al posto delle date; i casi 422/409 restano (stagione inesistente → 422; ordine → 422; doppia campagna → 409).

### 5.3 Frontend (`RenewalsView.vue` + `useRenewals.ts`)
- Le due `<input type="date">` "Stagione origine/destinazione" → due **`<Select>`** popolati da `useSeasons()`
  (già esistente, `features/pricing/useSeasons.ts`). Etichette invariate, ora oneste.
- Stato: `originSeasonId`/`destinationSeasonId` (ref). Default `originSeasonId` = stagione che contiene
  `session.activeDate` se presente tra le `seasons`, altrimenti la prima; `destinationSeasonId` vuoto finché
  l'utente sceglie. La `deadline` resta un date-picker.
- Composable: `useSubscriptions(seasonId)`, `useRenewalCampaign(destinationSeasonId)`, `useOpenCampaign` e
  `useRenewBooking` inviano gli id. `enabled` guardie invariate (query attive solo con id valorizzato).
- Le `queryKeys` che includevano la data passano a includere il `seasonId` (coerenza cache).
- MSW (`mocks/server.ts`): gli handler `GET /bookings/subscriptions`, `GET/POST /renewal-campaigns`,
  `POST /bookings/:id/renew` leggono/filtrano per `seasonId`/`destinationSeasonId` invece che per data.

## 6. Layer 4 — Chiarezza campagne/rinnovi (microcopy + affordance)

Solo testo/affordance, nessun ridisegno strutturale:
- **Intestazione esplicativa** breve in `RenewalsView`: cosa è la campagna di prelazione (diritto di precedenza
  dell'abbonato della stagione precedente sullo stesso ombrellone) e cosa comporta aprirla/chiuderla.
- **Legenda badge** (Aperta / Rinnovato / Scaduta) e microcopy sulle CTA: tooltip/sottotesto su "Apri campagna"
  ("riserva gli ombrelloni agli aventi-diritto fino alla scadenza"); spiegazione del "Rinnova" disabilitato
  (già rinnovato, oppure manca la stagione di destinazione).
- **Empty state** espliciti sul *perché*: "Scegli una stagione di destinazione per gestire i rinnovi" vs "Nessun
  abbonato nella stagione di origine".
- **Conferma "Chiudi campagna"** via `ConfirmDialog` (Layer 1): "Chiudere la campagna? Gli ombrelloni riservati
  tornano liberi."
- **Test** (`RenewalsView.spec.ts`): presenza dei testi chiave (spiegazione, legenda) e conferma-chiudi che
  richiede il `ConfirmDialog` prima di chiamare la DELETE.

## 7. Note su Slice B (per non creare debito)
La provenienza del prezzo (mostrare la `Rate` combaciata + spiegare la precedenza) è **rimandata a Slice B**,
dove `BookingQuoteDTO` e il risultato di `resolvePrice` verranno estesi per esporre la regola vincente
(ADR-0032). Questo slice non tocca `pricing.engine.ts` né i contratti di quote.

## 8. Rischi e mitigazioni
- **`resolveSeasonById` nuovo path**: unit/e2e coprono stagione inesistente (422) e tenant altrui (RLS → non
  trovata). Mirror di `resolveSeasonWithin`, superficie piccola.
- **DTO subscriptions condiviso**: NON modificare `BookingsQueryDto` (usato da `GET /bookings`); creare un DTO
  dedicato. Verificato: `BookingsQueryDto` è usato da entrambi i controller.
- **Cache FE per data→id**: cambiare le query key evita collisioni; verificare che il cambio stagione rifaccia
  la query (test esistenti sul cambio destinazione da adattare).
- **e2e a cascata**: gli e2e di D-011/A4.2 usano date; vanno riscritti per `seasonId`. Contati nel budget test
  (non devono calare i totali; semmai crescono).
- **ConfirmDialog e test esistenti**: i test di `PricingView` che mockano `window.confirm` (`PricingView.spec.ts:126-156`,
  e i nuovi di Slice A `:181+`) vanno riscritti per interagire col `ConfirmDialog` (click sul bottone di conferma
  del componente) invece di `vi.spyOn(window,'confirm')`.

## 9. Decisioni (risolte in brainstorming 2026-07-02)
1. **Sequenza:** ibrido — questo slice (conferme + rinnovi) ora; provenienza-prezzo → B; equipment → C.
2. **Selezione stagioni:** backend accetta `seasonId` (scelta senza-debito), non FE-only date rappresentativa.
3. **Scope "adesso":** ConfirmDialog + tutte le conferme delete (inclusa tariffa) + rinnovi season-native +
   microcopy campagne. **Fuori:** provenienza prezzo nella modale (→ B).
4. **MapView unhandled rejection:** assorbito in questo slice (Layer 2), non task separato; modale prenotazione
   **resta aperto su errore**, si chiude su successo.
5. **Nessun nuovo ADR:** incremento su architettura già decisa (ADR-0033 componenti, ADR-0034 prelazione,
   ADR-0031 date/stagioni). La selezione per `seasonId` **rafforza** ADR-0031 (meno traduzioni data↔stagione),
   non lo viola; se in fase di piano emerge un cambio semantico, valutare una nota all'ADR-0031/0034.

## 10. Impatto test (atteso, da non regredire)
Baseline: api unit 83 · api e2e 112 · web-staff 119 · ui-kit 49. Attesi in crescita: +ui-kit (ConfirmDialog),
+web-staff (MapView error test, rinnovi season-native, microcopy), +api (subscriptions/renew/campagne per
`seasonId`, `resolveSeasonById`). Nessun test rimosso; e2e riscritti restano ≥ conteggio attuale. Prossimo ADR
libero: **0035**.
