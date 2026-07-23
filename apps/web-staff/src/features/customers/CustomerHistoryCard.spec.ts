import { describe, it, expect } from 'vitest';
import { mountApp } from '@/test/utils';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import CustomerHistoryCard from './CustomerHistoryCard.vue';

const base: CustomerBookingDTO = {
  id: 'b1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-07-05', endDate: '2026-07-05',
  type: 'daily', status: 'confirmed', totalPrice: 30, paymentStatus: 'paid', amountCollected: 30,
  umbrellaLabel: '12', sectorName: 'Centro', seasonName: 'Estate 2026',
};

describe('CustomerHistoryCard — chip posizione (D-055)', () => {
  it('ombrellone vivo: chip «Centro · 12», nessun badge Ritirato', () => {
    const w = mountApp(CustomerHistoryCard, { props: { bookings: [base] } });
    expect(w.text()).toContain('Centro · 12');
    expect(w.text()).not.toContain('Ritirato');
  });
  it('ombrellone ritirato: chip con lo snapshot storico + badge «Ritirato»', () => {
    const retired: CustomerBookingDTO = {
      ...base, id: 'b2', sectorName: undefined,
      umbrellaRetiredAt: '2026-07-12T10:00:00.000Z', umbrellaRetiredFrom: 'Centro · Fila 1',
    };
    const w = mountApp(CustomerHistoryCard, { props: { bookings: [retired] } });
    expect(w.text()).toContain('Centro · Fila 1 · 12');
    expect(w.text()).toContain('Ritirato');
    expect(w.text()).not.toContain('– ·');
  });
});
