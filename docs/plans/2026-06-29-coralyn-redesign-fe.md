# Coralyn Redesign FE — Implementation Plan

> **Stato: COMPLETATO (2026-06-30).** Tutti i 26 task implementati e integrati su `main` (test ui-kit + web-staff verdi, typecheck/build OK). Le checkbox sottostanti riflettono il lavoro svolto.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin `apps/web-staff` + `packages/ui-kit` to the Coralyn design, pixel-faithful to `Coralyn.dc.html`, with centralized tokens, an extended Iconify registry, modular ui-kit components, and all views (incl. new Login / Registrazione / Stabilimento).

**Architecture:** Token-first (Tailwind v4 `@theme` in `ui-kit/src/styles/theme.css`) → ui-kit components consuming only CSS-variable tokens → shell/layout → views. Icons via existing `<Icon>` + Iconify/Lucide registry (offline). Auth is a FE mock seam only (real auth lives on the backend branch).

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, Tailwind v4, Reka UI, Pinia, vue-router, TanStack Query, `unplugin-icons`+`@iconify-json/lucide`, MSW, Vitest, `@vue/test-utils`.

**Source of truth (pixel reference):** `Redesign coralyn gestionale moderno/Coralyn.dc.html` (canvas; line refs below) and `Coralyn - Gestionale Lidi.html` (rendered bundle). Spec: `docs/specs/2026-06-29-coralyn-redesign-fe-design.md`.

**Conventions for every task:** no literal hex/px in components — only `var(--token)` or Tailwind utilities bound to tokens (ADR-0017). Keep existing tests green; update assertions tied to old teal tokens. Commit after each task. Run from repo root with `pnpm --filter @driftly/web-staff <script>` / `pnpm --filter @driftly/ui-kit <script>`.

---

## Phase 0 — Foundation (tokens, icons, manifest)

### Task 1: Rewrite `theme.css` to Coralyn tokens

**Files:**
- Modify (replace): `packages/ui-kit/src/styles/theme.css`

- [x] **Step 1: Replace the whole file** with the Coralyn token set (primitive → semantic). Keep the Tailwind v4 `@theme` block (so `--color-*` tokens generate utilities) plus a `:root` block for non-color tokens / focus ring.

```css
@theme {
  /* ===== PRIMITIVE — Brand corallo ===== */
  --color-coral-500: #E0795A; --color-coral-600: #C9603F; --color-coral-700: #B65A38;
  --color-coral-100: #FBE8DF; --color-coral-050: #FBF1EF;
  /* ===== PRIMITIVE — Teal profondo (sidebar/auth) ===== */
  --color-teal-900: #0B3543; --color-teal-800: #0F3C49; --color-teal-700: #16505E;
  --color-teal-650: #1A5666; --color-teal-600: #23606E; --color-teal-divider: #1C4E5B;
  /* ===== PRIMITIVE — Teal accento (su chiaro) ===== */
  --color-accent-500: #2F7281; --color-accent-100: #E6EFEC; --color-accent-150: #E2EDEE;
  /* ===== PRIMITIVE — Testo su teal ===== */
  --color-on-teal: #CFE0DF; --color-on-teal-strong: #F6EEE1; --color-on-teal-muted: #6E9197;
  --color-on-teal-eyebrow: #577A80; --color-on-teal-2nd: #9FBCC0;
  /* ===== PRIMITIVE — Neutri caldi ===== */
  --color-warm-000: #FFFFFF; --color-warm-025: #FCFAF5; --color-warm-050: #FBF6EE;
  --color-warm-075: #FBF4E6; --color-warm-100: #F4ECE0; --color-warm-150: #F6EAD3;
  --color-warm-200: #ECE3D5; --color-warm-250: #EDE3D4;
  /* bordi */
  --color-warm-border: #E7DCCB; --color-warm-border-input: #E0D5C3;
  --color-warm-border-row: #F1EADC; --color-warm-border-stage: #ECDFC8; --color-warm-border-seg: #E2D6C3;
  /* ink */
  --color-ink-900: #22303A; --color-ink-canvas: #2B2722; --color-ink-700: #5E5648;
  --color-ink-600: #8A7E6B; --color-ink-500: #978C7B; --color-ink-400: #B3A998;
  /* stage eyebrows (su sabbia) */
  --color-stage-1: #8A6E3F; --color-stage-2: #B79A63; --color-stage-3: #9A8460;
  /* ===== PRIMITIVE — Stati mappa ===== */
  --color-state-libero: #8FBF9E; --color-state-libero-ink: #1E3A16;
  --color-state-abbonato: #5E9AA6; --color-state-abbonato-ink: #102945;
  --color-state-giornaliero: #E89270; --color-state-giornaliero-ink: #3A1E08;
  --color-state-prenotato: #F1C879; --color-state-prenotato-ink: #4A3711;
  --color-state-normale-mark: #D8CDBB;
  /* Mare */
  --color-sea-1: #E0EFF3; --color-sea-2: #BEDDE8; --color-sea-3: #A8D0DE; --color-sea-ink: #2E6B81;
  /* ===== PRIMITIVE — Feedback (bg/ink) ===== */
  --color-success: #3F9D5B; --color-success-bg: #E7F1E9; --color-success-ink: #3E7A53;
  --color-warning: #E8A93C; --color-warning-bg: #FBF1DA; --color-warning-ink: #9A7322;
  --color-danger: #C8503E; --color-danger-bg: #FBE3E0; --color-danger-ink: #A33A2C; --color-danger-border: #EBB7AF;
  --color-info: #4F86E0; --color-soon-bg: #F1E8D8; --color-soon-ink: #B7A98F;

  /* ===== SEMANTIC ===== */
  --color-canvas: var(--color-warm-200);
  --color-bg: var(--color-warm-100);
  --color-surface: var(--color-warm-000);
  --color-raised: var(--color-warm-050);
  --color-border: var(--color-warm-border);
  --color-border-input: var(--color-warm-border-input);
  --color-border-row: var(--color-warm-border-row);
  --color-text: var(--color-ink-900);
  --color-text-2nd: var(--color-ink-700);
  --color-text-muted: var(--color-ink-500);
  --color-placeholder: var(--color-ink-400);
  --color-brand: var(--color-coral-500);
  --color-brand-hover: var(--color-coral-600);
  --color-brand-ink: var(--color-coral-700);
  --color-brand-tint: var(--color-coral-100);
  --color-accent: var(--color-accent-500);
  --color-accent-tint: var(--color-accent-100);
  --color-sidebar-bg: var(--color-teal-800);
  --color-sidebar-raised: var(--color-teal-700);
  --color-sidebar-border: var(--color-teal-600);
  --color-sidebar-divider: var(--color-teal-divider);
  --color-on-sidebar: var(--color-on-teal);
  --color-on-sidebar-strong: var(--color-on-teal-strong);
  --color-on-sidebar-muted: var(--color-on-teal-muted);

  --font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --radius-sm: 9px; --radius-md: 11px; --radius-lg: 16px; --radius-xl: 18px; --radius-full: 999px;
  --shadow-card: 0 1px 3px rgba(15,60,73,.05);
  --shadow-soft: 0 1px 2px rgba(15,60,73,.08);
  --shadow-drawer: 0 12px 40px rgba(15,60,73,.13);
  --shadow-modal: 0 24px 70px rgba(11,53,67,.34);
  --shadow-brand: 0 2px 8px rgba(224,121,90,.3);
  --ease-standard: cubic-bezier(.2,0,.2,1);
  --ease-emphasized: cubic-bezier(.2,0,0,1);
}

:root {
  --ring-focus: 0 0 0 3px rgba(224,121,90,.16); /* anello focus morbido corallo */
}
* { box-sizing: border-box; }
body { font-family: var(--font-sans); color: var(--color-text); background: var(--color-bg); margin: 0; -webkit-font-smoothing: antialiased; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```

