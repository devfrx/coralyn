# Fase B — Sweep CTA / microinterazioni per vista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Applicare la rubrica CTA (§4 dello spec) e le microinterazioni in tutte le viste — convertire i `<button>` grezzi che sono CTA a `Button`/`IconButton` con la variante giusta, correggere le varianti sbagliate (distruttive rese `secondary`), e lasciare bespoke i controlli non-CTA verificandone solo gli stati.

**Architecture:** Prima si estende `IconButton` con la variante `danger` (abilita la rubrica sulle azioni distruttive solo-icona → **ADR-0044**). Poi sweep vista-per-vista in pipeline: le viste ad alta conversione (PricingView, MapView) e i mismatch di rubrica (EstablishmentStructureView, EstablishmentView, CustomerSubscriptionsCard) hanno diff concreti; le viste già `Button`-based e i controlli bespoke (shell, nav, celle mappa, frecce data, toggle disclosure) sono audit degli stati. Nessun cambio di dominio/logica/contracts.

**Tech Stack:** Vue 3 `<script setup>`, ui-kit (`Button`, `IconButton`, `Icon`), Tailwind v4 (token `theme.css`), Vitest + @vue/test-utils, pnpm (`corepack pnpm`, mai npm).

---

## Convenzioni
- **pnpm mai npm.** Comandi da root. Filtro spec: `corepack pnpm --filter <pkg> test -- <Name>.spec`.
- **Baseline da non regredire** (post-Fase A): ui-kit **106** · web-staff **311** · web-platform **16** · typecheck pulito. Task 1 aggiunge 1 test ui-kit → ui-kit **107**, web-staff **312** (globa gli spec ui-kit).
- **Rubrica CTA (spec §4):** primaria=`primary` · annulla/indietro=`secondary` · inline/link-like=`ghost` · distruttiva=`danger` · solo-icona=`IconButton` (`ghost`/`subtle`, `danger` per distruttive) · async=`:loading`.
- **NON convertire i bespoke non-CTA:** celle mappa, voci di navigazione (Sidebar/nav), frecce data (Topbar), toggle disclosure ("mostra archiviati"), chip, valori-cliccabili in tabella. Si verificano solo gli stati (hover token, `focus-visible:[box-shadow:var(--ring-focus)]`, cursore già globale).
- **API componenti:**
  - `IconButton`: props `icon: string` · `label: string` (→ `aria-label`) · `variant?: 'ghost'|'subtle'|'danger'` (dopo Task 1) · `size?: 'sm'|'md'` · `disabled?`. `@click`/`title`/`:data-test` passano per **attribute fallthrough** sul `<button>` root. Rende `<button type="button">`.
  - `Button`: props `variant?: 'primary'|'secondary'|'ghost'|'danger'` · `size?: 'sm'|'md'` · `loading?`. `type`/`form`/`data-test` per fallthrough. Slot per label + icona.
- **Teleport nei test** (modali reka-ui): `attachTo: document.body`, `await nextTick()`, `document.body.querySelector`, `afterEach(()=>document.body.innerHTML='')`.
- **I selettori spec sono `data-test`/`data-testid`:** passano per fallthrough sia su `Button` sia su `IconButton`, quindi la maggior parte degli spec resta verde dopo la conversione. Se uno spec asseriva `title=` o la struttura interna del `<button>`, aggiornarlo per verificare **comportamento/aria-label**, non markup.
- **Verifica LIVE** sull'istanza Docker dell'utente (il preview interno ha mismatch di porta). Docker: `docker compose --profile full up -d --build web web-platform` dopo i commit, poi controllo per vista. **`data-test` sono strippati nel build di produzione** → la verifica LIVE è comportamentale/visiva, non grep del bundle.
- **Presenta e attendi conferma a fine fase** prima del merge FF su `main`.

