# Fase C — Audit coerenza CTA (rubrica v2 + ActionBar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere le CTA coerenti col contesto in tutte le viste — dimensione per densità (`md` header pagina · `sm` card/riga/toolbar/drawer), azioni solo-icona sempre `IconButton`, e cluster d'azione centralizzati in una nuova primitiva ui-kit `<ActionBar>` — senza stili per-elemento.

**Architecture:** Prima si aggiungono le leve centralizzate alla ui-kit: la primitiva `<ActionBar>` (layout dei cluster) e la rubrica v2 in `design-system.md` + ADR-0045. Poi sweep vista-per-vista in pipeline che applica **solo** `size`/`variant`/`IconButton`/`ActionBar` (zero classi one-off): converte le icone-sole rimaste a `IconButton`, porta a `sm` le CTA dense, avvolge i cluster in `<ActionBar>`. Nessun cambio di dominio/logica/contracts.

**Tech Stack:** Vue 3 `<script setup>`, ui-kit (`Button`, `IconButton`, `Icon`, nuovo `ActionBar`), Tailwind v4 (token `theme.css`), Vitest + @vue/test-utils, pnpm (`corepack pnpm`, mai npm).

---

## Convenzioni
- **pnpm mai npm.** Comandi da root. Filtro spec: `corepack pnpm --filter <pkg> test -- <Name>.spec`.
- **Baseline** (post-Fase B): ui-kit **107** · web-staff **312** · web-platform **16** · typecheck pulito. Task 1 aggiunge 3 test → ui-kit **110**, web-staff **315** (globa gli spec ui-kit).
- **API componenti:**
  - `IconButton`: `icon` · `label`(→aria-label) · `variant?: 'ghost'|'subtle'|'danger'` · `size?: 'sm'|'md'` · `disabled?`. Rende `<button type="button">`; `@click`/`title`/`:data-test(id)` per fallthrough.
  - `Button`: `variant?: 'primary'|'secondary'|'ghost'|'danger'` · `size?: 'sm'|'md'` · `loading?`. Slot label; `type`/`form`/`@click`/`:data-test(id)` per fallthrough.
  - `ActionBar` (Task 1): `align?: 'start'|'end'|'between'` (default `end`) · `gap?: 'sm'|'md'` (default `sm`) · `wrap?: boolean` (default `false`). Rende un `<div class="flex items-center …">` con lo slot. **Solo layout**: non impone size ai figli.
- **Selettori spec** = `data-test`/`data-testid`: reggono su `IconButton`/`Button`/dentro `ActionBar` per fallthrough → la maggior parte degli spec resta verde. Aggiornare solo gli spec che asserivano markup/struttura/classe-size, verificando comportamento/aria.
- **Verifica LIVE** su Docker rebuildato dal branch (`docker compose --profile full up -d --build web web-platform`), browser ext non affidabile → check demandato all'utente per vista. `data-test` strippati in prod → verifica comportamentale/visiva.
- **Presenta e attendi conferma a fine fase** prima del merge FF su `main`.

## Conversion patterns (riferimento per tutti i task di applicazione)
Ogni task di vista applica **solo** questi pattern. Nessuna classe one-off.

- **P1 — icona-sola `Button` → `IconButton`.** Un `<Button variant=…><Icon name="X" :size=…/></Button>` (nessun testo) diventa:
  ```vue
  <IconButton icon="X" label="<Etichetta umana>" variant="<ghost|danger>" size="sm" :data-testid="…" @click="…" />
  ```
  `variant`: distruttiva → `danger`, altrimenti `ghost`. `label` = testo umano per l'aria (es. "Modifica", "Elimina settore"). `@click`/`:data-test(id)`/`v-if` invariati.

- **P2 — CTA testuale densa `md` → `sm`.** Un `<Button …>…testo…</Button>` in **header di card, riga di lista, toolbar o drawer** riceve `size="sm"` (nient'altro cambia):
  ```vue
  <Button variant="secondary" size="sm" @click="…"><Icon name="plus" :size="13" />Nuova fila</Button>
  ```
  Le CTA **primarie di header di pagina/vista** restano `md` (default).

- **P3 — cluster di 2+ azioni → `<ActionBar>`.** Un `<div class="flex items-center gap-…">` che contiene **solo azioni** (Button/IconButton) diventa:
  ```vue
  <ActionBar gap="sm"><Button size="sm" …/><IconButton size="sm" …/></ActionBar>
  ```
  Si rimuovono le classi `flex/items-center/gap-…` scritte a mano. Elementi **non-azione** nel cluster (es. una `<span>` conteggio, un `<Badge>`) restano **fuori** dall'`ActionBar` (l'ActionBar avvolge solo i bottoni; il contenitore esterno tiene span+ActionBar). Un cluster con **una sola** azione **non** usa ActionBar (solo `size`).

