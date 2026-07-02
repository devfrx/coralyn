# Catalogo Slice A "Scritture sicure & leggibili" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gli errori di scrittura (409/422) arrivano all'utente come toast col messaggio del server; delete-pacchetto con conferma; `GET /rates` validato; fix a11y `Modal` e tipo `Input`; honesty-pass documentale.

**Architecture:** `ApiError` conserva il messaggio d'errore NestJS; un primitivo `Toast` (ui-kit, presentazionale token-first) + coda module-scope in web-staff, agganciata come `onError` di default in `mutationResource` (copre tutte le mutation in un punto). API: query-DTO su `GET /rates`. Nessuna migrazione DB.

**Tech Stack:** Vue 3 + vue-query + msw (web-staff), reka-ui (Modal), NestJS + class-validator (api), vitest / jest+supertest.

**Spec:** `docs/specs/2026-07-02-catalog-slice-a-design.md` (decisioni §5 GIÀ RISOLTE: toast globale; seasonId obbligatorio→400; mockup committato marcato).

## Global Constraints

- Branch: `feat/catalog-slice-a` da `main`. Un commit per task (convenzione commit-per-layer).
- Baseline test da NON regredire: **api unit 83 · api e2e 110 · web-staff 100 · ui-kit 41** (verificata live 2026-07-02).
- Codice/DB in inglese, UI/doc in italiano (ADR-0030). Messaggi errore utente = quelli del server (già in italiano).
- ui-kit è token-first, NO build step; i suoi spec girano dentro la suite web-staff (`vitest.config.ts` include `../../packages/ui-kit/src/**/*.spec.ts`) E nella suite ui-kit standalone.
- Comandi test: `corepack pnpm --filter web-staff test`, `corepack pnpm --filter @coralyn/ui-kit test`, `corepack pnpm --filter api test`, `corepack pnpm --filter api test:e2e` (dal root; DB test su localhost:5433, container `coralyn-db` già up).
- Vietato toccare `pricing.engine.ts`, lo schema Prisma, le migrazioni.

---

### Task 0: Branch

- [ ] **Step 0.1:** `git checkout main && git merge --ff-only origin/main && git checkout -b feat/catalog-slice-a`

---

### Task 1: `ApiError` conserva il messaggio del server (web-staff lib)

**Files:**
- Modify: `apps/web-staff/src/lib/http.ts`
- Test: `apps/web-staff/src/lib/http.spec.ts`

**Interfaces:**
- Produces: `ApiError` con costruttore `(status: number, path: string, serverMessage?: string)`; `.message` = `serverMessage` se presente, altrimenti `` `HTTP ${status} su ${path}` `` (fallback attuale). `.status` invariato (usato da `SettlePaymentModal.vue:54`).

- [ ] **Step 1.1: Test falliti** — aggiungi a `http.spec.ts` (dentro `describe('apiFetch')`):

```ts
it("l'ApiError porta il messaggio del body d'errore NestJS", async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ statusCode: 409, message: 'Pacchetto in uso da tariffe o prenotazioni: non eliminabile.', error: 'Conflict' }), { status: 409 }),
  );
  await expect(apiFetch('/packages/p1')).rejects.toMatchObject({
    status: 409,
    message: 'Pacchetto in uso da tariffe o prenotazioni: non eliminabile.',
  });
});

it("message array (class-validator) → messaggi uniti e leggibili", async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ statusCode: 400, message: ['seasonId must be a UUID', 'price must not be less than 0'], error: 'Bad Request' }), { status: 400 }),
  );
  await expect(apiFetch('/rates')).rejects.toMatchObject({
    status: 400,
    message: 'seasonId must be a UUID; price must not be less than 0',
  });
});

it('body d\'errore non-JSON → fallback al messaggio sintetico', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
  await expect(apiFetch('/clienti')).rejects.toMatchObject({ status: 502, message: 'HTTP 502 su /clienti' });
});

it("body d'errore vuoto → fallback al messaggio sintetico", async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
  await expect(apiFetch('/clienti')).rejects.toMatchObject({ status: 500, message: 'HTTP 500 su /clienti' });
});
```

- [ ] **Step 1.2:** Run `corepack pnpm --filter web-staff test -- src/lib/http.spec.ts` → i 4 nuovi FALLISCONO (message = "HTTP 409 su /packages/p1" ecc.), i 6 esistenti passano.

