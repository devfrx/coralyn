import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { todayIso, addDays } from '@/lib/dates';
import SuspendSubscriptionModal from './SuspendSubscriptionModal.vue';

// L'abbonamento deve coprire "oggi" con ampio margine su entrambi i lati (il test sospende
// per soli 7 giorni), altrimenti la clamp di SuspendSubscriptionModal su maxDate/minStart
// farebbe divergere startDate/refundAmount da todayIso() quando l'orologio reale avanza.
// Calcolata a chiamata (non a top-level del modulo) così todayIso() legge sempre l'orologio
// corrente al momento del test, non quello letto all'import del file.
function makeSub(): CustomerBookingDTO {
  return {
    id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: addDays(todayIso(), -60), endDate: addDays(todayIso(), 60),
    type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
    umbrellaLabel: 'A12',
  };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount(sub: CustomerBookingDTO) {
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
    const sub = makeSub();
    let captured: unknown = null;
    server.use(http.post('/api/bookings/:id/suspend', async ({ request }) => {
      captured = await request.json();
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount(sub);
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
    const sub = makeSub();
    let captured: Record<string, unknown> = {};
    server.use(http.post('/api/bookings/:id/suspend', async ({ request }) => {
      captured = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount(sub);
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