## File map
- **Create (ui-kit):** `packages/ui-kit/src/components/ActionBar.vue` (+ `ActionBar.spec.ts`). **Modify:** `packages/ui-kit/src/index.ts` (export).
- **Create:** `docs/architecture/decisions/0045-rubrica-cta-contestuale-e-actionbar.md`. **Modify:** `docs/design/design-system.md` (sezione rubrica CTA).
- **Modify (viste web-staff):** `features/establishment/EstablishmentStructureView.vue`, `establishment/EstablishmentView.vue`, `pricing/PricingView.vue`, `map/MapView.vue`, `bookings/BookingsView.vue`, `customers/CustomersView.vue`, `customers/CustomerDetailView.vue`, `renewals/RenewalsView.vue`, `reports/ReportView.vue` (+ i rispettivi `.spec`).
- **Modify (web-platform):** `establishments/EstablishmentsListView.vue`, `establishments/EstablishmentDetailView.vue`, `establishments/CreateEstablishmentModal.vue`, `auth/LoginView.vue` (+ spec).
- **Verify-only:** `app/Sidebar.vue`, `app/Topbar.vue` (bespoke).

---

## Task 1: ui-kit — primitiva `<ActionBar>`

**Files:** Create `packages/ui-kit/src/components/ActionBar.vue`, `packages/ui-kit/src/components/ActionBar.spec.ts`. Modify `packages/ui-kit/src/index.ts`.

- [ ] **Step 1 — failing tests.** Create `packages/ui-kit/src/components/ActionBar.spec.ts`:

```ts
import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import ActionBar from './ActionBar.vue';

describe('ActionBar', () => {
  it('rende i figli in un flex row con default (align=end, gap=sm, no wrap)', () => {
    const w = mount(ActionBar, { slots: { default: '<button>A</button><button>B</button>' } });
    const cls = w.get('div').classes().join(' ');
    expect(cls).toContain('flex');
    expect(cls).toContain('items-center');
    expect(cls).toContain('justify-end');
    expect(cls).toContain('gap-1.5');
    expect(cls).toContain('flex-nowrap');
    expect(w.findAll('button')).toHaveLength(2);
  });

  it('applica align e gap dalle prop', () => {
    const w = mount(ActionBar, { props: { align: 'between', gap: 'md' }, slots: { default: '<i/>' } });
    const cls = w.get('div').classes().join(' ');
    expect(cls).toContain('justify-between');
    expect(cls).toContain('gap-2.5');
  });

  it('consente il wrap con :wrap', () => {
    const w = mount(ActionBar, { props: { wrap: true }, slots: { default: '<i/>' } });
    expect(w.get('div').classes().join(' ')).toContain('flex-wrap');
  });
});
```

- [ ] **Step 2 — confirm FAIL:** `corepack pnpm --filter @coralyn/ui-kit test -- ActionBar.spec` → FAIL (componente inesistente).

- [ ] **Step 3 — implement.** Create `packages/ui-kit/src/components/ActionBar.vue` (stile coerente con `Button.vue`: `const props = withDefaults(...)`, mappe `as const`):

```vue
<script setup lang="ts">
const props = withDefaults(
  defineProps<{ align?: 'start' | 'end' | 'between'; gap?: 'sm' | 'md'; wrap?: boolean }>(),
  { align: 'end', gap: 'sm', wrap: false },
);
const aligns = { start: 'justify-start', end: 'justify-end', between: 'justify-between' } as const;
const gaps = { sm: 'gap-1.5', md: 'gap-2.5' } as const;
</script>
<template>
  <div :class="['flex items-center', aligns[props.align], gaps[props.gap], props.wrap ? 'flex-wrap' : 'flex-nowrap']">
    <slot />
  </div>
</template>
```