- [ ] **Step 1.3: Implementazione** — in `http.ts` sostituisci `ApiError` e il ramo `!res.ok`:

```ts
/** Errore HTTP con lo status, così i chiamanti possono reagire (es. 401 → logout).
 *  `message` è quello del server quando il body NestJS lo fornisce, altrimenti il sintetico. */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, path: string, serverMessage?: string) {
    super(serverMessage || `HTTP ${status} su ${path}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Estrae `message` dal body d'errore NestJS ({statusCode, message, error}); string[] → join.
 *  Body vuoto/non-JSON (proxy, 502…) → undefined, il chiamante usa il fallback sintetico. */
async function readErrorMessage(res: Response): Promise<string | undefined> {
  try {
    const { message } = JSON.parse(await res.text()) as { message?: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
    if (Array.isArray(message)) return message.filter((m): m is string => typeof m === 'string').join('; ') || undefined;
  } catch {
    /* fallback sintetico */
  }
  return undefined;
}
```

e in `apiFetch`: `if (!res.ok) throw new ApiError(res.status, path, await readErrorMessage(res));`

- [ ] **Step 1.4:** Run `corepack pnpm --filter web-staff test -- src/lib/http.spec.ts` → PASS (10 test).

- [ ] **Step 1.5: Commit**

```bash
git add apps/web-staff/src/lib/http.ts apps/web-staff/src/lib/http.spec.ts
git commit -m "fix(web-staff): ApiError conserva il messaggio d'errore del server (catalog Slice A)"
```

---

### Task 2: Primitivo `Toast` in ui-kit

**Files:**
- Create: `packages/ui-kit/src/components/Toast.vue`
- Modify: `packages/ui-kit/src/icons/registry.ts` (icona `alert-triangle`), `packages/ui-kit/src/index.ts` (export)
- Test: `packages/ui-kit/src/components/Toast.spec.ts`

**Interfaces:**
- Produces: `<Toast :message="string" @dismiss="() => void" />` — presentazionale, `role="alert"`, stile danger token-first. Esportato da `@coralyn/ui-kit`.

- [ ] **Step 2.1: Test fallito** — `packages/ui-kit/src/components/Toast.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Toast from './Toast.vue';

describe('Toast', () => {
  it('rende il messaggio con role="alert" (annunciato dagli screen reader)', () => {
    const w = mount(Toast, { props: { message: 'Pacchetto in uso: non eliminabile.' } });
    expect(w.attributes('role')).toBe('alert');
    expect(w.text()).toContain('Pacchetto in uso: non eliminabile.');
  });

  it('emette dismiss al click sul bottone di chiusura', async () => {
    const w = mount(Toast, { props: { message: 'Errore' } });
    await w.get('button[aria-label="Chiudi"]').trigger('click');
    expect(w.emitted('dismiss')).toHaveLength(1);
  });

  it('usa i token di superficie/danger (niente colori hardcoded)', () => {
    const w = mount(Toast, { props: { message: 'Errore' } });
    expect(w.classes().join(' ')).toContain('border-[var(--color-danger)]');
    expect(w.classes().join(' ')).toContain('bg-[var(--color-surface)]');
  });
});
```

- [ ] **Step 2.2:** Run `corepack pnpm --filter @coralyn/ui-kit test -- src/components/Toast.spec.ts` → FAIL (componente inesistente).

- [ ] **Step 2.3: Implementazione** — registry: aggiungi `import IconAlert from '~icons/lucide/alert-triangle';` e la entry `'alert-triangle': IconAlert,` nella mappa `icons`. Poi `Toast.vue`:

```vue
<script setup lang="ts">
import Icon from './Icon.vue';
defineProps<{ message: string }>();
const emit = defineEmits<{ dismiss: [] }>();
</script>
<template>
  <div role="alert" class="flex items-start gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-surface)] p-3.5 [box-shadow:var(--shadow-modal)]">
    <Icon name="alert-triangle" :size="16" class="mt-0.5 shrink-0 text-[var(--color-danger)]" />
    <span class="flex-1 text-[13px] leading-snug text-[var(--color-text)]">{{ message }}</span>
    <button type="button" aria-label="Chiudi" class="grid size-6 shrink-0 place-items-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)]" @click="emit('dismiss')">
      <Icon name="x" :size="14" />
    </button>
  </div>
</template>
```

In `index.ts`: `export { default as Toast } from './components/Toast.vue';` (accanto agli altri export componente).

- [ ] **Step 2.4:** Run `corepack pnpm --filter @coralyn/ui-kit test` → PASS (41+3=44).

- [ ] **Step 2.5: Commit**

```bash
git add packages/ui-kit/src/components/Toast.vue packages/ui-kit/src/components/Toast.spec.ts packages/ui-kit/src/icons/registry.ts packages/ui-kit/src/index.ts
git commit -m "feat(ui-kit): primitivo Toast token-first per il feedback errori (catalog Slice A)"
```

---

### Task 3: Fix `Modal` aria-describedby + `Input` string|number (ui-kit)

**Files:**
- Modify: `packages/ui-kit/src/components/Modal.vue`, `packages/ui-kit/src/components/Input.vue:3`
- Test: `packages/ui-kit/src/components/Modal.spec.ts` (nuovo), `packages/ui-kit/src/components/Input.spec.ts` (nuovo)

**Interfaces:**
- Produces: `Modal` prop opzionale `description?: string`; `DialogDescription` SEMPRE montata (visibile se `description`, altrimenti `sr-only` col testo del titolo) → `aria-describedby` presente, niente warn reka-ui. `Input` `defineModel<string | number>()` — nessun cambiamento per i chiamanti string.

- [ ] **Step 3.1: Test falliti** — `Modal.spec.ts` (reka-ui usa il portal: interroga `document.body`):

```ts
import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Modal from './Modal.vue';

const mountModal = (props: Record<string, unknown>) =>
  mount(Modal, { props: { open: true, title: 'Titolo', ...props }, attachTo: document.body });

afterEach(() => { document.body.innerHTML = ''; });

describe('Modal', () => {
  it('ha sempre aria-describedby che punta a un elemento reale (no warn reka-ui)', () => {
    mountModal({});
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).not.toBeNull();
  });

  it('con description la mostra come testo visibile sotto il titolo', () => {
    mountModal({ description: 'Compila i campi e salva.' });
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const desc = document.getElementById(dialog.getAttribute('aria-describedby')!)!;
    expect(desc.textContent).toContain('Compila i campi e salva.');
    expect(desc.className).not.toContain('sr-only');
  });

  it('senza description l\'elemento è sr-only (solo per screen reader)', () => {
    mountModal({});
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const desc = document.getElementById(dialog.getAttribute('aria-describedby')!)!;
    expect(desc.className).toContain('sr-only');
  });
});
```

`Input.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import Input from './Input.vue';

