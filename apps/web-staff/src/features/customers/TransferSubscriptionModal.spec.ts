import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import TransferSubscriptionModal from './TransferSubscriptionModal.vue';
import { suggestedCessionRefund } from './cessionRefund';

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};
const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  const w = mountApp(TransferSubscriptionModal, {
    attachTo: document.body,
    props: { booking: sub, customerId: 'c-1', open: false },
  });
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido' };
  s.activeDate = '2026-07-20';
  await w.setProps({ open: true });
  await flushPromises();
  await tick();
  return w;
}

describe('TransferSubscriptionModal', () => {
  it("all'apertura: rimborso al cedente e incasso dal subentrante sono pre-compilati al residuo suggerito e uguali", async () => {
    const w = await mount();
    const suggested = suggestedCessionRefund(sub, '2026-07-20');
    const refund = document.querySelector('input[data-testid="transfer-refund"]') as HTMLInputElement;
    const collect = document.querySelector('input[data-testid="transfer-collect"]') as HTMLInputElement;
    expect(Number(refund.value)).toBe(suggested);
    expect(Number(collect.value)).toBe(suggested);
    expect(Number(refund.value)).toBe(Number(collect.value));
    w.unmount();
  });

  it('il selettore subentrante NON include il titolare attuale', async () => {
    const w = await mount();
    const select = document.querySelector('select[data-testid="transfer-new-customer"]') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).not.toContain('c-1');
    expect(values).toContain('c-2');
    w.unmount();
  });

  it('submit con subentrante scelto -> POST /bookings/:id/transfer con payload corretto e chiude', async () => {
    let captured: unknown = null;
    server.use(http.post('/api/bookings/:id/transfer', async ({ request }) => {
      captured = await request.json();
      return HttpResponse.json({ ...sub, customerId: 'c-2' });
    }));
    const w = await mount();
    const select = document.querySelector('select[data-testid="transfer-new-customer"]') as HTMLSelectElement;
    select.value = 'c-2';
    select.dispatchEvent(new Event('change'));
    await tick();
    (document.querySelector('[data-testid="transfer-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured).toMatchObject({
      newCustomerId: 'c-2',
      effectiveDate: '2026-07-20',
      refundToPrevious: suggestedCessionRefund(sub, '2026-07-20'),
      collectedFromNew: suggestedCessionRefund(sub, '2026-07-20'),
    });
    const emits = w.emitted('update:open');
    expect(emits?.[emits.length - 1]).toEqual([false]);
    w.unmount();
  });

  it('409 dal server -> messaggio "Sospensione aperta..." inline', async () => {
    server.use(http.post('/api/bookings/:id/transfer', () => new HttpResponse(null, { status: 409 })));
    const w = await mount();
    const select = document.querySelector('select[data-testid="transfer-new-customer"]') as HTMLSelectElement;
    select.value = 'c-2';
    select.dispatchEvent(new Event('change'));
    await tick();
    (document.querySelector('[data-testid="transfer-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(document.body.textContent).toContain('Sospensione aperta');
    w.unmount();
  });

  it('422 dal server -> "Dati non validi." inline', async () => {
    server.use(http.post('/api/bookings/:id/transfer', () => new HttpResponse(null, { status: 422 })));
    const w = await mount();
    const select = document.querySelector('select[data-testid="transfer-new-customer"]') as HTMLSelectElement;
    select.value = 'c-2';
    select.dispatchEvent(new Event('change'));
    await tick();
    (document.querySelector('[data-testid="transfer-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(document.body.textContent).toContain('Dati non validi.');
    w.unmount();
  });
});
