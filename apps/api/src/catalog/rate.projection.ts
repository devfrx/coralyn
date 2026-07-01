import type { Rate } from '@prisma/client';
import type { RateDTO } from '@coralyn/contracts';
import { formatDbDate } from '../common/dates';

/** Proietta una Rate nel DTO: `pricingId` interno → `seasonId` esposto; null → undefined;
 *  Decimal → number; @db.Date → ISO. Il chiamante passa il `seasonId` risolto. */
export function toRateDTO(r: Rate, seasonId: string): RateDTO {
  return {
    id: r.id,
    seasonId,
    type: r.type ?? undefined,
    sectorId: r.sectorId ?? undefined,
    rowId: r.rowId ?? undefined,
    packageId: r.packageId ?? undefined,
    timeSlotId: r.timeSlotId ?? undefined,
    periodStart: r.periodStart ? formatDbDate(r.periodStart) : undefined,
    periodEnd: r.periodEnd ? formatDbDate(r.periodEnd) : undefined,
    price: Number(r.price),
    unit: r.unit,
  };
}
