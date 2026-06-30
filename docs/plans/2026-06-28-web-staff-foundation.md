# Web-staff — Foundation & First Vertical Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Prerequisiti d'esecuzione:** lavorare su un **branch** `feat/web-staff` creato da `main`
> (**niente worktree**: si lavora **sequenzialmente** col backend — vedi §Coordinamento). Il monorepo
> e `packages/contracts` **esistono già** su `main` (Opzione A confermata): questo piano **parte da
> `apps/web-staff`**.

**Goal:** Costruire il primo slice eseguibile dell'app staff — **app-shell + `@coralyn/ui-kit` + Clienti (su API reale) + Mappa (mockata MSW)** — come *walking skeleton* del frontend, in parallelo al [Piano 1 backend](2026-06-28-core-foundation.md), con `packages/contracts` come confine.

**Architecture:** Vue 3 + TS (strict) + Vite, **token-first** ([ADR-0017](../architecture/decisions/0017-design-system-frontend.md)): i token vivono in `@coralyn/ui-kit` e alimentano Tailwind (v4, CSS-first `@theme`). **Server-state con TanStack Query, stato UI con Pinia** ([ADR-0021](../architecture/decisions/0021-server-state-frontend.md)); componenti accessibili su **Reka UI**; icone **Iconify bundled/offline** (unplugin-icons + Lucide). Il FE costruisce contro `contracts` + **API mockata (MSW)**: Clienti colpisce l'API reale (proxy Vite); la Mappa è mockata.

**Tech Stack:** Vue 3.5, TypeScript ~5.6 (strict), Vite 6, Vitest + @vue/test-utils + jsdom, Pinia, Vue Router, @tanstack/vue-query, reka-ui, Tailwind CSS v4 (`@tailwindcss/vite`), unplugin-icons + @iconify-json/lucide, MSW v2, vite-plugin-pwa (Workbox). pnpm 10, Node 24.

**Riferimenti:** [design-system.md](../design/design-system.md) · [spec UI/UX](../specs/2026-06-28-frontend-ui-ux-design.md) · [ADR-0017](../architecture/decisions/0017-design-system-frontend.md)/[0018](../architecture/decisions/0018-linguaggio-visivo.md)/[0019](../architecture/decisions/0019-app-shell-e-ux.md)/[0020](../architecture/decisions/0020-resa-mappa.md)/[0021](../architecture/decisions/0021-server-state-frontend.md) · [data-model](../design/data-model.md) · [flows](../design/flows.md).

---

## Scelte tattiche di questo piano (rubrica)

- **Tailwind v4 (CSS-first, `@theme`)** invece di un preset JS: i token del `ui-kit` sono CSS
  variables in `@theme`, e le utility Tailwind ne derivano — **una sola fonte**, niente palette
  parallela ([ADR-0017](../architecture/decisions/0017-design-system-frontend.md)).
- **Vitest** (default Vue) come test runner; il backend usa Jest (Piano 1) — ognuno il proprio default.
- **Icone offline con `unplugin-icons` + `@iconify-json/lucide`** (build-time, tree-shaken); le icone
  **data-driven** di `Tipologia.icona` passano da un **registry curato** in `ui-kit` (offline +
  fallback), coerente con [ADR-0018](../architecture/decisions/0018-linguaggio-visivo.md)/[0020](../architecture/decisions/0020-resa-mappa.md).
- **MSW**: in **dev** mocka solo la **Mappa**; `/api/clienti` passa al backend reale via proxy Vite
  (`onUnhandledRequest: 'bypass'`). In **test** MSW (node) mocka tutto: niente backend vivo richiesto.
- **PWA**: `vite-plugin-pwa` con `devOptions.enabled: false` → in dev il service worker attivo è
  quello di **MSW**, in build/preview quello della **PWA**: nessun conflitto.
- **Validazione runtime (zod): fuori slice 1** — i `contracts` sono tipi TS ([D-021](../architecture/deferred.md)).
- **Ownership**: questo piano possiede `apps/web-staff` e `packages/ui-kit`, **consuma**
  `packages/contracts`; **non tocca `apps/api`/`prisma`**. I DTO mappa sono **proposti** a
  `contracts` (handshake, §Coordinamento) per l'allineamento col backend.

## File Structure

```
packages/
  contracts/src/index.ts        # MODIFY: + DTO mappa proposti (handshake)
  ui-kit/
    package.json                # @coralyn/ui-kit
    tsconfig.json
    src/
      index.ts                  # public exports
      styles/theme.css          # @theme {…} token (primitive+semantic) + base
      icons/registry.ts         # registry offline nome->icona (chrome + tipologie)
      components/
        Icon.vue  Button.vue  Card.vue  Badge.vue  Field.vue  Input.vue
        Drawer.vue  OmbrelloneCell.vue
      components/*.spec.ts       # test colocati
apps/
  web-staff/
    package.json                # @coralyn/web-staff
    index.html  vite.config.ts  vitest.config.ts  tsconfig*.json
    src/
      main.ts  App.vue
      styles/main.css           # @import "tailwindcss"; @import ui-kit theme; @source
      router/index.ts
      app/ AppShell.vue Topbar.vue Sidebar.vue
      stores/session.ts         # Pinia: tenant + data attiva + ruolo
      lib/ http.ts queryClient.ts queryKeys.ts
      mocks/ browser.ts server.ts handlers.ts data/seed.ts
      features/
        clienti/ ClientiView.vue useClienti.ts
        mappa/ MappaView.vue useMappaGiorno.ts
      test/ setup.ts utils.ts sanity.spec.ts
    public/ icons (PWA: pwa-192.png, pwa-512.png, favicon.svg)
```

## Coordinamento backend — handshake DTO (confine = `packages/contracts`)

Il FE **propone** in `contracts` i DTO mappa; il backend li rivede e li allinea al dominio
([ADR-0020](../architecture/decisions/0020-resa-mappa.md), [ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)).
Merge **piccoli e frequenti**. `Tipologia.icona` è additiva e porta la **chiave del registry icone**
(nome breve, es. `palmtree`) — non il nome Iconify completo; finché il backend non la espone, il FE usa
il **fallback**. `FasciaDTO` è una **proiezione ridotta** (`id/nome/ordine`, senza `oraInizio/oraFine`
del [data-model](../design/data-model.md)): sufficiente per la mappa, estendibile. Tenant via header
`X-Stabilimento-Id` ([ADR-0010](../architecture/decisions/0010-isolamento-multi-tenant.md)).

**Esecuzione sequenziale (non concorrente), su branch.** Il backend ha completato il Piano 1 **Task
1–2** (monorepo + `contracts`); questo slice è il **corrispettivo frontend** e si esegue **ora** su un
branch `feat/web-staff`. La verifica di **Clienti su API reale** richiede che il backend abbia esposto
`/clienti` (Piano 1 **Task 3–7**): finché non c'è, sviluppo e test usano **MSW** (anche per
`/clienti`), e la verifica end-to-end su API reale si fa quando il backend è pronto.

> **Ordine dei task = ordine delle dipendenze.** Eseguire in sequenza: ogni task assume i precedenti.

---

## Task 1: Scaffold `apps/web-staff` (Vue 3 + TS + Vite) e wiring workspace

**Files:**
- Create: `apps/web-staff/*` (via scaffolder)
- Modify: `apps/web-staff/package.json`

- [ ] **Step 1: Scaffolda l'app** (dalla radice del repo)

