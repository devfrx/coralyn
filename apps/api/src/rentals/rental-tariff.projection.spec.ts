import { toRentalTariffDTO } from './rental-tariff.projection';
describe('toRentalTariffDTO', () => {
  const base = { id: 'r1', establishmentId: 't', rentalItemId: 'i1', seasonId: 's1',
    label: '1 ora', price: { toString: () => '8' }, durationMinutes: 60, sortOrder: 2, archivedAt: null };
  it('Decimal→number, archived omesso quando attivo', () => {
    expect(toRentalTariffDTO(base as never)).toEqual(
      { id: 'r1', rentalItemId: 'i1', seasonId: 's1', label: '1 ora', price: 8, durationMinutes: 60 });
  });
  it('archived:true + durationMinutes null', () => {
    expect(toRentalTariffDTO({ ...base, durationMinutes: null, archivedAt: new Date() } as never))
      .toMatchObject({ durationMinutes: null, archived: true });
  });
});
