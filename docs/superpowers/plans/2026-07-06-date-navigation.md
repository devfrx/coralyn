# Navigazione data operativa (`activeDate`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere `session.activeDate` navigabile giorno-per-giorno (frecce ±1) e a data arbitraria (picker), con default a "oggi operativo" Europe/Rome, mostrato solo su Mappa/Prenotazioni; scollegare l'hint erasure GDPR dalla data di navigazione.

**Architecture:** Slice **FE-only** (nessun backend). Si introduce `lib/dates.ts` con due util pure e testate (`addDays` UTC-safe DST, `todayIso()` Europe/Rome) che diventano l'unica fonte del "oggi operativo". Lo store default e i consumatori reattivi (mappa/prenotazioni via query-keys) reagiscono automaticamente al mutare di `activeDate`. La Topbar cabla i controlli ed è gated su route-meta `usesDate`. L'hint erasure legge `todayIso()` invece di `activeDate`.

**Tech Stack:** Vue 3 (`<script setup>`), Pinia, vue-router, Vitest, `@vue/test-utils`, msw (mock).

## Global Constraints

- **Package manager:** `corepack pnpm` — MAI `npm`. Se pnpm chiede di purgare `node_modules` senza TTY → `CI=true corepack pnpm install`.
- **Comandi test/typecheck (dalla root):**
  - web-staff unit: `corepack pnpm --filter web-staff test`
  - web-staff typecheck: `corepack pnpm --filter web-staff typecheck`
  - singolo file: `corepack pnpm --filter web-staff test -- <path>` (es. `src/lib/dates.spec.ts`)
- **Baseline da non regredire:** web-staff **227** test verdi · typecheck **EXIT 0**. Ogni task lascia il progetto verde.
- **Aritmetica date UTC-safe:** MAI `new Date(iso + 'T00:00:00')` (ora locale, deriva su DST). Usare parse/format in UTC.
- **Pattern test esistente:** Vitest `describe/it/expect`; util pure importate direttamente; componenti via `mountApp` da `@/test/utils`; store via `setActivePinia(createPinia())`.
- **Branch:** `date-navigation` (già creato). Nessun push su `main` senza ok esplicito.

---

### Task 1: util `lib/dates.ts` (`addDays` + `todayIso`)

**Files:**
- Create: `apps/web-staff/src/lib/dates.ts`
- Test: `apps/web-staff/src/lib/dates.spec.ts`

**Interfaces:**
- Consumes: nulla.
- Produces:
  - `export function addDays(iso: string, n: number): string` — dato `yyyy-mm-dd`, restituisce `yyyy-mm-dd` spostato di `n` giorni (n può essere negativo), aritmetica in UTC (DST-safe).
  - `export function todayIso(): string` — "oggi" nel fuso `Europe/Rome` come `yyyy-mm-dd`.

- [ ] **Step 1: Scrivere i test che falliscono**

Create `apps/web-staff/src/lib/dates.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addDays, todayIso } from './dates';

describe('addDays', () => {
  it('somma e sottrae giorni nello stesso mese', () => {
    expect(addDays('2026-07-06', 1)).toBe('2026-07-07');
    expect(addDays('2026-07-06', -1)).toBe('2026-07-05');
    expect(addDays('2026-07-06', 0)).toBe('2026-07-06');
  });
  it('attraversa il confine di mese', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });
  it('attraversa il confine di anno', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });
  it('gestisce l anno bisestile (29 feb 2028)', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });
  it('e DST-safe: attorno al cambio ora legale in Italia (29 mar 2026) resta stabile', () => {
    // La primavera 2026 in Europa: ora legale dal 29 marzo. L aritmetica UTC non deve saltare/duplicare un giorno.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    // ora solare (autunno): 25 ott 2026
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
  });
  it('e simmetrica: addDays(addDays(x, n), -n) === x', () => {
    expect(addDays(addDays('2026-03-29', 5), -5)).toBe('2026-03-29');
  });
});

describe('todayIso', () => {
  it('restituisce il formato yyyy-mm-dd', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('e coerente con la data odierna nel fuso Europe/Rome', () => {
    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    expect(todayIso()).toBe(expected);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che FALLISCA**

Run: `corepack pnpm --filter web-staff test -- src/lib/dates.spec.ts`
Expected: FAIL — `Failed to resolve import "./dates"` / `addDays is not a function`.

- [ ] **Step 3: Implementare le util**

Create `apps/web-staff/src/lib/dates.ts`:

```ts
// Util di data pure e timezone-safe per la navigazione operativa (activeDate).
// Fonte unica del "oggi operativo" (Europe/Rome, coerente ADR-0031).