Run:
```bash
pnpm create vite@latest apps/web-staff --template vue-ts
```
Expected: crea `apps/web-staff/` con Vue 3 + TS (Vite). Non eseguire ancora l'install interno.

- [ ] **Step 2: Rinomina il pacchetto** — in `apps/web-staff/package.json` imposta `"name": "@coralyn/web-staff"` (lascia invariati `scripts`/`dependencies`/`devDependencies` generati; verranno estesi).

- [ ] **Step 3: Installa dal root** (il workspace include già `apps/*`)

Run: `pnpm install`
Expected: `apps/web-staff` agganciato al workspace; nessun errore.

- [ ] **Step 4: Avvia il dev server e verifica**

Run: `pnpm --filter @coralyn/web-staff dev`
Expected: Vite serve su `http://localhost:5173` la pagina starter Vue. Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff pnpm-lock.yaml
git commit -m "chore(web-staff): scaffold Vue 3 + TS + Vite app"
```

---

## Task 2: `@coralyn/ui-kit` — skeleton e token (`@theme`)

**Files:**
- Create: `packages/ui-kit/package.json`, `packages/ui-kit/tsconfig.json`,
  `packages/ui-kit/src/index.ts`, `packages/ui-kit/src/styles/theme.css`
- Modify: `apps/web-staff/package.json`

- [ ] **Step 1: `packages/ui-kit/package.json`**

```json
{
  "name": "@coralyn/ui-kit",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./styles/theme.css": "./src/styles/theme.css"
  },
  "peerDependencies": { "vue": "^3.5.0" },
  "dependencies": { "reka-ui": "^2.0.0", "@coralyn/contracts": "workspace:*" }
}
```
> Consumiamo il `ui-kit` come **sorgente** (no build step): Vite/Vitest compilano i `.vue`/`.ts`.

- [ ] **Step 2: `packages/ui-kit/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "noEmit": true,
    "types": ["vite/client", "unplugin-icons/types/vue"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: `packages/ui-kit/src/styles/theme.css`** — token da [design-system.md](../design/design-system.md)

```css
@theme {
  /* primitive */
  --color-teal-700: #155A73; --color-teal-500: #1F6F8B; --color-teal-100: #DCECF2;
  --color-navy-900: #0F3A4A; --color-navy-700: #1B5167;
  --color-sand-400: #E0A24E; --color-sand-100: #FBF3DE;
  --color-cool-0: #FFFFFF; --color-cool-50: #F5F7F9; --color-cool-100: #ECF0F3;
  --color-cool-150: #E9EFF2; --color-cool-200: #D8E0E6; --color-cool-300: #C2CCD4;
  --color-cool-400: #99A4AE; --color-cool-500: #66727E; --color-cool-700: #46535F;
  --color-cool-900: #23323F;
  --color-green-500: #3F9D5B; --color-amber-500: #E8A93C; --color-red-500: #D6453D; --color-blue-500: #4F86E0;
  --color-state-libero: #7BB661; --color-state-libero-ink: #1E3A16;
  --color-state-abbonato: #5B8DEF; --color-state-abbonato-ink: #102945;
  --color-state-giornaliero: #E8843C; --color-state-giornaliero-ink: #3A1E08;
  --color-state-prenotato: #F0C24A; --color-state-prenotato-ink: #4A3711;

  /* semantic (alias) */
  --color-canvas: var(--color-cool-150);
  --color-bg: var(--color-cool-50);
  --color-surface: var(--color-cool-0);
  --color-sunken: var(--color-cool-100);
  --color-border: var(--color-cool-200);
  --color-text: var(--color-cool-900);
  --color-text-muted: var(--color-cool-500);
  --color-brand: var(--color-teal-500);
  --color-brand-hover: var(--color-teal-700);
  --color-brand-tint: var(--color-teal-100);
  --color-on-navy: #CFE2EA;

  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --radius-sm: 6px; --radius-md: 8px; --radius-lg: 12px; --radius-full: 999px;
  --shadow-xs: 0 1px 2px rgba(15,58,74,.10);
  --shadow-sm: 0 2px 10px rgba(15,58,74,.10);
  --shadow-md: 0 8px 24px rgba(15,58,74,.14);
  --shadow-lg: 0 16px 40px rgba(15,58,74,.18);
  --ease-standard: cubic-bezier(.2,0,.2,1);
  --ease-emphasized: cubic-bezier(.2,0,0,1);
}

:root { --shadow-focus: 0 0 0 2px var(--color-surface), 0 0 0 4px var(--color-brand); }
* { box-sizing: border-box; }
body { font-family: var(--font-sans); color: var(--color-text); background: var(--color-bg); margin: 0; }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
```

- [ ] **Step 4: `packages/ui-kit/src/index.ts`** (placeholder, riempito nei task successivi)

```ts
export {};
```

- [ ] **Step 5: Aggiungi `ui-kit` come dipendenza di `web-staff`**

Run: `pnpm --filter @coralyn/web-staff add @coralyn/ui-kit@workspace:*`
Expected: in `apps/web-staff/package.json` compare `"@coralyn/ui-kit": "workspace:*"`.

- [ ] **Step 6: Commit**

```bash
git add packages/ui-kit apps/web-staff/package.json pnpm-lock.yaml
git commit -m "feat(ui-kit): package skeleton + design tokens (@theme)"
```

---

## Task 3: Tailwind v4 sui token + consumo del tema nel `web-staff`

**Files:**
- Create: `apps/web-staff/src/styles/main.css`
- Modify: `apps/web-staff/vite.config.ts`, `apps/web-staff/src/main.ts`, `apps/web-staff/src/App.vue`

- [ ] **Step 1: Installa Tailwind v4**

Run: `pnpm --filter @coralyn/web-staff add -D tailwindcss @tailwindcss/vite`

- [ ] **Step 2: `apps/web-staff/vite.config.ts`** (Vue + Tailwind + alias + proxy API)

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    proxy: {
      // Clienti -> API reale (Piano 1) senza CORS; MSW in dev bypassa /api non gestiti.
      '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
});
```

- [ ] **Step 3: `apps/web-staff/src/styles/main.css`**

```css
@import "tailwindcss";
@import "@coralyn/ui-kit/styles/theme.css";
/* Tailwind v4 deve scansionare anche i componenti del ui-kit per le classi usate */
@source "../../../../packages/ui-kit/src";
```

- [ ] **Step 4: importa la CSS in `apps/web-staff/src/main.ts`**

```ts
import { createApp } from 'vue';
import App from './App.vue';
import './styles/main.css';

createApp(App).mount('#app');
```

- [ ] **Step 5: `apps/web-staff/src/App.vue`** (prova-token temporanea)

```vue
<template>
  <main class="p-6">
    <h1 class="text-2xl font-semibold text-[var(--color-brand)]">Coralyn · web-staff</h1>
    <p class="text-[var(--color-text-muted)]">Tailwind sui token attivo.</p>
  </main>
