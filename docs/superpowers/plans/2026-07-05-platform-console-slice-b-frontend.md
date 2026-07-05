# Platform Console — Slice B (frontend `apps/web-platform`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nuova SPA dedicata al distributore, `apps/web-platform`, che consuma le API `/api/platform/*` (Slice A): login superuser, lista lidi con metriche, crea lido, sospendi/riattiva, dettaglio lido — con chrome purpose-built e zero UI che esponga PII dei bagnanti.

**Architecture:** App Vue 3 sibling di `web-staff` nel monorepo pnpm, riusa `@coralyn/ui-kit` e `@coralyn/contracts`. Auth condivisa sul BE (`POST /api/auth/login`), ma **login che rifiuta i non-superuser**. Router con guard `meta.role: Superuser`. TanStack Query via il factory `queryResource`/`mutationResource` riusato da web-staff. Test Vitest + MSW. Realizza [ADR-0041](../../architecture/decisions/0041-app-frontend-dedicata-platform.md). Spec §9: [2026-07-05-platform-console-superuser-design.md](../specs/2026-07-05-platform-console-superuser-design.md).

**Tech Stack:** Vue 3.5, vue-router, Pinia 3, @tanstack/vue-query 5, Vite 8, Vitest 4 + @vue/test-utils + MSW 2, Tailwind v4 (via ui-kit theme), `@coralyn/ui-kit`, `@coralyn/contracts`.

---

## Contesto e convenzioni (dalla ricognizione di `web-staff`)

`web-platform` **rispecchia** `apps/web-staff`. Punti chiave che l'implementer deve conoscere:

- **Monorepo pnpm** (`pnpm@11.9.0`, Node ≥22). `pnpm-workspace.yaml` ha già la glob `apps/*` → nessuna registrazione serve. `corepack pnpm`.
- **API base URL** = literal `'/api'` in `http.ts`, instradato dal proxy Vite (`/api`→`http://localhost:3000`) in dev e da nginx (`/api/`→`api:3000`) in prod. Nessuna env var.
- **Token JWT** in localStorage. ⚠️ **Chiave DIVERSA** da web-staff (`coralyn.auth.token`) per non collidere sullo stesso origin → usa `coralyn.platform.auth.token`.
- **Campo token nella risposta login = `accessToken`** (non `token`). `POST /api/auth/login` → `{ accessToken, user }`; `GET /api/auth/me` → `UserDTO`.
- **`Role` enum** da `@coralyn/contracts`: `Role.Superuser = 'superuser'`, `Role.Admin`, `Role.Staff`.
- **ui-kit**: import nominati da `@coralyn/ui-kit`. Disponibili (tra gli altri): `Button, Card, SectionCard, Badge, Field, Input, Modal, ModalFooter, ConfirmDialog, DataTable, EmptyState, PageToolbar, KpiCard, StatTile, Icon, Avatar, formatEuro, initials`, e classi tabella `TD, TD_FIRST, TD_RIGHT, TD_NUM`. `Modal`/`ConfirmDialog` **teleportano** il contenuto su `document.body` (reka-ui portal) → nei test `attachTo: document.body` + `document.querySelector` + `w.unmount()`.
- **Icone**: registry condiviso in `packages/ui-kit/src/icons/registry.ts`. Se servono icone nuove, aggiungile lì (chiavi lucide). Verifica prima quali esistono; `<Icon name="..." :size="15" />`.
- **Lingua**: italiano-first, come web-staff (nessuna libreria i18n; stringhe inline).
- **Test**: `mountApp` da `src/test/utils.ts` (crea Pinia + VueQuery + router in-memory, stubba `RouterLink`); MSW `setupServer` in `src/mocks/server.ts`; `src/test/setup.ts` con `server.listen({ onUnhandledRequest: 'error' })`. Helper `settle()` (flush + macrotask + flush) per far risolvere TanStack Query.
- **Fixture email**: usa TLD `.test`/`.example` (non domini con cifra tipo `*.e2e` → `@IsEmail` li rifiuta).

Comandi:
```bash
corepack pnpm install                                   # dopo aver aggiunto la nuova app (linka i workspace)
corepack pnpm --filter @coralyn/web-platform dev        # dev server (Vite, porta 5173/5174)
corepack pnpm --filter @coralyn/web-platform test       # vitest run
corepack pnpm --filter @coralyn/web-platform typecheck  # vue-tsc -b --noEmit
corepack pnpm --filter @coralyn/web-platform build      # vue-tsc -b && vite build
```

**Baseline test (non regredire):** ui-kit 70 · web-staff 210 · api unit 178 · api e2e 222.

---

## File Structure (nuovo albero `apps/web-platform/`)

```
apps/web-platform/
  package.json  vite.config.ts  vitest.config.ts  index.html
  tsconfig.json  tsconfig.app.json  tsconfig.node.json
  Dockerfile  nginx.conf
  src/
    main.ts  App.vue
    router/index.ts  router/meta.d.ts
    stores/session.ts            (+ session.spec.ts)
    lib/authToken.ts  lib/http.ts  lib/queryClient.ts  lib/queryKeys.ts  lib/useQueryResource.ts
    app/PlatformShell.vue  app/AuthLayout.vue
    features/auth/LoginView.vue  (+ LoginView.spec.ts)
    features/establishments/
      usePlatformEstablishments.ts
      EstablishmentsListView.vue   (+ .spec.ts)
      EstablishmentDetailView.vue  (+ .spec.ts)
      CreateEstablishmentModal.vue (usata dalla list view; testata via list spec)
    mocks/server.ts  mocks/handlers.ts
    test/utils.ts  test/setup.ts  test/sanity.spec.ts
  public/  (favicon ecc., copiati/minimi)
```

