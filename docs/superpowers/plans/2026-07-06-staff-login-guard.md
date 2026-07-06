# D-045: web-staff rifiuta i superuser (+ copertura Sidebar) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Impedire ai superuser di piattaforma di autenticarsi su `web-staff` (login + rehydrate), e coprire con un test che la Sidebar renderizza il nome stabilimento dalla sessione.

**Architecture:** Slice **FE-only** (solo web-staff). Guard di ruolo nello store `session` mirroring inverso di web-platform. Nessun backend, nessun contract.

**Tech Stack:** Vue 3 + Pinia + Vitest + msw.

## Global Constraints

- **Package manager:** `corepack pnpm` — MAI `npm`. Se pnpm chiede di purgare `node_modules` senza TTY → `CI=true corepack pnpm install`.
- **Comandi:** web-staff test `--filter web-staff test`; singolo file `--filter web-staff test -- <path>`; typecheck `--filter web-staff typecheck` (EXIT 0).
- **Baseline:** web-staff **253** → atteso ~**257** (+2 session, +2 Sidebar). web-platform **16** invariato (non toccato).
- **`Role.Superuser === 'superuser'`**; `Role` è già importato in `session.ts`.
- **MSW auto-reset:** `test/setup.ts afterEach` fa `server.resetHandlers()` → usare `server.use(...)` per override per-test (niente leak).
- **Branch:** `staff-login-guard` (creato). Nessun push senza ok esplicito.

---

### Task 1: guard di ruolo nello store `session` (D-045)

**Files:**
- Modify: `apps/web-staff/src/stores/session.ts` (login + rehydrate)
- Test: `apps/web-staff/src/stores/session.spec.ts` (+2 casi)

**Interfaces:**
- Produces: `login` rigetta (throw) un utente `Superuser` senza salvare token/sessione; `rehydrate` fa `logout()` se `/me` è `Superuser`.

- [ ] **Step 1: Scrivere i test che falliscono**

In `apps/web-staff/src/stores/session.spec.ts`, aggiungere gli import in cima (se mancanti):

```ts
import { Role } from '@coralyn/contracts';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
```

Aggiungere i due casi dentro `describe('session store', ...)`:

```ts
  it('login di un superuser è rifiutato: throw, nessun token, non autenticato (D-045)', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json({
          accessToken: MOCK_TOKEN,
          user: { id: 'su-1', email: 'super@coralyn.dev', role: Role.Superuser, establishmentId: null, establishmentName: null },
        }),
      ),
    );
    const s = useSessionStore();
    await expect(s.login('super@coralyn.dev', 'coralyn-super')).rejects.toThrow();
    expect(s.authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('rehydrate con token di un superuser fa logout (D-045)', async () => {
    setToken(MOCK_TOKEN);
    server.use(
      http.get('/api/auth/me', () =>
        HttpResponse.json({ id: 'su-1', email: 'super@coralyn.dev', role: Role.Superuser, establishmentId: null, establishmentName: null }),
      ),
    );
    const s = useSessionStore();
    await s.rehydrate();
    expect(s.authenticated).toBe(false);
    expect(getToken()).toBeNull();
  });
```

- [ ] **Step 2: Eseguire e verificare che FALLISCANO (RED)**

Run: `corepack pnpm --filter web-staff test -- src/stores/session.spec.ts`
Expected: FAIL — oggi `login` salva token+user anche per un superuser (`authenticated` true, `getToken()` non-null) e `rehydrate` idrata la sessione senza controllare il ruolo.

- [ ] **Step 3: Implementare il guard in `session.ts`**

`login` — controllare il ruolo PRIMA di `setToken`:

```ts
  async function login(email: string, password: string): Promise<void> {
    const res = await apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    // web-staff è il gestionale di stabilimento: un superuser di piattaforma ha credenziali
    // valide ma NON deve entrare qui (la sua superficie è web-platform). D-045.
    if (res.user.role === Role.Superuser) {
      throw new Error('Accesso riservato al personale dello stabilimento');
    }
    setToken(res.accessToken);
    user.value = res.user;
  }
```

