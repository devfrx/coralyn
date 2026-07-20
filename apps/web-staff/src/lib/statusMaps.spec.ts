import { describe, it, expect } from 'vitest';
import { PAY_LABEL, PAY_TONE, TYPE_LABEL, RENTAL_STATUS_LABEL, RENTAL_STATUS_TONE } from './statusMaps';

describe('statusMaps', () => {
  it('PAY_LABEL: etichetta IT per ogni PaymentStatus', () => {
    expect(PAY_LABEL.unpaid).toBe('Da incassare');
    expect(PAY_LABEL.partial).toBe('Parziale');
    expect(PAY_LABEL.paid).toBe('Saldato');
  });
  it('PAY_TONE: tone Badge per ogni PaymentStatus', () => {
    expect(PAY_TONE.unpaid).toBe('neutral');
    expect(PAY_TONE.partial).toBe('warning');
    expect(PAY_TONE.paid).toBe('success');
  });
  it('TYPE_LABEL: etichetta IT per ogni BookingType', () => {
    expect(TYPE_LABEL.daily).toBe('Giornaliera');
    expect(TYPE_LABEL.periodic).toBe('Periodica');
    expect(TYPE_LABEL.subscription).toBe('Abbonamento');
  });
  it('RENTAL_STATUS_LABEL: etichetta IT per ogni RentalStatus', () => {
    expect(RENTAL_STATUS_LABEL.active).toBe('Attivo');
    expect(RENTAL_STATUS_LABEL.returned).toBe('Rientrato');
    expect(RENTAL_STATUS_LABEL.cancelled).toBe('Annullato');
  });
  it('RENTAL_STATUS_TONE: tone Badge per ogni RentalStatus', () => {
    expect(RENTAL_STATUS_TONE.active).toBe('accent');
    expect(RENTAL_STATUS_TONE.returned).toBe('success');
    expect(RENTAL_STATUS_TONE.cancelled).toBe('neutral');
  });
});
