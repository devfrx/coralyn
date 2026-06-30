import type { Row, Sector, TimeSlot, Umbrella, UmbrellaType } from '@prisma/client';
import type {
  DayMapDTO,
  RowDTO,
  SectorDTO,
  SlotState,
  TimeSlotDTO,
  UmbrellaDTO,
  UmbrellaTypeDTO,
} from '@coralyn/contracts';

type RowWithUmbrellas = Row & { umbrellas: Umbrella[] };
type SectorWithRows = Sector & { rows: RowWithUmbrellas[] };

/** Structure loaded from DB (output of the `forTenant` queries). */
export interface MapSource {
  umbrellaTypes: UmbrellaType[];
  timeSlots: TimeSlot[];
  sectors: SectorWithRows[];
}

/** Effective date: the requested one or, if absent, today (ISO yyyy-mm-dd, UTC). */
export function resolveDate(date?: string): string {
  return date ?? new Date().toISOString().slice(0, 10);
}

/**
 * Projects the map structure into the DTO shared with the FE.
 *
 * INCREMENT BOUNDARY: `stateBySlot` is `free` for EVERY time slot in this slice.
 * The real derivation (season/daily/booked) will arrive with bookings, which will
 * make this projection slot-aware. Do not invent other states here.
 */
export function projectDayMap(date: string, source: MapSource): DayMapDTO {
  const timeSlots: TimeSlotDTO[] = source.timeSlots.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder }));
  const umbrellaTypes: UmbrellaTypeDTO[] = source.umbrellaTypes.map((t) => ({
    id: t.id,
    name: t.name,
    sortOrder: t.sortOrder,
    icon: t.icon ?? undefined,
  }));
  const freeState: Record<string, SlotState> = Object.fromEntries(
    timeSlots.map((s) => [s.id, 'free' as SlotState]),
  );
  const sectors: SectorDTO[] = source.sectors.map((s) => ({
    id: s.id,
    name: s.name,
    sortOrder: s.sortOrder,
    rows: s.rows.map((r) => ({
      id: r.id,
      label: r.label,
      sortOrder: r.sortOrder,
      umbrellas: r.umbrellas.map(
        (u): UmbrellaDTO => ({
          id: u.id,
          label: u.label,
          umbrellaTypeId: u.umbrellaTypeId,
          rowId: u.rowId,
          stateBySlot: { ...freeState },
        }),
      ),
    })),
  }));
  return { date, umbrellaTypes, timeSlots, sectors };
}