`rehydrate` — logout se `/me` è superuser:

```ts
  async function rehydrate(): Promise<void> {
    if (!getToken()) return;
    try {
      const me = await apiFetch<UserDTO>('/auth/me');
      // Difesa in profondità: un token superuser non deve dare sessione qui. D-045.
      if (me.role === Role.Superuser) {
        logout();
        return;
      }
      user.value = me;
    } catch {
      logout();
    }
  }
```

- [ ] **Step 4: Eseguire e verificare che PASSINO (GREEN)**

Run: `corepack pnpm --filter web-staff test -- src/stores/session.spec.ts`
Expected: PASS — inclusi i 2 nuovi casi e i preesistenti (login admin ok, rehydrate admin ok, ecc.).

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/stores/session.ts apps/web-staff/src/stores/session.spec.ts
git commit -m "feat(web-staff): rifiuta il login/rehydrate dei superuser (D-045)"
```

---

### Task 2: test di copertura Sidebar (nome stabilimento)

**Files:**
- Test (nuovo): `apps/web-staff/src/app/Sidebar.spec.ts`

**Interfaces:**
- Consumes: `Sidebar.vue` (invariato), `session.establishmentName` (già computed dalla sessione).
- Produces: nessuna (test di copertura). Chiude il buco della slice "Nome stabilimento" (#3): garantisce che il binding del banner non si rompa silenziosamente.

> Nota: è un **test di copertura** su comportamento esistente → è atteso **verde al primo run** (non c'è cambio di codice sorgente). Se invece fallisce, indagare (il binding non renderizza come atteso).

- [ ] **Step 1: Scrivere il test**

Create `apps/web-staff/src/app/Sidebar.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mountApp } from '@/test/utils';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import Sidebar from './Sidebar.vue';

function setUser(establishmentName: string) {
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName };
  return s;
}

describe('Sidebar', () => {
  it('mostra nel banner il nome dello stabilimento dalla sessione', async () => {
    const w = mountApp(Sidebar);
    setUser('Lido Delle Palme');
    await w.vm.$nextTick();
    expect(w.text()).toContain('Lido Delle Palme');
  });

  it('riflette reattivamente un cambio di nome', async () => {
    const w = mountApp(Sidebar);
    const s = setUser('Lido Uno');
    await w.vm.$nextTick();
    expect(w.text()).toContain('Lido Uno');
    s.user = { ...s.user!, establishmentName: 'Lido Due' };
    await w.vm.$nextTick();
    expect(w.text()).toContain('Lido Due');
    expect(w.text()).not.toContain('Lido Uno');
  });
});
```

- [ ] **Step 2: Eseguire il test (atteso GREEN)**

Run: `corepack pnpm --filter web-staff test -- src/app/Sidebar.spec.ts`
Expected: PASS (2/2). La Sidebar renderizza `session.establishmentName` reattivamente.

- [ ] **Step 3: Suite completa + typecheck (no regressioni)**

Run: `corepack pnpm --filter web-staff test`
Expected: ~**257** (253 + 2 session + 2 Sidebar).

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web-staff/src/app/Sidebar.spec.ts
git commit -m "test(web-staff): copre il render del nome stabilimento nel banner Sidebar"
```

---

## Verifica finale (dopo Task 2)

- [ ] web-staff ~**257** verdi; web-platform **16** invariato; typecheck EXIT 0.
- [ ] Un superuser non ottiene sessione su web-staff (login rigettato, rehydrate logout); la Sidebar mostra il nome reale.
- [ ] Review whole-branch (opus) prima del merge FF su `main` (ok esplicito).

## Note di scope
- LoginView invariato (messaggio generico di proposito: nessuna conferma di credenziali valide). web-platform non toccata. Nessun backend/contract.