</template>
```

- [ ] **Step 6: Verifica** — `pnpm --filter @coralyn/web-staff dev`
Expected: titolo teal (`#1F6F8B`), paragrafo grigio muto; nessun warning Tailwind. Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff
git commit -m "feat(web-staff): wire Tailwind v4 on ui-kit tokens"
```

---

## Task 4: Test infrastructure (Vitest) + componente `<Icon>` offline (TDD)

**Files:**
- Create: `apps/web-staff/vitest.config.ts`, `apps/web-staff/src/test/setup.ts`,
  `apps/web-staff/src/test/sanity.spec.ts`, `packages/ui-kit/src/icons/registry.ts`,
  `packages/ui-kit/src/components/Icon.vue`, `packages/ui-kit/src/components/Icon.spec.ts`
- Modify: `apps/web-staff/vite.config.ts`, `apps/web-staff/package.json`, il tsconfig che compila
  `src` (di solito `apps/web-staff/tsconfig.app.json`), `packages/ui-kit/src/index.ts`

- [ ] **Step 1: Installa Vitest, test-utils e il sistema icone**

Run:
```bash
pnpm --filter @coralyn/web-staff add -D vitest @vue/test-utils jsdom unplugin-icons @iconify-json/lucide
```

- [ ] **Step 2: `apps/web-staff/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import Icons from 'unplugin-icons/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue(), Icons({ compiler: 'vue3' })],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.ts', '../../packages/ui-kit/src/**/*.spec.ts'],
  },
});
```

- [ ] **Step 3: `apps/web-staff/src/test/setup.ts`** (minimale; il server MSW si collega qui nel Task 9)

```ts
// Setup di test condiviso. Il server MSW viene collegato qui nel Task 9.
export {};
```

- [ ] **Step 4: sanity test — `apps/web-staff/src/test/sanity.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';

describe('vitest', () => {
  it('esegue i test', () => expect(1 + 1).toBe(2));
});
```

- [ ] **Step 5: script in `apps/web-staff/package.json`** (`scripts`)

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "vue-tsc --noEmit"
  }
}
```

- [ ] **Step 6: verifica il runner** — `pnpm --filter @coralyn/web-staff test`
Expected: PASS (1 test, sanity).

- [ ] **Step 7: abilita unplugin-icons** — in `apps/web-staff/vite.config.ts` aggiungi
`import Icons from 'unplugin-icons/vite';` e `Icons({ compiler: 'vue3' })` ai `plugins`. Nel tsconfig
che compila `src` aggiungi `"unplugin-icons/types/vue"` a `compilerOptions.types`.

- [ ] **Step 8: `packages/ui-kit/src/icons/registry.ts`** — registry offline (chrome + tipologie)

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
import IconPalm from '~icons/lucide/palmtree';
import IconLeaf from '~icons/lucide/leaf';
import IconPlus from '~icons/lucide/plus';
import IconStar from '~icons/lucide/star';
import IconCheck from '~icons/lucide/check';
import IconX from '~icons/lucide/x';
import IconChevronLeft from '~icons/lucide/chevron-left';
import IconChevronRight from '~icons/lucide/chevron-right';

/** Nomi consentiti (chrome + Tipologia.icona). Confine offline + fallback. */
export const icons: Record<string, Component> = {
  map: IconMap, calendar: IconCalendar, users: IconUsers, tag: IconTag, chart: IconChart,
  shield: IconShield, search: IconSearch, umbrella: IconUmbrella, palmtree: IconPalm,
  leaf: IconLeaf, plus: IconPlus, star: IconStar, check: IconCheck, x: IconX,
  'chevron-left': IconChevronLeft, 'chevron-right': IconChevronRight,
};

export const FALLBACK_ICON = 'umbrella';
```

- [ ] **Step 9: test che fallisce — `packages/ui-kit/src/components/Icon.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Icon from './Icon.vue';

describe('Icon', () => {
  it('rende un svg per un nome noto', () => {
    expect(mount(Icon, { props: { name: 'umbrella' } }).find('svg').exists()).toBe(true);
  });
  it('usa il fallback per un nome ignoto', () => {
    expect(mount(Icon, { props: { name: 'non-esiste' } }).find('svg').exists()).toBe(true);
  });
});
```

- [ ] **Step 10: verifica fallimento** — `pnpm --filter @coralyn/web-staff test -- Icon`
Expected: FAIL (`Icon.vue` assente).

- [ ] **Step 11: `packages/ui-kit/src/components/Icon.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { icons, FALLBACK_ICON } from '../icons/registry';

const props = withDefaults(defineProps<{ name: string; size?: number; label?: string }>(), { size: 16 });
const comp = computed(() => icons[props.name] ?? icons[FALLBACK_ICON]);
</script>

<template>
  <component
    :is="comp" :width="size" :height="size"
    :aria-hidden="label ? undefined : true" :aria-label="label" :role="label ? 'img' : undefined"
    style="display:inline-block; vertical-align:-0.15em;"
  />
</template>
```

- [ ] **Step 12: esporta** — `packages/ui-kit/src/index.ts`

```ts
export { default as Icon } from './components/Icon.vue';
export { icons, FALLBACK_ICON } from './icons/registry';
```

- [ ] **Step 13: verifica successo** — `pnpm --filter @coralyn/web-staff test`
Expected: PASS (sanity + Icon = 3 test).

- [ ] **Step 14: Commit**

```bash
git add packages/ui-kit apps/web-staff pnpm-lock.yaml
git commit -m "feat(ui-kit): Vitest setup + offline Icon component & icon registry (TDD)"
```

---

## Task 5: Componenti base `ui-kit` (Button, Card, Badge, Field, Input)

**Files:**
- Create: `packages/ui-kit/src/components/{Button,Card,Badge,Field,Input}.vue`,
  `packages/ui-kit/src/components/Button.spec.ts`
- Modify: `packages/ui-kit/src/index.ts`

- [ ] **Step 1: test che fallisce — `packages/ui-kit/src/components/Button.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Button from './Button.vue';

describe('Button', () => {
  it('rende lo slot ed emette click', async () => {
    const w = mount(Button, { slots: { default: 'Salva' } });
    expect(w.text()).toContain('Salva');
    await w.trigger('click');
    expect(w.emitted('click')).toBeTruthy();
  });
  it('rende un elemento button', () => {
    expect(mount(Button).element.tagName).toBe('BUTTON');
  });
});
```

- [ ] **Step 2: verifica fallimento** — `pnpm --filter @coralyn/web-staff test -- Button`
Expected: FAIL (`Button.vue` assente).

- [ ] **Step 3: `packages/ui-kit/src/components/Button.vue`**

```vue
<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'primary' | 'ghost' | 'danger' }>(), { variant: 'primary' });
const base =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)] disabled:opacity-50';
const variants = {
  primary: 'bg-[var(--color-brand)] text-white hover:bg-[var(--color-brand-hover)]',
  ghost: 'bg-[var(--color-sunken)] text-[var(--color-brand)] hover:bg-[var(--color-cool-200)]',
  danger: 'bg-[var(--color-red-500)] text-white',
} as const;
</script>

<template>
  <button :class="[base, variants[$props.variant ?? 'primary']]"><slot /></button>
</template>
```

- [ ] **Step 4: `Card.vue`, `Badge.vue`, `Field.vue`, `Input.vue`**

`Card.vue`:
```vue
<template>
  <div class="rounded-[var(--radius-lg)] bg-[var(--color-surface)] [box-shadow:var(--shadow-sm)]"><slot /></div>
</template>
```

`Badge.vue`:
```vue
<template>
  <span class="inline-flex items-center gap-1 rounded-[var(--radius-full)] bg-[var(--color-brand-tint)] px-2 py-0.5 text-xs font-semibold text-[var(--color-teal-700)]"><slot /></span>
