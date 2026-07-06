# Modifica cliente (edit modale, superficie unica) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rendere modificabile un cliente (nome incluso) tramite una modale unica speculare a "Nuovo cliente", trasformando la card "Anagrafica e contatti" in sola-lettura ed eliminando il bottone «Modifica» morto e la doppia affordance.

**Architecture:** Slice **FE-only** (nessun backend: `PATCH /customers/:id`, `UpdateCustomerDto`, `useUpdateCustomer` esistono già e accettano `firstName/lastName/phone/email/notes`). Nuovo componente `EditCustomerModal.vue` (mirror di `CustomersView`'s create-modal) incapsula form + mutation; `CustomerDetailView` lo apre dal bottone «Modifica» e mostra l'anagrafica in sola-lettura.

**Tech Stack:** Vue 3 `<script setup>`, Pinia, `@tanstack/vue-query`, `@coralyn/ui-kit` (`Modal`/`Field`/`Input`/`Textarea`/`Button`), Vitest, `@vue/test-utils`, msw.

## Global Constraints

- **Package manager:** `corepack pnpm` — MAI `npm`. Se pnpm chiede di purgare `node_modules` senza TTY → `CI=true corepack pnpm install`.
- **Comandi test/typecheck (root):**
  - singolo file: `corepack pnpm --filter web-staff test -- <path>`
  - suite: `corepack pnpm --filter web-staff test`
  - typecheck: `corepack pnpm --filter web-staff typecheck` (EXIT 0)
- **Baseline da non regredire:** web-staff **243** (dopo la slice navigazione data, già su `main`). Additivo atteso: `EditCustomerModal.spec` **+3**; `CustomerDetailView.spec` conteggio **invariato** (2 test riscritti). Target ~**246**.
- **Modale teleportata (reka-ui):** i test interrogano il DOM con `attachTo: document.body` + `document.querySelector(...)` + dispatch di eventi nativi (pattern in `CustomersView.spec.ts`). Ogni test che apre la modale fa `w.unmount()` a fine caso.
- **Parità con la creazione:** validazione = `firstName` E `lastName` obbligatori (submit no-op se vuoti); contatti `|| undefined`; **nessun toast**.
- **Branch:** `edit-customer` (già creato, spec committata). Nessun push senza ok esplicito.

---

### Task 1: `EditCustomerModal.vue` + test

**Files:**
- Create: `apps/web-staff/src/features/customers/EditCustomerModal.vue`
- Test: `apps/web-staff/src/features/customers/EditCustomerModal.spec.ts`

**Interfaces:**
- Consumes: `useUpdateCustomer(id)` da `./useCustomers` (esiste: `mutationResource`, `.mutate(input, { onSuccess })`); `CustomerDTO` da `@coralyn/contracts`; `Modal/Field/Input/Textarea/Button` da `@coralyn/ui-kit`.
- Produces: componente `EditCustomerModal` con prop `customer: CustomerDTO` e `v-model:open` (`boolean`); form `data-test="form-edit-customer"`; input `name="firstName|lastName|phone|email|notes"`. Su success emette `update:open`=`false`.

- [ ] **Step 1: Scrivere il test che fallisce**

Create `apps/web-staff/src/features/customers/EditCustomerModal.spec.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import type { CustomerDTO } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import EditCustomerModal from './EditCustomerModal.vue';

const CUSTOMER: CustomerDTO = {
  id: 'c-1', firstName: 'Mario', lastName: 'Rossi',
  phone: '+39 333 1111111', email: 'mario.rossi@email.it', notes: 'VIP',
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const val = (name: string) => (document.querySelector(`input[name="${name}"]`) as HTMLInputElement).value;
function setField(name: string, value: string) {
  const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement;
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
function submitForm() {
  (document.querySelector('[data-test="form-edit-customer"]') as HTMLFormElement)
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('EditCustomerModal', () => {
  it('precompila i campi dal cliente all apertura', async () => {
    const w = mountApp(EditCustomerModal, { attachTo: document.body, props: { customer: CUSTOMER, open: true } });
    await flushPromises(); await tick();
    expect(val('firstName')).toBe('Mario');
    expect(val('lastName')).toBe('Rossi');
    expect(val('phone')).toBe('+39 333 1111111');
    expect(val('email')).toBe('mario.rossi@email.it');
    w.unmount();
  });

  it('submit invia PATCH con nome+contatti aggiornati e chiude la modale', async () => {
    let body: Partial<CustomerDTO> | null = null;
    server.use(http.patch('/api/customers/:id', async ({ request, params }) => {
      body = (await request.json()) as Partial<CustomerDTO>;
      return HttpResponse.json({ id: params.id, ...body });
    }));
    const w = mountApp(EditCustomerModal, { attachTo: document.body, props: { customer: CUSTOMER, open: true } });
    await flushPromises(); await tick();
    setField('firstName', 'Marianna');
    setField('phone', '+39 333 9999999');
    submitForm();
    await flushPromises(); await tick();
    expect(body).toMatchObject({ firstName: 'Marianna', lastName: 'Rossi', phone: '+39 333 9999999', email: 'mario.rossi@email.it' });
    const emits = w.emitted('update:open');
    expect(emits?.[emits.length - 1]).toEqual([false]);
    w.unmount();
  });

  it('guard: nome o cognome vuoto → nessun PATCH', async () => {
    let called = false;
    server.use(http.patch('/api/customers/:id', async ({ params }) => { called = true; return HttpResponse.json({ id: params.id }); }));
    const w = mountApp(EditCustomerModal, { attachTo: document.body, props: { customer: CUSTOMER, open: true } });
    await flushPromises(); await tick();
    setField('firstName', '');
    submitForm();
    await flushPromises(); await tick();
    expect(called).toBe(false);
    w.unmount();
  });
});
```

- [ ] **Step 2: Eseguire il test e verificare che FALLISCA**

Run: `corepack pnpm --filter web-staff test -- src/features/customers/EditCustomerModal.spec.ts`
Expected: FAIL — `Failed to resolve import "./EditCustomerModal.vue"`.

- [ ] **Step 3: Implementare il componente**

Create `apps/web-staff/src/features/customers/EditCustomerModal.vue`:

```vue
<script setup lang="ts">
import { ref, watch } from 'vue';
import { Modal, Field, Input, Textarea, Button } from '@coralyn/ui-kit';
import type { CustomerDTO } from '@coralyn/contracts';
import { useUpdateCustomer } from './useCustomers';

const props = defineProps<{ customer: CustomerDTO }>();
const open = defineModel<boolean>('open', { required: true });
const update = useUpdateCustomer(props.customer.id);

const firstName = ref('');
const lastName = ref('');
const phone = ref('');
const email = ref('');
const notes = ref('');

// Precompila (e risincronizza all'apertura) dai valori correnti del cliente.
watch(
  [open, () => props.customer],
  ([isOpen]) => {
    if (!isOpen) return;
    firstName.value = props.customer.firstName;
    lastName.value = props.customer.lastName;
    phone.value = props.customer.phone ?? '';
    email.value = props.customer.email ?? '';
    notes.value = props.customer.notes ?? '';
  },
  { immediate: true },
);

function submit() {
  if (!firstName.value || !lastName.value) return;
  update.mutate(
    {
      firstName: firstName.value,
      lastName: lastName.value,
      phone: phone.value || undefined,
      email: email.value || undefined,
      notes: notes.value || undefined,
    },
    { onSuccess: () => { open.value = false; } },
  );
}
</script>
<template>
  <Modal v-model:open="open" title="Modifica cliente">
    <form data-test="form-edit-customer" class="flex flex-col gap-4" @submit.prevent="submit">
      <div class="flex gap-3.5">
        <div class="flex-1"><Field label="Nome"><Input name="firstName" v-model="firstName" placeholder="Mario" /></Field></div>
        <div class="flex-1"><Field label="Cognome"><Input name="lastName" v-model="lastName" placeholder="Rossi" /></Field></div>
      </div>
      <Field label="Telefono"><Input name="phone" v-model="phone" placeholder="+39 ___ ___ ____" /></Field>
      <Field label="Email"><Input name="email" v-model="email" type="email" placeholder="nome@email.it" /></Field>
      <Field label="Note"><Textarea name="notes" v-model="notes" placeholder="Preferenze, recapiti aggiuntivi…" /></Field>
      <div class="flex justify-end gap-2.5 pt-1">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button type="submit">Salva</Button>
      </div>
    </form>
  </Modal>
</template>
```

- [ ] **Step 4: Eseguire il test e verificare che PASSI**

Run: `corepack pnpm --filter web-staff test -- src/features/customers/EditCustomerModal.spec.ts`
Expected: PASS (3/3: precompilazione, submit PATCH+chiusura, guard nome vuoto).

- [ ] **Step 5: Typecheck**

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/EditCustomerModal.vue apps/web-staff/src/features/customers/EditCustomerModal.spec.ts
git commit -m "feat(web-staff): EditCustomerModal — modale di modifica cliente (nome+contatti) via PATCH"
```

---

### Task 2: `CustomerDetailView` — wiring «Modifica» + card read-only

**Files:**
- Modify: `apps/web-staff/src/features/customers/CustomerDetailView.vue`
- Test: `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts` (riscrive 2 test, conteggio invariato)

**Interfaces:**
- Consumes: `EditCustomerModal` (Task 1), prop `customer` + `v-model:open`.
- Produces: bottone «Modifica» con `data-testid="edit-customer"` che apre la modale; card "Anagrafica e contatti" in sola-lettura.

- [ ] **Step 1: Aggiornare i test esistenti (devono fallire sull'implementazione attuale)**

In `apps/web-staff/src/features/customers/CustomerDetailView.spec.ts`:

**(a)** Sostituire il test "mostra header e anagrafica del cliente" (attualmente asserisce i `value` degli input) con la versione read-only:

```ts
  it('mostra header e anagrafica del cliente (sola lettura)', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Mario');
    expect(w.text()).toContain('Rossi');
    expect(w.text()).toContain('mario.rossi@email.it');
    expect(w.text()).toContain('+39 333 1111111');
  });
