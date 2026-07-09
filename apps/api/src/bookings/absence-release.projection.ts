import type { AbsenceRelease } from '@prisma/client';
import type { AbsenceReleaseDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta un'assenza comunicata nel DTO della Scheda. `resold` = il giorno è occupato da altra booking. */
export function toAbsenceReleaseDTO(r: AbsenceRelease, resold: boolean): AbsenceReleaseDTO {
  return {
    id: r.id,
    date: formatDbDate(r.date),
    source: r.source,
    canceledAt: r.canceledAt ? r.canceledAt.toISOString() : null,
    resold,
    reason: r.reason ?? undefined,
    createdAt: r.createdAt.toISOString(),
  };
}
