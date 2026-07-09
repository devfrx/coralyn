import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { Role, type CustomerBookingDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { todayIso } from '@/lib/dates';
import AbsenceReleaseModal from './AbsenceReleaseModal.vue';

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};
const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount() {
  const w = mountApp(AbsenceReleaseModal, {
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

describe('AbsenceReleaseModal', () => {
  it('il date-input ha min = max(oggi, startDate) e max = endDate', async () => {
    const w = await mount();
    const input = document.querySelector('input[data-testid="absence-date"]') as HTMLInputElement;
    const today = todayIso();
    const expectedMin = sub.startDate > today ? sub.startDate : today;
    expect(input.min).toBe(expectedMin);
    expect(input.max).toBe('2026-09-30');
    w.unmount();
  });

  it('alla conferma chiama mutateAsync con { id, input: { date, reason? } }', async () => {
    let captured: unknown = null;
    const postSpy = vi.fn();
    server.use(http.post('/api/bookings/:id/absence-releases', async ({ request, params }) => {
      captured = await request.json();
      postSpy(params.id);
      return HttpResponse.json({ ...sub });
    }));
    const w = await mount();
    const dateInput = document.querySelector('input[data-testid="absence-date"]') as HTMLInputElement;
    dateInput.value = '2026-07-22';
    dateInput.dispatchEvent(new Event('input'));
    const reasonInput = document.querySelector('textarea') as HTMLTextAreaElement;
    reasonInput.value = 'Influenza';
    reasonInput.dispatchEvent(new Event('input'));
    await tick();
    (document.querySelector('[data-testid="absence-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(captured).toMatchObject({ date: '2026-07-22', reason: 'Influenza' });
    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith('sub-1');
    w.unmount();
  });

  it('su 409 mostra il messaggio "Assenza già registrata per quel giorno."', async () => {
    server.use(http.post('/api/bookings/:id/absence-releases', () => HttpResponse.json({ message: 'conflict' }, { status: 409 })));
    const w = await mount();
    (document.querySelector('[data-testid="absence-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(document.body.textContent).toContain('Assenza già registrata per quel giorno.');
    w.unmount();
  });
});