- [x] **Step 2: Load Inter.** Confirm Inter is available. Add to `apps/web-staff/index.html` `<head>` (dev/online) the Google Fonts link; production bundling of Inter is tracked separately (see Task 18 note).

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

- [x] **Step 3: Build the ui-kit / typecheck.** Run: `pnpm --filter @driftly/ui-kit build` (or `typecheck`). Expected: no errors. (Old token names like `--color-cool-*`, `--color-navy-900`, `--color-teal-500` are now gone — later tasks fix every consumer; a transient broken visual is fine until Phase 1–3 land, but the package must still build.)

- [x] **Step 4: Commit.**

```bash
git add packages/ui-kit/src/styles/theme.css apps/web-staff/index.html
git commit -m "feat(ui-kit): Coralyn design tokens (theme.css) + Inter"
```

---

### Task 2: Extend the icon registry (Iconify/Lucide)

**Files:**
- Modify: `packages/ui-kit/src/icons/registry.ts`
- Test: `packages/ui-kit/src/components/Icon.spec.ts` (existing — extend)

- [x] **Step 1: Add the new Lucide imports + registry keys.** Replace the file with:

```ts
import type { Component } from 'vue';
import IconMap from '~icons/lucide/map';
import IconCalendar from '~icons/lucide/calendar';
import IconUsers from '~icons/lucide/users';
import IconTag from '~icons/lucide/tag';
import IconChart from '~icons/lucide/bar-chart-3';
import IconShield from '~icons/lucide/shield';
import IconSearch from '~icons/lucide/search';
import IconUmbrella from '~icons/lucide/umbrella';
import IconPalm from '~icons/lucide/tree-palm';
import IconLeaf from '~icons/lucide/leaf';
import IconPlus from '~icons/lucide/plus';
import IconStar from '~icons/lucide/star';
import IconCheck from '~icons/lucide/check';
import IconX from '~icons/lucide/x';
import IconChevronLeft from '~icons/lucide/chevron-left';
import IconChevronRight from '~icons/lucide/chevron-right';
import IconChevronDown from '~icons/lucide/chevron-down';
import IconBell from '~icons/lucide/bell';
import IconSettings from '~icons/lucide/settings';
import IconEuro from '~icons/lucide/euro';
import IconClock from '~icons/lucide/clock';
import IconPhone from '~icons/lucide/phone';
import IconMail from '~icons/lucide/mail';
import IconRenew from '~icons/lucide/refresh-cw';
import IconEdit from '~icons/lucide/pencil';
import IconLogout from '~icons/lucide/log-out';
import IconBuilding from '~icons/lucide/building-2';
import IconLayers from '~icons/lucide/layers';
import IconFilter from '~icons/lucide/filter';
import IconArrowUp from '~icons/lucide/arrow-up';
import IconArrowDown from '~icons/lucide/arrow-down';
import IconWaves from '~icons/lucide/waves';

/** Nomi consentiti (chrome + Tipologia.icona). Confine offline + fallback. */
export const icons: Record<string, Component> = {
  map: IconMap, calendar: IconCalendar, users: IconUsers, tag: IconTag, chart: IconChart,
  shield: IconShield, search: IconSearch, umbrella: IconUmbrella, palmtree: IconPalm,
  leaf: IconLeaf, plus: IconPlus, star: IconStar, check: IconCheck, x: IconX,
  'chevron-left': IconChevronLeft, 'chevron-right': IconChevronRight, 'chevron-down': IconChevronDown,
  bell: IconBell, settings: IconSettings, euro: IconEuro, clock: IconClock, phone: IconPhone,
  mail: IconMail, renew: IconRenew, edit: IconEdit, logout: IconLogout, building: IconBuilding,
  layers: IconLayers, filter: IconFilter, 'arrow-up': IconArrowUp, 'arrow-down': IconArrowDown,
  waves: IconWaves,
};

export const FALLBACK_ICON = 'umbrella';
```