```

**(b)** Sostituire il test "modifica il telefono e lo rilegge aggiornato" (edit inline) con il test di apertura modale (l'edit è coperto interamente da `EditCustomerModal.spec.ts` — unica fonte di verità):

```ts
  it('«Modifica» apre la modale di modifica precompilata', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' }, attachTo: document.body });
    await settle();
    expect(document.querySelector('[data-test="form-edit-customer"]')).toBeNull();
    await w.get('[data-testid="edit-customer"]').trigger('click');
    await settle();
    expect(document.querySelector('[data-test="form-edit-customer"]')).not.toBeNull();
    expect((document.querySelector('input[name="firstName"]') as HTMLInputElement).value).toBe('Mario');
    w.unmount();
  });
```

- [ ] **Step 2: Eseguire il test e verificare che FALLISCA**

Run: `corepack pnpm --filter web-staff test -- src/features/customers/CustomerDetailView.spec.ts`
Expected: FAIL — il test (a) può già passare (i valori compaiono anche negli input attuali), ma il test (b) FALLISCE: il bottone «Modifica» non ha `data-testid="edit-customer"` né apre alcuna modale (`[data-test="form-edit-customer"]` resta `null`).

- [ ] **Step 3: Modificare `CustomerDetailView.vue`**

**Script (`<script setup>`):**
- Import Vue: `import { ref, computed } from 'vue';` (rimuovere `watch`).
- Rimuovere dalla import di `@coralyn/ui-kit` i componenti ora inutili nel template: `Field, Input, Textarea`. Mantenere `Card, Avatar, Button, Icon, SectionCard, ConfirmDialog, Callout`.
- Import `useCustomers`: rimuovere `useUpdateCustomer` (resta `useCustomer, useCustomerBookings, useDeleteCustomer`).
- Aggiungere: `import EditCustomerModal from './EditCustomerModal.vue';`
- Rimuovere lo stato inline: le ref `phone`/`email`/`notes`, la `const update = useUpdateCustomer(...)`, il `watch(customer, ...)`, la funzione `save()`.
- Aggiungere: `const editOpen = ref(false);`

Le parti GDPR (`isAdmin`, `hasBookings`, `hasActiveOrFuture`, `deleteLabel`, `deleteDescription`, `deleteConfirmOpen`, `askDelete`, `onConfirmDelete`) e `ini`/`customer`/`isLoading`/`isError` restano **invariate**.

**Template:**
- Bottone «Modifica» (riga ~81): aggiungere handler e testid:

```vue
            <Button variant="secondary" data-testid="edit-customer" @click="editOpen = true"><Icon name="edit" :size="15" />Modifica</Button>
