import type { EquipmentType } from '@prisma/client';
import { toEquipmentTypeDTO } from './equipment-type.projection';

const row = (over: Partial<EquipmentType> = {}): EquipmentType =>
  ({ id: 'eq-1', establishmentId: 'e-1', name: 'Lettino', archivedAt: null, ...over }) as EquipmentType;

describe('toEquipmentTypeDTO', () => {
  it('proietta id/name senza establishmentId', () => {
    expect(toEquipmentTypeDTO(row())).toEqual({ id: 'eq-1', name: 'Lettino' });
  });
  it('un tipo attivo non espone archived', () => {
    expect('archived' in toEquipmentTypeDTO(row())).toBe(false);
  });
  it('un tipo archiviato espone archived: true', () => {
    expect(toEquipmentTypeDTO(row({ archivedAt: new Date() })).archived).toBe(true);
  });
});