</template>
```

`Field.vue`:
```vue
<script setup lang="ts">
defineProps<{ label: string; error?: string }>();
</script>
<template>
  <label class="block">
    <span class="mb-1 block text-sm font-medium text-[var(--color-text)]">{{ label }}</span>
    <slot />
    <span v-if="error" class="mt-1 block text-xs text-[var(--color-red-500)]">{{ error }}</span>
  </label>
</template>
```

`Input.vue`:
```vue
<script setup lang="ts">
const model = defineModel<string>();
</script>
<template>
  <input
    v-model="model"
    class="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:border-[var(--color-brand)] focus:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
  />
</template>
```

- [ ] **Step 5: esporta** — aggiungi a `packages/ui-kit/src/index.ts`

```ts
export { default as Button } from './components/Button.vue';
export { default as Card } from './components/Card.vue';
export { default as Badge } from './components/Badge.vue';
export { default as Field } from './components/Field.vue';
export { default as Input } from './components/Input.vue';
```

- [ ] **Step 6: verifica** — `pnpm --filter @coralyn/web-staff test`
Expected: PASS (sanity + Icon + Button = 5 test).

- [ ] **Step 7: Commit**

```bash
git add packages/ui-kit
git commit -m "feat(ui-kit): base components (Button, Card, Badge, Field, Input)"
```

---

## Task 6: Session store (Pinia) + Router + App-shell con console gated

**Files:**
- Create: `apps/web-staff/src/stores/session.ts`, `apps/web-staff/src/router/index.ts`,
  `apps/web-staff/src/app/{AppShell,Topbar,Sidebar}.vue`, le viste di sezione
- Modify: `apps/web-staff/src/App.vue`, `apps/web-staff/src/main.ts`

- [ ] **Step 1: Installa router + pinia**

Run: `pnpm --filter @coralyn/web-staff add vue-router pinia`

- [ ] **Step 2: `apps/web-staff/src/stores/session.ts`** (tenant, data attiva, ruolo)

```ts
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Ruolo } from '@coralyn/contracts';

const TENANT_DEV = '00000000-0000-0000-0000-000000000001';

export const useSessionStore = defineStore('session', () => {
  const stabilimentoId = ref<string>(TENANT_DEV); // provvisorio, Piano 2 -> JWT
  const nomeStabilimento = ref<string>('Lido Sole');
  const dataAttiva = ref<string>('2026-06-27'); // ISO yyyy-mm-dd
  const ruolo = ref<Ruolo>(Ruolo.Staff);
  return { stabilimentoId, nomeStabilimento, dataAttiva, ruolo };
});
```

- [ ] **Step 3: viste placeholder di sezione** — crea file minimi:
`apps/web-staff/src/features/prenotazioni/PrenotazioniView.vue` (e analoghi per
`listino/ListinoView.vue`, `report/ReportView.vue`, `console/ConsoleView.vue`,
`mappa/MappaView.vue`, `clienti/ClientiView.vue`), ciascuno:

```vue
<template><section class="p-6"><h2 class="text-xl font-semibold">Sezione</h2><p class="text-[var(--color-text-muted)]">In arrivo.</p></section></template>
```
(Cambia il titolo per sezione; `MappaView`/`ClientiView` saranno riscritte nei Task 10-11.)

- [ ] **Step 4: `apps/web-staff/src/router/index.ts`**

```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Ruolo } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/mappa' },
  { path: '/mappa', name: 'mappa', component: () => import('@/features/mappa/MappaView.vue') },
  { path: '/prenotazioni', name: 'prenotazioni', component: () => import('@/features/prenotazioni/PrenotazioniView.vue') },
  { path: '/clienti', name: 'clienti', component: () => import('@/features/clienti/ClientiView.vue') },
  { path: '/listino', name: 'listino', component: () => import('@/features/listino/ListinoView.vue') },
  { path: '/report', name: 'report', component: () => import('@/features/report/ReportView.vue') },
  { path: '/console', name: 'console', component: () => import('@/features/console/ConsoleView.vue'), meta: { ruolo: Ruolo.Superuser } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const required = to.meta.ruolo as Ruolo | undefined;
  if (!required) return true;
  return useSessionStore().ruolo === required ? true : { name: 'mappa' };
});
```

- [ ] **Step 5: `apps/web-staff/src/app/Sidebar.vue`** (voce console solo superuser)

```vue
<script setup lang="ts">
import { Icon } from '@coralyn/ui-kit';
import { Ruolo } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
const session = useSessionStore();
const items = [
  { to: '/mappa', label: 'Mappa', icon: 'map' },
  { to: '/prenotazioni', label: 'Prenotazioni', icon: 'calendar' },
  { to: '/clienti', label: 'Clienti', icon: 'users' },
  { to: '/listino', label: 'Listino', icon: 'tag' },
  { to: '/report', label: 'Report', icon: 'chart' },
];
</script>
<template>
  <nav class="flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-lg)] bg-[var(--color-navy-900)] p-2 [box-shadow:var(--shadow-sm)]">
    <RouterLink v-for="it in items" :key="it.to" :to="it.to" v-slot="{ isActive }">
      <span :class="['flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium',
        isActive ? 'bg-[var(--color-brand)] text-white' : 'text-[var(--color-on-navy)] hover:bg-white/5']">
        <Icon :name="it.icon" /> {{ it.label }}
      </span>
    </RouterLink>
    <template v-if="session.ruolo === Ruolo.Superuser">
      <div class="my-2 h-px bg-[var(--color-navy-700)]" />
      <RouterLink to="/console" class="flex items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2 text-xs text-[var(--color-on-navy)]/80">
        <Icon name="shield" /> Console
      </RouterLink>
    </template>
  </nav>
</template>
```

- [ ] **Step 6: `apps/web-staff/src/app/Topbar.vue`**

```vue
<script setup lang="ts">
import { Icon } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
const session = useSessionStore();
</script>
<template>
  <header class="mb-3 flex items-center gap-2.5 rounded-[var(--radius-lg)] bg-[var(--color-brand)] px-3.5 py-2.5 text-white [box-shadow:var(--shadow-sm)]">
    <span class="flex items-center gap-2 font-semibold"><Icon name="umbrella" /> {{ session.nomeStabilimento }}</span>
    <span class="flex items-center gap-2 rounded-[var(--radius-md)] bg-white/15 px-2.5 py-1.5 text-xs [font-variant-numeric:tabular-nums]">
      <Icon name="chevron-left" :size="14" /> {{ session.dataAttiva }} <Icon name="chevron-right" :size="14" />
    </span>
    <span class="flex flex-1 items-center gap-2 rounded-[var(--radius-md)] bg-white px-3 py-1.5 text-xs text-[var(--color-cool-400)]">
      <Icon name="search" /> Cerca cliente…
    </span>
    <span class="grid size-6 place-items-center rounded-full bg-[var(--color-sand-400)] text-[11px] font-semibold text-[#3a2a08]">LS</span>
  </header>
</template>
```

- [ ] **Step 7: `apps/web-staff/src/app/AppShell.vue`**

```vue
<script setup lang="ts">
import Topbar from './Topbar.vue';
import Sidebar from './Sidebar.vue';
</script>
<template>
  <div class="min-h-screen bg-[var(--color-canvas)] p-3">
    <Topbar />
    <div class="flex items-stretch gap-3">
      <Sidebar />
      <main class="min-h-[70vh] flex-1 rounded-[var(--radius-lg)] bg-[var(--color-surface)] [box-shadow:var(--shadow-sm)]">
        <RouterView />
      </main>
    </div>
  </div>