```

- Sostituire l'intera `SectionCard` "Anagrafica e contatti" (form editabile) con la versione **sola-lettura**:

```vue
      <SectionCard v-if="!customer.anonymizedAt" title="Anagrafica e contatti" icon="users" class="mb-4">
        <div class="grid grid-cols-2 gap-x-7 gap-y-[18px]">
          <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Nome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.firstName }}</div></div>
          <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Cognome</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.lastName }}</div></div>
          <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Telefono</div><div class="text-sm font-medium tabular-nums text-[var(--color-text)]">{{ customer.phone ?? '—' }}</div></div>
          <div><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Email</div><div class="text-sm font-medium text-[var(--color-text)]">{{ customer.email ?? '—' }}</div></div>
          <div class="col-span-2"><div class="mb-1 text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Note</div><div class="whitespace-pre-wrap text-sm font-medium text-[var(--color-text)]">{{ customer.notes || '—' }}</div></div>
        </div>
      </SectionCard>
```

- Aggiungere la modale dentro il blocco `v-else-if="customer"`, subito dopo il `<ConfirmDialog ... />`:

```vue
      <EditCustomerModal :customer="customer" v-model:open="editOpen" />
```

- [ ] **Step 4: Eseguire il test del file e verificare che PASSI**

Run: `corepack pnpm --filter web-staff test -- src/features/customers/CustomerDetailView.spec.ts`
Expected: PASS (inclusi i 2 test riscritti; i test GDPR e le card storico/abbonamento/pagamenti invariati).

- [ ] **Step 5: Suite completa web-staff + typecheck (no regressioni)**

Run: `corepack pnpm --filter web-staff test`
Expected: verde, ~**246** (243 baseline + 3 EditCustomerModal; CustomerDetailView invariato).

Run: `corepack pnpm --filter web-staff typecheck`
Expected: EXIT 0. (Se `vue-tsc` segnala import inutilizzati `Field/Input/Textarea/watch/useUpdateCustomer`, rimuoverli come indicato allo Step 3.)

- [ ] **Step 6: Commit**

```bash
git add apps/web-staff/src/features/customers/CustomerDetailView.vue apps/web-staff/src/features/customers/CustomerDetailView.spec.ts
git commit -m "feat(web-staff): Scheda cliente — «Modifica» apre EditCustomerModal, anagrafica read-only"
```

---

## Verifica finale (dopo Task 2)

- [ ] Suite completa verde (~246): `corepack pnpm --filter web-staff test`.
- [ ] Typecheck EXIT 0.
- [ ] Nessun residuo della doppia affordance: un solo punto di edit (la modale); nome modificabile; card in sola-lettura; bottone «Modifica» funzionante.
- [ ] Review whole-branch (opus) prima del merge FF su `main` (con ok esplicito).

## Note di scope
- Nessun backend (PATCH/DTO/service esistono e validano). `CustomersView` (create-modal) non toccato.
- Nessun toast, nessuna gestione errori aggiuntiva oltre a `mutationResource`.
- Read-only su cliente anonimizzato garantito dal `v-if="!customer.anonymizedAt"` già presente attorno a bottone/card/modale.