Ogni file ha una responsabilità singola. Le viste sono piccole (lista, dettaglio, login); la modale create è un componente a sé riusato dalla lista.

---

## Task 1: Scaffold dell'app (boota vuota)

**Files (create, copiando da `apps/web-staff` e rinominando):**
- `apps/web-platform/package.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `src/main.ts`, `src/App.vue`, `src/test/utils.ts`, `src/test/setup.ts`, `src/test/sanity.spec.ts`
- Modify: `.claude/launch.json` (aggiungi entry `web-platform`)

- [ ] **Step 1: Copia i file di config da web-staff, con le modifiche indicate**

Leggi ogni sorgente in `apps/web-staff/` e crea l'equivalente in `apps/web-platform/` **identico**, tranne:
- `package.json`: `"name": "@coralyn/web-platform"` (tutto il resto — scripts, deps, devDeps, versioni, blocco `msw` — invariato).
- `vite.config.ts`: identico, ma nel plugin PWA cambia `name`/`short_name` in `"Coralyn · Platform"` / `"Coralyn Platform"` (lascia colori/tema).
- `index.html`: `<title>Coralyn · Platform</title>`, `lang="it"`.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: **verbatim** (nessun contenuto app-specifico).
- `vitest.config.ts`: **verbatim** MA rimuovi dal `test.include` il cross-include `'../../packages/ui-kit/src/**/*.spec.ts'` (i test ui-kit girano già col loro package; non duplicarli qui). Lascia `include: ['src/**/*.spec.ts']`.
- `src/main.ts`: **verbatim** (registra Pinia + VueQuery, `await useSessionStore().rehydrate()` prima di `app.use(router)`, cleanup service worker dev). Import path `@/stores/session` e `@/router`.
- `src/App.vue`: renderizza `<PlatformShell />` invece di `<AppShell />` (il componente sarà creato nel Task 4; per ora, per far bootare, renderizza `<RouterView />` direttamente — verrà sostituito da PlatformShell nel Task 4).
- `src/test/utils.ts`: **verbatim** (`mountApp` con Pinia + VueQuery + router in-memory + stub RouterLink).
- `src/test/setup.ts`: come web-staff ma **senza** i `reset*Seed()` di dominio staff → per ora solo:
```ts
import { beforeAll, beforeEach, afterEach, afterAll } from 'vitest';
import { server } from '@/mocks/server';
import { resetPlatformSeed } from '@/mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => resetPlatformSeed());
afterEach(() => { server.resetHandlers(); document.body.innerHTML = ''; });
afterAll(() => server.close());
```
(`resetPlatformSeed` e `server` saranno definiti nel Task 5; questo file compila solo dopo il Task 5 — va bene, la sanity spec del Task 1 non importa `setup.ts` finché `server.ts` non esiste. Per sbloccare il Task 1, crea un `src/mocks/server.ts` MINIMO ora: `import { setupServer } from 'msw/node'; export const server = setupServer(); export function resetPlatformSeed(): void {}` — verrà ampliato nel Task 5.)

- [ ] **Step 2: Crea `src/test/sanity.spec.ts`** (canary che prova che l'harness gira):
```ts
import { describe, it, expect } from 'vitest';

