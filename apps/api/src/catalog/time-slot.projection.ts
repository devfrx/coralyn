import type { TimeSlot } from '@prisma/client';
import type { TimeSlotDTO } from '@coralyn/contracts';
import { formatDbTime } from '../common/time';

export function toTimeSlotDTO(row: TimeSlot): TimeSlotDTO {
  return {
    id: row.id,
    name: row.name,
    startTime: formatDbTime(row.startTime),
    endTime: formatDbTime(row.endTime),
    sortOrder: row.sortOrder,
  };
}