</template>
```

- [ ] **Step 8: `App.vue` + `main.ts`**

`App.vue`:
```vue
<script setup lang="ts">
import AppShell from '@/app/AppShell.vue';
</script>
<template><AppShell /></template>
```

`main.ts`:
```ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router';
import './styles/main.css';

createApp(App).use(createPinia()).use(router).mount('#app');
```
> TanStack Query (Task 7) e MSW (Task 9) estenderanno `main.ts`.

- [ ] **Step 9: Verifica** — `pnpm --filter @coralyn/web-staff dev`
Expected: app-shell con topbar teal (nome stabilimento) e sidebar navy a 5 voci; il routing
funziona; la voce **Console NON compare** (ruolo Staff). Ctrl-C.

- [ ] **Step 10: Commit**

```bash
git add apps/web-staff
git commit -m "feat(web-staff): session store + app-shell (topbar, sidebar, router) with gated console"
```

---

## Task 7: Data-layer — http client (tenant header) + TanStack Query (TDD)

**Files:**
- Create: `apps/web-staff/src/lib/{http.ts,queryClient.ts,queryKeys.ts}`, `apps/web-staff/src/lib/http.spec.ts`
- Modify: `apps/web-staff/src/main.ts`

- [ ] **Step 1: Installa TanStack Query**

Run: `pnpm --filter @coralyn/web-staff add @tanstack/vue-query`

- [ ] **Step 2: test che fallisce — `apps/web-staff/src/lib/http.spec.ts`**

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch } from './http';

afterEach(() => vi.restoreAllMocks());

describe('apiFetch', () => {
  it('aggiunge X-Stabilimento-Id e ritorna il json', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const data = await apiFetch<{ ok: boolean }>('/clienti', { tenantId: 'tenant-123' });
    expect(data).toEqual({ ok: true });
    const [, init] = spy.mock.calls[0];
    expect(new Headers(init?.headers).get('X-Stabilimento-Id')).toBe('tenant-123');
  });

  it('lancia su risposta non ok', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(apiFetch('/clienti', { tenantId: 't' })).rejects.toThrow();
  });
});
```

- [ ] **Step 3: verifica fallimento** — `pnpm --filter @coralyn/web-staff test -- http`
Expected: FAIL (`apiFetch` non esiste).

- [ ] **Step 4: `apps/web-staff/src/lib/http.ts`**

```ts
const BASE = '/api';

export interface ApiOptions extends RequestInit {
  tenantId: string;
}

export async function apiFetch<T>(path: string, { tenantId, headers, ...init }: ApiOptions): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Stabilimento-Id': tenantId, ...headers },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${path}`);
  return (await res.json()) as T;
}
```

- [ ] **Step 5: verifica successo** — `pnpm --filter @coralyn/web-staff test -- http`
Expected: PASS (2 test).

- [ ] **Step 6: `apps/web-staff/src/lib/queryKeys.ts`**

```ts
export const queryKeys = {
  clienti: (tenantId: string) => ['clienti', tenantId] as const,
  mappaGiorno: (tenantId: string, data: string) => ['mappa', tenantId, data] as const,
};
```

- [ ] **Step 7: `apps/web-staff/src/lib/queryClient.ts`**

```ts
import { QueryClient } from '@tanstack/vue-query';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});
```

- [ ] **Step 8: registra Query in `main.ts`** — aggiungi gli import e l'uso del plugin:

```ts
import { VueQueryPlugin } from '@tanstack/vue-query';
import { queryClient } from './lib/queryClient';
// createApp(App).use(createPinia()).use(router).use(VueQueryPlugin, { queryClient }).mount('#app');
```

- [ ] **Step 9: Commit**

```bash
git add apps/web-staff
git commit -m "feat(web-staff): http client (tenant header) + TanStack Query wiring (TDD)"
```

---

## Task 8: Handshake DTO — estendi `@coralyn/contracts` con i DTO mappa (proposta FE)

**Files:**
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: aggiungi i DTO mappa** in coda a `packages/contracts/src/index.ts`

```ts
/** Stato di uno slot (ombrellone, data, fascia). Derivato dal backend. ADR-0013/0020. */
export type StatoSlot = 'libero' | 'abbonato' | 'giornaliero' | 'prenotato';

/** Tipologia ombrellone (ADR-0016). `icona` = nome del registry icone (additivo, ADR-0020). */
export interface TipologiaDTO {
  id: string;
  nome: string;
  ordine: number;
  icona?: string; // fallback FE finché il backend non la espone
}

export interface FasciaDTO {
  id: string;
  nome: string;
  ordine: number;
}

export interface OmbrelloneDTO {
  id: string;
  etichetta: string;               // numero fisico reale (ADR-0016)
  tipologiaId: string | null;      // null = Normale
  filaId: string;
  statoPerFascia: Record<string, StatoSlot>; // chiave = FasciaDTO.id
}

export interface FilaDTO {
  id: string;
  etichetta: string;
  ordine: number;
  ombrelloni: OmbrelloneDTO[];
}

export interface SettoreDTO {
  id: string;
  nome: string;
  ordine: number;
  file: FilaDTO[];
}

/** Vista della mappa per una data (ADR-0020). Proposta FE da allineare col backend. */
export interface MappaGiornoDTO {
  data: string; // ISO yyyy-mm-dd
  tipologie: TipologiaDTO[];
  fasce: FasciaDTO[];
  settori: SettoreDTO[];
}
```

- [ ] **Step 2: builda i contracts**

Run: `pnpm --filter @coralyn/contracts build`
Expected: nessun errore TS; `dist` rigenerato.

- [ ] **Step 3: Commit** (segnala la natura di proposta/handshake)

```bash
git add packages/contracts
git commit -m "feat(contracts): propose map DTOs (Settore/Fila/Ombrellone/Tipologia/Fascia, StatoSlot) [FE handshake]"
```
> **Handshake:** apri una nota/PR piccola verso il backend per allineare questi DTO al dominio
> ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)/[ADR-0016](../architecture/decisions/0016-tipologia-ombrellone.md)); `Tipologia.icona` è additiva.

---

## Task 9: Mock-API con MSW (Mappa) + wiring dev/test

**Files:**
- Create: `apps/web-staff/src/mocks/{handlers.ts,browser.ts,server.ts,data/seed.ts}`
- Modify: `apps/web-staff/src/main.ts`, `apps/web-staff/src/test/setup.ts`

- [ ] **Step 1: Installa MSW e inizializza il worker**

Run:
```bash
pnpm --filter @coralyn/web-staff add -D msw
pnpm --filter @coralyn/web-staff exec msw init public/ --save
```
Expected: crea `apps/web-staff/public/mockServiceWorker.js`.

- [ ] **Step 2: `apps/web-staff/src/mocks/data/seed.ts`** (usa i DTO del Task 8)

```ts
import type { MappaGiornoDTO } from '@coralyn/contracts';