afterEach(() => vi.restoreAllMocks());

describe('Input', () => {
  it('accetta modelValue numerico senza warn (v-model su type="number" emette Number)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount(Input, { props: { modelValue: 42 }, attrs: { type: 'number' } });
    const typeWarn = warn.mock.calls.find((c) => String(c[0]).includes('Invalid prop'));
    expect(typeWarn).toBeUndefined();
  });

  it('resta compatibile con modelValue stringa', () => {
    const w = mount(Input, { props: { modelValue: 'abc' } });
    expect(w.find('input').element.value).toBe('abc');
  });
});
```

- [ ] **Step 3.2:** Run `corepack pnpm --filter @coralyn/ui-kit test` → Modal.spec FAIL (aria-describedby assente), Input.spec: il test warn FAIL.

- [ ] **Step 3.3: Implementazione** — `Modal.vue`: importa `DialogDescription` da `reka-ui`, aggiungi `description?: string` alle prop, e sotto `DialogTitle`:

```vue
<DialogDescription :class="description ? 'mt-1 text-[12.5px] text-[var(--color-text-2nd)]' : 'sr-only'">
  {{ description ?? title }}
</DialogDescription>
```

`Input.vue:3`: `const model = defineModel<string | number>();`

- [ ] **Step 3.4:** Run `corepack pnpm --filter @coralyn/ui-kit test` → PASS (44+5=49). Poi `corepack pnpm --filter web-staff test` → PASS (i 100 base + i nuovi ui-kit inclusi dal glob; nessuna regressione delle viste che usano Modal).

- [ ] **Step 3.5: Commit**

```bash
git add packages/ui-kit/src/components/Modal.vue packages/ui-kit/src/components/Modal.spec.ts packages/ui-kit/src/components/Input.vue packages/ui-kit/src/components/Input.spec.ts
git commit -m "fix(ui-kit): Modal con DialogDescription (a11y) + Input string|number (catalog Slice A)"
```

---

### Task 4: Coda toast + `ToastHost` + onError di default in `mutationResource` (web-staff)

**Files:**
- Create: `apps/web-staff/src/lib/toasts.ts`, `apps/web-staff/src/app/ToastHost.vue`
- Modify: `apps/web-staff/src/lib/useQueryResource.ts`, `apps/web-staff/src/app/AppShell.vue`, `apps/web-staff/src/features/bookings/useBookings.ts:39` (`useSettlePayment` → `quiet: true`), `apps/web-staff/src/test/setup.ts` (reset toasts)
- Test: `apps/web-staff/src/lib/toasts.spec.ts`, `apps/web-staff/src/lib/useQueryResource.spec.ts`

**Interfaces:**
- Consumes: `Toast` da `@coralyn/ui-kit` (Task 2); `ApiError.message` col messaggio server (Task 1).
- Produces: `pushToast(message: string)`, `dismissToast(id: number)`, `clearToasts()`, `useToasts(): { items: ToastItem[] }` con `ToastItem = { id: number; message: string }` (module-scope, usabile fuori dal contesto componente). `mutationResource` accetta `quiet?: boolean` (default false → toast su errore con `error.message`).

- [ ] **Step 4.1: Test falliti** — `toasts.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { pushToast, dismissToast, clearToasts, useToasts } from './toasts';