## File map
- **Modify (ui-kit):** `packages/ui-kit/src/components/IconButton.vue` (+ `IconButton.spec.ts`). **Create:** `docs/architecture/decisions/0044-iconbutton-variante-danger.md`.
- **Modify (conversioni):** `apps/web-staff/src/features/pricing/PricingView.vue`, `apps/web-staff/src/features/map/MapView.vue`.
- **Modify (rubrica danger):** `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`, `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue`.
- **Audit stati (verifica, fix mirati se necessario):** `apps/web-staff/src/app/Sidebar.vue`, `Topbar.vue`; `apps/web-staff/src/features/bookings/BookingsView.vue`; `establishment/EstablishmentView.vue`; `auth/LoginView.vue`, `auth/SetPasswordView.vue`; `customers/CustomersView.vue`, `CustomerDetailView.vue`; `renewals/RenewalsView.vue`; `reports/ReportView.vue`; `apps/web-platform/src/features/auth/LoginView.vue`, `establishments/EstablishmentsListView.vue`, `EstablishmentDetailView.vue`.

---

## Task 1: `IconButton` — variante `danger` (+ ADR-0044)

**Files:** Modify `packages/ui-kit/src/components/IconButton.vue`, `packages/ui-kit/src/components/IconButton.spec.ts`. Create `docs/architecture/decisions/0044-iconbutton-variante-danger.md`.

- [ ] **Step 1 — leggere `IconButton.spec.ts`** per il pattern esistente (`ls packages/ui-kit/src/components/IconButton.spec.ts`; se non esiste, crealo minimale). Appendere il test della nuova variante dentro `describe('IconButton', …)`:

```ts
  it('applica la variante danger (hover su token --color-danger)', () => {
    const wrapper = mount(IconButton, { props: { icon: 'trash-2', label: 'Elimina', variant: 'danger' } });
    expect(wrapper.get('button').classes().join(' ')).toContain('--color-danger');
  });
```

- [ ] **Step 2 — confirm FAIL:** `corepack pnpm --filter @coralyn/ui-kit test -- IconButton.spec` → FAIL (la variante `danger` non esiste ancora nella mappa `variants`).

- [ ] **Step 3 — implement.** In `IconButton.vue`: estendere il tipo `variant` e la mappa `variants`.

Da:
```ts
  defineProps<{ icon: string; label: string; variant?: 'ghost' | 'subtle'; size?: 'sm' | 'md'; disabled?: boolean }>(),
```
A:
```ts
  defineProps<{ icon: string; label: string; variant?: 'ghost' | 'subtle' | 'danger'; size?: 'sm' | 'md'; disabled?: boolean }>(),
```
E nella mappa `variants` aggiungere la chiave `danger` (dopo `subtle`):
```ts
  danger: 'border-0 bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-danger-tint,var(--color-accent-tint))] hover:text-[var(--color-danger)]',
```
> `danger` resta neutro a riposo (come `ghost`) e vira al rosso in hover — coerente con l'attuale `hover:text-[var(--color-danger)]` dei delete grezzi. Usa `--color-danger-tint` se esiste in `theme.css`, altrimenti fallback a `--color-accent-tint` (la sintassi `var(--a,var(--b))` è già usata nel progetto).

- [ ] **Step 4 — verificare il token di fallback.** `grep -n "color-danger-tint" packages/ui-kit/src/styles/theme.css`. Se **non** esiste, lasciare il fallback come sopra (nessun nuovo token — resta nei non-obiettivi §2). Se esiste, semplificare a `hover:bg-[var(--color-danger-tint)]`.

- [ ] **Step 5 — confirm PASS:** `corepack pnpm --filter @coralyn/ui-kit test -- IconButton.spec` → PASS (esistenti + il nuovo). Full ui-kit: `corepack pnpm --filter @coralyn/ui-kit test` → **107**.

- [ ] **Step 6 — ADR-0044.** Creare `docs/architecture/decisions/0044-iconbutton-variante-danger.md` seguendo il formato di `0043-*`:

