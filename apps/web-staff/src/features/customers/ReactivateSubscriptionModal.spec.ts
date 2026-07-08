import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO, type SuspensionDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import ReactivateSubscriptionModal from './ReactivateSubscriptionModal.vue';

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};
const openSus: SuspensionDTO = { id: 'sus-1', startDate: '2026-07-20', refundedAmount: 0 };
const tick = () => new Promise((r) => setTimeout(r, 0));

// Modal usa DialogPortal (reka-ui) → il contenuto è teleportato su document.body: si interroga
// via document.querySelector, non via wrapper.find (pattern TerminateSubscriptionModal.spec).
async function mount() {
  const w = mountApp(ReactivateSubscriptionModal, {
    attachTo: document.body,
    props: { booking: sub, suspension: openSus, customerId: 'c-1', open: false },
  });
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido' };
  s.activeDate = '2026-08-01';
  await w.setProps({ open: true });
  await flushPromises();
  await tick();
  return w;
}

describe('ReactivateSubscriptionModal', () => {
  it('invia returnDate e refundAmount (suggerito sui giorni reali)', async () => {
    let captured: Record<string, unknown> = {};
    server.use(http.post('/api/bookings/:id/reactivate', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount();
    (document.querySelector('[data-testid="reactivate-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured.returnDate).toBe('2026-08-01');
    expect(typeof captured.refundAmount).toBe('number');
    w.unmount();
  });

  it('ricalcola il rimborso suggerito quando cambia la data di ritorno', async () => {
    let captured: Record<string, unknown> = {};
    server.use(http.post('/api/bookings/:id/reactivate', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount();
    const refundBefore = Number(
      (document.querySelector('input[data-testid="reactivate-refund"]') as HTMLInputElement).value,
    );
    const returnInput = document.querySelector('input[data-testid="reactivate-return"]') as HTMLInputElement;
    returnInput.value = '2026-08-15';
    returnInput.dispatchEvent(new Event('input'));
    await tick();
    const refundAfter = Number(
      (document.querySelector('input[data-testid="reactivate-refund"]') as HTMLInputElement).value,
    );
    expect(refundAfter).not.toBe(refundBefore);
    (document.querySelector('[data-testid="reactivate-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured.returnDate).toBe('2026-08-15');
    expect(captured.refundAmount).toBe(refundAfter);
    w.unmount();
  });

  it('mostra un errore inline su 409', async () => {
    server.use(
      http.post('/api/bookings/:id/reactivate', () => HttpResponse.json({ message: 'conflict' }, { status: 409 })),
    );
    const w = await mount();
    (document.querySelector('[data-testid="reactivate-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(document.body.textContent).toContain('occupato');
    w.unmount();
  });
});
