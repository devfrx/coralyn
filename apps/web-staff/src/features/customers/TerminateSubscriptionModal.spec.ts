import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import TerminateSubscriptionModal from './TerminateSubscriptionModal.vue';

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};

const tick = () => new Promise((r) => setTimeout(r, 0));

// Modal usa DialogPortal (reka-ui) → il contenuto è teleportato su document.body: si interroga
// via document.querySelector, non via wrapper.find (pattern EditCustomerModal.spec).
async function mount() {
  // pinia è attivato da mountApp: monta con open:false, imposta la sessione, poi apri
  // (il watch(open) pre-compila il rimborso suggerito leggendo session.activeDate).
  const w = mountApp(TerminateSubscriptionModal, {
    attachTo: document.body,
    props: { booking: sub, customerId: 'c-1', open: false },
  });
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido' };
  s.activeDate = '2026-07-01';
  await w.setProps({ open: true });
  await flushPromises();
  await tick();
  return w;
}

describe('TerminateSubscriptionModal', () => {
  it('invia effectiveDate, refundAmount e reason al backend', async () => {
    let captured: unknown = null;
    server.use(
      http.post('/api/bookings/:id/terminate', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ ...sub, terminatedAt: '2026-07-01T10:00:00.000Z', refundedAmount: 481.05 });
      }),
    );
    const w = await mount();
    // il rimborso suggerito (481.05) è pre-compilato
    const refundInput = document.querySelector('input[data-testid="refund-amount"]') as HTMLInputElement;
    expect(Number(refundInput.value)).toBeCloseTo(481.05, 2);
    // conferma
    (document.querySelector('[data-testid="terminate-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured).toMatchObject({ effectiveDate: '2026-07-01', refundAmount: 481.05 });
    w.unmount();
  });
});