- [x] **Step 2: Extend the test** to assert a few new keys resolve and unknown falls back.

```ts
it('resolve le nuove chiavi del registry', () => {
  for (const k of ['bell','settings','euro','clock','phone','mail','renew','edit','logout','building','filter','waves','chevron-down']) {
    expect(icons[k]).toBeTruthy();
  }
});
```

- [x] **Step 3: Run tests.** `pnpm --filter @driftly/ui-kit test` → PASS.
- [x] **Step 4: Commit.** `git commit -am "feat(ui-kit): estende registry icone Coralyn (Lucide)"`

---

### Task 3: PWA manifest + theme colors

**Files:**
- Modify: `apps/web-staff/vite.config.ts:21-22`

- [x] **Step 1:** Change `theme_color: '#1F6F8B'` → `'#E0795A'` and `background_color: '#E9EFF2'` → `'#ECE3D5'`.
- [x] **Step 2:** Run `pnpm --filter @driftly/web-staff typecheck` → PASS.
- [x] **Step 3: Commit.** `git commit -am "chore(web-staff): PWA theme/background colors Coralyn"`

---

## Phase 1 — ui-kit components

> For each component: match the cited `Coralyn.dc.html` lines, use only tokens, keep `<Icon>` for icons. After Phase 1, run `pnpm --filter @driftly/ui-kit test` and `typecheck`.

### Task 4: Button (variants)

**Files:** Modify `packages/ui-kit/src/components/Button.vue`; Test `Button.spec.ts` (existing).
Ref: primary lines 268/292/339/380/694/721; secondary/ghost 270/271/528/657.

- [x] **Step 1:** Replace component:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }>(), { variant: 'primary' });
const base = 'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50 disabled:cursor-not-allowed';
const variants = {
  primary: 'border-0 bg-[var(--color-brand)] text-white [box-shadow:var(--shadow-brand)] hover:bg-[var(--color-brand-hover)]',
  secondary: 'border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-accent)] hover:bg-[var(--color-warm-025)]',
  ghost: 'border-0 bg-transparent text-[var(--color-accent)] hover:bg-[var(--color-accent-tint)]',
  danger: 'border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger)] hover:brightness-95',
} as const;
</script>
<template><button :class="[base, variants[$props.variant ?? 'primary']]"><slot /></button></template>
```

- [x] **Step 2:** Update `Button.spec.ts` assertions: primary uses `--color-brand` (no longer teal token). Run `pnpm --filter @driftly/ui-kit test` → PASS.
- [x] **Step 3: Commit.** `git commit -am "feat(ui-kit): Button varianti Coralyn (primary/secondary/ghost/danger)"`

### Task 5: Badge (status / tipologia / ruolo / soon)

**Files:** Modify `packages/ui-kit/src/components/Badge.vue`. Test: new `Badge.spec.ts`.
Ref: status badges in tables (319), tipologia chip 232, ruolo/"Tu" 614, "in arrivo" 549/606.

- [x] **Step 1:** Replace with a `tone` prop:

```vue
<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral'|'brand'|'accent'|'success'|'warning'|'danger'|'soon' }>(), { tone: 'neutral' });
const tones = {
  neutral: 'bg-[var(--color-raised)] text-[var(--color-text-2nd)]',
  brand:   'bg-[var(--color-brand-tint)] text-[var(--color-brand-ink)]',
  accent:  'bg-[var(--color-accent-tint)] text-[var(--color-accent)]',
  success: 'bg-[var(--color-success-bg)] text-[var(--color-success-ink)]',
  warning: 'bg-[var(--color-warning-bg)] text-[var(--color-warning-ink)]',
  danger:  'bg-[var(--color-danger-bg)] text-[var(--color-danger-ink)]',
  soon:    'bg-[var(--color-soon-bg)] text-[var(--color-soon-ink)]',
} as const;
</script>
<template>
  <span :class="['inline-flex items-center gap-1.5 rounded-[var(--radius-full)] px-2.5 py-1 text-xs font-semibold', tones[$props.tone ?? 'neutral']]"><slot /></span>
