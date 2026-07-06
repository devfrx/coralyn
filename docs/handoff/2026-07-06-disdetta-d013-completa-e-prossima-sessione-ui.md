# Handoff — D-013 disdetta+rimborso COMPLETA e MERGIATA · prossima sessione: **miglioramento UI** · backlog D-0xx

> Documento di consegna per la **prossima sessione**. **Supersede**
> [2026-07-06-fasce-mappa-n-e-sovrapposte-d048-branch-non-mergiato.md](2026-07-06-fasce-mappa-n-e-sovrapposte-d048-branch-non-mergiato.md)
> (quel branch è stato mergiato). Workflow **[ADR-0009](../architecture/decisions/0009-documentazione-di-design.md)**: per slice creative → spec (brainstorming, decisioni
> risolte con l'utente) → piano TDD → subagent-driven (un commit per layer, TDD, review a due stadi + whole-branch su opus) →
> verifica LIVE → **presenta e attendi conferma**. Push su `main` = **FF con ok ESPLICITO** dell'utente. **Leggi questo per primo.**

---

## 0. Situazione GIT — tutto su `main`, tree pulito
- **`main` = `origin/main` = `ad52477`** (nessun branch aperto; `feat/subscription-termination` mergiato FF e rimosso).
- **Nessuna migrazione pendente.** L'ultima è `20260706130000_subscription_termination` (applicata a dev **e** test).
- **Prossimo D libero: D-049. Prossimo ADR libero: 0044.** (D-013 esiste già; la slice fatta è la sua **sotto-slice 1/3**, nessun nuovo ADR.)
- All'avvio: `git fetch --all --prune`. ⚠️ Molto lavoro può arrivare dall'altra macchina — fidati di `git log`. Path: `C:\Users\zagor\Desktop\coralyn` (zagor) / `C:\Users\Jays\Desktop\new` (Jays).

## 1. Cosa è COMPLETO in questa sessione (2026-07-06)
### 1a. D-013 sotto-slice 1/3 — Disdetta anticipata abbonamento + rimborso
Spec [2026-07-06-subscription-termination-refund-design.md](../superpowers/specs/2026-07-06-subscription-termination-refund-design.md), piano
[2026-07-06-subscription-termination-refund.md](../superpowers/plans/2026-07-06-subscription-termination-refund.md). **Nessun nuovo ADR** (additivo su [ADR-0011](../architecture/decisions/0011-incasso-base-nel-core.md)).
- **Modello:** la disdetta **tronca `endDate`** al giorno di validità + marca **`terminatedAt`** (`status` resta `confirmed`, **niente nuovo enum** → zero rotture delle mappe `Record<BookingStatus>`). Il posto si libera dal giorno effettivo (occupazione date-ranged) senza toccare la projection.
- **Schema (migration):** `Booking` += `terminatedAt DateTime?`, `terminationReason String?`, `refundedAmount Decimal @default(0)`.
- **Backend:** `POST /bookings/:id/terminate` **admin-only** (`@Roles(Role.Admin)`, `@HttpCode(200)`). Invarianti (422/409): solo `subscription`; solo `confirmed`; non già disdetto; `effectiveDate ∈ (startDate, endDate]`; `0 ≤ refundAmount ≤ amountCollected`. Tenant-scoped (`forTenant`), tx unica come `settlePayment`/`cancel`.
- **Rimborso:** **suggerimento pro-rata calcolato nel FE** ([terminationRefund.ts](../../apps/web-staff/src/features/customers/terminationRefund.ts)) e **sovrascrivibile** dall'operatore; il server **non** ricalcola (non è un prezzo autoritativo), valida solo i bound. Niente endpoint preview, niente formula duplicata.
- **Contracts (additivo, opzionali):** `BookingDTO`/`CustomerBookingDTO` += `refundedAmount?`, `terminatedAt?`, `terminationReason?`; nuovo `TerminateSubscriptionInput { effectiveDate; refundAmount; reason? }`.
- **UI:** Scheda cliente → [CustomerSubscriptionsCard.vue](../../apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue) bottone **«Disdici»** (admin, solo su abbonamento confermato/non-disdetto/stagione in corso) → [TerminateSubscriptionModal.vue](../../apps/web-staff/src/features/customers/TerminateSubscriptionModal.vue) (data effettiva con bound, rimborso suggerito editabile, motivo); stato disdetto → riga "Disdetto il {data} · rimborso €".

### 1b. Fix mappa collegato (segnalato dall'utente in verifica) — FE-only
La card ombrellone (drawer mappa) offriva **«Annulla prenotazione»** su **qualsiasi** tipo, abbonamenti inclusi → il `cancel` crudo (`status=cancelled`) **azzerava** l'abbonamento (perdendo storico e denaro), scavalcando la disdetta. Fix in [MapView.vue](../../apps/web-staff/src/features/map/MapView.vue): «Annulla prenotazione» reso **solo** per `type!=='subscription'`; sugli abbonamenti un link **«Gestisci abbonamento»** → Scheda cliente (dove vive la disdetta).
- **Perché FE-only (decisione informata da debug sistematico):** bloccare il `cancel` anche nel **backend** rompeva l'annullo **legittimo di un rinnovo futuro** (voidare un abbonamento 2027 non ancora attivo/non pagato — flusso reale, 5 test e2e). La mappa mostra **solo abbonamenti attivi del giorno**, quindi il fix FE copre esattamente il caso pericoloso senza togliere capacità legittime. Il `cancel` backend **resta invariato**.

### Baseline test (su `main` `ad52477`, da NON regredire)
ui-kit **79** · web-staff **284** · web-platform **16** · api unit **209** · api e2e **243** (`--runInBand`) · typecheck **pulito** ovunque.
Review: spec+qualità (backend/FE) ✅, whole-branch **opus** *Ready to merge YES* (solo note Minor, tutte accettate/deferite).

## 2. PROSSIMA SESSIONE — **miglioramento di componenti ed elementi UI** (focus dichiarato dall'utente)
L'utente vuole dedicare la prossima sessione a **migliorare i componenti e gli elementi dell'UI**. Non è una slice di dominio: è lavoro di **design/qualità visiva**. Indicazioni:
- **Skill disponibile:** `frontend-design` (crea/rifinisce interfacce di alta qualità, evita l'estetica "AI generica"). Valuta di attivarla. Per lavoro creativo, prima **brainstorming** con l'utente su *cosa* migliorare (scope: quali componenti? quali pagine? un refresh del design system o ritocchi puntuali?).
- **Design system esistente (RISPETTALO, non reinventarlo):**
  - **Token & tema:** [packages/ui-kit/src/styles/theme.css](../../packages/ui-kit/src/styles/theme.css) — TUTTI i colori/spaziature/radius/shadow sono variabili CSS `--color-*`, `--radius-*`, `--shadow-*`, `--ring-focus`. I componenti NON hardcodano colori. Cambiare un token propaga ovunque.
  - **ADR di linguaggio visivo:** [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md) + [ADR-0027](../architecture/decisions/0027-coralyn-linguaggio-visivo.md) (brand Coralyn); layout [ADR-0008](../architecture/decisions/0008-stack-e-layout.md); resa mappa [ADR-0020](../architecture/decisions/0020-resa-mappa.md); astrazione componenti FE [ADR-0033](../architecture/decisions/0033-astrazione-componenti-frontend.md); grafici ECharts [ADR-0038](../architecture/decisions/0038-libreria-grafici-echarts.md).
  - **Icone:** registry unico [packages/ui-kit/src/icons/registry.ts](../../packages/ui-kit/src/icons/registry.ts) (ADR-0020). Un'icona non registrata NON esiste — aggiungila lì o usa una presente.
  - **Componenti ui-kit (25+):** `Avatar, Badge, Button, Callout, Card, ChartBar, ChartDonut, ConfirmDialog, DataTable, Drawer, Field, Icon, Input, KpiCard, Modal, ModalFooter, PageToolbar, SearchInput, SectionCard, SegmentedControl, Select, StatTile, Textarea, Toast, UmbrellaCell`. **Riusa/estendi** questi prima di crearne di nuovi (dev-discipline: cerca prima di creare). Modali = **reka-ui** (teleport su `body`).
- **Verifica LIVE UI:** usa i tool `preview_*` (dev server + screenshot/inspect) — NON claude-in-chrome. Alternativa: Docker su `:8080` (web-staff) / `:8081` (web-platform). ⚠️ **Le immagini container sono precedenti a `ad52477`**: `docker compose --profile full up -d --build web web-platform api` per vedere D-013 live.
- **Gotcha test UI:** `apps/web-staff/vitest.config.ts` **globa** gli spec ui-kit → uno spec ui-kit conta in ENTRAMBE le suite. Toccando `UmbrellaCell` verifica **ui-kit E web-staff**. Componenti con teleport: nei test `attachTo: document.body` + `document.querySelector`.
- **D-0xx pertinenti all'UI** (se emergono in scope): [D-020](../architecture/deferred.md) pattern colorblind-safe sugli stati mappa; [D-003](../architecture/deferred.md) i18n; [D-040](../architecture/deferred.md) estrazione di `EstablishmentStructureView.vue` (~406 righe, alla soglia); [D-038-drag](../architecture/deferred.md) drag-reorder editor struttura.

## 3. Backlog D-0xx di DOMINIO (per implementazioni future — registro completo in [`deferred.md`](../architecture/deferred.md))
Ordinati per valore/vicinanza; **conferma sempre la priorità con l'utente**. NB: l'utente ha **scartato D-012** come poco utile per la sua realtà.
- **D-013 restanti (2/3, 3/3):** **cessione/subentro** (l'abbonamento passa a un nuovo cliente da una data, eventuale conguaglio — tocca `customerId` + storico) · **sospensione temporanea** (pausa per una finestra, posto rivendibile, poi ripresa — crea un "buco" di occupazione; **da fare in sinergia con D-035**, condividono la meccanica "posto rivendibile in una finestra").
- **D-035 — canale cliente "assenze comunicate":** superficie **client-facing nuova** (app/PWA/QR self-service). **Invariante non negoziabile:** senza segnalazione esplicita del cliente, l'operatore NON può rivendere il posto abbonato (nessuna presunzione d'assenza). Alto valore, grande. Vedi la voce D-035 (motivazione di dominio estesa).
- **D-036 — report cruscotto avanzato:** heatmap, medie di periodo, serie stagione, export, rinnovo inline. **+ `revenue-netting` dei rimborsi disdetta** (oggi i report sommano `amountCollected` senza sottrarre `refundedAmount` — deferito qui di proposito). Sinergia con l'occupancy% sotto slot sovrapposte (D-048 §7).
- **D-015 — orari arbitrari** (fasce fini): il modello `Fascia` è ora N-agnostico e overlap-aware → generalizzabile senza riscrittura.
- **Altre di dominio "modulo successivo":** D-004 pagamenti/fiscale, D-006 liste d'attesa avanzate, D-009 entità Pagamento completa, D-014 rostering, D-033/D-034 pricing periodico avanzato, D-018 prezzo per tipologia.

### Security / hardening (gated sull'esposizione pubblica)
D-026 (refresh/revoca token) · D-027 (rate-limit login) · D-028 (RLS User) · D-029 (login a tempo costante) · **D-037 (gestione globale 401 nel FE** — interceptor → logout+redirect, utile UX) · D-041 (filtro globale `P2002→409`) · D-047 (audit di tenant delle azioni admin) · D-046 (deliverability invito in console) · D-042 (impersonation supporto) · D-023 (least-privilege ruolo DB).

## 4. Stato DEV / Docker
- **Container tutti SU** (verificato 2026-07-06): `coralyn-{web,api,web-platform,mailpit,db}`. **MA le immagini web/api sono precedenti a `ad52477`** → per vedere D-013/il fix mappa live: `docker compose --profile full up -d --build web api web-platform`. DB (`5433`) e dati **intatti**.
- Porte: web-staff **8080**, web-platform **8081**, api **3000**, DB **5433**, Mailpit **8025**. Login admin `admin@coralyn.dev`/`coralyn-admin-8473`; superuser `super@coralyn.dev`/`coralyn-super-9182` (web-platform).

## 5. Insidie note (gotcha) — LEGGERE PRIMA DI ESEGUIRE
- **pnpm, MAI npm** ([[coralyn-pnpm-not-npm]]): `corepack pnpm`. Se chiede purge senza TTY → `CI=true corepack pnpm install`.
- **⚠️ Il build di `@coralyn/contracts` può triggerare il purge di `node_modules` → azzera il Prisma client generato.** Se dopo un build i test api falliscono con errori Prisma → `corepack pnpm --filter @coralyn/api exec prisma generate`, poi ritesta.
- **`@coralyn/contracts` compila in `dist/` (gitignored):** dopo modifica a `packages/contracts/src/index.ts` → `corepack pnpm --filter @coralyn/contracts build` **prima** di typecheck/test (api E FE). api e2e (ts-jest) **type-checka** il progetto.
- **api e2e:** run autoritativi `--runInBand` (flaky in parallelo). Comando robusto: `corepack pnpm --filter @coralyn/api exec jest --config ./test/jest-e2e.json [pattern] --runInBand` (il passaggio `test:e2e -- --runInBand` inietta un `--` spurio a jest).
- **Migration:** file cartella manuale + `prisma migrate deploy` a **dev E test** (`.env`/`.env.test` sono alla **root** del repo) + `prisma generate`. Mai `db push`/`migrate dev` sul flusso condiviso.
- **`web-staff/vitest.config.ts` globa gli spec ui-kit** → contano in entrambe le suite. Modali ui-kit = **reka-ui** (teleport su body): nei test `attachTo: document.body` + `document.querySelector`.
- **Aggiungere un valore a `SlotState`/`BookingStatus`** rompe (per esaustività) più mappe `Record<...>` → il typecheck le elenca (rete di sicurezza).
- **PWA service worker autoUpdate** (web-staff+web-platform): dopo rebuild container il browser può servire lo SPA **vecchio** dalla cache SW → Clear site data/Unregister/reload.
- **Mailpit è un CATCHER** (dev, mail a `http://localhost:8025`, non recapitate a caselle reali).

## 6. Ancore di codice (VERIFICATE 2026-07-06, `ad52477`)
- **Disdetta:** [bookings.service.ts](../../apps/api/src/bookings/bookings.service.ts) (`terminate`), [bookings.controller.ts](../../apps/api/src/bookings/bookings.controller.ts) (`POST :id/terminate`), [terminate-subscription.dto.ts](../../apps/api/src/bookings/dto/terminate-subscription.dto.ts), [contracts](../../packages/contracts/src/index.ts) (`TerminateSubscriptionInput` + 3 campi), projection [booking.projection.ts](../../apps/api/src/bookings/booking.projection.ts)/[customer-booking.projection.ts](../../apps/api/src/bookings/customer-booking.projection.ts).
- **FE disdetta:** [terminationRefund.ts](../../apps/web-staff/src/features/customers/terminationRefund.ts) (pro-rata), [TerminateSubscriptionModal.vue](../../apps/web-staff/src/features/customers/TerminateSubscriptionModal.vue), [CustomerSubscriptionsCard.vue](../../apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue), hook `useTerminateSubscription` in [useCustomers.ts](../../apps/web-staff/src/features/customers/useCustomers.ts).
- **Fix mappa:** [MapView.vue](../../apps/web-staff/src/features/map/MapView.vue) (blocco `currentBooking`, gate `type!=='subscription'` + link «Gestisci abbonamento»).
- **UI / design system:** [ui-kit/components/](../../packages/ui-kit/src/components/), [theme.css](../../packages/ui-kit/src/styles/theme.css), [icons/registry.ts](../../packages/ui-kit/src/icons/registry.ts).

## 7. Messaggio di delega (apertura prossima sessione)
Fornito separatamente nel turno di chat che accompagna questo handoff.