beforeEach(() => { clearToasts(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

describe('toasts', () => {
  it('pushToast accoda; dismissToast rimuove', () => {
    pushToast('Errore A');
    pushToast('Errore B');
    const { items } = useToasts();
    expect(items.map((t) => t.message)).toEqual(['Errore A', 'Errore B']);
    dismissToast(items[0].id);
    expect(items.map((t) => t.message)).toEqual(['Errore B']);
  });

  it('auto-dismiss dopo 6 secondi', () => {
    pushToast('Errore effimero');
    expect(useToasts().items).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    expect(useToasts().items).toHaveLength(0);
  });
});
```

In `useQueryResource.spec.ts` aggiungi (riusa `mountHook` esistente; importa `clearToasts`, `useToasts` da `./toasts`):

```ts
describe('mutationResource — feedback errori (Slice A)', () => {
  it('su errore pubblica un toast col message dell\'errore', async () => {
    clearToasts();
    const mutationFn = vi.fn().mockRejectedValue(new Error('Pacchetto in uso: non eliminabile.'));
    const { api } = mountHook(() => mutationResource({ mutationFn, invalidates: () => [] }));
    await expect(api().mutateAsync('x')).rejects.toThrow();
    await flushPromises();
    expect(useToasts().items.map((t) => t.message)).toEqual(['Pacchetto in uso: non eliminabile.']);
  });

  it('quiet: true NON pubblica il toast (il chiamante gestisce inline, es. SettlePaymentModal)', async () => {
    clearToasts();
    const mutationFn = vi.fn().mockRejectedValue(new Error('boom'));
    const { api } = mountHook(() => mutationResource({ mutationFn, invalidates: () => [], quiet: true }));
    await expect(api().mutateAsync('x')).rejects.toThrow();
    await flushPromises();
    expect(useToasts().items).toHaveLength(0);
  });
});
```

- [ ] **Step 4.2:** Run `corepack pnpm --filter web-staff test -- src/lib` → nuovi FAIL (modulo/opzione inesistenti).

- [ ] **Step 4.3: Implementazione** — `lib/toasts.ts`:

```ts
import { reactive } from 'vue';

/** Coda toast module-scope (non Pinia): dev'essere usabile anche fuori dal contesto
 *  componente/store, es. dall'onError di default di mutationResource. */
export interface ToastItem { id: number; message: string }

const state = reactive<{ items: ToastItem[] }>({ items: [] });
let nextId = 1;
const AUTO_DISMISS_MS = 6000;

export function useToasts(): { items: ToastItem[] } {
  return state;
}
export function pushToast(message: string): void {
  const id = nextId++;
  state.items.push({ id, message });
  setTimeout(() => dismissToast(id), AUTO_DISMISS_MS);
}
export function dismissToast(id: number): void {
  const i = state.items.findIndex((t) => t.id === id);
  if (i >= 0) state.items.splice(i, 1);
}
export function clearToasts(): void {
  state.items.splice(0);
}
```

`useQueryResource.ts` — `mutationResource` diventa (commento factory in testa: aggiorna la doc con la riga sull'onError di default):

```ts
export function mutationResource<TInput, TOutput>(opts: {
  mutationFn: (input: TInput) => Promise<TOutput>;
  invalidates: () => QueryKey[];
  /** true = niente toast globale su errore (il chiamante mostra l'errore inline). */
  quiet?: boolean;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onError: (error) => {
      if (!opts.quiet) pushToast(error instanceof Error ? error.message : String(error));
    },
    onSuccess: () => {
      for (const key of opts.invalidates()) qc.invalidateQueries({ queryKey: key });
    },
  });
}
```

(import: `import { pushToast } from './toasts';`)

`app/ToastHost.vue`:

```vue
<script setup lang="ts">
import { Toast } from '@coralyn/ui-kit';
import { useToasts, dismissToast } from '@/lib/toasts';
const toasts = useToasts();
</script>
<template>
  <div class="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[360px] max-w-[calc(100vw-40px)] flex-col gap-2">
    <Toast v-for="t in toasts.items" :key="t.id" class="pointer-events-auto" :message="t.message" @dismiss="dismissToast(t.id)" />
  </div>
</template>
```

`AppShell.vue`: importa `ToastHost` e aggiungi `<ToastHost />` come nodo root aggiuntivo del template (dopo il `div` principale, fuori dal ramo `v-if`, così copre anche le viste `bare` come il login).

`useBookings.ts:39` (`useSettlePayment`): aggiungi `quiet: true` alle opzioni di `mutationResource` (il modale ha già l'errore inline a `SettlePaymentModal.vue:53-60`; senza `quiet` mostreremmo il doppio feedback).

`test/setup.ts`: in `beforeEach` aggiungi `clearToasts()` (import da `@/lib/toasts`).

- [ ] **Step 4.4:** Run `corepack pnpm --filter web-staff test` → PASS (tutti; i 4 nuovi inclusi).

- [ ] **Step 4.5: Commit**

```bash
git add apps/web-staff/src/lib/toasts.ts apps/web-staff/src/lib/toasts.spec.ts apps/web-staff/src/lib/useQueryResource.ts apps/web-staff/src/lib/useQueryResource.spec.ts apps/web-staff/src/app/ToastHost.vue apps/web-staff/src/app/AppShell.vue apps/web-staff/src/features/bookings/useBookings.ts apps/web-staff/src/test/setup.ts
git commit -m "feat(web-staff): toast globale per gli errori di mutation col messaggio del server (catalog Slice A)"
```

---

### Task 5: Conferma delete-pacchetto + error-path coperti (web-staff)

**Files:**
- Modify: `apps/web-staff/src/features/pricing/PricingView.vue` (`:250` delete senza conferma)
- Test: `apps/web-staff/src/features/pricing/PricingView.spec.ts`, `apps/web-staff/src/features/renewals/RenewalsView.spec.ts` (o test composable in `useQueryResource.spec.ts` se i selettori della vista non bastano — preferisci la vista)

**Interfaces:**
- Consumes: toast di Task 4 (`useToasts` per le assert), `ApiError.message` di Task 1, msw `server.use(...)` per gli override 409/422.

- [ ] **Step 5.1: Test falliti** — in `PricingView.spec.ts` aggiungi (import: `server` da `@/mocks/server`, `http, HttpResponse` da `msw`, `useToasts` da `@/lib/toasts`):

```ts
describe('elimina pacchetto: conferma + errore server visibile (Slice A)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('annullando la conferma NON elimina il pacchetto', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="del-pkg-pkg-1"]').trigger('click');
    await settle();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('Standard');
    expect(w.text()).toContain('Standard'); // il pacchetto resta
  });

  it('409 dal server (pacchetto in uso) → il messaggio del server diventa un toast', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    server.use(
      http.delete('/api/packages/:id', () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Pacchetto in uso da tariffe o prenotazioni: non eliminabile.', error: 'Conflict' },
          { status: 409 },
        ),
      ),
    );
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="del-pkg-pkg-1"]').trigger('click');
    await settle();
    expect(useToasts().items.map((t) => t.message)).toEqual(['Pacchetto in uso da tariffe o prenotazioni: non eliminabile.']);
    expect(w.text()).toContain('Standard'); // niente rimozione ottimistica
  });
});
```

In `RenewalsView.spec.ts` aggiungi il test per l'apertura campagna (il file ha già `server`/`http`/`HttpResponse` importati e l'helper `setTargetDate` a `:35-41`; aggiungi solo l'import `useToasts` da `@/lib/toasts`). Stesso flusso del test «dopo aver aperto la campagna…» a `:52-65`:

```ts
it('422 all\'apertura campagna → il messaggio del server diventa un toast (Slice A)', async () => {
  server.use(
    http.post('/api/renewal-campaigns', () =>
      HttpResponse.json(
        { statusCode: 422, message: 'La stagione di destinazione deve seguire quella di origine', error: 'Unprocessable Entity' },
        { status: 422 },
      ),
    ),
  );
  const w = mountApp(RenewalsView);
  await flushPromises();
  await tick();
  await flushPromises();
  await setTargetDate(w, '2027-07-01');

  const deadlineInput = w.findAll('input[type="date"]')[2]; // [0] origine, [1] destinazione, [2] scadenza
  await deadlineInput.setValue('2027-06-15');
  const openBtn = w.findAll('button').find((b) => b.text().includes('Apri campagna'));
  await openBtn?.trigger('click');
  await flushPromises();
  await tick();
  await flushPromises();

  expect(useToasts().items.map((t) => t.message)).toEqual(['La stagione di destinazione deve seguire quella di origine']);
  expect(w.text()).toContain('Apri campagna di prelazione'); // la campagna NON risulta aperta
});
```

- [ ] **Step 5.2:** Run `corepack pnpm --filter web-staff test -- src/features/pricing src/features/renewals` → i nuovi FAIL (nessuna conferma; toast già funzionante dal Task 4 ma il primo test fallisce sul confirm).

- [ ] **Step 5.3: Implementazione** — in `PricingView.vue` script (accanto a `confirmDeleteSeason`):

```ts
/** Elimina un pacchetto SOLO dopo conferma. Se è referenziato il server risponde 409 (toast). */
function confirmDeletePackage(p: { id: string; name: string }) {
  if (!window.confirm(`Eliminare il pacchetto «${p.name}»?`)) return;
  deletePackage.mutate(p.id);
}
```

e nel template `:250`: `@click="confirmDeletePackage(p)"`.

- [ ] **Step 5.4:** Run `corepack pnpm --filter web-staff test` → PASS tutti.

- [ ] **Step 5.5: Commit**

```bash
git add apps/web-staff/src/features/pricing/PricingView.vue apps/web-staff/src/features/pricing/PricingView.spec.ts apps/web-staff/src/features/renewals/RenewalsView.spec.ts
git commit -m "fix(web-staff): conferma su delete-pacchetto + errori 409/422 visibili come toast (catalog Slice A)"
```

---

### Task 6: `GET /rates` validato — `seasonId` obbligatorio → 400 (api)

**Files:**
- Create: `apps/api/src/catalog/dto/rates-query.dto.ts`
- Modify: `apps/api/src/catalog/rates.controller.ts:11-14`, `apps/api/src/catalog/rates.service.ts:24-25`
- Test: `apps/api/test/rates.e2e-spec.ts`

**Interfaces:**
- Produces: `GET /api/rates` senza `seasonId` o con `seasonId` non-UUID → **400** (ValidationPipe). `RatesService.list(seasonId: string)` (non più `string | undefined`). Il FE non cambia: `useRates` ha già la guardia `enabled` (`useRates.ts:13`).

- [ ] **Step 6.1: Test falliti** — in `rates.e2e-spec.ts` aggiungi:

```ts
it('GET senza seasonId → 400 (contratto esplicito, niente [] silenzioso)', async () => {
  await request(app.getHttpServer()).get('/api/rates').set(...bearer(token1)).expect(400);
});