/** Sposta una data ISO `yyyy-mm-dd` di `n` giorni (aritmetica in UTC → DST-safe). */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Oggi" nel fuso Europe/Rome come `yyyy-mm-dd` (en-CA formatta già ISO). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
```

- [ ] **Step 4: Eseguire il test e verificare che PASSI**

Run: `corepack pnpm --filter web-staff test -- src/lib/dates.spec.ts`
Expected: PASS (tutti i test di `addDays` e `todayIso`).

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/lib/dates.ts apps/web-staff/src/lib/dates.spec.ts
git commit -m "feat(web-staff): util date UTC-safe addDays + todayIso (Europe/Rome)"
```

---

### Task 2: default store `activeDate` = `todayIso()`

**Files:**
- Modify: `apps/web-staff/src/stores/session.ts:10`
- Test: `apps/web-staff/src/stores/session.spec.ts` (aggiunge un caso)

**Interfaces:**
- Consumes: `todayIso()` da `@/lib/dates` (Task 1).
- Produces: `session.activeDate` inizializzato a "oggi" invece della data fissa `'2026-06-27'`. Firma invariata (`ref<string>`).

- [ ] **Step 1: Scrivere il test che falliscono**

In `apps/web-staff/src/stores/session.spec.ts`, aggiungere in cima l'import e un nuovo blocco di test (dentro il `describe('session store', ...)` esistente, es. dopo il primo `it`):

```ts
// (in cima, insieme agli altri import)
import { todayIso } from '@/lib/dates';
```

```ts
  it('activeDate parte da oggi (todayIso), non da una data fissa', () => {
    const s = useSessionStore();
    expect(s.activeDate).toBe(todayIso());
    expect(s.activeDate).not.toBe('2026-06-27');
  });
```

- [ ] **Step 2: Eseguire il test e verificare che FALLISCA**

Run: `corepack pnpm --filter web-staff test -- src/stores/session.spec.ts`
Expected: FAIL — `expected '2026-06-27' to be '<oggi>'`.

- [ ] **Step 3: Implementare la modifica minima**

In `apps/web-staff/src/stores/session.ts`:
- Aggiungere l'import in cima (accanto agli altri `@/lib/...`):

```ts
import { todayIso } from '@/lib/dates';
```

- Sostituire la riga 10:

```ts
  const activeDate = ref<string>(todayIso()); // ISO yyyy-mm-dd — default: oggi operativo (Europe/Rome)
```

- [ ] **Step 4: Eseguire il test e verificare che PASSI**

Run: `corepack pnpm --filter web-staff test -- src/stores/session.spec.ts`
Expected: PASS (incluso il nuovo caso).

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/stores/session.ts apps/web-staff/src/stores/session.spec.ts
git commit -m "feat(web-staff): activeDate default a oggi (todayIso) invece della data fissa"
```

---

### Task 3: Topbar — frecce ±1 + picker + gating route-meta `usesDate`

**Files:**
- Modify: `apps/web-staff/src/app/Topbar.vue`
- Modify: `apps/web-staff/src/router/index.ts:10-11` (aggiunge `usesDate: true` a `/map` e `/bookings`)
- Test: `apps/web-staff/src/app/Topbar.spec.ts` (nuovo)

**Interfaces:**
- Consumes: `addDays` da `@/lib/dates` (Task 1); `session.activeDate` (Task 2); `route.meta.usesDate` (impostato in questo task).
- Produces: nessuna interfaccia riusata da task successivi (UI di consumo finale).

**Note di implementazione (per l'implementer):**
- Le frecce mutano `session.activeDate = addDays(session.activeDate, ±1)`.
- Il picker è un `<input type="date">` **trasparente sovrapposto** al label: cliccando l'area della data il click arriva all'input nativo che apre il calendario; lo `<span>` mostra la data formattata. Su scelta (`@change`) si aggiorna `activeDate` col valore `yyyy-mm-dd` (già ISO).
- Il navigatore è visibile **solo** se `route.meta.usesDate === true`.

- [ ] **Step 1: Scrivere il test che falliscono**

Create `apps/web-staff/src/app/Topbar.spec.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import Topbar from './Topbar.vue';
import { useSessionStore } from '@/stores/session';