- [ ] **Step 4 — export.** In `packages/ui-kit/src/index.ts` aggiungere (nell'ordine/formato delle export esistenti, es. accanto a `Button`):
```ts
export { default as ActionBar } from './components/ActionBar.vue';
```

- [ ] **Step 5 — confirm PASS:** `corepack pnpm --filter @coralyn/ui-kit test -- ActionBar.spec` → PASS. Full ui-kit: `corepack pnpm --filter @coralyn/ui-kit test` → **110**. Typecheck: `corepack pnpm --filter @coralyn/ui-kit typecheck` → pulito.

- [ ] **Step 6 — commit:**
```bash
git add packages/ui-kit/src/components/ActionBar.vue packages/ui-kit/src/components/ActionBar.spec.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): primitiva ActionBar per cluster d'azione (layout centralizzato) — Fase C"
```
End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: Rubrica v2 in `design-system.md` + ADR-0045

**Files:** Modify `docs/design/design-system.md`. Create `docs/architecture/decisions/0045-rubrica-cta-contestuale-e-actionbar.md`.

- [ ] **Step 1 — leggere `docs/design/design-system.md`** e individuare la sezione CTA/Button esistente (c'è un §10 sui focus-ring da Fase precedente). Aggiungere una sottosezione "Rubrica CTA contestuale" con la tabella:

```markdown
### Rubrica CTA contestuale (size-by-context)

La CTA eredita la densità del suo contenitore.

| Contesto | Trattamento |
|---|---|
| CTA primaria di pagina (header vista) | `Button` size `md` (default) |
| Azione in header di card/sezione | `Button` size `sm` |
| Azione inline in riga/lista/toolbar/drawer | `Button` size `sm` |
| Solo icona (edit/elimina/espandi/chiudi/rimuovi) | `IconButton` (mai `Button` con solo `<Icon>`); variante `ghost`/`subtle`/`danger` |
| Async | `:loading` col pending osservabile |
| Distruttiva | `danger` |

I cluster di 2+ azioni si compongono con `<ActionBar>` (layout centralizzato: `align`/`gap`/`wrap`), non con `flex gap` a mano. I controlli bespoke non-CTA (nav, frecce, chip, celle mappa, toggle disclosure, valori cliccabili) restano tali: si verificano solo gli stati.
```

- [ ] **Step 2 — ADR-0045.** Creare `docs/architecture/decisions/0045-rubrica-cta-contestuale-e-actionbar.md` nel formato di `0044-*` (leggerlo per lo stile). Contenuto:

```markdown
# ADR-0045: Rubrica CTA contestuale (size-by-context) e primitiva `ActionBar`

- **Status:** Accepted
- **Data:** 2026-07-07
- **ADR correlati:** [0002](0002-decision-rubric.md), [0044](0044-iconbutton-variante-danger.md)
- **Spec:** [2026-07-07-cta-coherence-audit-design.md](../../superpowers/specs/2026-07-07-cta-coherence-audit-design.md)

## Context
La rubrica CTA (Fase B) definiva la variante ma non la dimensione: azioni di riga/header-card
erano rese `md` (troppo grandi per il contesto denso), alcune icone-sole erano `Button` boxati
invece di `IconButton`, e ogni cluster d'azione era un `flex gap` scritto a mano (spaziature
incoerenti, wrap accidentali). L'utente ha chiesto una soluzione centralizzata/modulare, non
stili per-elemento.

## Decision
1. **Rubrica v2 (size-by-context):** la CTA eredita la densità del contenitore — header pagina `md`;
   card/riga/toolbar/drawer `sm`; icona-sola sempre `IconButton`; async `:loading`; distruttiva `danger`.
2. **Primitiva `ActionBar`:** i cluster di 2+ azioni si compongono con `<ActionBar>` (props `align`/`gap`/
   `wrap`), unico punto di verità per il layout del cluster. Gemello non-modale di `ModalFooter`.
   Non impone size ai figli (resta per-Button secondo la rubrica).

## Consequences
- **+** Coerenza visiva e densità corrette in tutte le viste; layout dei cluster centralizzato.
- **+** Zero stili per-elemento: si usano solo `size`/`variant`/`IconButton`/`ActionBar`.
- **−** Un nuovo componente ui-kit (`ActionBar`) da mantenere; adozione progressiva vista-per-vista.
```

- [ ] **Step 3 — commit:**
```bash
git add docs/design/design-system.md docs/architecture/decisions/0045-rubrica-cta-contestuale-e-actionbar.md
git commit -m "docs: rubrica CTA v2 (size-by-context) + ADR-0045 (ActionBar) — Fase C"
```
End commit body with the Co-Authored-By trailer.

---

## Task 3: `EstablishmentStructureView.vue` (caso peggiore)

**Files:** Modify `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`, `…/EstablishmentStructureView.spec.ts`.

Applica P1/P2/P3. Import: aggiungere `IconButton` e `ActionBar` all'import da `@coralyn/ui-kit` (verificare quali già presenti).

**Conversioni (per `data-testid`):**
| data-testid | attuale | pattern | risultato |
|---|---|---|---|
| `add-sector` | Button secondary md (icon+testo "Nuovo") | P2 | `size="sm"` (azione singola in header card → no ActionBar) |
| `edit-sector` | Button secondary md (solo `edit`) | P1 | `IconButton icon="edit" label="Modifica settore" variant="ghost" size="sm"` |
| `delete-sector` | Button danger md (solo `trash-2`) | P1 | `IconButton icon="trash-2" label="Elimina settore" variant="danger" size="sm"` |
| `add-type` | Button secondary md (icon+testo "Nuova") | P2 | `size="sm"` |
| `edit-type` | Button secondary md (solo `edit`) | P1 | `IconButton icon="edit" label="Modifica tipologia" variant="ghost" size="sm"` |
| `delete-type` | Button danger md (solo `trash-2`) | P1 | `IconButton icon="trash-2" label="Elimina tipologia" variant="danger" size="sm"` |
| `add-row` | Button secondary md (icon+testo "Nuova fila") | P2 | `size="sm"` |
| `generate-umbrellas` | Button secondary md ("Genera") | P2 | `size="sm"` |
| `add-umbrella` | Button secondary md (icon+testo "Aggiungi") | P2 | `size="sm"` |
| `edit-row` | Button secondary md (solo `edit`) | P1 | `IconButton icon="edit" label="Modifica fila" variant="ghost" size="sm"` |
| `delete-row` | Button danger md (solo `trash-2`) | P1 | `IconButton icon="trash-2" label="Elimina fila" variant="danger" size="sm"` |

**Cluster → ActionBar (P3):**
- **Riga settore** (`data-testid="sector-row"`): il trailing `<template v-if="isAdmin">` con `edit-sector`+`delete-sector`. Avvolgere le due IconButton in `<ActionBar gap="sm">`. Il pulsante di selezione `flex-1` (bespoke) resta fuori, prima dell'ActionBar.
- **Riga tipologia** (`data-testid="type-row"`): idem, `edit-type`+`delete-type` in `<ActionBar gap="sm">` (icona+nome restano fuori).
- **Header fila** (`data-testid="row-block"`, il `<div class="… flex items-center gap-2">` a ~L272 che contiene lo `<span>` conteggio + `generate`/`add-umbrella`/`edit-row`/`delete-row`): lo **span conteggio resta fuori**; avvolgere i 4 bottoni in `<ActionBar gap="sm">`. Struttura risultante:
  ```vue
  <div class="mb-2 flex items-center justify-between gap-2">
    <span class="text-[13px] font-semibold …">{{ r.label }}</span>
    <div class="flex items-center gap-2">
      <span class="text-xs text-[var(--color-text-muted)]">{{ r.umbrellas.length }} {{ … }}</span>
      <ActionBar gap="sm">
        <Button data-testid="generate-umbrellas" variant="secondary" size="sm" @click="openGenerate(r.id)">Genera</Button>
        <Button data-testid="add-umbrella" variant="secondary" size="sm" @click="openNewUmbrella(r.id)"><Icon name="plus" :size="12" />Aggiungi</Button>
        <IconButton icon="edit" label="Modifica fila" variant="ghost" size="sm" data-testid="edit-row" @click="openEditRow(r)" />
        <IconButton icon="trash-2" label="Elimina fila" variant="danger" size="sm" data-testid="delete-row" @click="askDeleteRow(r)" />
      </ActionBar>
    </div>
  </div>
  ```
- **Header "Settore …"** (`data-testid="add-row"` con `class="ml-auto"`): azione singola → solo `size="sm"`, mantenere `ml-auto` (nessun ActionBar).

Le celle ombrellone (`data-testid="umbrella-chip"`, `<button>` bespoke) **NON** si toccano.

- [ ] **Step 1 — leggere il file**, confermare gli import, individuare gli 11 target + i 3 cluster.
- [ ] **Step 2 — applicare** le conversioni P1/P2 e i wrap P3 come da tabella e struttura sopra.
- [ ] **Step 3 — regression:** `corepack pnpm --filter @coralyn/web-staff test -- EstablishmentStructureView.spec` → verde. I selettori `data-testid` reggono (fallthrough). Se uno spec asseriva la classe `secondary`/`md` o cliccava per struttura, aggiornarlo a comportamento; motivare.
- [ ] **Step 4 — typecheck:** `corepack pnpm --filter @coralyn/web-staff typecheck` → pulito.
- [ ] **Step 5 — commit:**
```bash
git add apps/web-staff/src/features/establishment/EstablishmentStructureView.vue apps/web-staff/src/features/establishment/EstablishmentStructureView.spec.ts
git commit -m "refactor(web-staff): EstablishmentStructureView — icone→IconButton, azioni sm, cluster in ActionBar — Fase C"
```
End with the Co-Authored-By trailer.

---

## Task 4: `EstablishmentView.vue`

**Files:** Modify `apps/web-staff/src/features/establishment/EstablishmentView.vue`, `…/EstablishmentView.spec.ts`.

Applica P1/P2/P3. Import: aggiungere `IconButton`/`ActionBar` se mancanti.

- [ ] **Step 1 — censire:** `grep -n "<Button\|<button\|flex items-center gap" apps/web-staff/src/features/establishment/EstablishmentView.vue`. Target noti dal censimento (verificare a video le righe):
  - `data-testid="edit-establishment"` (secondary): se **solo icona** → P1 `IconButton icon="edit" label="Modifica stabilimento" variant="ghost" size="sm"`; se icon+testo → P2 `size="sm"`.
  - `data-testid="add-user"` (secondary, header card utenti): P2 `size="sm"`.
  - `data-testid="toggle-user-disabled"` (secondary, azione di riga utente): P2 `size="sm"` (NON destructive → resta secondary).
  - `data-testid="reset-user-password"` (secondary, azione di riga utente): P2 `size="sm"`.
  - `data-testid="edit-establishment"` e le altre azioni di riga utente che formano un cluster (toggle+reset) → P3 `<ActionBar gap="sm">`.
  - Il delete stabilimento (già `variant="danger"` da prima, L188): se è testo lascialo `Button danger` (azione primaria di sezione, valutare `sm` se in un cluster; se è nell'header di pagina resta `md`).
- [ ] **Step 2 — applicare** P1/P2/P3 secondo il contesto reale (header pagina = md; righe/card = sm; icone-sole = IconButton; cluster ≥2 = ActionBar). Non convertire eventuali controlli bespoke.
- [ ] **Step 3 — regression:** `corepack pnpm --filter @coralyn/web-staff test -- EstablishmentView.spec` → verde; aggiornare spec solo se asserivano struttura/size.
- [ ] **Step 4 — typecheck** app → pulito.
- [ ] **Step 5 — commit:**
```bash
git add apps/web-staff/src/features/establishment/EstablishmentView.vue apps/web-staff/src/features/establishment/EstablishmentView.spec.ts
git commit -m "refactor(web-staff): EstablishmentView — CTA sm + cluster ActionBar (rubrica v2) — Fase C"
```
End with the Co-Authored-By trailer.

---

## Task 5: `PricingView.vue`

**Files:** Modify `apps/web-staff/src/features/pricing/PricingView.vue`, `…/PricingView.spec.ts`.

Le azioni solo-icona sono già `IconButton` (Fase B). Qui: **size-by-context** sulle CTA testuali + **ActionBar** sui cluster. Import: aggiungere `ActionBar`.

- [ ] **Step 1 — censire i `<Button>` testuali** (`grep -n "<Button" …/PricingView.vue`). Sono header/toolbar di sezione (es. `new-season`/"Stagione", `new-equipment-type`, `new-package`, `new-rate`/"Nuova tariffa", `new-time-slot`, `add-equipment-row`) e i submit/annulla dei modali.
- [ ] **Step 2 — applicare P2** (`size="sm"`) alle CTA delle **toolbar di sezione** (quelle in cima alle liste tariffe/pacchetti/tipi/fasce). I **submit/annulla dentro i modali** restano `md` (i footer modale non sono contesto denso di riga → lasciare default). In caso di dubbio su una CTA di header-pagina, lasciarla `md`.
- [ ] **Step 3 — applicare P3** dove 2+ CTA testuali (o CTA+IconButton) sono adiacenti in una toolbar/riga: avvolgere in `<ActionBar gap="sm">` rimuovendo il `flex gap` manuale. Il cestino `delete-season` (IconButton) accanto alle CTA di header stagione: se forma cluster con le CTA "Stagione/Tipo/Pacchetto/Nuova tariffa", metterle in un `ActionBar` (valuta anche `align="start"` se allineate a sinistra) — così il cestino `sm` non appare più sperso tra Button `md` (nota LIVE Fase B risolta portando le CTA a `sm`).
- [ ] **Step 4 — regression:** `corepack pnpm --filter @coralyn/web-staff test -- PricingView.spec` → verde; typecheck pulito. Aggiornare spec solo se asserivano struttura/size.
- [ ] **Step 5 — commit:**
```bash
git add apps/web-staff/src/features/pricing/PricingView.vue apps/web-staff/src/features/pricing/PricingView.spec.ts
git commit -m "refactor(web-staff): PricingView — toolbar CTA sm + cluster ActionBar — Fase C"
```
End with the Co-Authored-By trailer.

---

## Task 6: `MapView.vue`

**Files:** Modify `apps/web-staff/src/features/map/MapView.vue`, `…/MapView.spec.ts`.

Il drawer è già stato sistemato (card 380px, azioni inline `sm`, "Gestisci abbonamento"→Button ghost — commit `652d0ad`). Qui si **consolida col pattern**: avvolgere i cluster in `ActionBar` e verificare le size. Import: aggiungere `ActionBar`.

- [ ] **Step 1 — censire** i cluster d'azione: (a) riga azioni contestuali del drawer (`Registra incasso` + `Annulla prenotazione`/`Gestisci abbonamento`, oggi `flex items-center gap-2.5`); (b) gruppo in fondo (`Nuova prenotazione`/`Abbonamento`, oggi `flex flex-col gap-2`).
- [ ] **Step 2 — applicare P3** al cluster (a): sostituire il `<div class="mt-2.5 flex items-center gap-2.5">` con `<ActionBar align="start" gap="sm">` mantenendo i tre Button. Il gruppo (b) è verticale (colonna) → **lasciarlo com'è** (ActionBar è per cluster orizzontali; `flex-col` full-width è una scelta di layout diversa, fuori dal pattern cluster). Le size sono già `sm` per le azioni contestuali; le due CTA in fondo sono le primarie del drawer → possono restare `md` (default) o `sm` per coerenza col drawer denso: **portarle a `size="sm"`** (contesto drawer) se non regredisce lo spec.
- [ ] **Step 3 — verificare** che close (`IconButton subtle`) e il segmented slot (bespoke) restino invariati.
- [ ] **Step 4 — regression:** `corepack pnpm --filter @coralyn/web-staff test -- MapView.spec` → verde; typecheck pulito.
- [ ] **Step 5 — commit:**
```bash
git add apps/web-staff/src/features/map/MapView.vue apps/web-staff/src/features/map/MapView.spec.ts
git commit -m "refactor(web-staff): MapView — cluster drawer in ActionBar + size coerenti — Fase C"
```
End with the Co-Authored-By trailer.

---

## Task 7: web-staff — viste rimanenti + shell

**Files:** Modify (se necessario) `apps/web-staff/src/features/bookings/BookingsView.vue`, `customers/CustomersView.vue`, `customers/CustomerDetailView.vue`, `renewals/RenewalsView.vue`, `reports/ReportView.vue` (+ spec). **Verify-only:** `app/Sidebar.vue`, `app/Topbar.vue`.

Audit chirurgico con P1/P2/P3. Molte di queste hanno pochi cluster; attese modifiche contenute.

- [ ] **Step 1 — per ciascun file:** `grep -n "<Button\|<button\|flex items-center gap\|flex.*gap.*justify" <file>`. Applicare:
  - Icona-sola `Button` → `IconButton` (P1).
  - CTA testuale in header-card/riga/toolbar → `size="sm"` (P2); CTA primaria di header-vista → resta `md`.
  - Cluster 2+ azioni → `<ActionBar>` (P3), rimuovendo il `flex gap` manuale.
  - **Bespoke non-CTA** (BookingsView valore incasso cliccabile L72; Sidebar nav/signOut; Topbar frecce): **non** convertire; solo verificare focus-ring/hover (già presenti da Fase B).
- [ ] **Step 2 — regression per file toccato:** `corepack pnpm --filter @coralyn/web-staff test -- <Name>.spec`. Full: `corepack pnpm --filter @coralyn/web-staff test` → **315** verde. Typecheck pulito. Aggiornare spec solo se asserivano struttura/size.
- [ ] **Step 3 — commit** (se cambi; se zero cambi su un file, annotarlo):
```bash
git add apps/web-staff/src
git commit -m "refactor(web-staff): audit rubrica v2 + ActionBar viste rimanenti e shell — Fase C"
```
End with the Co-Authored-By trailer.

---

## Task 8: web-platform

**Files:** Modify (se necessario) `apps/web-platform/src/features/establishments/EstablishmentsListView.vue`, `EstablishmentDetailView.vue`, `CreateEstablishmentModal.vue`, `auth/LoginView.vue` (+ spec).

- [ ] **Step 1 — censire** `grep -rn "<Button\|flex items-center gap" apps/web-platform/src --include=*.vue`. Applicare P1/P2/P3:
  - `EstablishmentsListView`: "Nuovo lido" (primary, header vista → **md**), "Dettaglio" (secondary, azione di riga → **sm**), "Sospendi"/"Riattiva" (secondary, azione di riga → **sm**). Se "Dettaglio"+"Sospendi/Riattiva" formano un cluster di riga → `<ActionBar gap="sm">`.
  - `EstablishmentDetailView`: azioni (toggle-suspend, reset-admin-password) → `sm`; se cluster → ActionBar. Icone-sole → IconButton.
  - `CreateEstablishmentModal`: footer modale → resta `md` (non contesto denso).
  - `LoginView`: submit primario di pagina → resta `md`.
- [ ] **Step 2 — regression:** `corepack pnpm --filter @coralyn/web-platform test` → **16** verde; typecheck pulito.
- [ ] **Step 3 — commit** (se cambi):
```bash
git add apps/web-platform/src
git commit -m "refactor(web-platform): audit rubrica v2 + ActionBar viste console — Fase C"
```
End with the Co-Authored-By trailer.

---

## Task 9: Verifica finale + consegna

- [ ] **Step 1 — suite completa + typecheck:** `corepack pnpm --filter @coralyn/ui-kit test` (**110**) · `--filter @coralyn/web-staff test` (**315**) · `--filter @coralyn/web-platform test` (**16**) · `corepack pnpm -r typecheck` (pulito). Report conteggi vs baseline.
- [ ] **Step 2 — verifica LIVE** (Docker: `docker compose --profile full up -d --build web web-platform`). Controllare per campione:
  - **EstablishmentStructureView:** header fila non più affollato — "Genera"/"Aggiungi" `sm`, edit/elimina come `IconButton` compatti (elimina rosso in hover), cluster allineati; card Settori/Tipologie idem.
  - **PricingView:** toolbar CTA `sm`, `delete-season` non più sperso.
  - **MapView:** drawer coerente, nessun wrap.
  - **EstablishmentView / web-platform:** azioni di riga `sm`, cluster ordinati.
  - Nessuna regressione visiva su shell e viste già a posto.
  Screenshot dei campioni.
- [ ] **Step 3 — presenta e attendi conferma** per il merge FF su `main` (il branch contiene il fix MapView `652d0ad` + Fase C).

---

## Self-review del piano (eseguita)
- **Copertura spec:** A rubrica v2 → Task 2; B `ActionBar` → Task 1; C token-audit → gestito on-demand nei task di applicazione (nota: nessun `xs` pianificato a priori, si valuta con ADR solo se emerge); D applicazione → Task 3-8 (tutte le viste dello spec §6). Verifica finale → Task 9. ✔
- **Placeholder:** i target per-vista dei Task 4-8 sono elencati per `data-testid`/contesto reale dal censimento; i pattern P1/P2/P3 sono codice concreto in testa al piano. Nessun "TBD". ✔
- **Coerenza tipi/nomi:** `ActionBar` props (`align`/`gap`/`wrap`) coerenti tra Task 1, la rubrica e i pattern; `IconButton`/`Button` size/variant coerenti col censimento. ✔
- **Baseline:** Task 1 +3 test → ui-kit 110 / web-staff 315; web-platform 16; typecheck pulito. Gli altri task non aggiungono test (sweep markup); i selettori `data-test(id)` reggono per fallthrough. ✔
- **Rischio churn/over-conversion** mitigato: bespoke non-CTA esclusi esplicitamente; cluster con 1 sola azione non usano ActionBar. ✔