</template>
```

- [x] **Step 2:** Test renders the `accent` tone classes. Run test → PASS.
- [x] **Step 3: Commit.** `git commit -am "feat(ui-kit): Badge a toni semantici (status/tipologia/ruolo/soon)"`

### Task 6: Card

**Files:** Modify `packages/ui-kit/src/components/Card.vue`.

- [x] **Step 1:** `<div class="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-card)]"><slot /></div>`
- [x] **Step 2: Commit.** `git commit -am "feat(ui-kit): Card superficie Coralyn (bordo + ombra soft)"`

### Task 7: Input / Field / Textarea

**Files:** Modify `Input.vue`, `Field.vue`; Create `Textarea.vue`; export in `index.ts`. Ref lines 712-717, 771-774.

- [x] **Step 1:** `Input.vue` control = `w-full rounded-[var(--radius-md)] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-placeholder)] outline-none focus:border-[var(--color-brand)] focus:[box-shadow:var(--ring-focus)]`. Add `[font-variant-numeric:tabular-nums]` when a `numeric?: boolean` prop is set.
- [x] **Step 2:** `Field.vue` label = `text-[13px] font-semibold text-[var(--color-text-2nd)] mb-1.5`; error = `text-xs text-[var(--color-danger)]`.
- [x] **Step 3:** `Textarea.vue` mirrors Input with `resize-none` + `rows`.
- [x] **Step 4:** Export `Textarea` from `packages/ui-kit/src/index.ts`. Run `typecheck` → PASS.
- [x] **Step 5: Commit.** `git commit -am "feat(ui-kit): Input/Field/Textarea Coralyn (focus ring corallo)"`

### Task 8: Avatar (new)

**Files:** Create `packages/ui-kit/src/components/Avatar.vue`; export in `index.ts`; Test `Avatar.spec.ts`. Ref 311/355/520.

- [x] **Step 1: Write failing test** for initials + size:

```ts
import { mount } from '@vue/test-utils';
import Avatar from './Avatar.vue';
it('mostra le iniziali e applica la size', () => {
  const w = mount(Avatar, { props: { iniziali: 'MR', size: 'lg' } });
  expect(w.text()).toBe('MR');
  expect(w.attributes('style')).toContain('60px');
});
```

- [x] **Step 2: Run** → FAIL (file missing).
- [x] **Step 3: Implement:**

```vue
<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ iniziali: string; size?: 'sm'|'md'|'lg'; tone?: 'brand'|'accent' }>(), { size: 'md', tone: 'accent' });
const px = { sm: '30px', md: '40px', lg: '60px' } as const;
const fs = { sm: '11px', md: '12.5px', lg: '20px' } as const;
const tones = { brand: 'background:var(--color-brand-tint);color:var(--color-brand-ink)', accent: 'background:var(--color-accent-tint);color:var(--color-accent)' } as const;
const style = computed(() => `width:${px[props.size]};height:${px[props.size]};font-size:${fs[props.size]};${tones[props.tone]}`);
</script>
<template>
  <span class="inline-flex flex-none items-center justify-center rounded-full font-semibold" :style="style">{{ iniziali }}</span>
</template>
```

- [x] **Step 4: Run** → PASS. **Step 5: Commit** `git commit -am "feat(ui-kit): Avatar iniziali (sm/md/lg, toni)"`

### Task 9: SegmentedControl (new)

**Files:** Create `packages/ui-kit/src/components/SegmentedControl.vue`; export; Test. Ref 148-152, 284-289.

- [x] **Step 1: Failing test** — renders options, active gets `aria-selected`, click emits `update:modelValue`:

```ts
import { mount } from '@vue/test-utils';
import SegmentedControl from './SegmentedControl.vue';
it('seleziona ed emette', async () => {
  const w = mount(SegmentedControl, { props: { modelValue: 'a', options: [{value:'a',label:'A'},{value:'b',label:'B'}] } });
  const tabs = w.findAll('[role="tab"]');
  expect(tabs[0].attributes('aria-selected')).toBe('true');
  await tabs[1].trigger('click');
  expect(w.emitted('update:modelValue')![0]).toEqual(['b']);
});
```

- [x] **Step 2: Run** → FAIL. **Step 3: Implement:**

```vue
<script setup lang="ts">
defineProps<{ modelValue: string; options: { value: string; label: string }[] }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
<template>
  <div role="tablist" class="inline-flex gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-warm-border-seg)] bg-[var(--color-warm-250)] p-[3px]">
    <button v-for="o in options" :key="o.value" role="tab" :aria-selected="o.value === modelValue"
      class="rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-medium transition-colors"
      :class="o.value === modelValue ? 'bg-[var(--color-surface)] font-semibold text-[var(--color-text)] [box-shadow:var(--shadow-soft)]' : 'text-[var(--color-ink-600)] hover:text-[var(--color-text)]'"
      @click="$emit('update:modelValue', o.value)">{{ o.label }}</button>
  </div>
