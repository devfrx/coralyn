# Scheda Cliente — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare la vista Clienti di `apps/web-staff` in una scheda cliente a 360° (struttura A): lista → dettaglio `/clienti/:id` con header di sintesi, anagrafica editabile (telefono/email/note) e sezioni "in arrivo" come placeholder.

**Architecture:** Frontend-first contro **MSW** (come lo slice 1): si estende `@coralyn/contracts` in modo **additivo**, si mockano `GET /api/clienti/:id` e `PATCH /api/clienti/:id` per i test, e si costruisce la scheda. L'**integrazione runtime** col backend reale (endpoint `:id`/PATCH) è *gated* dalla delega Backend (la scheda dettaglio nel browser funzionerà quando il BE li esporrà; i test restano deterministici su MSW). Spec: [docs/specs/2026-06-28-scheda-cliente-design.md](../specs/2026-06-28-scheda-cliente-design.md).

**Tech Stack:** Vue 3 (`<script setup>`) + TypeScript, TanStack Vue Query, Pinia, vue-router, MSW v2, Vitest + @vue/test-utils, `@coralyn/ui-kit`.

---

## File Structure

- `packages/contracts/src/index.ts` — *modify*: estende `ClienteDTO`; aggiunge `CreaClienteInput`, `ModificaClienteInput` (additivo).
- `apps/web-staff/src/lib/queryKeys.ts` — *modify*: aggiunge `cliente(tenantId, id)`.
- `apps/web-staff/src/mocks/server.ts` — *modify*: mock `GET/PATCH /api/clienti/:id`; seed coi nuovi campi.
- `apps/web-staff/src/test/utils.ts` — *modify*: stub globale `RouterLink` in `mountApp`.
- `apps/web-staff/src/features/clienti/useClienti.ts` — *modify*: input esteso; `useCliente(id)`, `useModificaCliente(id)`.
- `apps/web-staff/src/features/clienti/ClienteDettaglioView.vue` — *create*: la scheda (header + anagrafica editabile + placeholder).
- `apps/web-staff/src/features/clienti/ClienteDettaglioView.spec.ts` — *create*: component test.
- `apps/web-staff/src/router/index.ts` — *modify*: rotta `/clienti/:id` con `props: true`.
- `apps/web-staff/src/features/clienti/ClientiView.vue` — *modify*: ogni riga linka alla scheda.

Convenzione: codice EN, dominio/UI IT ([ADR-0003](../architecture/decisions/0003-language-convention.md)). Commit atomici col trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Estendere i contratti (additivo)

**Files:**
- Modify: `packages/contracts/src/index.ts`

- [ ] **Step 1: Estendere `ClienteDTO` e aggiungere i tipi input**

```ts
/** DTO minimale di un Cliente (il bagnante). Condiviso FE/BE. */
export interface ClienteDTO {
  id: string;
  nome: string;
  cognome: string;
  telefono?: string;
  email?: string;
  note?: string;
}

/** Input di creazione di un Cliente (contatti opzionali). */
export interface CreaClienteInput {
  nome: string;
  cognome: string;
  telefono?: string;
  email?: string;
  note?: string;
}

/** Input di modifica anagrafica: tutti i campi opzionali. */
export type ModificaClienteInput = Partial<CreaClienteInput>;
```

- [ ] **Step 2: Buildare i contratti**

Run: `pnpm --filter @coralyn/contracts build`
Expected: build OK (i campi sono additivi, nessun consumer si rompe).

- [ ] **Step 3: Commit**

```bash
git add packages/contracts/src/index.ts
git commit -m "feat(contracts): extend ClienteDTO with optional contacts + input types"
```

---

### Task 2: Query key per il dettaglio cliente

**Files:**
- Modify: `apps/web-staff/src/lib/queryKeys.ts`

- [ ] **Step 1: Aggiungere `cliente(tenantId, id)`**

```ts
export const queryKeys = {
  clienti: (tenantId: string) => ['clienti', tenantId] as const,
  cliente: (tenantId: string, id: string) => ['cliente', tenantId, id] as const,
  mappaGiorno: (tenantId: string, data: string) => ['mappa', tenantId, data] as const,
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @coralyn/web-staff typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/lib/queryKeys.ts
git commit -m "feat(web-staff): add cliente detail query key"
```

---

### Task 3: Mock MSW per dettaglio e modifica (test)

**Files:**
- Modify: `apps/web-staff/src/mocks/server.ts`

