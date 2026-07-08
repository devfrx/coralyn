import { describe, it, expect } from 'vitest';
import { mountApp } from '@/test/utils';
import type { CustomerBookingDTO, CededSubscriptionDTO } from '@coralyn/contracts';
import CustomerSubscriptionsCard from './CustomerSubscriptionsCard.vue';

const activeSub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2030-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12', seasonName: 'Estate', seniority: 2,
};
const terminatedSub: CustomerBookingDTO = {
  ...activeSub, id: 'sub-2', endDate: '2026-06-30', terminatedAt: '2026-06-20T09:00:00.000Z', refundedAmount: 250, terminationReason: 'Trasloco',
};
const openSuspendedSub: CustomerBookingDTO = {
  ...activeSub, id: 'sub-3',
  suspensions: [{ id: 'sus-1', startDate: '2026-07-20', refundedAmount: 0 }],
};
const historySub: CustomerBookingDTO = {
  ...activeSub, id: 'sub-4',
  suspensions: [{ id: 'sus-2', startDate: '2026-06-03', endDate: '2026-06-10', refundedAmount: 84, reason: 'Viaggio' }],
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

  it('admin + abbonamento attivo senza sospensione aperta → mostra «Sospendi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    expect(w.text()).toContain('Sospendi');
  });

  it('non-admin → nessun «Sospendi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: false } });
    expect(w.text()).not.toContain('Sospendi');
  });

  it('sospensione aperta → riga «in corso» + «Riattiva», niente «Sospendi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [openSuspendedSub], isAdmin: true } });
    expect(w.text()).toContain('in corso');
    expect(w.text()).toContain('Riattiva');
    expect(w.text()).not.toContain('Sospendi');
  });

  it('sospensione conclusa → riga storica con rimborso', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [historySub], isAdmin: true } });
    expect(w.text()).toContain('Sospeso');
    expect(w.text()).toContain('84');
  });

  it('emette «suspend» col booking al click', async () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    await w.find('[data-testid="suspend-sub-1"]').trigger('click');
    expect(w.emitted('suspend')?.[0]?.[0]).toMatchObject({ id: 'sub-1' });
  });

  it('emette «reactivate» con booking+suspension al click', async () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [openSuspendedSub], isAdmin: true } });
    await w.find('[data-testid="reactivate-sub-3"]').trigger('click');
    expect(w.emitted('reactivate')?.[0]?.[0]).toMatchObject({ booking: { id: 'sub-3' }, suspension: { id: 'sus-1' } });
  });
});

describe('CustomerSubscriptionsCard — cessione (D-013)', () => {
  it('admin + abbonamento cedibile → mostra «Cedi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    expect(w.text()).toContain('Cedi');
  });

  it('non-admin → nessun «Cedi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: false } });
    expect(w.find('[data-testid="transfer-sub-1"]').exists()).toBe(false);
  });

  it('abbonamento con sospensione aperta → nessun «Cedi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [openSuspendedSub], isAdmin: true } });
    expect(w.find('[data-testid="transfer-sub-3"]').exists()).toBe(false);
  });

  it('abbonamento disdetto → nessun «Cedi»', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [terminatedSub], isAdmin: true } });
    expect(w.find('[data-testid="transfer-sub-2"]').exists()).toBe(false);
  });

  it('emette «transfer» col booking al click', async () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    await w.find('[data-testid="transfer-sub-1"]').trigger('click');
    expect(w.emitted('transfer')?.[0]?.[0]).toMatchObject({ id: 'sub-1' });
  });

  it('sezione «Cessioni effettuate» renderizza le righe da ceded', () => {
    const ceded: CededSubscriptionDTO[] = [
      { transferId: 'tr-1', bookingId: 'sub-9', effectiveDate: '2026-06-15T08:00:00.000Z', newCustomerName: 'Luca Bianchi', umbrellaLabel: 'A12', refundToPrevious: 120, reason: 'Trasferimento', createdAt: '2026-06-15T08:00:00.000Z' },
    ];
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], ceded, isAdmin: true } });
    expect(w.text()).toContain('Cessioni effettuate');
    expect(w.text()).toContain('A12');
    expect(w.text()).toContain('Luca Bianchi');
    expect(w.text()).toContain('2026-06-15');
    expect(w.text()).toContain('120');
    expect(w.text()).toContain('Trasferimento');
  });

  it('nessuna cessione → sezione assente', () => {
    const w = mountApp(CustomerSubscriptionsCard, { props: { bookings: [activeSub], isAdmin: true } });
    expect(w.text()).not.toContain('Cessioni effettuate');
  });
});
