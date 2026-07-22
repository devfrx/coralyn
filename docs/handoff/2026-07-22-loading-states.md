# Handoff — Loading state universale (skeleton + anti-flicker + chiusura drift CTA)

> **Data:** 2026-07-22 · **Autore sessione:** agente loading-states.
> **TL;DR:** Sistema di caricamento unico e riutilizzato in tutto il monorepo — atomo `Skeleton`
> + `SkeletonText` + composable `useDelayedLoading` (gate anti-flicker 150/300ms) in `ui-kit`;
> prop `loading` su `DataTable`/`StatTile`, `submitLoading` su `ModalFooter`; **migrazione di TUTTE
> le viste** con «Caricamento…» testuale a skeleton, e **chiusura completa del drift CTA**
> (`:disabled` nudi → `:loading`). **Mergiato FF su `main` e pushato** (`origin/main = 164c9dd`),
> **verde**: web-staff **500/500**, web-platform **17/17**, web-customer **25/25**, typecheck pulito
> sui 4 workspace. Prova visiva in browser **fatta dall'utente: OK**. Nessun gate residuo.

---

## 1. Cosa è stato fatto

### A) Primitivi nuovi in `ui-kit` (Task 1-5, TDD)
- **`Skeleton.vue`** — atomo: `variant: 'line' | 'block' | 'circle'` (default `line`),
  `width`/`height` opzionali (default per variante: line `100%×0.75em`, block `100%×64px`, circle
  `32×32px`). Sempre `aria-hidden="true"` (decorativo — lo stato lo annuncia il contenitore).
  Shimmer `skeleton-sheen`: sweep di gradiente caldo verso `--color-skeleton-sheen`, keyframe in
  `theme.css`, 1.6s linear infinite; **statico con `prefers-reduced-motion`** (la regola globale già
  azzera le animazioni, gratis). Token nuovi (SEMANTIC, sui neutri sabbia, zero hex nuovi):
  `--color-skeleton: var(--color-warm-150)`, `--color-skeleton-sheen: var(--color-warm-050)`.
- **`SkeletonText.vue`** — `:lines` (default 3): righe skeleton a larghezze **deterministiche per
  indice** (mai `Math.random()` — niente shift tra render), ultima al 60%.
- **`useDelayedLoading.ts`** — composable gate anti-flicker:
  `useDelayedLoading(source: Ref<boolean> | (() => boolean), { delay=150, minVisible=300 })
  → Ref<boolean>`. Visibile solo se l'attesa supera 150ms; una volta visibile resta ≥300ms.
  Logica pura coi timer (accanto a `tableData.ts`, stesso precedente), cleanup su scope dispose,
  spec con fake timers (Vitest 4 mocka anche `Date.now`).

### B) Integrazioni nei componenti che possiedono il layout (Task 4-5)
- **`DataTable` prop `loading`** (+ `skeletonRows`, default 5): il chiamante passa `isLoading`
  **grezzo**, il gate anti-flicker è **interno** (ogni consumatore lo eredita). Input del gate =
  `loading && 0 righe` → **lo skeleton non sostituisce MAI dati reali** (refetch con dati stantii =
  silenzioso). Durante lo skeleton: footer nascosto, `emptyMessage` soppresso, `aria-busy` sul
  contenitore. Solo API data-driven (a slot resta congelata).
- **`StatTile` prop `loading`** + `value` ora **opzionale** (default `''`): skeleton 56×20 al posto
  del valore, **label reale**, gate interno, `aria-busy` sul tile.
- **`ModalFooter` prop `submitLoading`**: spinner sul bottone conferma + **lo disabilita** insieme a
  `submitDisabled` (`:disabled="submitDisabled || submitLoading"`).

### C) Migrazione di TUTTE le viste (Task 6-11) — zero «Caricamento…» residui
- **web-staff**: Clienti, Prenotazioni, Rinnovi (2 tabelle + pending per-riga su «Rinnova»),
  Noleggi (+ «Rientro» per-riga), Listino, Catalogo (tabella tariffe), Pagamenti — via
  `DataTable :loading`; dettaglio cliente e stabilimento via `SkeletonText`/`StatTile :loading`;
  Mappa via skeleton-canvas bespoke; modali incasso/noleggio via `submitLoading`.
- **web-platform**: Lidi lista (`DataTable :loading`) + dettaglio (header Skeleton + 10 `StatTile
  :loading`).
- **web-customer**: abbonamenti (skeleton card) + «Segnala assenza» (`:loading`).
- **Drift CTA chiuso** ovunque: reset password (staff/admin), sospendi/riattiva, AbsenceReleaseModal
  — da `:disabled` nudo a `:loading`; azioni per-riga col pending sulla riga giusta via `variables`.