- [ ] **Step 1: Estendere il seed e aggiungere i mock `:id` GET/PATCH**

```ts
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { handlers } from './handlers';
import type { ClienteDTO } from '@coralyn/contracts';

const INITIAL_CLIENTI: ClienteDTO[] = [
  { id: 'c-1', nome: 'Mario', cognome: 'Rossi', telefono: '+39 333 1111111', email: 'mario.rossi@email.it', note: '' },
];
let clienti: ClienteDTO[] = [...INITIAL_CLIENTI];
export function resetClientiSeed() { clienti = [...INITIAL_CLIENTI]; }

export const server = setupServer(
  ...handlers,
  http.get('/api/clienti', () => HttpResponse.json(clienti)),
  http.get('/api/clienti/:id', ({ params }) => {
    const c = clienti.find((x) => x.id === params.id);
    return c ? HttpResponse.json(c) : new HttpResponse(null, { status: 404 });
  }),
  http.post('/api/clienti', async ({ request }) => {
    const body = (await request.json()) as Omit<ClienteDTO, 'id'>;
    const nuovo: ClienteDTO = { id: `c-${clienti.length + 1}`, ...body };
    clienti.push(nuovo);
    return HttpResponse.json(nuovo, { status: 201 });
  }),
  http.patch('/api/clienti/:id', async ({ params, request }) => {
    const patch = (await request.json()) as Partial<ClienteDTO>;
    const i = clienti.findIndex((x) => x.id === params.id);
    if (i < 0) return new HttpResponse(null, { status: 404 });
    clienti[i] = { ...clienti[i], ...patch };
    return HttpResponse.json(clienti[i]);
  }),
);
```

- [ ] **Step 2: Eseguire la suite per confermare che resta verde**

Run: `pnpm --filter @coralyn/web-staff test`
Expected: PASS (i test esistenti continuano a passare; `c-1` ora ha contatti).

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/mocks/server.ts
git commit -m "test(web-staff): mock cliente detail GET and PATCH"
```

---

### Task 4: Stub `RouterLink` nei test

**Files:**
- Modify: `apps/web-staff/src/test/utils.ts`

- [ ] **Step 1: Aggiungere lo stub globale così i componenti con `<RouterLink>` montano senza un router completo**

```ts
import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import type { Component } from 'vue';

const RouterLinkStub = { props: ['to'], template: '<a><slot /></a>' };

export function mountApp<C extends Component>(comp: C, options: ComponentMountingOptions<C> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(comp, {
    ...options,
    global: {
      plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      stubs: { RouterLink: RouterLinkStub },
      ...(options.global ?? {}),
    },
  });
}
```

- [ ] **Step 2: Eseguire la suite (deve restare verde)**

Run: `pnpm --filter @coralyn/web-staff test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web-staff/src/test/utils.ts
git commit -m "test(web-staff): stub RouterLink in mountApp"
```

---

### Task 5: Hook `useCliente(id)` (dettaglio)

**Files:**
- Modify: `apps/web-staff/src/features/clienti/useClienti.ts`
- Test: `apps/web-staff/src/features/clienti/useClienti.spec.ts` (create)

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { useCliente } from './useClienti';

const Probe = defineComponent({
  setup() {
    const q = useCliente('c-1');
    return () => h('div', q.data.value ? `${q.data.value.nome} ${q.data.value.cognome}` : 'loading');
  },
});

describe('useCliente', () => {
  it('legge il cliente per id dal mock', async () => {
    const w = mountApp(Probe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('Mario Rossi');
  });
});
```

- [ ] **Step 2: Eseguire il test (deve fallire)**

Run: `pnpm --filter @coralyn/web-staff test useClienti`
Expected: FAIL ("useCliente is not exported"/non definita).

- [ ] **Step 3: Implementare l'hook**

In `useClienti.ts` aggiungere (gli import esistenti `computed`, `useQuery`, `apiFetch`, `queryKeys`, `useSessionStore` restano; aggiungere `ClienteDTO` già importato):

```ts
export function useCliente(id: string) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.cliente(session.stabilimentoId, id)),
    queryFn: () => apiFetch<ClienteDTO>(`/clienti/${id}`, { tenantId: session.stabilimentoId }),
  });
}
```

- [ ] **Step 4: Eseguire il test (deve passare)**

