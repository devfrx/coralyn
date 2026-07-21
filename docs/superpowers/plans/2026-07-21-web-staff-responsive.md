# Responsività app-wide `web-staff` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere `web-staff` responsive app-wide (tablet-first, mobile graceful) senza regressioni desktop.

**Architecture:** Contratto di breakpoint semantico su `lg` (1024): `< lg` = compatto (portrait/telefono) → nav off-canvas + griglie collassate; `≥ lg` = esteso (landscape/desktop) → identico a oggi. La nav diventa off-canvas riusando le primitive `Dialog` di reka-ui **dietro un nuovo primitivo ui-kit `NavDrawer`**; il contenuto nav vive in un solo `SidebarNav`. Le tabelle si risolvono una volta sola nel `DataTable` condiviso.

**Tech Stack:** Vue 3.5 `<script setup>`, Tailwind v4 (config in CSS `@theme`, default breakpoints), reka-ui (solo dietro ui-kit), Pinia, vue-router 5, Vitest + @vue/test-utils + jsdom, MSW.

## Global Constraints

- Soglia shell = `lg` (1024). Fascia **compatto** `< lg`, **esteso** `≥ lg`.
- Breakpoint = default Tailwind v4 (`sm 640 · md 768 · lg 1024 · xl 1280`). **Nessun** breakpoint custom (verificato: `theme.css` non li override).
- **Nessuna regressione ≥ lg**: il layout esteso deve restare identico a `main`.
- Solo **token semantici** (`var(--color-*)`), **mai** hex hardcoded.
- **reka-ui solo dietro ui-kit**: `web-staff` NON deve importare reka-ui né aggiungerlo alle sue deps.
- Riuso primitivi ui-kit esistenti; nuovi artefatti solo se necessari e non-duplicati.
- **Verifica per fase (regola cross-file / time-bomb):** dopo ogni task girare **l'intera suite** — da `apps/web-staff/`: `npx vitest run` (include già `packages/ui-kit/src/**/*.spec.ts`) — mai solo lo spec toccato. Typecheck: da `apps/web-staff/` `npx vue-tsc -b --noEmit`.
- Commit in italiano, stile conventional-commit del repo (`feat(scope):` / `test(scope):`), con trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Baseline di partenza: `main` verde. Branch di lavoro: `feat/web-staff-responsive` (già creato, con lo spec committato).

---

## FASE 1 — Fondazione (shell responsive + fix tabelle)

### Task 1: `NavDrawer` (nuovo primitivo ui-kit) + keyframe left-slide

**Files:**
- Modify: `packages/ui-kit/src/styles/theme.css` (aggiunta keyframe, dopo la riga 88)
- Create: `packages/ui-kit/src/components/NavDrawer.vue`
- Modify: `packages/ui-kit/src/index.ts:15` (export, accanto a `Drawer`)
- Test: `packages/ui-kit/src/components/NavDrawer.spec.ts`

