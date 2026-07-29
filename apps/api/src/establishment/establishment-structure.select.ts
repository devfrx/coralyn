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
  // Basta sapere SE ne esiste una: il conteggio viaggia nella stessa query (nessun N+1) e non
  // richiede al chiamante il permesso sul listino, che è invece quello che chiederebbe
  // `GET /rates`. Non è filtrato per stagione di proposito: una tariffa dedicata in una stagione
  // qualsiasi è comunque una base di prezzo che lo spostamento cambierebbe.
  _count: { select: { rates: true } },
  rows: { orderBy: { sortOrder: 'asc' }, select: ROW_SELECT },
});

export const UMBRELLA_SELECT = Prisma.validator<Prisma.UmbrellaSelect>()({
  id: true,
  label: true,
  umbrellaTypeId: true,
  logicalOrder: true,
});