describe('web-platform harness', () => {
  it('somma', () => { expect(1 + 1).toBe(2); });
});
```

- [ ] **Step 3: Aggiungi la entry preview in `.claude/launch.json`** (leggi il file, aggiungi accanto a quella di web-staff, porta 5174):
```json
{ "name": "web-platform", "runtimeExecutable": "corepack", "runtimeArgs": ["pnpm", "--filter", "@coralyn/web-platform", "dev"], "port": 5174 }
```
(adatta alla forma esatta dell'array `configurations` esistente).

- [ ] **Step 4: Installa i workspace e verifica boot + sanity test**
```bash
corepack pnpm install
corepack pnpm --filter @coralyn/web-platform test -- sanity
```
Expected: `install` linka `@coralyn/web-platform`; il sanity test passa.

- [ ] **Step 5: Commit**
```bash
git add apps/web-platform pnpm-lock.yaml .claude/launch.json
git commit -m "feat(web-platform): scaffold app (config, main, test harness) — sibling di web-staff"
```

---

## Task 2: Libreria infra (http, query, token con chiave dedicata)

**Files (create in `apps/web-platform/src/lib/`, copiando da `apps/web-staff/src/lib/`):**
- `http.ts`, `queryClient.ts`, `useQueryResource.ts`, `queryKeys.ts`, `authToken.ts`

- [ ] **Step 1: Copia verbatim** `apps/web-staff/src/lib/http.ts` → `apps/web-platform/src/lib/http.ts` (nessuna modifica: `BASE='/api'`, `apiFetch`, `ApiError`, `readErrorMessage`).

- [ ] **Step 2: Copia verbatim** `apps/web-staff/src/lib/queryClient.ts` e `apps/web-staff/src/lib/useQueryResource.ts` nelle path equivalenti (nessuna modifica). Verifica che `useQueryResource.ts` importi `pushToast` da ui-kit o da un modulo locale — se importa un toast locale di web-staff, adatta l'import a `@coralyn/ui-kit` (che esporta `Toast`) o crea un piccolo `src/lib/toast.ts` equivalente; se il factory non dipende da toast, ignora. **Leggi il file e risolvi gli import concretamente.**

- [ ] **Step 3: Crea `apps/web-platform/src/lib/authToken.ts`** — come web-staff ma con **chiave dedicata**:
```ts
// Chiave DISTINTA da web-staff (coralyn.auth.token) per non collidere sullo stesso origin.
export const TOKEN_KEY = 'coralyn.platform.auth.token';
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY); }
export function setToken(token: string): void { localStorage.setItem(TOKEN_KEY, token); }
export function clearToken(): void { localStorage.removeItem(TOKEN_KEY); }
```

- [ ] **Step 4: Crea `apps/web-platform/src/lib/queryKeys.ts`** (centralizza le chiavi, minimale per ora):
```ts
export const queryKeys = {
  establishments: () => ['platform', 'establishments'] as const,
  establishment: (id: string) => ['platform', 'establishments', id] as const,
};
```

- [ ] **Step 5: Typecheck**
```bash
corepack pnpm --filter @coralyn/web-platform typecheck
```
Expected: nessun errore (o solo errori su file non ancora creati referenziati — se emergono, sono attesi finché non completi i task successivi; assicurati che questi 5 file compilino).

- [ ] **Step 6: Commit**
```bash
git add apps/web-platform/src/lib
git commit -m "feat(web-platform): lib infra (http, query factory, token con chiave dedicata)"
```

---

## Task 3: Session store — login rifiuta i non-superuser

**Files:**
- Create: `apps/web-platform/src/stores/session.ts`
- Test: `apps/web-platform/src/stores/session.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce** — `apps/web-platform/src/stores/session.spec.ts`:
```ts
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from './session';
import * as http from '@/lib/http';
import { TOKEN_KEY } from '@/lib/authToken';

describe('session store (platform)', () => {
  beforeEach(() => { setActivePinia(createPinia()); localStorage.clear(); vi.restoreAllMocks(); });

  it('login superuser → autenticato, token salvato', async () => {
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ accessToken: 'tok', user: { id: 'su', email: 's@p.test', role: Role.Superuser, establishmentId: null } } as any);
    const s = useSessionStore();
    await s.login('s@p.test', 'pw');
    expect(s.authenticated).toBe(true);
    expect(s.role).toBe(Role.Superuser);
    expect(localStorage.getItem(TOKEN_KEY)).toBe('tok');
  });

  it('login NON-superuser (admin di lido) → rifiutato, nessun token, non autenticato', async () => {
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ accessToken: 'tok', user: { id: 'a', email: 'a@lido.test', role: Role.Admin, establishmentId: 'e-1' } } as any);
    const s = useSessionStore();
    await expect(s.login('a@lido.test', 'pw')).rejects.toThrow();
    expect(s.authenticated).toBe(false);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('rehydrate: senza token → no-op non autenticato', async () => {
    const spy = vi.spyOn(http, 'apiFetch');
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Esegui — MUST FAIL** (modulo assente):
```bash
corepack pnpm --filter @coralyn/web-platform test -- session
```

- [ ] **Step 3: Implementa `apps/web-platform/src/stores/session.ts`:**
```ts
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { Role, type LoginResponse, type UserDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { clearToken, getToken, setToken } from '@/lib/authToken';

export const useSessionStore = defineStore('session', () => {
  const user = ref<UserDTO | null>(null);

  const authenticated = computed(() => user.value !== null);
  const role = computed<Role | null>(() => user.value?.role ?? null);
  const userEmail = computed(() => user.value?.email ?? '');

  async function login(email: string, password: string): Promise<void> {
    const res = await apiFetch<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    // Questa app è SOLO per il distributore: un utente di lido ha credenziali valide ma NON deve entrare.
    if (res.user.role !== Role.Superuser) {
      throw new Error('Accesso riservato agli operatori della piattaforma');
    }
    setToken(res.accessToken);
    user.value = res.user;
  }

  function logout(): void { clearToken(); user.value = null; }

  async function rehydrate(): Promise<void> {
    if (!getToken()) return;
    try {
      const me = await apiFetch<UserDTO>('/auth/me');
      // Difesa in profondità: un token non-superuser (es. riuso da web-staff) non deve dare sessione qui.
      if (me.role !== Role.Superuser) { logout(); return; }
      user.value = me;
    } catch {
      logout();
    }
  }

  return { user, authenticated, role, userEmail, login, logout, rehydrate };
});
```

- [ ] **Step 4: Esegui — MUST PASS** (3 test):
```bash
corepack pnpm --filter @coralyn/web-platform test -- session
```

- [ ] **Step 5: Commit**
```bash
git add apps/web-platform/src/stores/session.ts apps/web-platform/src/stores/session.spec.ts
git commit -m "feat(web-platform): session store — login/rehydrate rifiutano i non-superuser"
```

---

## Task 4: Router + guard + chrome (PlatformShell) + LoginView

**Files:**
- Create: `src/router/index.ts`, `src/router/meta.d.ts`, `src/app/PlatformShell.vue`, `src/app/AuthLayout.vue`, `src/features/auth/LoginView.vue`
- Test: `src/features/auth/LoginView.spec.ts`
- Modify: `src/App.vue` (usa `PlatformShell`)

- [ ] **Step 1: `src/router/meta.d.ts`** (augment RouteMeta):
```ts
import 'vue-router';
import type { Role } from '@coralyn/contracts';
declare module 'vue-router' {
  interface RouteMeta { title?: string; public?: boolean; bare?: boolean; role?: Role }
}
```

- [ ] **Step 2: `src/router/index.ts`** — home = `/establishments`, guard superuser:
```ts
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/establishments' },
  { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/establishments', name: 'establishments', component: () => import('@/features/establishments/EstablishmentsListView.vue'), meta: { title: 'Lidi', role: Role.Superuser } },
  { path: '/establishments/:id', name: 'establishment-detail', component: () => import('@/features/establishments/EstablishmentDetailView.vue'), meta: { title: 'Dettaglio lido', role: Role.Superuser } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'login' };
  const required = to.meta.role as Role | undefined;
  if (required && session.role !== required) return { name: 'login' };
  return true;
});
```

- [ ] **Step 3: `src/app/AuthLayout.vue`** — layout della pagina login (due colonne: hero brandizzato + form). Costruiscilo con Tailwind (tema ui-kit), slot `#hero`/`#footer` + default per il form. Brand "Coralyn Platform", sottotitolo "Console distributore". Nessun asset immagine esterno obbligatorio (usa testo/gradiente, per non rompere vitest sugli asset). Mirror strutturale di `apps/web-staff/src/app/AuthLayout.vue` ma con copy propria.