export const mappaSeed: MappaGiornoDTO = {
  data: '2026-06-27',
  tipologie: [
    { id: 't-mini', nome: 'Mini-palma', ordine: 1, icona: 'leaf' },
    { id: 't-palma', nome: 'Palma', ordine: 2, icona: 'palmtree' },
  ],
  fasce: [
    { id: 'f-mat', nome: 'Mattina', ordine: 1 },
    { id: 'f-pom', nome: 'Pomeriggio', ordine: 2 },
  ],
  settori: [
    {
      id: 's-centro', nome: 'Centro', ordine: 1,
      file: [
        {
          id: 'fila-1', etichetta: 'Fila 1', ordine: 1,
          ombrelloni: [
            { id: 'o-1', etichetta: '1', tipologiaId: 't-mini', filaId: 'fila-1', statoPerFascia: { 'f-mat': 'giornaliero', 'f-pom': 'giornaliero' } },
            { id: 'o-2', etichetta: '2', tipologiaId: 't-mini', filaId: 'fila-1', statoPerFascia: { 'f-mat': 'libero', 'f-pom': 'libero' } },
            { id: 'o-8', etichetta: '8', tipologiaId: null, filaId: 'fila-1', statoPerFascia: { 'f-mat': 'prenotato', 'f-pom': 'libero' } },
          ],
        },
      ],
    },
    {
      id: 's-speciali', nome: 'Speciali', ordine: 99,
      file: [
        {
          id: 'fila-palme', etichetta: 'Palme', ordine: 1,
          ombrelloni: [
            { id: 'o-p1', etichetta: 'P1', tipologiaId: 't-palma', filaId: 'fila-palme', statoPerFascia: { 'f-mat': 'abbonato', 'f-pom': 'abbonato' } },
          ],
        },
      ],
    },
  ],
};
```

- [ ] **Step 3: `apps/web-staff/src/mocks/handlers.ts`** (solo Mappa; Clienti passa al backend in dev)

```ts
import { http, HttpResponse } from 'msw';
import { mappaSeed } from './data/seed';

export const handlers = [http.get('/api/mappa', () => HttpResponse.json(mappaSeed))];
```

- [ ] **Step 4: `apps/web-staff/src/mocks/browser.ts`**

```ts
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
export const worker = setupWorker(...handlers);
```

- [ ] **Step 5: `apps/web-staff/src/mocks/server.ts`** (node, per i test; aggiunge Clienti)

```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';
import type { ClienteDTO } from '@coralyn/contracts';

const clienti: ClienteDTO[] = [{ id: 'c-1', nome: 'Mario', cognome: 'Rossi' }];

export const server = setupServer(
  ...handlers,
  http.get('/api/clienti', () => HttpResponse.json(clienti)),
  http.post('/api/clienti', async ({ request }) => {
    const body = (await request.json()) as { nome: string; cognome: string };
    const nuovo: ClienteDTO = { id: `c-${clienti.length + 1}`, ...body };
    clienti.push(nuovo);
    return HttpResponse.json(nuovo, { status: 201 });
  }),
);
```

- [ ] **Step 6: avvio condizionale del worker in `main.ts`** (solo dev) — sposta il `mount` dentro `then`:

```ts
async function enableMocking() {
  if (!import.meta.env.DEV) return;
  const { worker } = await import('./mocks/browser');
  // Mappa mockata; /api/clienti non gestito -> passa al backend reale via proxy.
  await worker.start({ onUnhandledRequest: 'bypass' });
}
enableMocking().then(() => {
  createApp(App).use(createPinia()).use(router).use(VueQueryPlugin, { queryClient }).mount('#app');
});
```

- [ ] **Step 7: collega MSW ai test** — `apps/web-staff/src/test/setup.ts` (sostituisci il contenuto)

```ts
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from '@/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

- [ ] **Step 8: verifica** — `pnpm --filter @coralyn/web-staff test`
Expected: i test esistenti restano verdi (MSW server attivo senza romperli).

- [ ] **Step 9: Commit**

```bash
git add apps/web-staff
git commit -m "feat(web-staff): MSW mock API (map) + dev/test wiring"
```

---

## Task 10: Clienti — verticale su API reale (TDD con MSW)

**Files:**
- Create: `apps/web-staff/src/features/clienti/useClienti.ts`,
  `apps/web-staff/src/features/clienti/ClientiView.spec.ts`, `apps/web-staff/src/test/utils.ts`
- Modify: `apps/web-staff/src/features/clienti/ClientiView.vue`

- [ ] **Step 1: helper di test (Query + Pinia)** — `apps/web-staff/src/test/utils.ts`

```ts
import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import type { Component } from 'vue';

export function mountApp<C extends Component>(comp: C, options: ComponentMountingOptions<C> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(comp, {
    ...options,
    global: { plugins: [createPinia(), [VueQueryPlugin, { queryClient }]], ...(options.global ?? {}) },
  });
}
```

- [ ] **Step 2: `apps/web-staff/src/features/clienti/useClienti.ts`** (query + mutation)

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { ClienteDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useClienti() {
  const session = useSessionStore();
  return useQuery({
    queryKey: queryKeys.clienti(session.stabilimentoId),
    queryFn: () => apiFetch<ClienteDTO[]>('/clienti', { tenantId: session.stabilimentoId }),
  });
}

export function useCreaCliente() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { nome: string; cognome: string }) =>
      apiFetch<ClienteDTO>('/clienti', { tenantId: session.stabilimentoId, method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.clienti(session.stabilimentoId) }),
  });
}
```

- [ ] **Step 3: test che fallisce — `apps/web-staff/src/features/clienti/ClientiView.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import ClientiView from './ClientiView.vue';