### D) Docs (Task 12) — `docs/design/design-system.md`
- §3: token skeleton. §10: voce **Skeleton/SkeletonText** nuova (con `useDelayedLoading` e la regola
  del pattern `v-else-if`), aggiornamenti **DataTable** (`loading`/`skeletonRows`), **StatTile**
  (voce creata da zero — non esisteva), **ModalFooter** (`submitLoading`). **Verificato
  claim-per-claim contro il codice shippato** (dal reviewer di Task 12 e di nuovo dal controller a
  fine sessione — pulito, incluso dopo il fix a11y `164c9dd`).

## 2. Stato `git` & verifica
- **`main = 164c9dd`, pushato su `origin/main`** (`60abbec..164c9dd`, 14 commit: spec, piano, 12 di
  lavoro + 1 fix a11y). Working tree pulito. Branch `feat/loading-states` mergiato **FF** ed
  eliminato.
- **web-staff 500/500, web-platform 17/17, web-customer 25/25, `pnpm -r typecheck` pulito** — tutto
  **verificato di prima mano dal controller** sullo stesso commit `164c9dd` pre-merge (FF = albero
  identico), non solo riportato dai subagenti.
- **Prova visiva in browser: FATTA dall'utente, OK.** Non è più un gate. (Vedi §3 il gotcha su
  *come* vederli.)

## 3. Gotcha tecnici (per il prossimo agente)

- **Gli skeleton sono invisibili in dev su rete veloce — BY DESIGN** (memoria
  [[coralyn-web-staff-preview-verify]]): il backend locale risponde in ~10–30ms, sotto i 150ms del
  gate → lo skeleton non compare mai. È il gate che evita il flash, non un bug. Per vederli:
  **DevTools → Network → Slow 3G** (o custom ~500ms) + reload; reduced-motion via Command Palette →
  "Emulate prefers-reduced-motion".
- **Il piano conteneva 3 bug latenti, tutti trovati e fixati in review** (il metodo li ha presi,
  non l'occhio del pianificatore):
  1. **`ModalFooter`**: passare solo `:disabled="submitDisabled"` lasciava il bottone **non
     disabilitato** con `submitLoading` true, perché l'attributo `disabled` di fallthrough di Vue
     sovrascrive il `:disabled="loading||undefined"` interno del Button. Fix: `submitDisabled ||
     submitLoading`. **Se aggiungi altri `submitLoading`-like, ricorda il fallthrough.**
  2. **Rami `v-else` nudi dopo lo skeleton** (CustomerDetailView, EstablishmentDetailView,
     MySubscriptionsView): nella finestra pre-delay (isLoading true, gate non ancora armato, dato
     assente) il `v-else` cadeva sul ramo contenuto → crash su `data.name` / blank. **Pattern
     corretto e ora documentato: `v-else-if="<dato>"`, mai `v-else` nudo** dopo un ramo skeleton
     (`v-else-if="subscriptions.length > 0"` dove il dato è un array — vuoto è truthy in JS).
  3. **`RentalCatalogView`**: il piano assumeva un `DataTable` per il «catalogo articoli» che è in
     realtà una **griglia di `Card`** → nessuno skeleton lì (solo la tabella tariffe ha `:loading`).
     La griglia Card resta senza skeleton (bespoke, fuori scope): è un **gap accettato**, non un
     errore.
- **Doppio gate su StatTile dentro un blocco già gated** (dettaglio Lido): il padre ha il suo
  `useDelayedLoading` per mostrare il blocco skeleton, e ogni `StatTile :loading` ne ha un altro
  interno → ~150ms in cui il tile mostra label + valore vuoto prima che parta il suo skeleton.
  Impercettibile e senza layout shift (il tile ha già la sua altezza) → **triato ship-as-is**. Se
  un domani servisse azzerarlo servirebbe una prop `immediate`/`delay=0` su StatTile (nuova API,
  non giustificata ora).
- **`aria-busy` va su un wrapper NON-hidden**: lo skeleton è `aria-hidden`, quindi `aria-busy` su
  un `<SkeletonText>` (root hidden) non viene mai annunciato. Pattern corretto (fix `164c9dd`):
  `<div v-if="skeletonVisible" aria-busy="true"><SkeletonText/></div>`.
- **Regola cross-file (confermata di nuovo)**: dopo ogni task gira l'**intera** suite del pacchetto
  toccato (`npx vitest run` da `apps/web-staff` include gli spec ui-kit; `apps/web-platform` e
  `apps/web-customer` a sé), mai il solo spec. jsdom non vede la resa (shimmer, gradiente,
  reduced-motion) → i test coprono il comportamento (gate coi fake timers, aria, rami v-if), la
  resa si vede solo in browser throttlato.
- **NON esiste un tema dark** nel codebase (verificato: nessun `.dark`/`data-theme`/
  `prefers-color-scheme`). Gli handoff più vecchi citavano «+ dark» ma non corrisponde a nulla di
  implementato. Se un domani lo si vuole, è una feature a sé.
- **Collisione file scratch SDD** (memoria [[coralyn-sdd-scratch-collision]]): questa sessione ha
  usato il prefisso `task-ls-N-*` per non collidere coi report della sessione DataTable. Mantieni
  la disciplina del prefisso (o pulisci `.superpowers/sdd/task-*` a inizio sessione). Il ledger
  `progress.md` va **appeso**, mai sovrascritto.

## 4. Prossimi passi / deferred (in ordine, tutti NON bloccanti)
La feature è completa e mergiata. I follow-up sotto sono minori, emersi dalla review finale:
1. **`METRIC_LABELS` duplicato** in `EstablishmentDetailView` (web-platform): le 10 label dello
   skeleton sono hardcoded in un array e ripetute negli StatTile reali sotto → se una metrica cambia
   nome/ordine, skeleton e contenuto driftano in silenzio. Armonizzabile derivando entrambi da
   un'unica sorgente `{label, testid, value}`. Costo basso; era over-engineering forzarlo pre-merge.
2. **`:loading` inerte sulla tabella finestre di `RenewalsView`**: la tabella è `v-if="campaign"`,
   e mentre `isLoading` è true `campaign` è undefined → la tabella non è montata; il `:loading` è
   wiring morto (innocuo). Da rimuovere o rendere vivo hoistando il `v-if`.
3. **Minori triati ship-as-is** (elenco completo in `.superpowers/sdd/progress.md`, sezione SESSIONE
   loading-states): `DEFAULTS` per-istanza in Skeleton, `aria-hidden` ridondante in SkeletonText,
   gate skeleton teoricamente attivabile sull'API a slot del DataTable (nessun consumatore, doc già
   dichiara «solo data-driven»), finestre pre-delay non coperte da test di vista (il gate è testato
   esaustivamente a livello composable/componente; i rami v-if sono trace-verificati in review).