**Interfaces:**
- Produces: componente `NavDrawer` con `defineModel<boolean>('open')` (v-model:open, required) e prop opzionale `title?: string` (default `'Menu di navigazione'`, resa `sr-only` per l'accessibilità). Slot default = contenuto della nav. Ancorato a **sinistra** (`left-0`, piena altezza), colore `--color-sidebar-bg`. Portalato (reka-ui `DialogPortal`) → nel DOM sotto `document.body`, `role="dialog"`, con overlay che chiude al click e chiusura su `Esc` (gratis da reka-ui).

- [ ] **Step 1: Scrivere il test che fallisce**

`packages/ui-kit/src/components/NavDrawer.spec.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import NavDrawer from './NavDrawer.vue';

const mountNav = async (props: Record<string, unknown> = {}, slot = '<nav data-test="nav-content">voci</nav>') => {
  const w = mount(NavDrawer, { props: { open: true, ...props }, slots: { default: slot }, attachTo: document.body });
  await nextTick();
  return w;
};
afterEach(() => { document.body.innerHTML = ''; });

describe('NavDrawer', () => {
  it('quando open rende un dialog col contenuto slot', async () => {
    await mountNav();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('[data-test="nav-content"]')).not.toBeNull();
  });
  it('ha un titolo accessibile sr-only (default) senza chrome visibile titolo+X', async () => {
    await mountNav();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Menu di navigazione');
    const title = [...dialog.querySelectorAll('*')].find((el) => el.textContent === 'Menu di navigazione')!;
    expect(title.className).toContain('sr-only');
    expect(dialog.querySelector('button[aria-label="Chiudi"]')).toBeNull();
  });
  it('è ancorato a sinistra con lo sfondo sidebar e lo slide-in da sinistra', async () => {
    await mountNav();
    const cls = document.body.querySelector('[data-test="nav-drawer"]')!.getAttribute('class') ?? '';
    expect(cls).toContain('left-0');
    expect(cls).toContain('bg-[var(--color-sidebar-bg)]');
    expect(cls).toContain('data-[state=open]:[animation:nav-in');
  });
  it('quando chiuso non rende il dialog', async () => {
    await mountNav({ open: false });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire il test — deve fallire**

Run (da `apps/web-staff/`): `npx vitest run ../../packages/ui-kit/src/components/NavDrawer.spec.ts`
Expected: FAIL — `Failed to resolve import './NavDrawer.vue'`.

- [ ] **Step 3: Aggiungere le keyframe al tema**

In `packages/ui-kit/src/styles/theme.css`, subito dopo la riga 88 (`@keyframes drawer-out …`), aggiungere:
```css
@keyframes nav-in  { from { transform: translateX(-100%) } to { transform: translateX(0) } }
@keyframes nav-out { from { transform: translateX(0) } to { transform: translateX(-100%) } }
```
(reduced-motion le neutralizza già globalmente, riga 99.)

- [ ] **Step 4: Creare `NavDrawer.vue`**

`packages/ui-kit/src/components/NavDrawer.vue`:
```vue
<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'reka-ui';
const open = defineModel<boolean>('open', { required: true });
withDefaults(defineProps<{ title?: string }>(), { title: 'Menu di navigazione' });
</script>
<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-[rgba(11,53,67,.3)] data-[state=open]:[animation:overlay-in_var(--motion-base)_var(--ease-standard)] data-[state=closed]:[animation:overlay-out_var(--motion-fast)_var(--ease-standard)]" />
      <DialogContent
        data-test="nav-drawer"
        class="fixed inset-y-0 left-0 z-50 flex w-[248px] max-w-[86vw] flex-col bg-[var(--color-sidebar-bg)] text-[var(--color-on-sidebar)] [box-shadow:var(--shadow-drawer)] focus:outline-none data-[state=open]:[animation:nav-in_var(--motion-base)_var(--ease-emphasized)] data-[state=closed]:[animation:nav-out_var(--motion-fast)_var(--ease-standard)]">
        <DialogTitle class="sr-only">{{ title }}</DialogTitle>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
```

- [ ] **Step 5: Esportare da ui-kit**

In `packages/ui-kit/src/index.ts`, dopo la riga 15 (`export { default as Drawer } …`):
```ts
export { default as NavDrawer } from './components/NavDrawer.vue';
```

- [ ] **Step 6: Eseguire i test — devono passare**

Run (da `apps/web-staff/`): `npx vitest run ../../packages/ui-kit/src/components/NavDrawer.spec.ts`
Expected: PASS (4 test).

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit/src/components/NavDrawer.vue packages/ui-kit/src/components/NavDrawer.spec.ts packages/ui-kit/src/index.ts packages/ui-kit/src/styles/theme.css
git commit -m "feat(ui-kit): NavDrawer off-canvas sinistro per nav responsive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: fix scroll orizzontale `DataTable` (ui-kit condiviso)

**Files:**
- Modify: `packages/ui-kit/src/components/DataTable.vue:22-38` (template wrapper)
- Test: `packages/ui-kit/src/components/DataTable.spec.ts` (aggiunta 1 test; gli esistenti restano verdi)

**Interfaces:**
- Consumes: nulla di nuovo.
- Produces: `DataTable` invariato nell'API; il markup interno guadagna una regione `div.overflow-x-auto` tra il wrapper arrotondato e la `<table>`. Nessuna modifica alle `<th>/<td>`.

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere in `packages/ui-kit/src/components/DataTable.spec.ts`, dentro il primo `describe`:
```ts
it('avvolge la tabella in una regione con scroll orizzontale, preservando il radius sul contenitore', () => {
  const w = mount(DataTable, { props: { columns } });
  const scroll = w.find('div.overflow-x-auto');
  expect(scroll.exists()).toBe(true);
  expect(scroll.find('table').exists()).toBe(true);
  // il contenitore esterno mantiene radius + clip degli angoli
  expect(w.find('div.overflow-hidden').exists()).toBe(true);
});
```

- [ ] **Step 2: Eseguire il test — deve fallire**

Run (da `apps/web-staff/`): `npx vitest run ../../packages/ui-kit/src/components/DataTable.spec.ts`
Expected: FAIL — `div.overflow-x-auto` non esiste.

- [ ] **Step 3: Modificare il template di `DataTable.vue`**

Sostituire l'apertura del template (righe 22-23) e la chiusura (righe 37-38). Nuovo `<template>`:
```vue
<template>
  <div class="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] [box-shadow:var(--shadow-card)]">
    <div class="overflow-x-auto">
      <table class="w-full border-collapse text-[13px]">
        <thead>
          <tr class="bg-[var(--color-raised)]">
            <th v-for="c in columns" :key="c.key" :class="['border-b border-[var(--color-border)] px-[18px] py-3 text-[10.5px] font-semibold uppercase tracking-[.07em] text-[var(--color-text-muted)]', c.align === 'right' ? 'text-right' : 'text-left']">{{ c.label }}</th>
          </tr>
        </thead>
        <tbody v-if="rows">
          <tr v-for="(row, i) in rows" :key="key(row, i)" class="hover:bg-[var(--color-raised)]">
            <td v-for="(c, ci) in columns" :key="c.key" :class="cellClass(c, ci === 0)">
              <slot :name="`cell-${c.key}`" :row="row">{{ row[c.key] }}</slot>
            </td>
          </tr>
        </tbody>
        <tbody v-else><slot /></tbody>
      </table>
    </div>
  </div>
</template>
```
(Unica differenza rispetto all'originale: la `<table>` è ora annidata in `<div class="overflow-x-auto">`.)

- [ ] **Step 4: Eseguire i test — devono passare**

Run (da `apps/web-staff/`): `npx vitest run ../../packages/ui-kit/src/components/DataTable.spec.ts`
Expected: PASS (test esistenti + il nuovo).

- [ ] **Step 5: Commit**

```bash
git add packages/ui-kit/src/components/DataTable.vue packages/ui-kit/src/components/DataTable.spec.ts
git commit -m "fix(ui-kit): DataTable scrolla in orizzontale su schermo stretto

Wrapper interno overflow-x-auto: le tabelle dense non vengono piu clippate,
radius/clip degli angoli preservati sul contenitore esterno.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: estrazione `SidebarNav` + `Sidebar` guscio responsive

**Files:**
- Create: `apps/web-staff/src/app/SidebarNav.vue` (tutto lo script + il contenuto interno dell'attuale `Sidebar`)
- Modify: `apps/web-staff/src/app/Sidebar.vue` (diventa guscio `aside` `hidden lg:flex` che monta `SidebarNav`)
- Test: `apps/web-staff/src/app/Sidebar.spec.ts` (resta invariato e verde: monta `Sidebar`, che rende `SidebarNav` inline)

**Interfaces:**
- Produces: `SidebarNav` — componente senza prop, contiene logo, switcher stabilimento, `nav[]`, footer utente/logout. Nessun bg/width propri (li fornisce l'host). Renderizzabile sia nell'`aside` desktop sia nello slot di `NavDrawer`.
- Consumes: `useSessionStore`, `useActiveSeason`, `Role`, `Icon` (come l'attuale Sidebar).

- [ ] **Step 1: Creare `SidebarNav.vue`** (sposta lo script attuale di `Sidebar.vue` + il contenuto interno dell'`<aside>`, senza `w-[248px]`/`flex-none`/`bg`)

`apps/web-staff/src/app/SidebarNav.vue`:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@coralyn/ui-kit';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useActiveSeason } from '@/lib/useActiveSeason';
const session = useSessionStore();
const router = useRouter();
const { name: seasonName } = useActiveSeason();
const roleLabel = computed(() =>
  session.role === Role.Admin ? 'Amministratore' : session.role === Role.Superuser ? 'Superuser' : 'Staff',
);
const nav = [
  { to: '/map', label: 'Mappa', icon: 'map' },
  { to: '/bookings', label: 'Prenotazioni', icon: 'calendar' },
  { to: '/rentals', label: 'Noleggi', icon: 'waves' },
  { to: '/renewals', label: 'Rinnovi', icon: 'renew' },
  { to: '/customers', label: 'Clienti', icon: 'users' },
  { to: '/pricing', label: 'Listino', icon: 'tag' },
  { to: '/rentals/catalogo', label: 'Listino noleggi', icon: 'layers' },
  { to: '/report', label: 'Report', icon: 'chart' },
];
const initials = computed(() => session.userEmail.slice(0, 2).toUpperCase());
function signOut() { session.logout(); router.push('/login'); }
</script>
<template>
  <div class="flex h-full flex-col px-3.5 pb-3.5 pt-[18px] text-[var(--color-on-sidebar)]">
    <div class="flex items-center gap-2.5 px-1.5 pb-[18px] pt-1">
      <img src="/coralyn-logo.png" alt="Coralyn" class="size-[38px] rounded-[11px] object-cover" style="box-shadow:0 2px 8px rgba(0,0,0,.22);" />
      <div class="leading-tight">
        <div class="text-[17px] font-bold tracking-[-.01em] text-[var(--color-on-sidebar-strong)]">Coralyn</div>
        <div class="text-[10.5px] font-medium uppercase tracking-[.08em] text-[var(--color-on-sidebar-muted)]">Gestionale lidi</div>
      </div>
    </div>
    <button @click="router.push('/establishment')" class="mb-[18px] flex w-full items-center gap-2.5 rounded-[11px] border border-[var(--color-sidebar-border)] bg-[var(--color-sidebar-raised)] px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]">
      <span class="grid size-[30px] flex-none place-items-center rounded-lg text-white" style="background:linear-gradient(150deg,#85B4B2,#5E9AA6);"><Icon name="waves" :size="17" /></span>
      <span class="flex-1 leading-tight">
        <span class="block text-[13px] font-semibold text-[var(--color-on-sidebar-strong)]">{{ session.establishmentName }}</span>
        <span v-if="seasonName" class="block text-[10.5px] text-[var(--color-on-sidebar-muted)]">{{ seasonName }}</span>
      </span>
      <Icon name="chevron-down" :size="16" class="flex-none text-[var(--color-on-sidebar-muted)]" />
    </button>
    <div class="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[.1em] text-[var(--color-on-teal-eyebrow)]">Operativo</div>
    <nav class="flex flex-col gap-[3px]">
      <RouterLink v-for="it in nav" :key="it.to" :to="it.to" custom v-slot="{ isActive, navigate }">
        <button @click="navigate" :aria-current="isActive ? 'page' : undefined"
          class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-sm focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          :class="isActive ? 'bg-[var(--color-sidebar-raised)] font-semibold text-[var(--color-on-sidebar-strong)]' : 'font-medium text-[var(--color-on-sidebar)] hover:bg-white/5'">
          <Icon :name="it.icon" :size="20" class="flex-none" />
          <span class="flex-1 text-left">{{ it.label }}</span>
          <span v-if="isActive" class="size-1.5 rounded-full bg-[var(--color-brand)]"></span>
        </button>
      </RouterLink>
    </nav>
    <div class="mt-auto flex flex-col gap-[3px]">
      <div class="mx-2 my-3 h-px bg-[var(--color-sidebar-divider)]"></div>
      <div class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2.5">
        <span class="grid size-8 flex-none place-items-center rounded-full bg-[var(--color-brand)] text-[12px] font-semibold text-white">{{ initials }}</span>
        <span class="min-w-0 flex-1 leading-tight">
          <span class="block truncate text-[12px] font-semibold text-[var(--color-on-sidebar-strong)]">{{ session.userEmail }}</span>
          <span class="block text-[10.5px] text-[var(--color-on-sidebar-muted)]">{{ roleLabel }}</span>
        </span>
        <button @click="signOut" aria-label="Esci" title="Esci" class="grid size-[30px] flex-none place-items-center rounded-lg text-[var(--color-on-sidebar-muted)] hover:bg-white/5 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"><Icon name="logout" :size="18" /></button>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Sostituire `Sidebar.vue` con il guscio responsive**

`apps/web-staff/src/app/Sidebar.vue` (intero file):
```vue
<script setup lang="ts">
import SidebarNav from './SidebarNav.vue';
</script>
<template>
  <aside class="hidden w-[248px] flex-none flex-col bg-[var(--color-sidebar-bg)] lg:flex">
    <SidebarNav />
  </aside>
</template>
```

- [ ] **Step 3: Eseguire i test — Sidebar.spec deve restare verde**

Run (da `apps/web-staff/`): `npx vitest run src/app/Sidebar.spec.ts`
Expected: PASS (5 test) — `mount(Sidebar)` rende `SidebarNav` inline, quindi nome stabilimento/ruolo/stagione restano nel testo. Nota: la classe `hidden` non rimuove dal DOM (Tailwind è solo CSS; in jsdom il contenuto è presente).

- [ ] **Step 4: Typecheck**

Run (da `apps/web-staff/`): `npx vue-tsc -b --noEmit`
Expected: nessun errore.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/app/SidebarNav.vue apps/web-staff/src/app/Sidebar.vue
git commit -m "refactor(web-staff): estrai SidebarNav, Sidebar diventa guscio hidden lg:flex

Contenuto nav in un solo posto, riusabile sia nell'aside desktop sia nel
drawer mobile. Nessun cambiamento di comportamento.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: composable `useMediaQuery` (difensivo per jsdom)

**Files:**
- Create: `apps/web-staff/src/lib/useMediaQuery.ts`
- Test: `apps/web-staff/src/lib/useMediaQuery.spec.ts`

**Interfaces:**
- Produces: `useMediaQuery(query: string): Ref<boolean>` — reattivo a `window.matchMedia`. Se `window.matchMedia` non esiste (jsdom di default), ritorna un `ref(false)` inerte senza lanciare. Registra il listener `change` e lo rimuove `onScopeDispose`.

- [ ] **Step 1: Scrivere il test che fallisce**

`apps/web-staff/src/lib/useMediaQuery.spec.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { useMediaQuery } from './useMediaQuery';

type Listener = (e: { matches: boolean }) => void;
function fakeMatchMedia(initial: boolean) {
  let listener: Listener | null = null;
  const mql = {
    matches: initial,
    addEventListener: (_: string, l: Listener) => { listener = l; },
    removeEventListener: vi.fn(),
    // emette un cambio simulando il browser
    _emit(v: boolean) { mql.matches = v; listener?.({ matches: v }); },
  };
  return mql;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('useMediaQuery', () => {
  it('senza window.matchMedia ritorna false senza lanciare', () => {
    vi.stubGlobal('matchMedia', undefined);
    const scope = effectScope();
    scope.run(() => { expect(useMediaQuery('(min-width: 1024px)').value).toBe(false); });
    scope.stop();
  });

  it('riflette il valore iniziale e reagisce ai cambi', async () => {
    const mql = fakeMatchMedia(false);
    vi.stubGlobal('matchMedia', () => mql);
    const scope = effectScope();
    let r!: { value: boolean };
    scope.run(() => { r = useMediaQuery('(min-width: 1024px)'); });
    expect(r.value).toBe(false);
    mql._emit(true);
    await nextTick();
    expect(r.value).toBe(true);
    scope.stop();
    expect(mql.removeEventListener).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Eseguire il test — deve fallire**

Run (da `apps/web-staff/`): `npx vitest run src/lib/useMediaQuery.spec.ts`
Expected: FAIL — `Failed to resolve import './useMediaQuery'`.

- [ ] **Step 3: Implementare il composable**

`apps/web-staff/src/lib/useMediaQuery.ts`:
```ts
import { ref, onScopeDispose, type Ref } from 'vue';

/** Ref reattivo a una media query. Difensivo: se matchMedia non c'è (jsdom), resta false. */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return matches;
  const mql = window.matchMedia(query);
  matches.value = mql.matches;
  const onChange = (e: MediaQueryListEvent | { matches: boolean }) => { matches.value = e.matches; };
  mql.addEventListener('change', onChange as (e: MediaQueryListEvent) => void);
  onScopeDispose(() => mql.removeEventListener('change', onChange as (e: MediaQueryListEvent) => void));
  return matches;
}
```

- [ ] **Step 4: Eseguire i test — devono passare**

Run (da `apps/web-staff/`): `npx vitest run src/lib/useMediaQuery.spec.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/lib/useMediaQuery.ts apps/web-staff/src/lib/useMediaQuery.spec.ts
git commit -m "feat(web-staff): composable useMediaQuery (difensivo per jsdom)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: hamburger in `Topbar` (emit `open-nav`)

**Files:**
- Modify: `apps/web-staff/src/app/Topbar.vue` (emit + bottone hamburger `lg:hidden`)
- Test: `apps/web-staff/src/app/Topbar.spec.ts` (aggiunta 1 test; gli esistenti restano verdi)

**Interfaces:**
- Produces: `Topbar` emette `open-nav` (nessun payload) al click sull'hamburger. Il bottone ha `aria-label="Apri menu"` e classe `lg:hidden` (visibile solo `< lg`); resta nel DOM in jsdom.

- [ ] **Step 1: Scrivere il test che fallisce**

Aggiungere in `apps/web-staff/src/app/Topbar.spec.ts`, dentro `describe('Topbar — navigazione data')`:
```ts
it('il bottone hamburger (visibile solo < lg) emette open-nav al click', async () => {
  const w = await mountAt('/customers');
  const burger = w.find('button[aria-label="Apri menu"]');
  expect(burger.exists()).toBe(true);
  expect(burger.classes()).toContain('lg:hidden');
  await burger.trigger('click');
  expect(w.emitted('open-nav')).toBeTruthy();
});
```

- [ ] **Step 2: Eseguire il test — deve fallire**

Run (da `apps/web-staff/`): `npx vitest run src/app/Topbar.spec.ts`
Expected: FAIL — bottone `aria-label="Apri menu"` non trovato.

- [ ] **Step 3: Modificare `Topbar.vue`**

Nello `<script setup>`, dopo la riga `const route = useRoute();` (riga 7), aggiungere l'emit:
```ts
const emit = defineEmits<{ 'open-nav': [] }>();
```
Nel `<template>`, come **primo** figlio dentro `<header …>` (prima del `<div class="min-w-0">`), inserire (`Icon` è già importato in `Topbar.vue`, riga 4):
```vue
<button aria-label="Apri menu" class="grid size-9 flex-none place-items-center rounded-[10px] text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] lg:hidden" @click="emit('open-nav')">
  <Icon name="menu" :size="20" />
</button>
```

- [ ] **Step 3b: Registrare l'icona `menu` (verificato assente dal registry)**

In `packages/ui-kit/src/icons/registry.ts`: aggiungere l'import dopo la riga 39 (`import IconSmartphone …`):
```ts
import IconMenu from '~icons/lucide/menu';
```
e la voce nella mappa `icons` (accanto a `smartphone: IconSmartphone,` alla riga 52):
```ts
  menu: IconMenu,
```

- [ ] **Step 4: Eseguire i test — devono passare**

Run (da `apps/web-staff/`): `npx vitest run src/app/Topbar.spec.ts`
Expected: PASS (esistenti + il nuovo).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/app/Topbar.vue apps/web-staff/src/app/Topbar.spec.ts packages/ui-kit/src/icons/registry.ts
git commit -m "feat(web-staff): hamburger nella Topbar (emit open-nav, lg:hidden)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: cablaggio `AppShell` (stato nav + NavDrawer + chiusura su route/breakpoint)

**Files:**
- Modify: `apps/web-staff/src/app/AppShell.vue`
- Test: `apps/web-staff/src/app/AppShell.spec.ts` (nuovo)

**Interfaces:**
- Consumes: `NavDrawer` (ui-kit), `SidebarNav` (Task 3), `Topbar` `@open-nav` (Task 5), `useMediaQuery` (Task 4).
- Produces: shell con `navOpen` ref; hamburger apre il drawer; il drawer si chiude su cambio route e al passaggio `≥ lg`.

- [ ] **Step 1: Scrivere i test che falliscono**

`apps/web-staff/src/app/AppShell.spec.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import AppShell from './AppShell.vue';

const Blank = { template: '<div />' };
function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/customers', name: 'customers', component: Blank, meta: { title: 'Clienti' } },
      { path: '/report', name: 'report', component: Blank, meta: { title: 'Report' } },
    ],
  });
}
async function mountShell() {
  const router = makeRouter();
  router.push('/customers');
  await router.isReady();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const w = mount(AppShell, {
    global: { plugins: [createPinia(), [VueQueryPlugin, { queryClient }], router] },
    attachTo: document.body,
  });
  await flushPromises();
  return { w, router };
}
afterEach(() => { document.body.innerHTML = ''; });

describe('AppShell', () => {
  it('il click sull hamburger apre il NavDrawer', async () => {
    const { w } = await mountShell();
    expect(document.body.querySelector('[data-test="nav-drawer"]')).toBeNull();
    await w.find('button[aria-label="Apri menu"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-test="nav-drawer"]')).not.toBeNull();
  });

  it('cambiare route chiude il NavDrawer', async () => {
    const { w, router } = await mountShell();
    await w.find('button[aria-label="Apri menu"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[data-test="nav-drawer"]')).not.toBeNull();
    await router.push('/report');
    await flushPromises();
    expect(document.body.querySelector('[data-test="nav-drawer"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Eseguire i test — devono fallire**

Run (da `apps/web-staff/`): `npx vitest run src/app/AppShell.spec.ts`
Expected: FAIL — nessun hamburger cablato / nessun NavDrawer.

- [ ] **Step 3: Modificare `AppShell.vue`**

`apps/web-staff/src/app/AppShell.vue` (intero file):
```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { NavDrawer } from '@coralyn/ui-kit';
import Topbar from './Topbar.vue';
import Sidebar from './Sidebar.vue';
import SidebarNav from './SidebarNav.vue';
import ToastHost from './ToastHost.vue';
import { useMediaQuery } from '@/lib/useMediaQuery';
const route = useRoute();
const navOpen = ref(false);
// Chiudi il drawer su ogni navigazione (voci nav, switcher, logout).
watch(() => route.fullPath, () => { navOpen.value = false; });
// Chiudi il drawer quando si entra in fascia esteso (>= lg), per non lasciare overlay fantasma al resize.
const isDesktop = useMediaQuery('(min-width: 1024px)');
watch(isDesktop, (v) => { if (v) navOpen.value = false; });
</script>
<template>
  <RouterView v-if="route.meta.bare" />
  <div v-else class="flex h-screen min-h-[620px] bg-[var(--color-canvas)] text-[var(--color-text)]">
    <Sidebar />
    <main class="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <Topbar @open-nav="navOpen = true" />
      <div class="min-h-0 flex-1 overflow-auto"><RouterView /></div>
    </main>
  </div>
  <NavDrawer v-model:open="navOpen"><SidebarNav /></NavDrawer>
  <ToastHost />
</template>
```

- [ ] **Step 4: Eseguire i test — devono passare**

Run (da `apps/web-staff/`): `npx vitest run src/app/AppShell.spec.ts`
Expected: PASS (2 test).

- [ ] **Step 5: Suite intera + typecheck (fine Fase 1)**

Run (da `apps/web-staff/`): `npx vitest run` poi `npx vue-tsc -b --noEmit`
Expected: tutti verdi (baseline + i nuovi test), typecheck pulito.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/app/AppShell.vue apps/web-staff/src/app/AppShell.spec.ts
git commit -m "feat(web-staff): shell responsive — NavDrawer + hamburger, chiusura su route/breakpoint

Sotto lg la sidebar diventa off-canvas (drawer) apribile dall'hamburger;
si chiude su navigazione e al passaggio >= lg. Nessuna regressione >= lg.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## FASE 2 — Griglie contenuto (scala di collasso coerente)

### Task 7: applicare la scala di collasso a tutte le viste

Modifiche **solo di classi** (non testabili in jsdom: la verifica è typecheck pulito + suite verde + prova visiva). Scala (dallo spec §5): `grid-cols-4`→`grid-cols-2 lg:grid-cols-4`; `grid-cols-3`→`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`; `grid-cols-2` (form)→`grid-cols-1 sm:grid-cols-2`; `[1.6fr_1fr]`→`grid-cols-1 lg:grid-cols-[1.6fr_1fr]`; `[300px_1fr]`→`grid-cols-1 lg:grid-cols-[300px_1fr]`.

**Files (edit di classi, riga indicativa dallo scan — confermare col contesto):**
- `apps/web-staff/src/features/report/ReportView.vue`: `:32` `grid-cols-4`→`grid-cols-2 lg:grid-cols-4`; `:39` `grid-cols-[1.6fr_1fr]`→`grid-cols-1 lg:grid-cols-[1.6fr_1fr]`
- `apps/web-staff/src/features/pricing/PricingView.vue`: `:426` e `:448` `grid-cols-4`→`grid-cols-2 lg:grid-cols-4`; `:465` e `:494` `grid-cols-3`→`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- `apps/web-staff/src/features/establishment/EstablishmentStructureView.vue`: `:206` `grid-cols-4`→`grid-cols-2 lg:grid-cols-4`; `:213` `grid-cols-[300px_1fr]`→`grid-cols-1 lg:grid-cols-[300px_1fr]`; `:329` e `:353` `grid-cols-3`→`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- `apps/web-staff/src/features/establishment/EstablishmentView.vue`: `:131` e `:149` `grid-cols-2`→`grid-cols-1 sm:grid-cols-2`
- `apps/web-staff/src/features/rentals/RentalCatalogView.vue`: `:204` e `:235` `grid-cols-4`→`grid-cols-2 lg:grid-cols-4`
- `apps/web-staff/src/features/customers/CustomerDetailView.vue`: `:158` `grid-cols-[1.6fr_1fr]`→`grid-cols-1 lg:grid-cols-[1.6fr_1fr]` (preservare `items-start gap-3.5` e i `min-w-0` sulle colonne); `:166` `grid-cols-2`→`grid-cols-1 sm:grid-cols-2`
- `apps/web-staff/src/features/customers/CustomerPaymentsCard.vue`: `:37` `grid-cols-2`→`grid-cols-1 sm:grid-cols-2`

- [ ] **Step 1: Applicare gli edit di classe** file per file, come sopra. Per ciascuno: aprire il file, individuare la classe esatta col Grep di contesto (i numeri di riga sono indicativi), sostituire **solo** la stringa `grid-cols-*` mantenendo il resto delle classi (gap, items, ecc.) invariato.

- [ ] **Step 2: Typecheck**

Run (da `apps/web-staff/`): `npx vue-tsc -b --noEmit`
Expected: nessun errore.

- [ ] **Step 3: Suite intera (regola cross-file)**

Run (da `apps/web-staff/`): `npx vitest run`
Expected: tutti verdi. Le griglie sono cambi di classe: nessuna assertion dovrebbe dipendere dalla stringa `grid-cols-*`; se qualche spec la asserisce, valutare se il test testava presentazione (allora aggiornarlo all'intento) — annotarlo nel messaggio di commit.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/features
git commit -m "feat(web-staff): scala di collasso griglie responsive su tutte le viste

grid-cols fisse -> ladder 1/2/lg-N; main/side e master/detail stack sotto lg.
Nessuna regressione >= lg.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## FASE 3 — Rifinitura

### Task 8: `MapView` — stack del layout a due pannelli sotto `lg`

**Files:**
- Modify: `apps/web-staff/src/features/map/MapView.vue:249` (contenitore a due pannelli)

Il piano mappa ha già `overflow-auto` e gli ombrelloni `flex-wrap` (riga 261-268): reggono già lo scroll/reflow. Il pezzo responsive è il contenitore a due pannelli (mappa + pannello dettaglio) alla riga 249, oggi `flex flex-1 items-stretch gap-[18px] …`: deve impilarsi sotto `lg`.

- [ ] **Step 1: Modificare la riga 249**

Cambiare `class="flex flex-1 items-stretch gap-[18px] px-[26px] pb-[26px] pt-4"` in:
`class="flex flex-1 flex-col items-stretch gap-[18px] px-[26px] pb-[26px] pt-4 lg:flex-row"`
(colonna sotto `lg`, riga affiancata `≥ lg`). Verificare nel file che il secondo pannello (dettaglio selezione, dopo la riga 269) non abbia una larghezza fissa che ne impedisca lo stack: se ha `w-[NNNpx]`, aggiungere `lg:` davanti così a colonna singola diventa full-width (`w-full lg:w-[NNNpx]`).

- [ ] **Step 2: Typecheck + suite**

Run (da `apps/web-staff/`): `npx vue-tsc -b --noEmit` poi `npx vitest run`
Expected: pulito e verde.

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/features/map/MapView.vue
git commit -m "feat(web-staff): MapView impila mappa e dettaglio sotto lg

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: `Topbar` a larghezza stretta (titolo troncabile)

**Files:**
- Modify: `apps/web-staff/src/app/Topbar.vue` (header a larghezza stretta)
- Test: `apps/web-staff/src/app/Topbar.spec.ts` resta verde

Con l'hamburger aggiunto (Task 5), su schermo molto stretto `header` ha hamburger + titolo (`whitespace-nowrap`) + date-nav: il titolo `whitespace-nowrap` può forzare overflow. Renderlo troncabile.

- [ ] **Step 1: Modificare le classi del titolo**

Nel `<h1>` (riga 30) sostituire `whitespace-nowrap` con `truncate` e assicurare che il contenitore `<div class="min-w-0">` resti (già presente, riga 29): `min-w-0` + `truncate` permettono al titolo di accorciarsi invece di spingere la date-nav fuori. Ridurre il gap header da `gap-[18px]` a `gap-3` per compattezza sotto `sm` è opzionale; se applicato, usare `gap-3 sm:gap-[18px]`.

- [ ] **Step 2: Suite (nessuna regressione)**

Run (da `apps/web-staff/`): `npx vitest run src/app/Topbar.spec.ts`
Expected: PASS (i test asseriscono testo/emit, non `whitespace-nowrap`).

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/app/Topbar.vue
git commit -m "fix(web-staff): titolo Topbar troncabile su schermo stretto

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: pass di verifica responsive nel browser (mobile/tablet/desktop + dark)

Task di **sola verifica** (nessun codice a priori): guidare il dev server e ridimensionare per confermare che nulla si rompa a nessuna larghezza; correggere gli overflow eventualmente trovati.

- [ ] **Step 1: Avviare il dev server**

`preview_start` con `{name}` dal `.claude/launch.json` (crearlo se assente: `npm run dev` di `apps/web-staff`, porta Vite). **Nota (memoria host):** il FE dev parla col backend reale su :3000 + DB su :5433; senza backend la SPA redirige al login. La prova con login utente è in carico all'utente. Per la sola verifica di layout basta la pagina di login + le viste raggiungibili; se serve autenticazione, chiedere all'utente di loggarsi nella Browser pane.

- [ ] **Step 2: Verifica ai tre preset** con `resize_window` (mobile 375×812, tablet 768×1024, desktop 1280×800) su ogni route raggiungibile: nessuno scroll orizzontale del `body`, nav a drawer sotto `lg`, sidebar piena `≥ lg`, tabelle in scroll interno, griglie collassate. Ripetere con `colorScheme: 'dark'`.

- [ ] **Step 3: Correggere** eventuali overflow trovati (contenitore che sfonda → `min-w-0` / `flex-wrap` / larghezza fissa da prefissare `lg:`), poi ri-verificare. Ogni fix segue il ciclo: edit → typecheck → `npx vitest run` → commit dedicato.

- [ ] **Step 4: Prova finale** — screenshot ai tre preset (via `computer {action:"screenshot"}`) come evidenza; suite intera verde + typecheck pulito.

---

## Self-Review (autore del piano)

**Copertura spec:** §3 breakpoint → Global Constraints + Task 6/7. §4 shell → Task 1,3,5,6 (+4). §5 griglie → Task 7. §6 tabelle → Task 2. §7 casi speciali → Task 8,9,10. §8 fasi → 3 fasi. §9 verifica → step suite/typecheck per fase + Task 10. §10 rischi → componenti condivisi girati nella suite intera; overlay fantasma gestito in Task 6; `min-w-0` preservato in Task 7. Nessun gap.

**Placeholder:** nessun TBD/TODO; codice completo in ogni step di codice; l'unica indeterminatezza legittima è l'icona `menu` (Task 5, verifica registry) e il secondo pannello di MapView (Task 8, verifica larghezza fissa) — entrambe con istruzione esplicita di controllo, non placeholder.

**Coerenza tipi/nomi:** `NavDrawer` `v-model:open` (Task 1) usato in Task 6; `useMediaQuery(query): Ref<boolean>` (Task 4) usato in Task 6; evento `open-nav` (Task 5) ascoltato in Task 6; `SidebarNav` senza prop (Task 3) montato in Sidebar e in AppShell (Task 6). Allineati.
