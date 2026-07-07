# Handoff — 2026-07-07 · Fasi UI A/B/C complete → prossimo: dominio (D-0xx)

> Handoff autorevole per la prossima sessione. **Tre fasi di qualità UI (modali universali,
> sweep varianti CTA, coerenza CTA contestuale) sono MERGIATE su `main`.** Il prossimo lavoro
> naturale torna al **dominio** (i D-0xx del registro `deferred.md`).

## 0. Stato del repo
- **`origin/main` = `main` LOCALE = `3ae044b`.** Working tree pulito. Nessun branch feature aperto.
- **Baseline test:** ui-kit **111** · web-staff **316** · web-platform **16** · typecheck **pulito**.
- api unit/e2e: invariati rispetto all'ultimo handoff dominio (nessuna fase UI ha toccato api/contracts).
- Ultimo ADR: **0045**. **Prossimo ADR libero: 0046.** Prossimo D libero: **D-049**.
- Login: `admin@coralyn.dev`/`coralyn-admin-8473` · superuser `super@coralyn.dev`/`coralyn-super-9182`. DB `localhost:5433`, api :3000, web-staff :8080, web-platform :8081. Docker: `docker compose --profile full up -d --build web web-platform`.

## 1. Cosa è stato fatto in questa sessione (solo UI/presentazione, zero dominio)
Tre fasi consecutive, ognuna: spec → piano → esecuzione TDD subagent-driven (implementer + spec-review + code-review per task) → verifica LIVE su Docker → merge FF. **Nessun cambio a dominio/logica/contracts/API/schema/palette.**

### Fase A — Modali universali (mergiata, `879f230…c553892`)
`Modal`/`Drawer` a **3 regioni**: header fisso (`shrink-0` + `border-b`) · body `flex-1 overflow-auto` · footer opzionale slot **`#footer`** (`v-if="$slots.footer"`). `DialogContent` = `flex flex-col max-h-[90vh]` senza scroll proprio. Migrati **13 consumer**; i modali con `<form>` usano il pattern **`form="id"`** (`<form id=x>` nel body + `<Button type="submit" form="x">` nel footer — `Button` inoltra `type`/`form` via attribute-fallthrough). `ConfirmDialog` copre 7 consumer. Spec/piano: `docs/superpowers/{specs/2026-07-07-modali-universali-e-cta-sweep-design.md, plans/2026-07-07-modali-universali.md}`.

### Fase B — Sweep varianti CTA (mergiata, `8bb521b…20e36d6`)
**`IconButton` += variante `danger`** (neutra a riposo, hover su `--color-danger-bg`+`--color-danger` — riusa il token già di `Button` danger, NESSUN nuovo token; **ADR-0044**). Rubrica variante applicata: PricingView 14 azioni solo-icona → `IconButton`; MapView drawer; **flip distruttive `secondary`→`danger`** (delete-*, "Disdici"); submit → `:loading`. Piano: `docs/superpowers/plans/2026-07-07-cta-microinteractions-sweep.md`.

