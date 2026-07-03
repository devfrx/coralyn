import type { Package, PackageEquipment, EquipmentType } from '@prisma/client';
import { toPackageDTO, type PackageWithLinks } from './package.projection';

const pkg = (over: Partial<Package> = {}): Package =>
  ({ id: 'pkg-1', establishmentId: 'e-1', name: 'Standard', archivedAt: null, ...over }) as Package;

const link = (typeName: string, quantity: number, typeId: string): PackageEquipment & { equipmentType: EquipmentType } =>
  ({
    establishmentId: 'e-1', packageId: 'pkg-1', equipmentTypeId: typeId, quantity,
    equipmentType: { id: typeId, establishmentId: 'e-1', name: typeName, archivedAt: null },
  }) as PackageEquipment & { equipmentType: EquipmentType };

const row = (links: Array<PackageEquipment & { equipmentType: EquipmentType }>, over: Partial<Package> = {}): PackageWithLinks =>
  ({ ...pkg(over), packageLinks: links }) as PackageWithLinks;

describe('toPackageDTO', () => {
  it('proietta equipment come array risolto, ordinato per nome', () => {
    const dto = toPackageDTO(row([link('Sdraio', 1, 't-2'), link('Lettino', 2, 't-1')]));
    expect(dto.equipment).toEqual([
      { equipmentTypeId: 't-1', name: 'Lettino', quantity: 2 },
      { equipmentTypeId: 't-2', name: 'Sdraio', quantity: 1 },
    ]);
  });
  it('non espone establishmentId', () => {
    expect((toPackageDTO(row([])) as unknown as Record<string, unknown>).establishmentId).toBeUndefined();
  });
  it('un pacchetto attivo NON espone archived', () => {
    expect('archived' in toPackageDTO(row([]))).toBe(false);
  });
  it('un pacchetto archiviato espone archived: true', () => {
    expect(toPackageDTO(row([], { archivedAt: new Date() })).archived).toBe(true);
  });
});
