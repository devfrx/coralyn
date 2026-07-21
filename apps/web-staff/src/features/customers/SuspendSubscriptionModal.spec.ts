import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { todayIso, addDays } from '@/lib/dates';
import SuspendSubscriptionModal from './SuspendSubscriptionModal.vue';

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};
const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  const w = mountApp(SuspendSubscriptionModal, {
    attachTo: document.body,
    props: { booking: sub, customerId: 'c-1', open: false },
  });
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido' };
  s.activeDate = todayIso();
  await w.setProps({ open: true });
  await flushPromises();
  await tick();
  return w;
}

describe('SuspendSubscriptionModal', () => {
  it('chiusa (default): invia startDate, endDate, refundAmount', async () => {
    let captured: unknown = null;
    server.use(http.post('/api/bookings/:id/suspend', async ({ request }) => {
      captured = await request.json();
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount();
    const ret = addDays(todayIso(), 7);
    (document.querySelector('input[data-testid="suspend-return"]') as HTMLInputElement).value = ret;
    (document.querySelector('input[data-testid="suspend-return"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    await tick();
    (document.querySelector('[data-testid="suspend-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured).toMatchObject({ startDate: todayIso(), endDate: ret });
    expect((captured as { refundAmount?: number }).refundAmount).toBeGreaterThan(0);
    w.unmount();
  });

  it('aperta: nessun endDate né refundAmount nel payload', async () => {
    let captured: Record<string, unknown> = {};
    server.use(http.post('/api/bookings/:id/suspend', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount();
    // passa a modalità aperta: SegmentedControl non inoltra data-testid, seleziona il
    // secondo bottone role="radio" (Ritorno ignoto) — reconciliato dal brief (Step 4).
    (document.querySelectorAll('[role="radio"]')[1] as HTMLButtonElement).click();
    await tick();
    (document.querySelector('[data-testid="suspend-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured.startDate).toBe(todayIso());
    expect(captured.endDate).toBeUndefined();
    expect(captured.refundAmount).toBeUndefined();
    w.unmount();
  });
});