Run: `pnpm --filter @coralyn/web-staff test useClienti`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/clienti/useClienti.ts apps/web-staff/src/features/clienti/useClienti.spec.ts
git commit -m "feat(web-staff): useCliente(id) detail query"
```

---

### Task 6: Hook `useModificaCliente(id)` (PATCH)

**Files:**
- Modify: `apps/web-staff/src/features/clienti/useClienti.ts`
- Modify: `apps/web-staff/src/features/clienti/useClienti.spec.ts`

- [ ] **Step 1: Aggiungere il test che fallisce**

```ts
import { useCliente, useModificaCliente } from './useClienti';

const EditProbe = defineComponent({
  setup() {
    const q = useCliente('c-1');
    const m = useModificaCliente('c-1');
    return () => h('div', [
      h('span', q.data.value?.telefono ?? '-'),
      h('button', { onClick: () => m.mutate({ telefono: '+39 000' }) }, 'save'),
    ]);
  },
});

it('modifica il cliente e invalida il dettaglio', async () => {
  const w = mountApp(EditProbe);
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await w.find('button').trigger('click');
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  expect(w.text()).toContain('+39 000');
});
```

- [ ] **Step 2: Eseguire (deve fallire)**

Run: `pnpm --filter @coralyn/web-staff test useClienti`
Expected: FAIL ("useModificaCliente is not exported").

- [ ] **Step 3: Implementare l'hook**

Aggiungere a `useClienti.ts` (importare `useMutation`, `useQueryClient` già presenti, e `ModificaClienteInput` da `@coralyn/contracts`):

```ts
export function useModificaCliente(id: string) {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ModificaClienteInput) =>
      apiFetch<ClienteDTO>(`/clienti/${id}`, { tenantId: session.stabilimentoId, method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.clienti(session.stabilimentoId) });
      qc.invalidateQueries({ queryKey: queryKeys.cliente(session.stabilimentoId, id) });
    },
  });
}
```

- [ ] **Step 4: Eseguire (deve passare)**

Run: `pnpm --filter @coralyn/web-staff test useClienti`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/clienti/useClienti.ts apps/web-staff/src/features/clienti/useClienti.spec.ts
git commit -m "feat(web-staff): useModificaCliente(id) PATCH mutation"
```

---

### Task 7: `ClienteDettaglioView` — header + anagrafica + placeholder

**Files:**
- Create: `apps/web-staff/src/features/clienti/ClienteDettaglioView.vue`
- Create: `apps/web-staff/src/features/clienti/ClienteDettaglioView.spec.ts`

- [ ] **Step 1: Scrivere il test che fallisce**

```ts
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import ClienteDettaglioView from './ClienteDettaglioView.vue';

async function settle(w: ReturnType<typeof mountApp>) {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

describe('ClienteDettaglioView', () => {
  it('mostra header e anagrafica del cliente', async () => {
    const w = mountApp(ClienteDettaglioView, { props: { id: 'c-1' } });
    await settle(w);
    expect(w.text()).toContain('Mario');
    expect(w.text()).toContain('Rossi');
    expect(w.text()).toContain('mario.rossi@email.it');
  });

  it('mostra i placeholder delle sezioni in arrivo', async () => {
    const w = mountApp(ClienteDettaglioView, { props: { id: 'c-1' } });
    await settle(w);
    expect(w.text()).toContain('in arrivo');
    expect(w.text()).toContain('Storico prenotazioni');
  });
});
```

- [ ] **Step 2: Eseguire (deve fallire)**

Run: `pnpm --filter @coralyn/web-staff test ClienteDettaglioView`
Expected: FAIL (file non esiste).

- [ ] **Step 3: Implementare la vista (sola lettura; la modifica arriva nel Task 8)**