```markdown
# ADR-0044: Variante `danger` per `IconButton`

- **Status:** Accepted
- **Data:** 2026-07-07
- **ADR correlati:** [0009](0009-metodo-decisionale.md)
- **Spec:** [2026-07-07-modali-universali-e-cta-sweep-design.md](../../superpowers/specs/2026-07-07-modali-universali-e-cta-sweep-design.md)

## Context
La rubrica CTA (spec §4) richiede che le azioni distruttive usino la semantica `danger`. `IconButton`
offriva solo `ghost`/`subtle`: le ~11 azioni distruttive solo-icona (trash-2 in PricingView, azioni in
MapView) restavano `<button>` grezzi con `hover:text-[var(--color-danger)]`, fuori dal design system.

## Decision
Aggiungere a `IconButton` la variante `variant="danger"`: neutra a riposo, hover su `--color-danger`
(bg tint con fallback su `--color-accent-tint`). Nessun nuovo token di palette (non-obiettivo §2).
Le azioni distruttive solo-icona migrano a `IconButton variant="danger"`.

## Consequences
- **+** Rubrica pienamente applicabile alle azioni distruttive solo-icona; markup uniforme.
- **+** Zero debito: un solo punto di verità per lo stile delle icon-action distruttive.
- **−** Piccola espansione dell'API di `IconButton` (3 varianti). Accettabile e coerente con `Button` (che ha già `danger`).
```

- [ ] **Step 7 — commit:**
```bash
git add packages/ui-kit/src/components/IconButton.vue packages/ui-kit/src/components/IconButton.spec.ts docs/architecture/decisions/0044-iconbutton-variante-danger.md
git commit -m "feat(ui-kit): IconButton variante danger + ADR-0044 — Fase B"
```

---

## Task 2: `PricingView.vue` — 14 azioni solo-icona → `IconButton`

**Files:** Modify `apps/web-staff/src/features/pricing/PricingView.vue`, `apps/web-staff/src/features/pricing/PricingView.spec.ts`.

Censimento (tutti `<button title=… @click=… :data-test=…><Icon name=… /></button>`). Conversione 1:1 a `IconButton`, mappando `title`→`label`, `<Icon name>`→`icon`, `data-test`/`@click` invariati (fallthrough). **Distruttivi (trash-2) → `variant="danger"`; gli altri → `variant="ghost"`.**

| Riga | data-test | icon | title/label | variante |
|------|-----------|------|-------------|----------|
| 405 | `delete-season` | `trash-2` | Elimina stagione | **danger** |
| 426 | `edit-eqt-…` | `edit` | Modifica | ghost |
| 428 | `archive-eqt-…` | `archive` | Archivia | ghost |
| 448 | `restore-eqt-…` | `renew` | Ripristina | ghost |
| 450 | `del-eqt-…` | `trash-2` | Elimina definitivamente | **danger** |
| 466 | `edit-pkg-…` | `edit` | Modifica | ghost |
| 468 | `archive-pkg-…` | `archive` | Archivia | ghost |
| 495 | `restore-pkg-…` | `renew` | Ripristina | ghost |
| 497 | `del-pkg-…` | `trash-2` | Elimina definitivamente | **danger** |
| 520 | `edit-slot-…` | `edit` | Modifica | ghost |
| 522 | `del-slot-…` | `trash-2` | Elimina | **danger** |
| 544 | `edit-rate-…` | `edit` | Modifica | ghost |
| 546 | `del-rate-…` | `trash-2` | Elimina | **danger** |
| 589 | (nessun data-test) | `trash-2` | Rimuovi voce | **danger** |

I due **toggle "mostra archiviati"** (`toggle-archived-eqt` L437, `toggle-archived` L483) sono **disclosure bespoke → NON convertire**; verificare solo che abbiano `focus-visible:[box-shadow:var(--ring-focus)]` (aggiungerlo se assente).