</template>
```

- [x] **Step 4: Run** → PASS. **Step 5: Commit** `git commit -am "feat(ui-kit): SegmentedControl (tablist a pill)"`

### Task 10: Modal / Dialog (new)

**Files:** Create `packages/ui-kit/src/components/Modal.vue`; export. Ref 640-651.

- [x] **Step 1: Implement** on Reka UI Dialog (centered):

```vue
<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from 'reka-ui';
import Icon from './Icon.vue';
defineProps<{ title: string; eyebrow?: string }>();
const open = defineModel<boolean>('open', { required: true });
</script>
<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[80] bg-[rgba(11,53,67,.46)]" />
      <DialogContent class="fixed left-1/2 top-1/2 z-[80] flex max-h-[90vh] w-full max-w-[548px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-auto rounded-[var(--radius-xl)] bg-[var(--color-surface)] [box-shadow:var(--shadow-modal)] focus:outline-none">
        <div class="flex items-start justify-between border-b border-[var(--color-border-row)] p-5">
          <div>
            <div v-if="eyebrow" class="mb-1 text-[11px] font-semibold uppercase tracking-[.06em] text-[var(--color-text-muted)]">{{ eyebrow }}</div>
            <DialogTitle class="text-[19px] font-bold tracking-[-.01em] text-[var(--color-text)]">{{ title }}</DialogTitle>
          </div>
          <DialogClose aria-label="Chiudi" class="grid size-8 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-raised)] text-[var(--color-text-muted)]"><Icon name="x" :size="16" /></DialogClose>
        </div>
        <div class="p-5"><slot /></div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
```

- [x] **Step 2: Commit** `git commit -am "feat(ui-kit): Modal centrato (Reka Dialog) Coralyn"`

### Task 11: Drawer (reskin)

**Files:** Modify `packages/ui-kit/src/components/Drawer.vue`. (Keep right-side overlay variant for tablet bottom-sheet / generic use.)

- [x] **Step 1:** Update tokens: content `rounded-[var(--radius-xl)] bg-[var(--color-surface)] [box-shadow:var(--shadow-drawer)]`, close button styled like Modal's. Overlay `bg-[rgba(11,53,67,.3)]`.
- [x] **Step 2: Commit** `git commit -am "feat(ui-kit): Drawer reskin Coralyn"`

### Task 12: OmbrelloneCell (reskin)

**Files:** Modify `packages/ui-kit/src/components/OmbrelloneCell.vue`; Test `OmbrelloneCell.spec.ts` (existing). Ref 177-182 (cell + marker), 193 (speciali).

- [x] **Step 1:** Keep 4-axis logic. Update: split divider uses `var(--color-surface)`; selection ring `outline-[var(--color-brand)]` + halo `0 0 0 4px var(--color-brand-tint)`; tipologia marker = white circle `bg-[var(--color-surface)]`, icon `text-[var(--color-accent)]`, `[box-shadow:var(--shadow-soft)]`, size ~15px. Split-cell label ink → `var(--color-text)`.
- [x] **Step 2:** Keep existing spec green (fill maps to `--color-state-*` tokens — unchanged token names, new values). Run `pnpm --filter @driftly/ui-kit test` → PASS.
- [x] **Step 3: Commit** `git commit -am "feat(ui-kit): OmbrelloneCell reskin Coralyn (marker teal, ring corallo)"`

### Task 13: DataTable, KpiCard, StatTile, BarChart, StackedBar (new presentational)

**Files:** Create `DataTable.vue`, `KpiCard.vue`, `StatTile.vue`, `BarChart.vue`, `StackedBar.vue` in `packages/ui-kit/src/components/`; export all in `index.ts`. Ref: table 295-325; KPI 441-449; StatTile 594-597; BarChart 460-468; StackedBar 473-478.

- [x] **Step 1: DataTable** — slot-based wrapper: `Card`-like container `rounded-[var(--radius-lg)] border ... overflow-hidden`; expose `<thead>` styling via a `columns` prop (`{ key, label, align }`) and a `#row` scoped slot, OR keep it as a thin styled `<table>` wrapper with header cells `text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]`, header bg `--color-raised`, row divider `--color-border-row`. Choose the thin-wrapper approach (views own their rows).
- [x] **Step 2: KpiCard** props `{ icon, iconTone, label, value, trend, trendDir: 'up'|'down' }`; value `text-[28px] font-bold tabular-nums`; trend arrow via `<Icon name="arrow-up|arrow-down">`, color success/danger.
- [x] **Step 3: StatTile** props `{ value, label }` on `bg-[var(--color-raised)] rounded-[var(--radius-md)]`.
- [x] **Step 4: BarChart** props `{ bars: { label, value, displayValue }[], max }`; render flexbox bars, height `% of max`, fill `--color-accent` (or per-bar), label below.
- [x] **Step 5: StackedBar** props `{ segments: { pct, color, label }[] }`; render the `h-3.5 rounded-full overflow-hidden` stacked bar + a legend list.
- [x] **Step 6:** Export all. Run `typecheck` → PASS. **Step 7: Commit** `git commit -am "feat(ui-kit): DataTable/KpiCard/StatTile/BarChart/StackedBar"`

---

## Phase 2 — Shell, layouts, routing

### Task 14: Session store + auth seam + route meta

**Files:** Modify `apps/web-staff/src/stores/session.ts`, `apps/web-staff/src/router/index.ts`.

