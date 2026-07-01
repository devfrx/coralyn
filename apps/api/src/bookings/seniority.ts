import type { Prisma } from '@prisma/client';

/**
 * Anzianità = lunghezza catena `previousBookingId`. Risalita iterativa per generazioni con la query API
 * Prisma (RLS via forTenant, niente SQL raw). Query bounded dalla profondità della catena (piccola: 1 per
 * stagione), non dal numero di abbonati.
 */
export async function computeSeniority(
  tx: Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const parentOf = new Map<string, string | null>();
  let toLoad = ids;
  while (toLoad.length > 0) {
    const gen = await tx.booking.findMany({
      where: { id: { in: toLoad } },
      select: { id: true, previousBookingId: true },
    });
    for (const r of gen) parentOf.set(r.id, r.previousBookingId);
    toLoad = gen
      .map((r) => r.previousBookingId)
      .filter((x): x is string => x !== null && !parentOf.has(x));
  }
  const seniority = new Map<string, number>();
  for (const id of ids) {
    let depth = 1;
    let cur = parentOf.get(id) ?? null;
    const seen = new Set<string>([id]);
    while (cur !== null && parentOf.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      depth += 1;
      cur = parentOf.get(cur) ?? null;
    }
    seniority.set(id, depth);
  }
  return seniority;
}