- [ ] **Step 4: `src/features/auth/LoginView.vue`:**
```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Field, Input, Button } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';
import AuthLayout from '@/app/AuthLayout.vue';

const router = useRouter();
const session = useSessionStore();
const email = ref('');
const password = ref('');
const errore = ref<string | null>(null);
const loading = ref(false);

async function accedi(): Promise<void> {
  errore.value = null;
  loading.value = true;
  try {
    await session.login(email.value, password.value);
    router.push({ name: 'establishments' });
  } catch (e) {
    // Messaggio esplicito per il caso "non-superuser" (403 logico lato app); generico altrimenti.
    errore.value = e instanceof Error && e.message.includes('riservato') ? e.message : 'Email o password non corretti';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <AuthLayout>
    <p v-if="errore" role="alert" data-testid="login-error" class="mb-3 text-sm text-red-600">{{ errore }}</p>
    <form class="flex flex-col gap-4" @submit.prevent="accedi">
      <Field label="Email"><Input v-model="email" type="email" data-testid="login-email" placeholder="operatore@coralyn.dev" /></Field>
      <Field label="Password"><Input v-model="password" type="password" data-testid="login-password" placeholder="••••••••" /></Field>
      <Button type="submit" class="w-full" :disabled="loading" data-testid="login-submit">{{ loading ? 'Accesso…' : 'Accedi' }}</Button>
    </form>
  </AuthLayout>
</template>
```

- [ ] **Step 5: `src/app/PlatformShell.vue`** — chrome purpose-built (topbar rifinita, no sidebar). Struttura: se la rotta ha `meta.bare` (login) → renderizza solo `<RouterView />`; altrimenti topbar con brand "Coralyn Platform", nav (link "Lidi" → `/establishments` con stato attivo), a destra `userEmail` + bottone Logout, e `<main>` con `<RouterView />`. Usa ui-kit (`Button`, `Icon`, `Badge`) e Tailwind. Logout → `session.logout()` + `router.push({ name: 'login' })`. Esempio scheletro:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button, Icon } from '@coralyn/ui-kit';
import { useSessionStore } from '@/stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const bare = computed(() => route.meta.bare === true);
function logout(): void { session.logout(); router.push({ name: 'login' }); }
</script>

<template>
  <RouterView v-if="bare" />
  <div v-else class="min-h-screen bg-[var(--surface,#f7f7f5)]">
    <header class="flex items-center justify-between border-b px-6 py-3">
      <div class="flex items-center gap-6">
        <span class="font-semibold">Coralyn <span class="opacity-60">Platform</span></span>
        <nav class="flex gap-4 text-sm">
          <RouterLink to="/establishments" class="hover:underline" active-class="font-semibold" data-testid="nav-establishments">Lidi</RouterLink>
        </nav>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span class="opacity-70" data-testid="current-user">{{ session.userEmail }}</span>
        <Button variant="secondary" data-testid="logout" @click="logout"><Icon name="log-out" :size="15" />Esci</Button>
      </div>
    </header>
    <main class="p-6"><RouterView /></main>
  </div>