- [x] **Step 1:** Extend `session`: add `authenticated = ref(true)` (dev default true so the app shows; login sets it), `utenteEmail = ref('giulia@lidomaestrale.it')`, `ruolo` default `Ruolo.Admin`; change `nomeStabilimento` → `'Lido Maestrale'`. Add actions `login()` → `authenticated.value = true`, `logout()` → `authenticated.value = false`.
- [x] **Step 2:** Router: add routes `/login` (name `login`, `meta.public`), `/registrazione` (name `registrazione`, `meta.public`), `/stabilimento` (name `stabilimento`, `meta: { title:'Stabilimento', subtitle:'Configurazione e team' }`). Add `meta: { title, subtitle }` to every app route (Mappa "Mappa"/"Lido Maestrale · 47 ombrelloni · vista per giornata"; Prenotazioni; Clienti; etc.). Mark login/registrazione `meta.public` and `meta.bare` (no shell).
- [x] **Step 3:** Guard: in `beforeEach`, if `!to.meta.public && !session.authenticated` → `{ name: 'login' }`; keep superuser check for `/console`.
- [x] **Step 4:** Run `typecheck` → PASS. **Step 5: Commit** `git commit -am "feat(web-staff): session auth seam + route meta (titoli/guard)"`

### Task 15: AppShell + Sidebar

**Files:** Modify `apps/web-staff/src/app/AppShell.vue`, `Sidebar.vue`. Ref sidebar 69-114, shell 66/116-118.

- [x] **Step 1: AppShell** — bare layout for `meta.bare` routes (render `<RouterView>` only); otherwise flex row: `<Sidebar>` + `<main class="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]"><Topbar/><div class="min-h-0 flex-1 overflow-auto"><RouterView/></div></main>`, wrapper `flex h-screen min-h-[620px] bg-[var(--color-canvas)] text-[var(--color-text)]`.
- [x] **Step 2: Sidebar** — `aside w-[248px] flex-none bg-[var(--color-sidebar-bg)] text-[var(--color-on-sidebar)]` with: logo + wordmark ("Coralyn" `font-bold text-[var(--color-on-sidebar-strong)]` + "Gestionale lidi" eyebrow); **stabilimento switcher** card (`bg-[var(--color-sidebar-raised)] border-[var(--color-sidebar-border)]`, wave icon tile, name + "Stagione 2026", chevron-down); eyebrow "OPERATIVO"; nav items (`map/calendar/users/tag/chart`) — active = `bg-[var(--color-sidebar-raised)]` + coral dot (`<span class="size-1.5 rounded-full bg-[var(--color-brand)]">`), inactive hover `bg-white/5`; `mt-auto`: divider, **Console** (gated `Ruolo.Superuser`) with "super" pill, **user footer** (Avatar initials on `--color-brand`, email truncate, "Amministratore", settings/logout button → `session.logout()` + `router.push('/login')`).
- [x] **Step 3:** Use `<RouterLink>` for nav with `v-slot="{ isActive }"`. Run `typecheck` → PASS.
- [x] **Step 4: Commit** `git commit -am "feat(web-staff): AppShell + Sidebar teal Coralyn"`

### Task 16: Topbar

**Files:** Modify `apps/web-staff/src/app/Topbar.vue`. Ref 120-139.

- [x] **Step 1:** `header flex-none flex items-center gap-[18px] px-[26px] py-4 border-b border-[var(--color-border)] bg-[var(--color-raised)]`. Left: title (`text-xl font-bold tracking-[-.015em] text-[var(--color-text)]`) + subtitle (`text-[12.5px] text-[var(--color-text-muted)]`) from `useRoute().meta`. Spacer. Date navigator pill (`bg-[var(--color-surface)] border rounded-full`, chevron-left/right buttons, date span `tabular-nums`, from `session.dataAttiva`). Search pill (`w-[236px]` placeholder). Bell button (`size-10 rounded-full border` + coral dot).
- [x] **Step 2:** Run `typecheck` → PASS. **Step 3: Commit** `git commit -am "feat(web-staff): Topbar Coralyn (titolo/data/ricerca/bell)"`

### Task 17: AuthLayout + Login + Registrazione

**Files:** Create `apps/web-staff/src/app/AuthLayout.vue`; Create `apps/web-staff/src/features/auth/LoginView.vue`, `RegistrazioneView.vue`. Wire routes (Task 14). Ref login 745-780, register 785-820.

- [x] **Step 1: AuthLayout** — split: left panel `w-[44%] max-w-[540px]` gradient `linear-gradient(158deg,var(--color-teal-650),var(--color-teal-800) 52%,var(--color-teal-900))` with logo, `#headline`, `#bullets` slots + radial-glow decor (coral/teal); right panel centered `#form` slot. Background `var(--color-bg)`.
- [x] **Step 2: LoginView** — "Bentornato" h1 + sub; optional error alert (`--color-danger-*`); Email + Password fields; primary "Accedi" → `session.login(); router.push('/mappa')`; divider "oppure"; link "Registra il tuo stabilimento" → `/registrazione`.
- [x] **Step 3: RegistrazioneView** — "Crea il tuo stabilimento"; nome/email/password/conferma; "Crea stabilimento" → `session.login(); router.push('/mappa')`; link "Accedi" → `/login`. Left bullets: configurazione guidata; prenotazioni dal primo giorno.
- [x] **Step 4:** Run `typecheck` → PASS. **Step 5: Commit** `git commit -am "feat(web-staff): AuthLayout + Login + Registrazione"`

---

## Phase 3 — Views (reskin + new)

> Each view: match cited lines, compose ui-kit components, keep existing data wiring (`useClienti`, `useMappaGiorno`, MSW). Keep/adjust existing view specs.

### Task 18: MappaView

**Files:** Modify `apps/web-staff/src/features/mappa/MappaView.vue`; Test `MappaView.spec.ts` (existing). Ref 146-277.

