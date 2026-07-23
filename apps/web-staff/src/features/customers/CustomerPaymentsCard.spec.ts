import { describe, it, expect } from 'vitest';
import { StatTile, formatEuro } from '@coralyn/ui-kit';
import { mountApp } from '@/test/utils';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import CustomerPaymentsCard from './CustomerPaymentsCard.vue';

const base: CustomerBookingDTO = {
  id: 'b-base', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 500, paymentStatus: 'partial', amountCollected: 200,
  umbrellaLabel: 'A12', sectorName: 'Levante', seasonName: 'Estate',
};
// Attivo, pagato a metà → residuo esigibile 300; incassato netto 200.
const activeSub: CustomerBookingDTO = { ...base, id: 'b-active' };
// Disdetto, pagato a metà con rimborso 100 → residuo NON esigibile (0); incassato netto 400-100=300.
const terminatedSub: CustomerBookingDTO = {
  ...base, id: 'b-term', totalPrice: 900, amountCollected: 400, refundedAmount: 100,
  terminatedAt: '2026-06-20T09:00:00.000Z',
};
// Annullato, saldato → fuori sia dal saldo sia dall'incassato.
const cancelledBk: CustomerBookingDTO = {
  ...base, id: 'b-cancel', status: 'cancelled', totalPrice: 1000, amountCollected: 1000, paymentStatus: 'paid',
};
const periodicBk: CustomerBookingDTO = {
  ...base, id: 'b-periodic', type: 'periodic', startDate: '2026-07-01', endDate: '2026-07-14',
  seasonName: undefined,
};

const tileValue = (w: ReturnType<typeof mountApp>, label: string) =>
  w.findAllComponents(StatTile).find((t) => t.props('label') === label)?.props('value');

describe('CustomerPaymentsCard — saldo/incassato (§4.3)', () => {
  it('«Saldo aperto» esclude i disdetti e gli annullati (solo residuo attivo)', () => {
    const w = mountApp(CustomerPaymentsCard, { props: { bookings: [activeSub, terminatedSub, cancelledBk] } });
    expect(tileValue(w, 'Saldo aperto')).toBe(formatEuro(300));
  });

  it('«Incassato stagione» è netto dei rimborsi (amountCollected − refundedAmount), annullati esclusi', () => {
    const w = mountApp(CustomerPaymentsCard, { props: { bookings: [activeSub, terminatedSub, cancelledBk] } });
    // 200 (attivo) + (400 − 100) (disdetto) = 500; l'annullato (1000) è escluso.
    expect(tileValue(w, 'Incassato stagione')).toBe(formatEuro(500));
  });

  it('mostra il tipo di prenotazione (abbonamento/periodica)', () => {
    const w = mountApp(CustomerPaymentsCard, { props: { bookings: [activeSub, periodicBk] } });
    expect(w.text()).toContain('Abbonamento');
    expect(w.text()).toContain('Periodica');
  });

  it('mostra la durata (periodo) delle periodiche', () => {
    const w = mountApp(CustomerPaymentsCard, { props: { bookings: [periodicBk] } });
    expect(w.text()).toContain('2026-07-01');
    expect(w.text()).toContain('2026-07-14');
  });

  it('riga su ombrellone ritirato: cella posizione con snapshot storico + «Ritirato» (D-055)', () => {
    const retired: CustomerBookingDTO = {
      ...base, id: 'b-retired', sectorName: undefined,
      umbrellaRetiredAt: '2026-07-12T10:00:00.000Z', umbrellaRetiredFrom: 'Centro · Fila 1',
    };
    const w = mountApp(CustomerPaymentsCard, { props: { bookings: [retired] } });
    expect(w.text()).toContain('Centro · Fila 1 · A12');
    expect(w.text()).toContain('Ritirato');
  });
});