describe('ClientiView', () => {
  it('mostra i clienti dal mock', async () => {
    const w = mountApp(ClientiView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('Rossi');
  });
});
```

- [ ] **Step 4: verifica fallimento** — `pnpm --filter @coralyn/web-staff test -- ClientiView`
Expected: FAIL (la view è placeholder).

- [ ] **Step 5: `apps/web-staff/src/features/clienti/ClientiView.vue`**

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { Button, Card, Field, Input } from '@coralyn/ui-kit';
import { useClienti, useCreaCliente } from './useClienti';

const { data: clienti, isLoading } = useClienti();
const crea = useCreaCliente();
const nome = ref('');
const cognome = ref('');

function submit() {
  if (!nome.value || !cognome.value) return;
  crea.mutate({ nome: nome.value, cognome: cognome.value }, { onSuccess: () => { nome.value = ''; cognome.value = ''; } });
}
</script>

<template>
  <section class="p-6">
    <h2 class="mb-4 text-xl font-semibold">Clienti</h2>
    <Card class="mb-4 p-4">
      <form class="flex items-end gap-3" @submit.prevent="submit">
        <Field label="Nome" class="flex-1"><Input v-model="nome" /></Field>
        <Field label="Cognome" class="flex-1"><Input v-model="cognome" /></Field>
        <Button type="submit">Aggiungi</Button>
      </form>
    </Card>
    <Card class="p-4">
      <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
            <th class="py-2">Cognome</th><th class="py-2">Nome</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in clienti" :key="c.id" class="border-t border-[var(--color-cool-100)]">
            <td class="py-2 font-medium">{{ c.cognome }}</td><td class="py-2">{{ c.nome }}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </section>
</template>
```
> TanStack Table (ordinamento/paginazione) arriverà nello slice 2; per l'elenco semplice basta una
> tabella token-driven (YAGNI).

- [ ] **Step 6: verifica successo** — `pnpm --filter @coralyn/web-staff test -- ClientiView`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web-staff
git commit -m "feat(web-staff): Clienti vertical (TanStack Query list + create) against real API"
```

---

## Task 11: Mappa — `OmbrelloneCell` (TDD a11y) + Drawer + render mock

**Files:**
- Create: `packages/ui-kit/src/components/OmbrelloneCell.vue`,
  `packages/ui-kit/src/components/OmbrelloneCell.spec.ts`, `packages/ui-kit/src/components/Drawer.vue`,
  `apps/web-staff/src/features/mappa/useMappaGiorno.ts`
- Modify: `packages/ui-kit/src/index.ts`, `apps/web-staff/src/features/mappa/MappaView.vue`

- [ ] **Step 1: test che fallisce — `packages/ui-kit/src/components/OmbrelloneCell.spec.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import OmbrelloneCell from './OmbrelloneCell.vue';

const base = {
  etichetta: '8',
  ariaLabel: 'Ombrellone 8, Settore Centro Fila 2, tipologia Normale, mattina prenotato, pomeriggio libero',
  statoMattina: 'prenotato' as const,
  statoPomeriggio: 'libero' as const,
};

describe('OmbrelloneCell', () => {
  it('è un button con aria-label testuale completa', () => {
    const btn = mount(OmbrelloneCell, { props: base }).get('button');
    expect(btn.attributes('aria-label')).toContain('mattina prenotato');
    expect(btn.attributes('aria-label')).toContain('pomeriggio libero');
  });
  it('mostra l’etichetta', () => {
    expect(mount(OmbrelloneCell, { props: base }).text()).toContain('8');
  });
  it('emette select al click', async () => {
    const w = mount(OmbrelloneCell, { props: base });
    await w.get('button').trigger('click');
    expect(w.emitted('select')).toBeTruthy();
  });
});
```

- [ ] **Step 2: verifica fallimento** — `pnpm --filter @coralyn/web-staff test -- OmbrelloneCell`
Expected: FAIL (componente assente).

- [ ] **Step 3: `packages/ui-kit/src/components/OmbrelloneCell.vue`**

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { StatoSlot } from '@coralyn/contracts';
import Icon from './Icon.vue';

const props = withDefaults(defineProps<{
  etichetta: string;
  ariaLabel: string;
  statoMattina: StatoSlot;
  statoPomeriggio: StatoSlot;
  iconaTipologia?: string | null;
  selezionato?: boolean;
}>(), { selezionato: false });

defineEmits<{ select: [] }>();

const fill: Record<StatoSlot, string> = {
  libero: 'var(--color-state-libero)', abbonato: 'var(--color-state-abbonato)',
  giornaliero: 'var(--color-state-giornaliero)', prenotato: 'var(--color-state-prenotato)',
};
const ink: Record<StatoSlot, string> = {
  libero: 'var(--color-state-libero-ink)', abbonato: 'var(--color-state-abbonato-ink)',
  giornaliero: 'var(--color-state-giornaliero-ink)', prenotato: 'var(--color-state-prenotato-ink)',
};
const isSplit = computed(() => props.statoMattina !== props.statoPomeriggio);
const bg = computed(() =>
  isSplit.value
    ? `linear-gradient(90deg, ${fill[props.statoMattina]} 0 49%, rgba(255,255,255,.7) 49% 51%, ${fill[props.statoPomeriggio]} 51% 100%)`
    : fill[props.statoMattina],
);
const color = computed(() => (isSplit.value ? 'var(--color-cool-900)' : ink[props.statoMattina]));
</script>

<template>
  <span class="relative inline-flex">
    <button
      type="button" :aria-label="ariaLabel" :aria-pressed="selezionato"
      class="grid size-[34px] place-items-center rounded-full text-xs font-semibold [font-variant-numeric:tabular-nums] [box-shadow:var(--shadow-xs)] transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--shadow-focus)]"
      :class="selezionato ? 'outline outline-2 outline-offset-2 outline-[var(--color-brand)]' : ''"
      :style="{ background: bg, color }"
      @click="$emit('select')"
    >{{ etichetta }}</button>
    <span v-if="iconaTipologia" class="absolute -right-1 -top-1 z-10 grid size-[15px] place-items-center rounded-full bg-[var(--color-surface)] text-[var(--color-brand)] [box-shadow:var(--shadow-xs)]">
      <Icon :name="iconaTipologia" :size="10" />
    </span>
  </span>
</template>
```

- [ ] **Step 4: verifica successo** — `pnpm --filter @coralyn/web-staff test -- OmbrelloneCell`
Expected: PASS (3 test).

- [ ] **Step 5: `packages/ui-kit/src/components/Drawer.vue`** (su Reka UI Dialog)

```vue
<script setup lang="ts">
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogClose } from 'reka-ui';
import Icon from './Icon.vue';
defineProps<{ title: string }>();
const open = defineModel<boolean>('open', { required: true });
</script>
<template>
  <DialogRoot v-model:open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-black/20" />
      <DialogContent class="fixed right-3 top-3 bottom-3 z-50 flex w-[380px] flex-col rounded-[var(--radius-lg)] bg-[var(--color-surface)] p-4 [box-shadow:var(--shadow-md)] focus:outline-none">
        <div class="flex items-center justify-between">
          <DialogTitle class="text-base font-semibold">{{ title }}</DialogTitle>
          <DialogClose class="text-[var(--color-cool-400)]"><Icon name="x" /></DialogClose>
        </div>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
```

- [ ] **Step 6: esporta** — aggiungi a `packages/ui-kit/src/index.ts`

```ts
export { default as OmbrelloneCell } from './components/OmbrelloneCell.vue';
export { default as Drawer } from './components/Drawer.vue';
```

- [ ] **Step 7: assicura `reka-ui` installato e risolto**

Run: `pnpm install`
Expected: `reka-ui` (dipendenza di `@coralyn/ui-kit`, Task 2) presente nel workspace.

- [ ] **Step 8: `apps/web-staff/src/features/mappa/useMappaGiorno.ts`**

```ts
import { useQuery } from '@tanstack/vue-query';
import type { MappaGiornoDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useMappaGiorno() {
  const session = useSessionStore();
  return useQuery({
    queryKey: queryKeys.mappaGiorno(session.stabilimentoId, session.dataAttiva),
    queryFn: () => apiFetch<MappaGiornoDTO>('/mappa', { tenantId: session.stabilimentoId }),
  });
}
```

- [ ] **Step 9: `apps/web-staff/src/features/mappa/MappaView.vue`** (render griglia + drawer)

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { OmbrelloneCell, Drawer, Badge } from '@coralyn/ui-kit';
import type { OmbrelloneDTO } from '@coralyn/contracts';
import { useMappaGiorno } from './useMappaGiorno';

const { data: mappa, isLoading } = useMappaGiorno();
const selezionato = ref<OmbrelloneDTO | null>(null);
const open = ref(false);

const fasce = computed(() => mappa.value?.fasce ?? []);
const tipologie = computed(() => new Map((mappa.value?.tipologie ?? []).map((t) => [t.id, t])));
const nomeTipologiaSel = computed(() => {
  const id = selezionato.value?.tipologiaId;
  return id ? (tipologie.value.get(id)?.nome ?? 'Tipologia') : 'Normale';
});

function statoFascia(o: OmbrelloneDTO, idx: number): OmbrelloneDTO['statoPerFascia'][string] {
  const f = fasce.value[idx] ?? fasce.value[0];
  return o.statoPerFascia[f?.id] ?? 'libero';
}
function iconaTip(o: OmbrelloneDTO): string | null {
  return o.tipologiaId ? (tipologie.value.get(o.tipologiaId)?.icona ?? 'umbrella') : null;
}
function ariaLabel(o: OmbrelloneDTO, settore: string, fila: string): string {
  const tip = o.tipologiaId ? tipologie.value.get(o.tipologiaId)?.nome ?? 'tipologia' : 'Normale';
  return `Ombrellone ${o.etichetta}, Settore ${settore} ${fila}, tipologia ${tip}, mattina ${statoFascia(o, 0)}, pomeriggio ${statoFascia(o, 1)}`;
}
function apri(o: OmbrelloneDTO) { selezionato.value = o; open.value = true; }
</script>

<template>
  <section class="p-6">
    <h2 class="mb-4 text-xl font-semibold">Mappa</h2>
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <div v-else class="space-y-6">
      <div v-for="s in mappa?.settori" :key="s.id">
        <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">Settore {{ s.nome }}</h3>
        <div v-for="f in s.file" :key="f.id" class="mb-2 flex items-center gap-2">
          <span class="w-16 text-right text-xs text-[var(--color-text-muted)]">{{ f.etichetta }}</span>
          <OmbrelloneCell
            v-for="o in f.ombrelloni" :key="o.id"
            :etichetta="o.etichetta"
            :aria-label="ariaLabel(o, s.nome, f.etichetta)"
            :stato-mattina="statoFascia(o, 0)"
            :stato-pomeriggio="statoFascia(o, 1)"
            :icona-tipologia="iconaTip(o)"
            :selezionato="selezionato?.id === o.id"
            @select="apri(o)"
          />
        </div>
      </div>
    </div>

    <Drawer v-model:open="open" :title="`Ombrellone ${selezionato?.etichetta ?? ''}`">
      <Badge class="mt-2"><span>{{ nomeTipologiaSel }}</span></Badge>
      <p class="mt-3 text-sm text-[var(--color-text-muted)]">Dettaglio prenotazione e azioni: slice successivo.</p>
    </Drawer>
  </section>
</template>
```

- [ ] **Step 10: verifica dev** — `pnpm --filter @coralyn/web-staff dev`
Expected: la **Mappa** (home) mostra il settore Centro + Speciali dal mock MSW; l'8 è split
(mattina/pomeriggio); marcatori tipologia su 1/2 (foglia) e P1 (palma); clic su una cella apre il
**drawer** "Ombrellone «etichetta»". Ctrl-C.

- [ ] **Step 11: esegui tutti i test** — `pnpm --filter @coralyn/web-staff test`
Expected: PASS (sanity, Icon, Button, http, ClientiView, OmbrelloneCell).

- [ ] **Step 12: Commit**

```bash
git add packages/ui-kit apps/web-staff pnpm-lock.yaml
git commit -m "feat(web-staff): map render (OmbrelloneCell, drawer) on mocked API (TDD a11y)"
```

---

## Task 12: PWA — installabile + shell precache (offline-light)

**Files:**
- Create: `apps/web-staff/public/{favicon.svg,pwa-192.png,pwa-512.png}`
- Modify: `apps/web-staff/vite.config.ts`

- [ ] **Step 1: Installa vite-plugin-pwa**

Run: `pnpm --filter @coralyn/web-staff add -D vite-plugin-pwa`

- [ ] **Step 2: aggiungi le icone** in `apps/web-staff/public/` (`pwa-192.png`, `pwa-512.png`, `favicon.svg`).
Placeholder accettabili in slice 1 (ombrellone teal su sfondo chiaro), da rifinire col brand ([D-017](../architecture/deferred.md)).

- [ ] **Step 3: configura il plugin in `vite.config.ts`** (aggiungi import e plugin)

```ts
import { VitePWA } from 'vite-plugin-pwa';
// dentro plugins: [...]
VitePWA({
  registerType: 'autoUpdate',
  devOptions: { enabled: false }, // in dev il SW attivo è quello di MSW
  workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
  manifest: {
    name: 'Coralyn · Staff',
    short_name: 'Coralyn',
    lang: 'it',
    theme_color: '#1F6F8B',
    background_color: '#E9EFF2',
    display: 'standalone',
    icons: [
      { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
}),
```

- [ ] **Step 4: build e verifica generazione SW**

Run: `pnpm --filter @coralyn/web-staff build`
Expected: build ok; in `apps/web-staff/dist/` compaiono il service worker (`sw.js`) e
`manifest.webmanifest`. `pnpm --filter @coralyn/web-staff preview` → l'app è installabile.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff
git commit -m "feat(web-staff): installable PWA with shell precache (offline-light)"
```

---

## Task 13: Wire-up finale, lint/typecheck e Definition of Done

**Files:**
- Modify: `eslint.config.mjs` (root) se serve includere i `.vue`

- [ ] **Step 1: typecheck** — `pnpm --filter @coralyn/web-staff typecheck`
Expected: nessun errore TS (strict).

- [ ] **Step 2: lint** (dalla radice) — `pnpm lint`
Expected: pulito. Se ESLint non conosce i `.vue`, aggiungi `eslint-plugin-vue` + `vue-eslint-parser`
al config root con un override mirato per `apps/web-staff/**/*.vue`, poi rilancia.

- [ ] **Step 3: test completi** — `pnpm --filter @coralyn/web-staff test`
Expected: tutti verdi.

- [ ] **Step 4: build del workspace** — `pnpm --filter @coralyn/contracts build && pnpm --filter @coralyn/web-staff build`
Expected: build verdi.

- [ ] **Step 5: Commit (se ci sono modifiche di config)**

```bash
git add -A
git commit -m "chore(web-staff): lint/typecheck wiring + DoD green"
```

---

## Definition of Done (slice 1)

- `pnpm install` ok; `@coralyn/ui-kit` e `@coralyn/web-staff` agganciati al workspace.
- **App-shell**: topbar (nome stabilimento), sidebar a 5 sezioni + **Console gated** (non visibile a non-superuser); routing per sezione; layout a card sui token.
- **ui-kit token-first**: token in `@theme`, Tailwind v4 sui token; componenti base + `Icon` (offline) + `OmbrelloneCell`.
- **Clienti**: elenco + creazione verso `/api/clienti` (proxy all'**API reale**), invalidazione cache dopo create (TanStack Query); **verificato via MSW** finché il backend non espone `/clienti` (Piano 1 Task 3–7).
- **Mappa**: render da **MSW** (settori/file/ombrelloni, Speciali), cella a 4 assi (etichetta, stato split per fascia, marcatore tipologia, selezione), **ink AA**, `aria-label` testuale, drawer contestuale.
- **MSW**: mappa mockata in dev; Clienti passa al backend; in test tutto mockato.
- **PWA** installabile con shell in cache (offline-light); SW PWA disattivo in dev (no conflitto MSW).
- **contracts**: DTO mappa proposti e buildano; handshake aperto col backend.
- **Test verdi**, **typecheck** pulito, **lint** pulito; commit atomici; working tree pulito.

## Note per gli slice successivi

- **Slice 2** (Prenotazioni/Listino reali) introdurrà **TanStack Table** (ordinamento/paginazione)
  nel `ui-kit` e i flussi del drawer (Nuova prenotazione, Assegna abbonamento, Registra presenza,
  [flows §2](../design/flows.md)), più il **responsive** tablet (rail + bottom-sheet) e la ricerca cliente.
- Quando il backend espone la Mappa reale e `Tipologia.icona`, rimuovere l'handler MSW della mappa
  e il fallback icona; allineare i DTO ([ADR-0020](../architecture/decisions/0020-resa-mappa.md)).
- Validazione runtime ([D-021](../architecture/deferred.md)) e i18n ([D-003](../architecture/deferred.md))
  restano rinviati; il check di contrasto AA dei token (§14 design-system) va aggiunto in CI.
```