- [x] **Step 1:** Header row: SegmentedControl settori (from `MappaGiornoDTO.settori`) + "Stato per fascia" hint with clock icon.
- [x] **Step 2:** Stage card: `bg-[linear-gradient(168deg,var(--color-warm-075),var(--color-warm-150))] border-[var(--color-warm-border-stage)] rounded-[var(--radius-xl)]`; "Mare" header band (gradient `--color-sea-*`, wave icon + label); rows of `OmbrelloneCell` (fila label + cells from `useMappaGiorno`); Speciali/Palme block; legend (Stato + Tipologia) — micro-labels uppercase.
- [x] **Step 3:** Selection opens an **inline side panel** (340px `Card`, `--shadow-drawer`): eyebrow "Ombrellone" + label (`text-2xl font-bold tabular-nums`), tipologia `Badge tone="accent"`, crumb, Mattina/Pomeriggio split boxes, booking detail (dashed dividers), payment status row (Saldato/Parziale/Non pagato via success/warning/danger tones), actions (primary "Nuova prenotazione" → opens Modal; secondary "Abbonamento"/"Presenza"; "Annulla prenotazione" danger link).
- [x] **Step 4:** Keep `MappaView.spec.ts` green (update any teal/token assertions). Run `pnpm --filter @driftly/web-staff test` → PASS.
- [x] **Step 5: Commit** `git commit -am "feat(web-staff): MappaView Coralyn (stage, celle, drawer)"`

### Task 19: PrenotazioniView

**Files:** Modify `apps/web-staff/src/features/prenotazioni/PrenotazioniView.vue`; MSW: add prenotazioni handler+seed if absent (`apps/web-staff/src/mocks/handlers.ts`, `data/seed.ts`). Ref 282-326.

- [x] **Step 1:** SegmentedControl (Tutte/Confermate/Bozze/Concluse) + secondary "Filtri" + primary "Nuova prenotazione". DataTable (Cliente w/ Avatar, Ombrellone, Pacchetto, Tipo, Periodo, Stato `Badge`, Incasso right tabular). Seed ~8 rows matching the canvas.
- [x] **Step 2:** Run `typecheck`+`test` → PASS. **Step 3: Commit** `git commit -am "feat(web-staff): PrenotazioniView Coralyn + mock"`

### Task 20: ClientiView + ClienteDettaglioView

**Files:** Modify `apps/web-staff/src/features/clienti/ClientiView.vue`, `ClienteDettaglioView.vue`; keep `useClienti`. Tests existing. Ref clienti 331-366; scheda 515-563.

- [x] **Step 1: ClientiView** — search pill + count + primary "Nuovo cliente" (opens Modal) + DataTable (Avatar+nome, telefono tabular, email, note truncate); row click → `/clienti/:id`.
- [x] **Step 2: ClienteDettaglioView** — back link; header card (Avatar lg, nome, phone/mail with icons, "Modifica" secondary); "Anagrafica e contatti" Card (grid nome/cognome/telefono/email/note); 3 "In arrivo" placeholder cards (`Badge tone="soon"`, dashed border, star/calendar/euro icons).
- [x] **Step 3:** Keep `ClientiView.spec.ts`, `ClienteDettaglioView.spec.ts`, `useClienti.spec.ts` green. Run `test` → PASS.
- [x] **Step 4: Commit** `git commit -am "feat(web-staff): Clienti + Scheda cliente Coralyn"`

### Task 21: ListinoView

**Files:** Modify `apps/web-staff/src/features/listino/ListinoView.vue`; MSW seed if needed. Ref 372-432.

- [x] **Step 1:** Season selector button; primary "Nuova tariffa"; pacchetti grid (3 `Card`: nome, tag `Badge`, dotazione, prezzo `text-[22px] font-bold tabular-nums`); fasce chips (clock icon + nome + orario); tariffe DataTable (Posizione, Pacchetto, Fascia, Giornata/Settimana/Stagione right tabular).
- [x] **Step 2:** Run `typecheck`+`test` → PASS. **Step 3: Commit** `git commit -am "feat(web-staff): ListinoView Coralyn + mock"`

### Task 22: ReportView

**Files:** Modify `apps/web-staff/src/features/report/ReportView.vue`. Ref 438-509.

- [x] **Step 1:** 4 `KpiCard` (incasso/presenze/occupazione/abbonamenti with icons+trend); `BarChart` "Incassi ultimi 7 giorni" (+ total); `StackedBar` "Stato ombrelloni" + legend; "Abbonamenti in scadenza" list (Avatar, nome, ombrellone+anzianità, scadenza, secondary "Rinnova" w/ renew icon). Static seed matching canvas values.
- [x] **Step 2:** Run `typecheck` → PASS. **Step 3: Commit** `git commit -am "feat(web-staff): ReportView Coralyn (KPI/chart)"`

### Task 23: StabilimentoView + ConsoleView reskin

**Files:** Create `apps/web-staff/src/features/stabilimento/StabilimentoView.vue` (route from Task 14); Modify `apps/web-staff/src/features/console/ConsoleView.vue`. Ref stabilimento 569-630.