it('GET con seasonId malformato → 400', async () => {
  await request(app.getHttpServer()).get('/api/rates?seasonId=not-a-uuid').set(...bearer(token1)).expect(400);
});
```

- [ ] **Step 6.2:** Run `corepack pnpm --filter api test:e2e -- rates` → i 2 nuovi FAIL (oggi 200 con `[]`).

- [ ] **Step 6.3: Implementazione** — `dto/rates-query.dto.ts`:

```ts
import { Matches } from 'class-validator';
import { UUID_SHAPE } from '../../common/uuid';

export class RatesQueryDto {
  @Matches(UUID_SHAPE, { message: 'seasonId must be a UUID' })
  seasonId!: string;
}
```

`rates.controller.ts`:

```ts
@Get()
list(@Query() query: RatesQueryDto): Promise<RateDTO[]> {
  return this.rates.list(query.seasonId);
}
```

`rates.service.ts`: firma `list(seasonId: string)` e rimuovi la riga `if (!seasonId) return [];`.

- [ ] **Step 6.4:** Run `corepack pnpm --filter api test:e2e` → PASS (112) e `corepack pnpm --filter api test` → PASS (83).

- [ ] **Step 6.5: Commit**

```bash
git add apps/api/src/catalog/dto/rates-query.dto.ts apps/api/src/catalog/rates.controller.ts apps/api/src/catalog/rates.service.ts apps/api/test/rates.e2e-spec.ts
git commit -m "fix(api): GET /rates valida seasonId (obbligatorio, UUID) con query-DTO (catalog Slice A)"
```

---

### Task 7: Honesty-pass documentale + mockup aspirazionale versionato

**Files:**
- Rename+Modify: `docs/design/mockups/Coralyn - Gestionale Lidi (standalone).html` → `docs/design/mockups/gestionale-lidi-aspirazionale.html` (banner in testa)
- Modify: `docs/design/README.md` (nota mockup aspirazionale), `docs/specs/2026-07-02-catalog-slice-a-design.md` (stato)

**Interfaces:** nessuna (solo doc).

- [ ] **Step 7.1:** Rinomina il file (git non lo traccia ancora: `mv` semplice). In testa al file HTML, subito dopo `<!DOCTYPE html>`, aggiungi:

```html
<!--
  MOCKUP ASPIRAZIONALE (ADR-0009) — NON è lo stato corrente dell'app.
  Mostra dati che il modello NON ha: orari delle fasce (Slice B), tier di prezzo
  Giornata/Settimana/Stagione (RIFIUTATO: ADR-0032, una Rate = un prezzo),
  badge marketing sui pacchetti (RIFIUTATO: honesty-pass Slice A, spec
  docs/specs/2026-07-02-catalog-slice-a-design.md §3.7), equipment custom (Slice C).
  Riferimento visivo, non spec.