</template>
```
Verifica in `packages/ui-kit/src/icons/registry.ts` che esistano `log-out` (se assente, aggiungilo mappando `~icons/lucide/log-out`, o usa un'icona presente). **Rifinisci** spaziature/tipografia coerenti col linguaggio visivo Coralyn ([ADR-0027](../../architecture/decisions/0027-coralyn-linguaggio-visivo.md)) — questa è la chrome "professionale, non pigra".

- [ ] **Step 6: `src/App.vue`** → `<PlatformShell />`.

- [ ] **Step 7: `LoginView.spec.ts`** — login ok naviga, non-superuser mostra il messaggio riservato:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import LoginView from './LoginView.vue';
import { mountApp } from '@/test/utils';
import * as http from '@/lib/http';

const push = vi.fn();
vi.mock('vue-router', async (orig) => ({ ...(await orig<any>()), useRouter: () => ({ push }) }));
// AuthLayout non ha asset esterni → non serve stub; se importasse un logo, stubbalo qui.

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('LoginView (platform)', () => {
  beforeEach(() => { push.mockReset(); vi.restoreAllMocks(); localStorage.clear(); });

  it('login superuser → naviga a establishments', async () => {
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ accessToken: 't', user: { id: 'su', email: 's@p.test', role: Role.Superuser, establishmentId: null } } as any);
    const w = mountApp(LoginView, { attachTo: document.body });
    (w.find('[data-testid="login-email"]').element as HTMLInputElement).value = 's@p.test';
    await w.find('[data-testid="login-email"]').setValue('s@p.test');
    await w.find('[data-testid="login-password"]').setValue('pw');
    await w.find('[data-testid="login-submit"]').trigger('submit');
    await settle();
    expect(push).toHaveBeenCalledWith({ name: 'establishments' });
    w.unmount();
  });

  it('login non-superuser → messaggio "riservato", nessuna navigazione', async () => {
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ accessToken: 't', user: { id: 'a', email: 'a@lido.test', role: Role.Admin, establishmentId: 'e-1' } } as any);
    const w = mountApp(LoginView, { attachTo: document.body });
    await w.find('[data-testid="login-email"]').setValue('a@lido.test');
    await w.find('[data-testid="login-password"]').setValue('pw');
    await w.find('[data-testid="login-submit"]').trigger('submit');
    await settle();
    expect(w.find('[data-testid="login-error"]').text()).toContain('riservato');
    expect(push).not.toHaveBeenCalled();
    w.unmount();
  });
});
```

- [ ] **Step 8: Esegui i test + typecheck**
```bash
corepack pnpm --filter @coralyn/web-platform test -- LoginView
corepack pnpm --filter @coralyn/web-platform typecheck
```
Expected: 2 test verdi; typecheck pulito.

- [ ] **Step 9: Commit**
```bash
git add apps/web-platform/src/router apps/web-platform/src/app apps/web-platform/src/features/auth apps/web-platform/src/App.vue
git commit -m "feat(web-platform): router+guard superuser, PlatformShell (chrome), LoginView"
```

---

## Task 5: MSW — handlers platform + seed in-memory

**Files:**
- Create: `apps/web-platform/src/mocks/server.ts` (sostituisce lo stub del Task 1), `apps/web-platform/src/mocks/handlers.ts`

- [ ] **Step 1: `src/mocks/handlers.ts`** — seed in-memory + handlers per auth e `/api/platform/*`:
```ts
import { http, HttpResponse } from 'msw';
import { Role, type PlatformEstablishmentDTO, type UserDTO } from '@coralyn/contracts';

export const MOCK_TOKEN = 'valid-super-token';
export const MOCK_SUPERUSER: UserDTO = { id: 'su-1', email: 'super@coralyn.test', role: Role.Superuser, establishmentId: null };

function baseDto(over: Partial<PlatformEstablishmentDTO> & { id: string; name: string }): PlatformEstablishmentDTO {
  return {
    createdAt: '2026-01-01T00:00:00.000Z', suspendedAt: null,
    sectors: 0, rows: 0, umbrellas: 0, staffUsersActive: 1, lastActivityAt: null,
    revenueSeasonTotal: 0, activeSubscriptions: 0, bookingsThisSeason: 0, occupancyPctToday: 0,
    ...over,
  };
}

let seed: PlatformEstablishmentDTO[] = [];
export function resetPlatformSeed(): void {
  seed = [
    baseDto({ id: 'e-1', name: 'Lido Alpha', umbrellas: 40, revenueSeasonTotal: 12000, occupancyPctToday: 55, staffUsersActive: 3 }),
    baseDto({ id: 'e-2', name: 'Lido Beta (sospeso)', suspendedAt: '2026-06-01T00:00:00.000Z', umbrellas: 10 }),
  ];
}
resetPlatformSeed();

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email: string };
    return HttpResponse.json({ accessToken: MOCK_TOKEN, user: MOCK_SUPERUSER });
  }),
  http.get('/api/auth/me', () => HttpResponse.json(MOCK_SUPERUSER)),

  http.get('/api/platform/establishments', () => HttpResponse.json(seed)),
  http.get('/api/platform/establishments/:id', ({ params }) => {
    const found = seed.find((e) => e.id === params.id);
    return found ? HttpResponse.json(found) : new HttpResponse(null, { status: 404 });
  }),
  http.post('/api/platform/establishments', async ({ request }) => {
    const body = (await request.json()) as { name: string; adminEmail: string };
    const dto = baseDto({ id: `e-${seed.length + 1}`, name: body.name });
    seed.push(dto);
    return HttpResponse.json({ establishment: dto, adminEmail: body.adminEmail, temporaryPassword: 'Tmp-abc123XYZ' }, { status: 201 });
  }),
  http.post('/api/platform/establishments/:id/suspend', ({ params }) => {
    const e = seed.find((x) => x.id === params.id);
    if (!e) return new HttpResponse(null, { status: 404 });
    e.suspendedAt = '2026-07-05T00:00:00.000Z';
    return HttpResponse.json(e, { status: 201 });
  }),
  http.post('/api/platform/establishments/:id/reactivate', ({ params }) => {
    const e = seed.find((x) => x.id === params.id);
    if (!e) return new HttpResponse(null, { status: 404 });
    e.suspendedAt = null;
    return HttpResponse.json(e, { status: 201 });
  }),
];
```