```vue
<script setup lang="ts">
import { Card, Badge } from '@coralyn/ui-kit';
import { useCliente } from './useClienti';

const props = defineProps<{ id: string }>();
const { data: cliente, isLoading, isError } = useCliente(props.id);

const inArrivo = ['Abbonamento e anzianità', 'Storico prenotazioni', 'Pagamenti e saldo'];
</script>

<template>
  <section class="p-6">
    <p v-if="isLoading" class="text-[var(--color-text-muted)]">Caricamento…</p>
    <p v-else-if="isError" class="text-[var(--color-text-danger)]">Errore nel caricamento del cliente.</p>
    <template v-else-if="cliente">
      <header class="mb-4 flex items-center justify-between">
        <div>
          <h2 class="text-xl font-semibold">{{ cliente.nome }} {{ cliente.cognome }}</h2>
          <p class="text-sm text-[var(--color-text-muted)]">scheda cliente</p>
        </div>
        <div class="flex gap-2">
          <Badge>stato oggi · in arrivo</Badge>
          <Badge>saldo · in arrivo</Badge>
        </div>
      </header>

      <Card class="mb-4 p-4">
        <h3 class="mb-2 text-sm font-medium">Anagrafica e contatti</h3>
        <dl class="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
          <dt class="text-[var(--color-text-muted)]">Telefono</dt><dd>{{ cliente.telefono || '—' }}</dd>
          <dt class="text-[var(--color-text-muted)]">Email</dt><dd>{{ cliente.email || '—' }}</dd>
          <dt class="text-[var(--color-text-muted)]">Note</dt><dd>{{ cliente.note || '—' }}</dd>
        </dl>
      </Card>

      <Card v-for="s in inArrivo" :key="s" class="mb-2 p-4 text-sm text-[var(--color-text-muted)]">
        {{ s }} · in arrivo
      </Card>
    </template>
  </section>
</template>
```

> Nota: `Badge` ([Badge.vue](../../packages/ui-kit/src/components/Badge.vue)) è uno `<span>` con uno slot di testo: `<Badge>…</Badge>` è corretto.

- [ ] **Step 4: Eseguire (deve passare)**

Run: `pnpm --filter @coralyn/web-staff test ClienteDettaglioView`
Expected: PASS (entrambi i test).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/clienti/ClienteDettaglioView.vue apps/web-staff/src/features/clienti/ClienteDettaglioView.spec.ts
git commit -m "feat(web-staff): cliente detail view (header, anagrafica, placeholders)"
```

---

### Task 8: Modifica anagrafica nella scheda

**Files:**
- Modify: `apps/web-staff/src/features/clienti/ClienteDettaglioView.vue`
- Modify: `apps/web-staff/src/features/clienti/ClienteDettaglioView.spec.ts`

- [ ] **Step 1: Aggiungere il test che fallisce**

```ts
it('modifica il telefono e lo rilegge aggiornato', async () => {
  const w = mountApp(ClienteDettaglioView, { props: { id: 'c-1' } });
  await settle(w);
  const tel = w.find('input[name="telefono"]');
  await tel.setValue('+39 333 9999999');
  await w.find('form').trigger('submit.prevent');
  await settle(w);
  expect(w.text()).toContain('+39 333 9999999');
});
```

- [ ] **Step 2: Eseguire (deve fallire)**

Run: `pnpm --filter @coralyn/web-staff test ClienteDettaglioView`
Expected: FAIL (nessun `form`/`input[name="telefono"]`).

- [ ] **Step 3: Sostituire il blocco Anagrafica con un form editabile**

Nel `<script setup>` aggiungere stato e submit:

```ts
import { ref, watch } from 'vue';
import { Card, Badge, Button, Field, Input } from '@coralyn/ui-kit';
import { useCliente, useModificaCliente } from './useClienti';

const props = defineProps<{ id: string }>();
const { data: cliente, isLoading, isError } = useCliente(props.id);
const modifica = useModificaCliente(props.id);

const telefono = ref('');
const email = ref('');
const note = ref('');
watch(cliente, (c) => {
  if (c) { telefono.value = c.telefono ?? ''; email.value = c.email ?? ''; note.value = c.note ?? ''; }
}, { immediate: true });

function salva() {
  modifica.mutate({ telefono: telefono.value, email: email.value, note: note.value });
}

const inArrivo = ['Abbonamento e anzianità', 'Storico prenotazioni', 'Pagamenti e saldo'];
```

Sostituire la `Card` "Anagrafica" con:

```vue
<Card class="mb-4 p-4">
  <h3 class="mb-2 text-sm font-medium">Anagrafica e contatti</h3>
  <form class="flex flex-col gap-3" @submit.prevent="salva">
    <Field label="Telefono"><Input name="telefono" v-model="telefono" /></Field>
    <Field label="Email"><Input name="email" v-model="email" /></Field>
    <Field label="Note"><Input name="note" v-model="note" /></Field>
    <div><Button type="submit">Salva</Button></div>
  </form>