- [ ] **Step 1 — confermare che `IconButton` sia importato** in PricingView (`grep -n "IconButton" apps/web-staff/src/features/pricing/PricingView.vue`). Se assente, aggiungerlo all'import da `@coralyn/ui-kit`.

- [ ] **Step 2 — convertire, un blocco alla volta.** Pattern (esempio riga 426 e 428):

Da:
```vue
<button type="button" title="Modifica" class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
  :data-test="`edit-eqt-${t.id}`" @click="openEditEquipmentType(t)"><Icon name="edit" :size="14" /></button>
<button type="button" title="Archivia" class="text-[var(--color-text-muted)] hover:text-[var(--color-accent)]"
  :data-test="`archive-eqt-${t.id}`" @click="archiveEquipmentType.mutate(t.id)"><Icon name="archive" :size="14" /></button>
```
A:
```vue
<IconButton icon="edit" label="Modifica" variant="ghost" size="sm"
  :data-test="`edit-eqt-${t.id}`" @click="openEditEquipmentType(t)" />
<IconButton icon="archive" label="Archivia" variant="ghost" size="sm"
  :data-test="`archive-eqt-${t.id}`" @click="archiveEquipmentType.mutate(t.id)" />
```
Esempio distruttivo (riga 450):
```vue
<IconButton icon="trash-2" label="Elimina definitivamente" variant="danger" size="sm"
  :data-test="`del-eqt-${t.id}`" @click="askDeleteEquipmentType(t)" />
```
Esempio senza `data-test` (riga 589):
```vue
<IconButton icon="trash-2" label="Rimuovi voce" variant="danger" size="sm" @click="removeEquipmentRow(i)" />
```
> `size="sm"` → icona 14px (l'attuale usa 14/15px). `label` fornisce l'`aria-label` (le vecchie `title` erano di fatto tooltip/aria). Applicare la conversione a **tutte le 14 righe** della tabella sopra.

- [ ] **Step 3 — regression spec del file:** `corepack pnpm --filter @coralyn/web-staff test -- PricingView.spec` → verde. Gli spec selezionano per `data-test` (`edit-eqt-…`, `del-slot-…`, ecc.) e fanno `.trigger('click')`: passano per fallthrough. Se uno spec asseriva `[title="…"]`, aggiornarlo a `[data-test="…"]` o `[aria-label="…"]`, motivando.

- [ ] **Step 4 — commit:**
```bash
git add apps/web-staff/src/features/pricing/PricingView.vue apps/web-staff/src/features/pricing/PricingView.spec.ts
git commit -m "refactor(web-staff): PricingView azioni solo-icona → IconButton (delete=danger) — Fase B"
```

---

## Task 3: `MapView.vue` — drawer card: close + azioni inline

**Files:** Modify `apps/web-staff/src/features/map/MapView.vue`, `apps/web-staff/src/features/map/MapView.spec.ts`.

Censimento (4 `<button>` grezzi):
- **L305** close card (`@click="close"`, icona `x`, ha già `border`+`bg`) → **`IconButton variant="subtle"`** (solo-icona con contorno).
- **L312** `selectSlot` (v-for su `timeSlots`) → **segmented control bespoke → NON convertire.** Verificare `focus-visible:[box-shadow:var(--ring-focus)]` (aggiungere se assente).
- **L330** "Registra incasso" (`@click="settleOpen = true"`, testo accent) → **CTA inline → `Button variant="ghost" size="sm"`**.
- **L333** "Annulla prenotazione" (`@click="onCancel"`, `v-if` non-subscription, testo danger) → **CTA distruttiva → `Button variant="danger" size="sm"`** (+ `:loading` se `onCancel` è async — vedi Step 2).

- [ ] **Step 1 — leggere `MapView.vue` L300-340** e verificare l'import di `IconButton`/`Button`; verificare se `onCancel` è async / espone uno stato pending (es. `cancelBooking.isPending`).

- [ ] **Step 2 — implement.** Conversioni:

Close (L305):
```vue
<IconButton icon="x" label="Chiudi" variant="subtle" @click="close" />
```
"Registra incasso" (L330):
```vue
<Button variant="ghost" size="sm" @click="settleOpen = true">Registra incasso</Button>
```
"Annulla prenotazione" (L333) — se esiste uno stato pending della mutation, aggiungere `:loading`:
```vue
<Button v-if="currentBooking.type !== 'subscription'" variant="danger" size="sm"
  :loading="cancelBooking.isPending" @click="onCancel">Annulla prenotazione</Button>
```
> Se **non** esiste uno stato pending osservabile, omettere `:loading` (non inventarlo). Il segmented control `selectSlot` (L312) resta `<button>`: verificare solo `focus-visible:[box-shadow:var(--ring-focus)]`.

- [ ] **Step 3 — regression:** `corepack pnpm --filter @coralyn/web-staff test -- MapView.spec` → verde. MapView.spec usa selettori/testo: se cliccava un `<button>` per testo "Annulla prenotazione"/"Registra incasso", `Button` rende comunque un `<button>` con quel testo → il `find('button')`/`text()` regge. Aggiornare eventuali asserzioni su classi/struttura del vecchio markup, motivando.

- [ ] **Step 4 — commit:**
```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "refactor(web-staff): MapView close→IconButton, azioni inline→Button (danger/ghost) — Fase B"
```

---

## Task 4: Rubrica `danger` — azioni distruttive rese `secondary`

**Files:** Modify `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`, `apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue` (+ i rispettivi `.spec`).

Mismatch trovati nel censimento: azioni distruttive con `variant="secondary"` (o assente) invece di `danger`.

**EstablishmentStructureView.vue:**
| Riga | data-testid | variante attuale | → |
|------|-------------|------------------|---|
| 231 | `delete-sector` | secondary | **danger** |
| 252 | `delete-type` | secondary | **danger** |
| 278 | `delete-row` | secondary | **danger** |
| 380 | `umbrella-delete` | secondary | **danger** |

**CustomerSubscriptionsCard.vue:**
| Riga | condizione | variante attuale | → |
|------|-----------|------------------|---|
| 35 | `canTerminate(b)` "Disdici" | secondary | **danger** (rubrica: *disdici → danger*) |

I tre `<button>` bespoke di EstablishmentStructureView (L200 back-link, L225 `selectSector` disclosure, L284 `umbrella-chip`) sono **nav/disclosure/chip → NON convertire**; verificare solo `focus-visible:[box-shadow:var(--ring-focus)]` e hover.

- [ ] **Step 1 — implement (EstablishmentStructureView).** Su ciascuna delle 4 righe, cambiare **solo** l'attributo `variant`:
```vue
<Button data-testid="delete-sector" variant="danger" …>…</Button>
<Button data-testid="delete-type" variant="danger" …>…</Button>
<Button data-testid="delete-row" variant="danger" …>…</Button>
<Button v-if="editingUmbId" data-testid="umbrella-delete" variant="danger" …>…</Button>
```
(Lasciare invariati testo, `@click`, `v-if`, gli altri attributi.)

- [ ] **Step 2 — implement (CustomerSubscriptionsCard L35).**
```vue
<Button v-if="isAdmin && canTerminate(b)" variant="danger" …>Disdici</Button>
```

- [ ] **Step 3 — regression:** 
`corepack pnpm --filter @coralyn/web-staff test -- EstablishmentStructureView.spec` → verde.
`corepack pnpm --filter @coralyn/web-staff test -- CustomerSubscriptionsCard.spec` → verde.
I selettori `data-testid` non cambiano; `variant` non è tipicamente asserito → verdi. Se uno spec asseriva la classe `secondary`, aggiornarlo a `danger`.

- [ ] **Step 4 — commit:**
```bash
git add apps/web-staff/src/features/establishment/EstablishmentStructureView.vue apps/web-staff/src/features/customers/CustomerSubscriptionsCard.vue apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts apps/web-staff/src/features/customers/CustomerSubscriptionsCard.spec.ts
git commit -m "refactor(web-staff): azioni distruttive → variant danger (delete-*, Disdici) — Fase B"
```

---

## Task 5: Audit stati — shell + viste già `Button`-based (web-staff)

**Files (verifica; fix mirati solo se un check fallisce):** `apps/web-staff/src/app/Sidebar.vue`, `Topbar.vue`; `features/bookings/BookingsView.vue`; `features/establishment/EstablishmentView.vue`; `features/auth/LoginView.vue`, `SetPasswordView.vue`; `features/customers/CustomersView.vue`, `CustomerDetailView.vue`; `features/renewals/RenewalsView.vue`; `features/reports/ReportView.vue`.

> Queste viste **non** hanno conversioni obbligatorie: usano già `Button`, o hanno solo controlli bespoke legittimi. L'audit è un **checklist per file**; ogni fix è puntuale e passa da uno spec.

**Checklist per ciascun `<button>` bespoke (verify-only):** deve avere `hover:*` su token, `focus-visible:[box-shadow:var(--ring-focus)]`, e (se disabilitabile) stato `disabled` coerente. Se manca il `focus-visible`, aggiungerlo. **Non** convertire a `Button`.

- Sidebar L34 (card establishment), L45 (nav item), L62 (signOut, icona `logout` su token **sidebar** dark) → **bespoke**: hanno già `focus-visible:[box-shadow:var(--ring-focus)]`; NON convertire (il signOut usa token `--color-on-sidebar-*`, `IconButton` userebbe token light → romperebbe il tema). Verificare hover.
- Topbar L35/L40 (frecce data) → **bespoke** (già focus-ring+hover). Nessun cambio.
- BookingsView L72 (valore incasso cliccabile in cella) → **bespoke** (già focus-ring+hover underline). Nessun cambio.

**Checklist rubrica per i `<Button>` esistenti:** scorrere i `<Button>` del file e verificare che la variante rispetti la rubrica. Mismatch **noti già coperti** in Task 4; qui verificare che non ce ne siano altri (es. una distruttiva rimasta `secondary`/`primary`). Le azioni async (submit login, mutation) devono avere `:loading` **se** esiste uno stato pending osservabile — LoginView L44 usa oggi `:disabled="loading"` + testo "Accesso…": è accettabile, ma se `loading` è booleano disponibile preferire `:loading="loading"` su `Button` (spinner ui-kit) e rimuovere il testo condizionale. Applicare solo se non regredisce lo spec.

- [ ] **Step 1 — audit file per file** (10 file). Per ognuno: `grep -n "<button\|<Button" <file>`, applicare le due checklist. Annotare i cambi effettivi (attesi: pochi o nessuno).

- [ ] **Step 2 — se applicati cambi, regression mirata** per ogni file toccato: `corepack pnpm --filter @coralyn/web-staff test -- <NomeFile>.spec` → verde.

- [ ] **Step 3 — full regression web-staff:** `corepack pnpm --filter @coralyn/web-staff test` → **312** verde.

- [ ] **Step 4 — commit** (anche se il diff è piccolo; se davvero zero cambi, saltare il commit e annotarlo nel report):
```bash
git add apps/web-staff/src
git commit -m "refactor(web-staff): audit stati/varianti CTA shell e viste Button-based — Fase B"
```

---

## Task 6: Sweep + audit web-platform

**Files:** `apps/web-platform/src/features/auth/LoginView.vue`, `establishments/EstablishmentsListView.vue`, `EstablishmentDetailView.vue` (+ `CreateEstablishmentModal.vue` già migrato in Fase A) e i rispettivi `.spec`.

web-platform ha **0 `<button>` grezzi**: audit degli stati + rubrica come Task 5, sulle 3 viste + modale.

- [ ] **Step 1 — audit:** `grep -rn "<button\|<Button" apps/web-platform/src --include=*.vue`. Applicare la checklist stati (focus-ring/hover) e la checklist rubrica (distruttive→danger, async→loading se pending osservabile).

- [ ] **Step 2 — regression:** `corepack pnpm --filter @coralyn/web-platform test` → **16** verde. Se toccati file con spec, verificarli singolarmente prima.

- [ ] **Step 3 — commit** (se cambi):
```bash
git add apps/web-platform/src
git commit -m "refactor(web-platform): audit stati/varianti CTA viste console — Fase B"
```

---

## Task 7: Verifica finale + consegna

- [ ] **Step 1 — suite completa + typecheck:**
`corepack pnpm --filter @coralyn/ui-kit test` (**107**) · `--filter @coralyn/web-staff test` (**312**) · `--filter @coralyn/web-platform test` (**16**) · `corepack pnpm -r typecheck` (pulito). Report conteggi vs baseline.

- [ ] **Step 2 — verifica LIVE** (Docker rebuildato dal branch: `docker compose --profile full up -d --build web web-platform`). Controllare per campione:
  - **PricingView:** le azioni solo-icona (edit/archive/restore neutre; delete/trash **rosse in hover**) rese come `IconButton`, con focus-ring e aria-label; i toggle "mostra archiviati" ancora funzionanti.
  - **MapView:** card ombrellone → close come `IconButton`, "Registra incasso" (ghost) e "Annulla prenotazione" (danger) come `Button`; segmented slot invariato.
  - **EstablishmentStructureView / CustomerSubscriptionsCard:** le azioni distruttive (`Elimina`/`Disdici`) ora **rosse** (variant danger).
  - **Shell (Sidebar/Topbar) e viste Button-based:** nessuna regressione visiva; hover/focus coerenti.
  Screenshot dei campioni.

- [ ] **Step 3 — presenta e attendi conferma** per il merge FF su `main` (branch `feat/modal-layout-and-cta-sweep`, che ora contiene Fase A + Fase B).

---

## Self-review del piano (eseguita)
- **Copertura spec §4 (rubrica) e §71 (viste in scope):** IconButton danger (Task1) · PricingView (Task2) · MapView (Task3) · mismatch danger EstablishmentStructureView+CustomerSubscriptionsCard (Task4) · shell + Login/SetPassword/Customers/CustomerDetail/EstablishmentView/Renewals/Report (Task5) · web-platform Login/List/Detail (Task6). Tutte le viste elencate nello spec §71 sono coperte da un task. ✔
- **Non-obiettivi rispettati (§2):** bespoke non-CTA (nav Sidebar, frecce Topbar, celle mappa, toggle disclosure, chip, segmented slot) **non** convertiti — solo verifica stati. Nessun cambio dominio/contracts/palette. ✔
- **Decisione con l'utente (2026-07-07):** IconButton `danger` variant → Task 1 + ADR-0044. ✔
- **Placeholder:** nessuno — ogni conversione ha righe/data-test/icon/variante concreti; le tabelle elencano valori reali, non "ecc.". ✔
- **Coerenza nomi:** `IconButton` props (`icon`/`label`/`variant`/`size`), `data-test`/`data-testid` preservati, varianti Button (`primary/secondary/ghost/danger`) coerenti col censimento. ✔
- **Baseline:** Task1 +1 test → ui-kit 107 / web-staff 312; web-platform 16; typecheck pulito. Gli altri task non aggiungono test (sweep su markup), i selettori `data-test` reggono per fallthrough. ✔
- **Rischio churn/over-conversion** mitigato dalle checklist "verify-only" esplicite per ogni bespoke. ✔
