import { Prisma } from '@prisma/client';

export const ROW_SELECT = Prisma.validator<Prisma.RowSelect>()({
  id: true,
  label: true,
  sortOrder: true,
  umbrellas: {
    orderBy: { logicalOrder: 'asc' },
    select: { id: true, label: true, umbrellaTypeId: true, logicalOrder: true },
  },
});

export const SECTOR_SELECT = Prisma.validator<Prisma.SectorSelect>()({
  id: true,
  name: true,
  sortOrder: true,
  kind: true,
  rows: { orderBy: { sortOrder: 'asc' }, select: ROW_SELECT },
});

export const UMBRELLA_SELECT = Prisma.validator<Prisma.UmbrellaSelect>()({
  id: true,
  label: true,
  umbrellaTypeId: true,
  logicalOrder: true,
});
