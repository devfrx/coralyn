import { computeRenewalWindowState } from './renewal-window.projection';

const destStart = new Date('2027-06-01');
const destEnd = new Date('2027-09-15');

describe('computeRenewalWindowState', () => {
  it('open quando oggi < deadline e nessun rinnovo', () => {
    expect(computeRenewalWindowState([], destStart, destEnd, '2027-05-31', '2027-05-01')).toBe('open');
  });
  it('open al giorno-scadenza (today == deadline è ancora aperta)', () => {
    expect(computeRenewalWindowState([], destStart, destEnd, '2027-05-31', '2027-05-31')).toBe('open');
  });
  it('expired quando oggi > deadline e nessun rinnovo', () => {
    expect(computeRenewalWindowState([], destStart, destEnd, '2027-05-31', '2027-06-01')).toBe('expired');
  });
  it('exercised quando esiste un rinnovo confermato che overlappa la destinazione (anche dopo la scadenza)', () => {
    const renewals = [{ status: 'confirmed' as const, startDate: new Date('2027-06-15'), endDate: new Date('2027-09-10') }];
    expect(computeRenewalWindowState(renewals, destStart, destEnd, '2027-05-31', '2027-06-01')).toBe('exercised');
  });
  it('un rinnovo cancellato non conta come exercised', () => {
    const renewals = [{ status: 'cancelled' as const, startDate: new Date('2027-06-15'), endDate: new Date('2027-09-10') }];
    expect(computeRenewalWindowState(renewals, destStart, destEnd, '2027-05-31', '2027-05-01')).toBe('open');
  });
});
