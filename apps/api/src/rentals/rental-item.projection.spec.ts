import { toRentalItemDTO } from './rental-item.projection';

describe('toRentalItemDTO', () => {
  const base = { id: 'i1', establishmentId: 't1', name: 'Pedalò', stock: 5, archivedAt: null };
  it('mappa i campi e omette archived quando attivo', () => {
    expect(toRentalItemDTO(base as never)).toEqual({ id: 'i1', name: 'Pedalò', stock: 5 });
  });
  it('stock null passa; archived:true quando archiviato', () => {
    expect(toRentalItemDTO({ ...base, stock: null, archivedAt: new Date() } as never))
      .toEqual({ id: 'i1', name: 'Pedalò', stock: null, archived: true });
  });
});