-->
```

- [ ] **Step 7.2:** In `docs/design/README.md` aggiungi una riga (nella sezione mockup se esiste, altrimenti in coda): `mockups/gestionale-lidi-aspirazionale.html` — «mockup ASPIRAZIONALE, non lo stato corrente: tier di prezzo e badge marketing RIFIUTATI (una Rate = un prezzo, ADR-0032; honesty-pass Slice A); orari fascia → Slice B; equipment custom → Slice C».

- [ ] **Step 7.3:** Nella spec Slice A, se serve, allinea lo stato (già «Approvato»).

- [ ] **Step 7.4: Commit**

```bash
git add "docs/design/mockups/gestionale-lidi-aspirazionale.html" docs/design/README.md docs/specs/2026-07-02-catalog-slice-a-design.md docs/superpowers/plans/2026-07-02-catalog-slice-a.md
git commit -m "docs(catalog-slice-a): mockup aspirazionale versionato e marcato + honesty-pass (prezzo singolo, niente badge)"
```

---

### Task 8: Verifica finale (gate di chiusura slice)

- [ ] **Step 8.1:** Suite complete dal root: `corepack pnpm --filter api test` (83), `corepack pnpm --filter api test:e2e` (**112**), `corepack pnpm --filter web-staff test` (**≥109**: 100 base + nuovi), `corepack pnpm --filter @coralyn/ui-kit test` (**49**). Nessun test rimosso.
- [ ] **Step 8.2:** `corepack pnpm -r build` e `corepack pnpm eslint .` verdi.
- [ ] **Step 8.3:** Verifica live in dev (rebuild container: `docker compose --profile full up -d --build api web`): delete del pacchetto "Standard" (in uso dal seed) → toast «Pacchetto in uso…»; `GET /api/rates` senza seasonId → 400.
- [ ] **Step 8.4:** NON mergiare: presentare lo stato all'utente e attendere conferma (workflow di delega).
