import { describe, it, expect } from 'vitest';
import { mountApp } from '@/test/utils';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import CustomerSubscriptionsCard from './CustomerSubscriptionsCard.vue';

const activeSub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2030-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12', seasonName: 'Estate', seniority: 2,
};
const terminatedSub: CustomerBookingDTO = {
  ...activeSub, id: 'sub-2', endDate: '2026-06-30', terminatedAt: '2026-06-20T09:00:00.000Z', refundedAmount: 250, terminationReason: 'Trasloco',
};

describe('CustomerSubscriptionsCard — disdetta (D-013)', () => {
  it('admin + abbonamento attivo → mostra «Disdici»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    expect(w.text()).toContain('Disdici');
  });

  it('non-admin → nessun «Disdici»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: false } });
    expect(w.text()).not.toContain('Disdici');
  });

  it('abbonamento disdetto → riga stato con rimborso, nessun «Disdici»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [terminatedSub], isAdmin: true } });
    expect(w.text()).toContain('Disdetto');
    expect(w.text()).toContain('250');
    expect(w.text()).not.toContain('Disdici');
  });

  it('emette «terminate» col booking al click', async () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    await w.find('[data-testid="terminate-sub-1"]').trigger('click');
    expect(w.emitted('terminate')?.[0]?.[0]).toMatchObject({ id: 'sub-1' });
  });
});
