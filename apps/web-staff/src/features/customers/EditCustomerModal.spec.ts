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
    expect((document.querySelector('textarea[name="notes"]') as HTMLTextAreaElement).value).toBe('VIP');
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
    expect(body).toMatchObject({ firstName: 'Marianna', lastName: 'Rossi', phone: '+39 333 9999999', email: 'mario.rossi@email.it', notes: 'VIP' });
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