## 5. Metodo & principi usati (skills attive)
- **brainstorming → writing-plans → subagent-driven-development**: spec approvata a decisioni
  strutturali portate all'utente una alla volta (anti-flicker, approccio A «primitivo + integrazioni
  nei componenti che possiedono il layout» vs boundary universale vs solo-atomo); piano a 12 task
  TDD bite-sized con codice esatto per step; esecuzione con implementer freschi per task (**haiku**
  per i task a codice completo nel brief, **sonnet** per integrazioni/migrazioni con giudizio sui
  tipi reali) + **task reviewer sonnet** per task; review finale whole-branch su **fable**
  (READY TO MERGE, 0 Critical/Important). **La disciplina ha pagato: 3 bug del piano presi in
  review**, non a runtime.
- **dev-discipline**: riuso primitivi ui-kit e token semantici (zero hex fuori da theme.css), YAGNI
  (il gate è un composable perché ha molti consumatori — non speculativo; niente `SkeletonCard`
  rigido perché le card hanno forme troppo diverse), API additiva retro-compatibile (tutte le prop
  nuove opzionali, `StatTile.value` opzionale), migrazione una vista alla volta ciascuna verde.
- **dev-communication**: le decisioni strutturali (approccio, anti-flicker, deviazioni del piano)
  portate all'utente o adjudicate in review, mai in autonomia silenziosa.
- **frontend-design**: estetica dentro il design system Coralyn caldo (shimmer sui neutri sabbia,
  nessuna estetica nuova), reduced-motion gratis dalla regola globale.

## 6. Ancore (file chiave)
- Primitivi: [`packages/ui-kit/src/components/Skeleton.vue`](../../packages/ui-kit/src/components/Skeleton.vue),
  [`SkeletonText.vue`](../../packages/ui-kit/src/components/SkeletonText.vue),
  [`useDelayedLoading.ts`](../../packages/ui-kit/src/useDelayedLoading.ts) (+ i rispettivi `.spec`).
  Export in `packages/ui-kit/src/index.ts`. Token/keyframe in
  [`packages/ui-kit/src/styles/theme.css`](../../packages/ui-kit/src/styles/theme.css).
- Integrazioni: `DataTable.vue`, `StatTile.vue`, `ModalFooter.vue` (stessa cartella).
- Docs: [`docs/design/design-system.md`](../design/design-system.md) §3 (token) + §10 (Skeleton,
  DataTable, StatTile, ModalFooter) — verità corrente. Spec:
  [`docs/superpowers/specs/2026-07-21-loading-states-design.md`](../superpowers/specs/2026-07-21-loading-states-design.md).
  Piano: [`docs/superpowers/plans/2026-07-21-loading-states.md`](../superpowers/plans/2026-07-21-loading-states.md).
- Ledger esecuzione: `.superpowers/sdd/progress.md` (git-ignored scratch — recuperabile da `git log`).
- Handoff sessione precedente (DataTable QoL + empty-state + `--tracking-caps`):
  [`2026-07-21-datatable-qol.md`](2026-07-21-datatable-qol.md).