- [ ] **Step 2: `src/mocks/server.ts`** (sostituisci lo stub del Task 1):
```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
export { resetPlatformSeed, MOCK_TOKEN, MOCK_SUPERUSER } from './handlers';
```

- [ ] **Step 3: Verifica che il harness gira ancora** (setup.ts ora ha handlers reali):
```bash
corepack pnpm --filter @coralyn/web-platform test -- sanity
```
Expected: sanity verde, nessun errore di import.

- [ ] **Step 4: Commit**
```bash
git add apps/web-platform/src/mocks
git commit -m "feat(web-platform): MSW handlers /api/platform/* + seed in-memory"
```

---

## Task 6: Composable `usePlatformEstablishments`

**Files:**
- Create: `apps/web-platform/src/features/establishments/usePlatformEstablishments.ts`
- Test: `apps/web-platform/src/features/establishments/usePlatformEstablishments.spec.ts`

- [ ] **Step 1: Scrivi il test che fallisce** — monta i composable dentro un componente di prova o usa il pattern di web-staff (`queryResource` richiede il contesto VueQuery). Il modo più semplice e robusto è testare le viste (Task 7/9); qui testiamo la forma delle query/mutation con un mini-harness. Crea `usePlatformEstablishments.spec.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { mountApp } from '@/test/utils';
import { resetPlatformSeed } from '@/mocks/server';
import { useEstablishmentsList, useCreateEstablishment } from './usePlatformEstablishments';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

beforeEach(() => resetPlatformSeed());

it('useEstablishmentsList: carica la lista dal server', async () => {
  let data: any;
  const Probe = defineComponent({ setup() { const q = useEstablishmentsList(); data = q; return () => h('div'); } });
  const w = mountApp(Probe, { attachTo: document.body });
  await settle();
  expect(data.data.value).toHaveLength(2);
  expect(data.data.value[0].name).toBe('Lido Alpha');
  w.unmount();
});

it('useCreateEstablishment: crea e ritorna la risposta con password temporanea', async () => {
  let mut: any;
  const Probe = defineComponent({ setup() { mut = useCreateEstablishment(); return () => h('div'); } });
  const w = mountApp(Probe, { attachTo: document.body });
  const res = await mut.mutateAsync({ name: 'Lido Nuovo', adminEmail: 'a@nuovo.test' });
  expect(res.temporaryPassword).toBeTruthy();
  expect(res.establishment.name).toBe('Lido Nuovo');
  w.unmount();
});
```
(Se il factory `queryResource`/`mutationResource` espone nomi diversi da `data`/`mutateAsync`, adatta il test alla firma reale letta in `apps/web-staff/src/lib/useQueryResource.ts`.)

- [ ] **Step 2: Esegui — MUST FAIL** (modulo assente).

- [ ] **Step 3: Implementa `usePlatformEstablishments.ts`** usando `queryResource`/`mutationResource`:
```ts
import type { CreateEstablishmentInput, CreateEstablishmentResponse, PlatformEstablishmentDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useEstablishmentsList() {
  return queryResource({
    queryKey: () => queryKeys.establishments(),
    queryFn: () => apiFetch<PlatformEstablishmentDTO[]>('/platform/establishments'),
  });
}

export function useEstablishmentDetail(id: () => string) {
  return queryResource({
    queryKey: () => queryKeys.establishment(id()),
    queryFn: () => apiFetch<PlatformEstablishmentDTO>(`/platform/establishments/${id()}`),
  });
}

export function useCreateEstablishment() {
  return mutationResource({
    mutationFn: (input: CreateEstablishmentInput) =>
      apiFetch<CreateEstablishmentResponse>('/platform/establishments', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishments()],
  });
}

export function useSuspendEstablishment() {
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PlatformEstablishmentDTO>(`/platform/establishments/${id}/suspend`, { method: 'POST' }),
    invalidates: () => [queryKeys.establishments()],
  });
}

export function useReactivateEstablishment() {
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PlatformEstablishmentDTO>(`/platform/establishments/${id}/reactivate`, { method: 'POST' }),
    invalidates: () => [queryKeys.establishments()],
  });
}
```
**Adatta le firme** (`queryKey`/`queryFn`/`mutationFn`/`invalidates`) a quelle reali del factory letto in web-staff; i nomi qui seguono la ricognizione ma vanno verificati.

- [ ] **Step 4: Esegui — MUST PASS** (2 test).

- [ ] **Step 5: Commit**
```bash
git add apps/web-platform/src/features/establishments/usePlatformEstablishments.ts apps/web-platform/src/features/establishments/usePlatformEstablishments.spec.ts
git commit -m "feat(web-platform): composable usePlatformEstablishments (lista/dettaglio/create/suspend/reactivate)"
```

---

## Task 7: Vista lista lidi + azioni + modale create

