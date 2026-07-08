import { toTransferDTO, toCededSubscriptionDTO } from './booking-transfer.projection';

const base = {
  id: 't-1', bookingId: 'b-1', establishmentId: 'e-1',
  previousCustomerId: 'c-a', newCustomerId: 'c-b',
  effectiveDate: new Date('2026-07-15T00:00:00.000Z'),
  refundToPrevious: { toString: () => '250.00' } as never,
  collectedFromNew: { toString: () => '250.00' } as never,
  reason: 'subentro famiglia',
  createdAt: new Date('2026-07-10T09:30:00.000Z'),
};

describe('toTransferDTO', () => {
  it('mappa Decimal→number, Date→ISO, e i nomi dei clienti', () => {
    const dto = toTransferDTO({
      ...base,
      previousCustomer: { firstName: 'Anna', lastName: 'Rossi' } as never,
      newCustomer: { firstName: 'Bruno', lastName: 'Bianchi' } as never,
    } as never);
    expect(dto).toMatchObject({
      id: 't-1', effectiveDate: '2026-07-15',
      previousCustomerId: 'c-a', previousCustomerName: 'Anna Rossi',
      newCustomerId: 'c-b', newCustomerName: 'Bruno Bianchi',
      refundToPrevious: 250, collectedFromNew: 250, reason: 'subentro famiglia',
    });
    expect(dto.createdAt).toBe('2026-07-10T09:30:00.000Z');
  });
});

describe('toCededSubscriptionDTO', () => {
  it('proietta la riga per la Scheda del cedente', () => {
    const dto = toCededSubscriptionDTO(
      { ...base, newCustomer: { firstName: 'Bruno', lastName: 'Bianchi' } as never } as never,
      { umbrellaLabel: 'A12', seasonName: 'Estate 2026' },
    );
    expect(dto).toMatchObject({
      transferId: 't-1', bookingId: 'b-1', effectiveDate: '2026-07-15',
      newCustomerName: 'Bruno Bianchi', umbrellaLabel: 'A12', seasonName: 'Estate 2026',
      refundToPrevious: 250, reason: 'subentro famiglia',
    });
  });
});