</Card>
```

> Nota: `Input` ([Input.vue](../../packages/ui-kit/src/components/Input.vue)) ha un unico root `<input>`, quindi l'attributo `name` raggiunge il DOM via *fallthrough* — il selettore `input[name="telefono"]` del test è valido. `Field`/`Input` si usano come in [ClientiView.vue](../../apps/web-staff/src/features/clienti/ClientiView.vue).

- [ ] **Step 4: Eseguire (deve passare)**

Run: `pnpm --filter @coralyn/web-staff test ClienteDettaglioView`
Expected: PASS (tutti e tre i test).

- [ ] **Step 5: Commit**

```bash
git add apps/web-staff/src/features/clienti/ClienteDettaglioView.vue apps/web-staff/src/features/clienti/ClienteDettaglioView.spec.ts
git commit -m "feat(web-staff): edit anagrafica from cliente detail"
```

---

### Task 9: Rotta `/clienti/:id` e link dalla lista

**Files:**
- Modify: `apps/web-staff/src/router/index.ts`
- Modify: `apps/web-staff/src/features/clienti/ClientiView.vue`
- Modify: `apps/web-staff/src/features/clienti/ClientiView.spec.ts`

- [ ] **Step 1: Aggiungere la rotta dettaglio (con `props: true`)**

In `router/index.ts`, subito dopo la rotta `clienti`:

```ts
{ path: '/clienti/:id', name: 'cliente-dettaglio', component: () => import('@/features/clienti/ClienteDettaglioView.vue'), props: true },
```

- [ ] **Step 2: Aggiungere il test che fallisce in `ClientiView.spec.ts`**

```ts
it('ogni riga linka alla scheda del cliente', async () => {
  const w = mountApp(ClientiView);
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  const link = w.find('a');
  expect(link.exists()).toBe(true);
  expect(link.text()).toContain('Rossi');
});
```

- [ ] **Step 3: Eseguire (deve fallire)**

Run: `pnpm --filter @coralyn/web-staff test ClientiView`
Expected: FAIL (nessun `<a>` nella tabella).

- [ ] **Step 4: Rendere il cognome un `RouterLink` nella riga**

In `ClientiView.vue`, sostituire la cella cognome:

```vue
<td class="py-2 font-medium">
  <RouterLink :to="{ name: 'cliente-dettaglio', params: { id: c.id } }" class="text-[var(--color-text-accent)]">
    {{ c.cognome }}
  </RouterLink>
</td>
```

- [ ] **Step 5: Eseguire (deve passare)**

Run: `pnpm --filter @coralyn/web-staff test ClientiView`
Expected: PASS (lo stub `RouterLink` rende `<a>Rossi</a>`).

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/router/index.ts apps/web-staff/src/features/clienti/ClientiView.vue apps/web-staff/src/features/clienti/ClientiView.spec.ts
git commit -m "feat(web-staff): route /clienti/:id and link rows to detail"
```

---

### Task 10: Verifica finale

**Files:** nessuna modifica (solo verifica).

- [ ] **Step 1: Suite completa**

Run: `pnpm --filter @coralyn/web-staff test`
Expected: PASS (tutti i file, inclusi i nuovi `useClienti.spec`, `ClienteDettaglioView.spec`, `ClientiView.spec`).

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm --filter @coralyn/web-staff typecheck` poi `pnpm lint`
Expected: entrambi PULITI.

- [ ] **Step 3: Nota d'integrazione (non bloccante)**

Nel browser, la scheda `/clienti/:id` legge/scrive via `GET`/`PATCH /api/clienti/:id`: questi esistono solo dopo la **delega Backend**. Finché il BE non li espone, la scheda nel browser mostrerà errore sul dettaglio (i test restano verdi su MSW). Verifica runtime browser → dopo il merge del Backend, come per `/api/clienti`.

- [ ] **Step 4: Commit finale (se restano modifiche non committate)**

```bash
git add -A
git commit -m "chore(web-staff): scheda cliente FE slice complete"
```

---

## Note di integrazione FE↔BE

- L'estensione di `@coralyn/contracts` (Task 1) è **additiva** e **condivisa**: la delega Backend consuma `ClienteDTO`/`CreaClienteInput`/`ModificaClienteInput` per `POST`/`PATCH`/validazione. Se BE e FE procedono in parallelo, Task 1 va fatto una volta sola (confine `contracts`).
- I mock MSW (Task 3) **non** vanno rimossi: restano la rete di sicurezza deterministica dei test ([test/setup.ts](../../apps/web-staff/src/test/setup.ts) usa `onUnhandledRequest: 'error'`).
- `/api/mappa` resta mock; nessuna modifica al proxy Vite (già corretto).