const Blank = { template: '<div />' };

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/map', name: 'map', component: Blank, meta: { title: 'Mappa', usesDate: true } },
      { path: '/bookings', name: 'bookings', component: Blank, meta: { title: 'Prenotazioni', usesDate: true } },
      { path: '/customers', name: 'customers', component: Blank, meta: { title: 'Clienti' } },
    ],
  });
}

async function mountAt(path: string) {
  setActivePinia(createPinia());
  const router = makeRouter();
  router.push(path);
  await router.isReady();
  const w = mount(Topbar, { global: { plugins: [router] } });
  return w;
}

describe('Topbar — navigazione data', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('su /map il navigatore data è visibile e il label mostra activeDate formattata', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    expect(w.find('[data-testid="date-nav"]').exists()).toBe(true);
    expect(w.text()).toContain('lug'); // "lun 6 lug 2026" (it-IT), case-insensitive sul mese
  });

  it('la freccia › incrementa activeDate di 1 giorno', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    await w.find('[aria-label="Giorno successivo"]').trigger('click');
    expect(s.activeDate).toBe('2026-07-07');
  });

  it('la freccia ‹ decrementa activeDate di 1 giorno', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    await w.find('[aria-label="Giorno precedente"]').trigger('click');
    expect(s.activeDate).toBe('2026-07-05');
  });

  it('il picker imposta activeDate alla data scelta (salto arbitrario)', async () => {
    const w = await mountAt('/map');
    const s = useSessionStore();
    s.activeDate = '2026-07-06';
    await w.vm.$nextTick();
    const input = w.find('input[type="date"]');
    await input.setValue('2026-09-20');
    await input.trigger('change');
    expect(s.activeDate).toBe('2026-09-20');
  });

  it('su /customers (senza usesDate) il navigatore data è NASCOSTO', async () => {
    const w = await mountAt('/customers');
    expect(w.find('[data-testid="date-nav"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che FALLISCA**

Run: `corepack pnpm --filter web-staff test -- src/app/Topbar.spec.ts`
Expected: FAIL — nessun `[data-testid="date-nav"]`; le frecce non mutano `activeDate`; nessun `input[type="date"]`.

- [ ] **Step 3: Aggiungere `usesDate` alle route dipendenti dalla data**

In `apps/web-staff/src/router/index.ts`, aggiornare le righe di `/map` e `/bookings` aggiungendo `usesDate: true` al `meta`:

```ts
  { path: '/map', name: 'map', component: () => import('@/features/map/MapView.vue'), meta: { title: 'Mappa', subtitle: 'Lido Maestrale · 47 ombrelloni · vista per giornata', usesDate: true } },
  { path: '/bookings', name: 'bookings', component: () => import('@/features/bookings/BookingsView.vue'), meta: { title: 'Prenotazioni', subtitle: 'Prenotazioni e incassi della giornata', usesDate: true } },
```

- [ ] **Step 4: Cablare la Topbar (frecce + picker + gating)**

Sostituire il contenuto di `apps/web-staff/src/app/Topbar.vue` con:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Icon } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
import { addDays } from '@/lib/dates';
const route = useRoute();
const session = useSessionStore();
const title = computed(() => (route.meta.title as string | undefined) ?? '');
const subtitle = computed(() => (route.meta.subtitle as string | undefined) ?? '');
const showDateNav = computed(() => route.meta.usesDate === true);
const dateLabel = computed(() => {
  const d = new Date(session.activeDate + 'T00:00:00');
  const s = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
});
function shiftDay(n: number): void {
  session.activeDate = addDays(session.activeDate, n);
}
function onPickDate(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  if (v) session.activeDate = v;
}
</script>
<template>
  <header class="flex flex-none items-center gap-[18px] border-b border-[var(--color-border)] bg-[var(--color-raised)] px-[26px] py-4">
    <div class="min-w-0">
      <h1 class="whitespace-nowrap text-xl font-bold tracking-[-.015em] text-[var(--color-text)]">{{ title }}</h1>
      <p v-if="subtitle" class="mt-0.5 text-[12.5px] text-[var(--color-text-muted)]">{{ subtitle }}</p>
    </div>
    <div class="flex-1"></div>
    <div v-if="showDateNav" data-testid="date-nav" class="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5 [box-shadow:var(--shadow-soft)]">
      <button aria-label="Giorno precedente" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]" @click="shiftDay(-1)"><Icon name="chevron-left" :size="17" /></button>
      <label class="relative grid min-w-[128px] cursor-pointer place-items-center px-1">
        <span class="text-center text-[13px] font-semibold tabular-nums text-[var(--color-text)]">{{ dateLabel }}</span>
        <input type="date" aria-label="Scegli data" :value="session.activeDate" class="absolute inset-0 cursor-pointer opacity-0" @change="onPickDate" />
      </label>
      <button aria-label="Giorno successivo" class="grid size-7 place-items-center rounded-full text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]" @click="shiftDay(1)"><Icon name="chevron-right" :size="17" /></button>
    </div>
  </header>
</template>
```

- [ ] **Step 5: Eseguire il test e verificare che PASSI**

Run: `corepack pnpm --filter web-staff test -- src/app/Topbar.spec.ts`
Expected: PASS (visibilità gated, frecce ±1, picker, nascosto su /customers).

- [ ] **Step 6: Typecheck**

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff/src/app/Topbar.vue apps/web-staff/src/app/Topbar.spec.ts apps/web-staff/src/router/index.ts
git commit -m "feat(web-staff): naviga activeDate (frecce ±1 + picker) gated su route-meta usesDate"
```

---

### Task 4: scollegare l'hint erasure GDPR da `activeDate` → `todayIso()`

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue:33`
- Test: `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts` (mock `todayIso` per determinismo)

**Interfaces:**
- Consumes: `todayIso()` da `@/lib/dates` (Task 1).
- Produces: `hasActiveOrFuture` calcolato su `todayIso()` (oggi reale) invece di `session.activeDate` → l'hint non dipende più dalla data di navigazione.

**Perché il mock nel test:** il seed `c-1` ha `cb-1` con `endDate: '2027-09-15'` (confirmed). Con `todayIso()` (clock reale) il test resterebbe verde solo fino al 2027 → flaky nel tempo. Si mocka `todayIso()` a una data fissa per rendere il test deterministico e permanente.

- [ ] **Step 1: Aggiornare il test (mock `todayIso`) — deve fallire sull'implementazione attuale**

In `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`, in cima al file (dopo gli import esistenti) aggiungere il mock del modulo date con una data fissa di riferimento:

```ts
import { vi } from 'vitest'; // se non già importato tra le utility vitest in uso
vi.mock('@/lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/dates')>();
  return { ...actual, todayIso: () => '2026-07-06' };
});
```

> Nota: se il file importa già `vi` da `vitest`, non duplicare l'import; aggiungere solo il blocco `vi.mock(...)`. I `vi.mock` sono hoisted, quindi la posizione tra gli import è corretta.

Aggiungere inoltre un test esplicito che l'hint dipenda da `todayIso()` e NON da `activeDate` (dentro il `describe` che monta la scheda con admin; riusa gli helper `mountAndTrack`/`setRole`/`settle` già presenti nel file):

```ts
    it('l hint attive/future usa todayIso() e NON activeDate (indipendente dalla navigazione)', async () => {
      const s = useSessionStore(); // helper store già disponibile nel file; in alternativa importarlo
      s.activeDate = '2028-01-01'; // data di navigazione ben oltre gli endDate di c-1: se l hint usasse activeDate, sarebbe FALSE
      const w = mountAndTrack('c-1'); // c-1: cb-1 confirmed endDate 2027-09-15 → attiva rispetto a todayIso()=2026-07-06
      setRole(Role.Admin);
      await settle();
      const btn = w.find('[data-testid="delete-customer"]');
      expect(btn.attributes('disabled')).toBeDefined();
      expect(w.find('[data-testid="delete-customer-hint"]').exists()).toBe(true);
    });
