import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SettlePaymentDto } from './settle-payment.dto';

const errs = (o: unknown) => validateSync(plainToInstance(SettlePaymentDto, o), { whitelist: true });

describe('SettlePaymentDto', () => {
  it('valido: amount + metodo', () => {
    expect(errs({ amountCollected: 28, paymentMethod: 'cash' })).toHaveLength(0);
  });
  it('valido: solo amount 0 (reset)', () => {
    expect(errs({ amountCollected: 0 })).toHaveLength(0);
  });
  it('valido: collectionDate ISO', () => {
    expect(errs({ amountCollected: 10, paymentMethod: 'card', collectionDate: '2026-07-15' })).toHaveLength(0);
  });
  it('invalido: amount negativo', () => {
    expect(errs({ amountCollected: -1 }).length).toBeGreaterThan(0);
  });
  it('invalido: amount con 3 decimali', () => {
    expect(errs({ amountCollected: 10.123, paymentMethod: 'cash' }).length).toBeGreaterThan(0);
  });
  it('invalido: metodo fuori enum', () => {
    expect(errs({ amountCollected: 10, paymentMethod: 'bitcoin' }).length).toBeGreaterThan(0);
  });
  it('invalido: collectionDate non calendariale', () => {
    expect(errs({ amountCollected: 10, paymentMethod: 'cash', collectionDate: '2026-13-40' }).length).toBeGreaterThan(0);
  });
});