- [x] **Step 1: StabilimentoView** — header card (logo, "Lido Maestrale", admin/email/stagione, "Modifica"); grid: "Informazioni stabilimento" + "Struttura della spiaggia" (4 `StatTile`: 2 settori / 47 ombrelloni / 3 tipologie / 3 pacchetti, "Configura" link); "Utenti e ruoli" card (intro paragraph re Admin/Staff/Superuser, user rows with `Badge` ruolo + "Tu", "Inviti · in arrivo" `Badge tone="soon"`); "Sessione" card (shield tile, copy, danger "Esci").
- [x] **Step 2: ConsoleView** — minimal reskin onto `Card`/tokens for coherence (keep current content).
- [x] **Step 3:** Run `typecheck` → PASS. **Step 4: Commit** `git commit -am "feat(web-staff): StabilimentoView + Console reskin"`

---

## Phase 4 — Documentation

### Task 24: Rewrite design-system.md + ADR-0027 + ADR-0020 note + README

**Files:** Modify `docs/design/design-system.md`, `docs/architecture/decisions/0027-coralyn-linguaggio-visivo.md`, `docs/architecture/decisions/0020-resa-mappa.md`, `docs/design/README.md`, `docs/architecture/decisions/0018-linguaggio-visivo.md`; copy canvas to `docs/design/mockups/Coralyn.dc.html`.

- [x] **Step 1:** `design-system.md` — replace all token tables/values with the actual Coralyn set (§4 of spec): coral `#E0795A`, teal sidebar `#0F3C49`, accent teal `#2F7281`, Inter incl. weight 700, radii 9/11/16/18, soft navy-tinted shadows, revised map-state colors; **icons section: Iconify/Lucide confirmed** (no sprite). Update §3.1 contrast table to new state fills.
- [x] **Step 2:** ADR-0027 — rewrite Decision/palette/typography sections to the real values; keep "supersedes ADR-0018 for palette+typography only"; explicitly state **icons unchanged (Iconify/Lucide, ADR-0018)**; update the semantic-delta table.
- [x] **Step 3:** ADR-0020 — add a short note: state fills updated to warm palette (Abbonato `#5E9AA6`, Giornaliero `#E89270`, Libero `#8FBF9E`, Prenotato `#F1C879`); AA re-confirmed.
- [x] **Step 4:** `design/README.md` — mockup pointer = `Coralyn.dc.html` (corrente); note bundle `Coralyn - Gestionale Lidi.html`. Copy the full canvas (`Redesign coralyn gestionale moderno/Coralyn.dc.html`) into `docs/design/mockups/Coralyn.dc.html` (overwrite the partial copy).
- [x] **Step 5:** ADR-0018 header already "Superseded by ADR-0027 (palette e tipografia)" — verify wording stays accurate (icons NOT superseded).
- [x] **Step 6: Commit** `git commit -am "docs: allinea design-system + ADR-0027/0020 al design Coralyn reale"`

---

## Phase 5 — Verification & finish

### Task 25: Full verification

- [x] **Step 1:** `pnpm --filter @driftly/ui-kit test` → PASS. `pnpm --filter @driftly/web-staff test` → PASS.
- [x] **Step 2:** `pnpm --filter @driftly/web-staff typecheck` → PASS. `pnpm --filter @driftly/web-staff build` → success.
- [x] **Step 3:** Grep guard — no stray literal hex in components (allow tokens/gradients): `rg -n "#[0-9A-Fa-f]{6}" packages/ui-kit/src/components apps/web-staff/src` and confirm only intentional gradient stops / none. Fix leaks into tokens.
- [x] **Step 4:** `pnpm --filter @driftly/web-staff dev`, visually compare each screen against `Coralyn - Gestionale Lidi.html` at 1280px (Mappa+drawer, Prenotazioni, Clienti, Scheda, Listino, Report, Stabilimento, Login, Registrazione). Note diffs; fix.
- [x] **Step 5: Commit** any fixes `git commit -am "fix(web-staff): rifiniture fedeltà Coralyn"`

### Task 26: Asset — Coralyn logo

**Files:** Copy `Redesign coralyn gestionale moderno/assets/coralyn-logo.png` → `apps/web-staff/public/coralyn-logo.png`; reference in Sidebar/AuthLayout/Stabilimento (replace inline-SVG placeholder if used). Decide gitignore vs commit for root bundle + Redesign folder (recommend: keep mockup under `docs/design/mockups/`, gitignore the root export dump).

- [x] **Step 1:** Copy asset, update `<img src>` paths.
- [x] **Step 2:** Add `/Coralyn - Gestionale Lidi.html` and `/Redesign coralyn gestionale moderno/` to `.gitignore` (export dump; canonical mockup is versioned under docs/).
- [x] **Step 3: Commit** `git commit -am "chore(web-staff): logo Coralyn + ignore export dump"`

---

## Self-review notes
- **Spec coverage:** tokens (T1), icons (T2), manifest (T3), all components incl. new Avatar/SegmentedControl/Modal/KpiCard/StatTile/charts (T4-13), shell/Topbar/AuthLayout/auth seam/routing (T14-17), all 10 views (T18-23), docs (T24), verify (T25), assets (T26). ✔
- **Auth seam** is explicitly mock (T14) — matches spec §7.3, out-of-scope §9.
- **Type consistency:** session adds `authenticated/utenteEmail/login()/logout()`; SegmentedControl `modelValue`/`options{value,label}`; Avatar `iniziali/size/tone`; Badge `tone`; Button `variant` incl. `secondary` — used consistently across shell/views.
- **Deferred:** real auth, global search, real notifications, user invites, scheda sub-sections → placeholders / `deferred.md` (note in T24 if new cuts emerge).
