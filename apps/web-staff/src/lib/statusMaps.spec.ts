import { describe, it, expect } from 'vitest';
import { PAY_LABEL, PAY_TONE, TYPE_LABEL } from './statusMaps';

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
});