```

> Se `useSessionStore` non è già importato/disponibile nel file di test, aggiungere `import { useSessionStore } from '@/stores/session';` e, se serve, `import { useSessionStore }`… (verificare gli import esistenti prima di duplicare).

- [ ] **Step 2: Eseguire il test e verificare lo stato**

Run: `corepack pnpm --filter web-staff test -- src/features/customers/CustomerDetailView.spec.ts`
Expected: il nuovo test `... usa todayIso() e NON activeDate` **FALLISCE** (l'implementazione attuale usa `session.activeDate = '2028-01-01'` → `hasActiveOrFuture` false → bottone non disabilitato). Gli altri test del file possono restare verdi (con `activeDate` di default il vecchio comportamento coincideva).

- [ ] **Step 3: Implementare la modifica minima**

In `apps/web-staff/src/features/customers/CustomerDetailView.vue`:
- Aggiungere l'import (accanto agli altri `@/lib/...`, es. dopo `import { pushToast } from '@/lib/toasts';`):

```ts
import { todayIso } from '@/lib/dates';
```

- Sostituire la riga 32-34 (`hasActiveOrFuture`):

```ts
const hasActiveOrFuture = computed(() =>
  (bookings.value ?? []).some((b) => b.status === 'confirmed' && b.endDate >= todayIso()),
);
```

> `session` resta usato per `session.role`; non rimuovere l'import dello store.

- [ ] **Step 4: Eseguire il test e verificare che PASSI**

Run: `corepack pnpm --filter web-staff test -- src/features/customers/CustomerDetailView.spec.ts`
Expected: PASS — incluso il nuovo test e i preesistenti (152: c-1 bloccato con `todayIso`=2026-07-06; 183: c-3 anonimizza).

- [ ] **Step 5: Suite completa web-staff + typecheck (no regressioni)**

Run: `corepack pnpm --filter web-staff test`
Expected: tutti verdi, conteggio ≥ **227 + i nuovi test** (dates: 8 · session: +1 · Topbar: 5 · CustomerDetail: +1).

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerDetailView.vue apps/web-staff/src/features/customers/CustomerDetailView.spec.ts
git commit -m "fix(web-staff): hint erasure GDPR usa todayIso() reale invece di activeDate"
```

---

## Verifica finale (dopo Task 4)

- [ ] Suite completa verde: `corepack pnpm --filter web-staff test` (≥ baseline 227 + nuovi).
- [ ] Typecheck EXIT 0: `corepack pnpm --filter web-staff typecheck`.
- [ ] Review whole-branch (a due stadi / opus) prima di proporre il merge FF su `main`.
- [ ] Verifica LIVE opzionale in dev (container): frecce/​picker su Mappa e Prenotazioni cambiano giorno; navigatore assente su Clienti/Listino/Report/Stabilimento; default = oggi.

## Note di scope (dalla spec)

- Nessun cambio backend (map/bookings prendono già `?date=`).
- Nessuna persistenza cross-reload (YAGNI su localStorage).
- Nessun limite di navigazione (passato/futuro liberi).
- Report ha un proprio selettore di periodo — non toccato.
- Nessun ADR necessario (data operativa già ADR-0031).