**Files:**
- Create: `src/features/establishments/EstablishmentsListView.vue`, `src/features/establishments/CreateEstablishmentModal.vue`
- Test: `src/features/establishments/EstablishmentsListView.spec.ts`

- [ ] **Step 1: `CreateEstablishmentModal.vue`** — Modal con form (nome + email admin); su successo emette e mostra la **password temporanea una-tantum** (copiabile). Props `open` (v-model), emette `created`. Usa `useCreateEstablishment`. Stato interno: `phase = 'form' | 'result'`. Nel `result` mostra `temporaryPassword` con bottone "Copia" e un avviso "mostrata una sola volta". `data-testid`: `create-name`, `create-admin-email`, `create-submit`, `temp-password`, `create-done`. Alla chiusura resetta a `phase='form'`.

- [ ] **Step 2: `EstablishmentsListView.vue`** — usa `useEstablishmentsList` + `PageToolbar` (titolo "Lidi" + bottone "Nuovo lido" → apre la modale) + `DataTable`/tabella con colonne: Nome, Creato, Ombrelloni, Staff attivi, Incasso stagione (`formatEuro`), Occupazione oggi %, Ultima attività, Stato (Badge "Attivo"/"Sospeso"), Azioni (Sospendi/Riattiva via `ConfirmDialog`, e link "Dettaglio" → `/establishments/:id`). Righe con `data-testid="est-row"` e attributi tipo `data-testid="est-name"`. Sospendi/Riattiva usano i rispettivi composable; durante il pending disabilita il bottone. `EmptyState` se lista vuota. Nessuna colonna/`v-if` che mostri clienti/PII.

- [ ] **Step 3: `EstablishmentsListView.spec.ts`** — copre: rende le 2 righe seed; badge "Sospeso" sulla seconda; apertura modale create + submit → compare `temp-password`; azione suspend su Lido Alpha → dopo conferma la riga passa a "Sospeso". Pattern MSW + teleport (attachTo body, document.querySelector per Modal/ConfirmDialog, `settle()`, `w.unmount()`), `server.use(...)` per override se serve. Esempio nucleo:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import EstablishmentsListView from './EstablishmentsListView.vue';
import { mountApp } from '@/test/utils';
import { resetPlatformSeed } from '@/mocks/server';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };
beforeEach(() => resetPlatformSeed());

it('mostra i lidi seed con il badge Sospeso', async () => {
  const w = mountApp(EstablishmentsListView, { attachTo: document.body });
  await settle();
  const rows = w.findAll('[data-testid="est-row"]');
  expect(rows).toHaveLength(2);
  expect(w.html()).toContain('Lido Alpha');
  expect(w.html()).toContain('Sospeso');
  w.unmount();
});

it('crea un lido → mostra la password temporanea una-tantum', async () => {
  const w = mountApp(EstablishmentsListView, { attachTo: document.body });
  await settle();
  await w.find('[data-testid="new-establishment"]').trigger('click');
  await settle();
  (document.querySelector('[data-testid="create-name"]') as HTMLInputElement).value = 'Lido Gamma';
  document.querySelector('[data-testid="create-name"]')!.dispatchEvent(new Event('input', { bubbles: true }));
  (document.querySelector('[data-testid="create-admin-email"]') as HTMLInputElement).value = 'a@gamma.test';
  document.querySelector('[data-testid="create-admin-email"]')!.dispatchEvent(new Event('input', { bubbles: true }));
  (document.querySelector('[data-testid="create-submit"]') as HTMLButtonElement).click();
  await settle();
  expect(document.querySelector('[data-testid="temp-password"]')!.textContent).toBeTruthy();
  w.unmount();
});
```
(Aggiungi il test suspend→badge come terzo caso, sullo stesso pattern con `ConfirmDialog` — il bottone conferma ha testo `Elimina`? No: per suspend usa un `ConfirmDialog` con `confirmLabel="Sospendi"`; asserisci di conseguenza.)

- [ ] **Step 4: Esegui i test + typecheck**
```bash
corepack pnpm --filter @coralyn/web-platform test -- EstablishmentsListView
corepack pnpm --filter @coralyn/web-platform typecheck
```

- [ ] **Step 5: Commit**
```bash
git add apps/web-platform/src/features/establishments/EstablishmentsListView.vue apps/web-platform/src/features/establishments/CreateEstablishmentModal.vue apps/web-platform/src/features/establishments/EstablishmentsListView.spec.ts
git commit -m "feat(web-platform): vista lista lidi + modale create (password temp una-tantum) + azioni suspend/reactivate"
```

---

## Task 8: Vista dettaglio lido

**Files:**
- Create: `src/features/establishments/EstablishmentDetailView.vue`
- Test: `src/features/establishments/EstablishmentDetailView.spec.ts`

- [ ] **Step 1: `EstablishmentDetailView.vue`** — legge `route.params.id`, usa `useEstablishmentDetail`, mostra le metriche in `KpiCard`/`StatTile` (Ombrelloni, Settori, File, Staff attivi, Incasso stagione `formatEuro`, Abbonamenti attivi, Prenotazioni stagione, Occupazione oggi %, Ultima attività, Creato), badge stato, e i bottoni Sospendi/Riattiva (ConfirmDialog). Nessuna PII. `EmptyState`/spinner in loading; gestione 404 (se la query fallisce, messaggio "Lido non trovato"). Bottone "← Lidi" → `/establishments`.

- [ ] **Step 2: `EstablishmentDetailView.spec.ts`** — monta con una rotta `/establishments/e-1` (usa il router in-memory di `mountApp`; se serve, naviga prima). Verifica che mostri "Lido Alpha" e le metriche (es. Ombrelloni 40, Occupazione 55%). Pattern MSW + settle + unmount.

- [ ] **Step 3: Esegui i test + typecheck**
```bash
corepack pnpm --filter @coralyn/web-platform test -- EstablishmentDetailView
corepack pnpm --filter @coralyn/web-platform typecheck
```

- [ ] **Step 4: Full test dell'app + commit**
```bash
corepack pnpm --filter @coralyn/web-platform test
git add apps/web-platform/src/features/establishments/EstablishmentDetailView.vue apps/web-platform/src/features/establishments/EstablishmentDetailView.spec.ts
git commit -m "feat(web-platform): vista dettaglio lido (metriche PII-free + suspend/reactivate)"
```

---

## Task 9: Deployment — Dockerfile, nginx, docker-compose

**Files:**
- Create: `apps/web-platform/Dockerfile`, `apps/web-platform/nginx.conf`
- Modify: `docker-compose.yml` (aggiungi servizio `web-platform`)

- [ ] **Step 1: Copia `apps/web-staff/Dockerfile`** → `apps/web-platform/Dockerfile`, cambiando i riferimenti al nome app: `--filter "@coralyn/web-platform..."`, `pnpm --filter @coralyn/web-platform build`, e `COPY --from=build /app/apps/web-platform/dist /usr/share/nginx/html`. Il resto (contesto = repo root, build contracts, nginx:alpine) invariato.

- [ ] **Step 2: Copia `apps/web-staff/nginx.conf`** → `apps/web-platform/nginx.conf` **verbatim** (proxy `/api/`→`api:3000`, `/health`, SPA fallback — il riferimento `api:3000` è il servizio compose, non app-specifico).

- [ ] **Step 3: Aggiungi il servizio in `docker-compose.yml`** (dentro il profilo `full`, porta host **8081** per non collidere con `web`:8080):
```yaml
  web-platform:
    profiles: ["full"]
    build:
      context: .
      dockerfile: apps/web-platform/Dockerfile
    container_name: coralyn-web-platform
    depends_on:
      api: { condition: service_healthy }
    ports:
      - "8081:80"