### Fase C — Coerenza CTA contestuale (mergiata, `692d163…bfaa6df`)
- **Nuova primitiva ui-kit `<ActionBar>`** (`packages/ui-kit/src/components/ActionBar.vue`): solo-layout `flex items-center`, props `align:'start'|'end'|'between'` (def end) · `gap:'sm'|'md'` (def sm = `gap-1.5` = 6px; md = `gap-2.5` = 10px) · `wrap` (def false). **Non impone size ai figli.** Gemello non-modale di `ModalFooter`. Accetta `class` fallthrough (single root `<div>`, no `inheritAttrs:false`).
- **Rubrica CTA v2 (size-by-context)** in `docs/design/design-system.md` §10 + **ADR-0045**: la CTA eredita la densità del contenitore → **header pagina `md`** · **card/riga/toolbar/drawer `sm`** · **icona-sola = SEMPRE `IconButton`** (mai `Button` con un solo `<Icon>`) · async `:loading` · distruttiva `danger`.
- **Applicata a tutte le viste** con 3 pattern riutilizzabili (nessuno stile per-elemento): **P1** icona-sola→IconButton · **P2** `md`→`sm` in contesto denso · **P3** cluster di 2+ azioni→`<ActionBar>` (rimuovendo `flex gap` a mano; le **non-azioni restano fuori** dall'ActionBar; un cluster con **1 sola** azione NON usa ActionBar).
- Fix collaterale: MapView drawer card **380px** (era 340, le 2 azioni andavano a capo); "Gestisci abbonamento" `RouterLink`→`Button ghost` (**perde apri-in-nuova-scheda** cmd/middle-click — trade-off accettato).
Spec/piano: `docs/superpowers/{specs/2026-07-07-cta-coherence-audit-design.md, plans/2026-07-07-cta-coherence-audit.md}`.

**Bespoke NON convertiti** (per scelta, in tutte e 3 le fasi): nav Sidebar, frecce data Topbar, valore incasso cliccabile BookingsView, celle/chip mappa, segmented slot, toggle disclosure "mostra archiviati". Il **signOut della Sidebar** usa token `--color-on-sidebar-*` → NO IconButton (romperebbe il tema dark). I **footer dei modali** restano `flex justify-end gap` manuale + Button `md` (ActionBar è riservato ai cluster inline/riga/in-content, non ai footer modale).

## 2. Sospesi LIVE minori (l'utente li verifica a occhio; non bloccanti)
- **PricingView header stagione:** 3 Button testuali ora a `gap` 6px (`ActionBar gap="sm"`). Se all'utente sembrano stretti → portare **quella** `ActionBar` a `gap="md"`.
- **MapView drawer:** gap delle azioni contestuali sceso a 6px; ok atteso ma da confermare.
- **"Gestisci abbonamento"** ora è un `Button` (persa la semantica del link). Se si vuole recuperare l'apri-in-nuova-scheda, valutare un supporto `as`/`asChild` su `Button` in ui-kit (nuovo ADR) — **non** un hack per-elemento.

## 3. PROSSIMO LAVORO — dominio (D-0xx da `docs/architecture/deferred.md`)
La prossima sessione **torna al dominio**. **Confermare la priorità con l'utente prima di partire** (alcuni item hanno valore/scope da chiarire). Candidati principali, dal registro `deferred.md`:

| ID | Tema | Note per la priorità |
|---|---|---|
| **D-013 (restanti)** | Cessione/subentro abbonamento · sospensione temporanea | La disdetta+rimborso è già fatta (sotto-slice 1/3). La **sospensione** è in sinergia con **D-035**. Additivo su ADR-0011. |
| **D-035** | Canale cliente + "assenze comunicate" degli abbonati | **Grande, alto valore.** Invariante non negoziabile: **nessuna presunzione d'assenza** — l'operatore può rivendere una fascia/giorno di un abbonato SOLO dopo segnalazione esplicita del cliente. Richiede: consenso "assenze comunicate" sull'abbonamento + modello di **override occupazione per fascia+giorno** + **canale cliente separato** (app/PWA/QR). Da modellare con cura. |
| **D-036** | Report cruscotto avanzato | Heatmap occupazione, medie di periodo, serie incassi settimanali, export, rinnovo inline. Lega alla ridefinizione **occupancy%** lasciata aperta da D-048 §7. |
| **D-012** | Cabine e servizi accessori come risorse prenotabili | ⚠️ **Priorità da confermare:** in una nota precedente l'utente l'aveva ritenuta **poco utile per la sua realtà**. Additivo (stesso pattern Ombrellone). Non partire senza conferma. |
| **D-015** | Disponibilità a orari arbitrari (fasce libere) | Atipico per ombrelloni; il modello a `Fascia` è generalizzabile. Bassa priorità. |

Altri gruppi (dal registro): **security-gated** D-026/027/028/029 (hardening auth: refresh/revoca, rate-limit, RLS User, login a tempo costante), **D-037** (gestione globale `401` nel data-layer FE), **D-041** (`P2002`→`409` globale), **D-046** (deliverability inviti in console), **D-047** (audit di tenant per azioni admin-in-tenant); **refactor** **D-040** (estrazione di `EstablishmentStructureView.vue` in composabili — nota: la vista è cresciuta ancora con Fase C), **D-038** (drag-reorder struttura).

**Regola del progetto** (ADR-0002 + [[decision-style]]): ogni decisione passa i 4 filtri (professionalità, convenzioni, modularità, zero debito); ogni scelta non banale → **ADR** (prox 0046) o voce **deferred**; il debito tracciato è ammesso, quello silenzioso no.

## 4. Gotcha che restano validi
- **pnpm mai npm** (`corepack pnpm`, da root; `CI=true corepack pnpm install` se chiede purge senza TTY).
- **`data-test`/`data-testid` STRIPPATI nel build di produzione** → verifica LIVE **comportamentale/visiva**, non grep del bundle.
- **`.isPending.value` col `.value` ANCHE in template** (i mutation ref di vue-query non sono auto-unwrapped — pattern del progetto).
- **`ActionBar` è solo layout** (la size sta sul singolo `Button`/`IconButton`).
- `web-staff/vitest.config.ts` **globa** gli spec ui-kit (contano in entrambe le suite → +1 ui-kit = +1 web-staff).
- Il **purge azzera il Prisma client** (se test api falliscono con errori Prisma → `prisma generate`); rebuild `@coralyn/contracts` (dist gitignored) dopo modifica a `src/index.ts` E dopo checkout; **api e2e ts-jest TYPE-CHECKA** → `--runInBand`; **+valore a `SlotState`** rompe 6 mappe `Record`.
- Mailpit CATCHER dev :8025 (non recapita reale); PWA SW autoUpdate serve SPA vecchio da cache dopo rebuild (Clear site data).
- **Push su `main` solo con ok ESPLICITO dell'utente** (FF da branch).

## 5. Puntatori
- Registro dominio: `docs/architecture/deferred.md` (autoritativo sui D-0xx). ADR: `docs/architecture/decisions/`. Design system: `docs/design/design-system.md`.
- Memoria di sessione: `driftly-project-state.md`, `decision-style.md`, `user-profile.md`.
