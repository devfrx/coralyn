import type { Package } from '@prisma/client';
import { toPackageDTO } from './package.projection';

const row = (over: Partial<Package> = {}): Package =>
  ({
    id: 'pkg-1',
    establishmentId: 'e-1',
    name: 'Standard',
    equipment: { sunbeds: 2, deckchairs: 1 },
    archivedAt: null,
    ...over,
  }) as Package;

describe('toPackageDTO', () => {
  it('proietta id/name/equipment', () => {
    expect(toPackageDTO(row())).toEqual({
      id: 'pkg-1',
      name: 'Standard',
      equipment: { sunbeds: 2, deckchairs: 1 },
    });
  });

  it('non espone establishmentId', () => {
    expect((toPackageDTO(row()) as unknown as Record<string, unknown>).establishmentId).toBeUndefined();
  });

  it('un pacchetto attivo (archivedAt null) NON espone archived', () => {
    expect('archived' in toPackageDTO(row())).toBe(false);
  });

  it('un pacchetto archiviato espone archived: true', () => {
    expect(toPackageDTO(row({ archivedAt: new Date('2026-07-01T10:00:00Z') })).archived).toBe(true);
  });
});