```

- [ ] **Step 4: Verifica build immagine** (facoltativo se Docker è su):
```bash
docker compose --profile full build web-platform
```
Expected: build ok. (Se Docker non è disponibile in questa fase, salta e nota; la verifica LIVE è in fondo.)

- [ ] **Step 5: Commit**
```bash
git add apps/web-platform/Dockerfile apps/web-platform/nginx.conf docker-compose.yml
git commit -m "feat(web-platform): Dockerfile + nginx + servizio docker-compose (porta 8081)"
```

---

## Self-Review (eseguita in scrittura)

- **Spec coverage (§9):** app separata (Task 1) ✓; login superuser brandizzato (Task 4) ✓; lista lidi + metriche + badge Sospeso + azioni (Task 7) ✓; create con password una-tantum (Task 7) ✓; dettaglio aggregati (Task 8) ✓; nessuna vista PII (Task 7/8, esplicito) ✓; deploy (Task 9) ✓.
- **Sicurezza:** login E rehydrate rifiutano i non-superuser (Task 3); guard `meta.role: Superuser` su tutte le rotte non-public (Task 4); token in chiave localStorage dedicata (Task 2).
- **Type consistency:** `PlatformEstablishmentDTO`/`CreateEstablishmentInput`/`CreateEstablishmentResponse` usati identici tra composable, viste, MSW e test; nomi query (`useEstablishmentsList`/`useEstablishmentDetail`/`useCreateEstablishment`/`useSuspendEstablishment`/`useReactivateEstablishment`) coerenti tra Task 6/7/8.
- **Dipendenze da verificare durante l'esecuzione** (l'implementer DEVE leggere il file reale e adattare): firme esatte di `queryResource`/`mutationResource` in `apps/web-staff/src/lib/useQueryResource.ts`; presenza icona `log-out` nel registry ui-kit; forma esatta di `.claude/launch.json`; eventuale dipendenza toast del factory.
- **YAGNI:** niente impersonation, niente viste PII, niente billing UI, niente vista audit (tutti deferred).

---

## Verifica LIVE (dopo l'ultimo task, prima di presentare)

Con Docker su e le API già migrate/seedate (superuser dev `super@coralyn.dev`/`coralyn-super-9182` creato nella Slice A):
```bash
docker compose --profile full up -d --build api web-platform
```
Poi via preview (`preview_start "web-platform"` → 5174) o diretto su `http://localhost:8081`:
1. Login come `super@coralyn.dev` → atterra su `/establishments`.
2. La lista mostra il lido dev ("Lido di Sviluppo") con metriche reali.
3. "Nuovo lido" → crea → appare la password temporanea → il nuovo admin fa login su web-staff (8080).
4. Sospendi il lido nuovo → il suo admin non fa più login; riattiva → torna a funzionare.
5. Verifica che nessuna schermata mostri nomi/telefoni dei bagnanti.
Verifica login negato per un utente non-superuser (es. `admin@coralyn.dev`) → messaggio "Accesso riservato".
