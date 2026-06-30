import type { Row, Sector, TimeSlot, Umbrella, UmbrellaType } from '@prisma/client';
import type {
  BookingType,
  DayMapDTO,
  SectorDTO,
  SlotState,
  TimeSlotDTO,
  UmbrellaDTO,
  UmbrellaTypeDTO,
} from '@coralyn/contracts';
import { slotsOverlap } from '../bookings/booking.availability';

type RowWithUmbrellas = Row & { umbrellas: Umbrella[] };
type SectorWithRows = Sector & { rows: RowWithUmbrellas[] };

/** Prenotazione confermata che copre la data, pre-filtrata e ordinata (per createdAt) dal service. */
export interface BookingForMap {
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;
}

export interface MapSource {
  umbrellaTypes: UmbrellaType[];
  timeSlots: TimeSlot[];
  sectors: SectorWithRows[];
  bookings: BookingForMap[];
}

const STATE_BY_TYPE: Record<BookingType, SlotState> = {
  daily: 'daily',
  periodic: 'booked',
  subscription: 'season',
};

export function projectDayMap(date: string, source: MapSource): DayMapDTO {
  const timeSlots: TimeSlotDTO[] = source.timeSlots.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder }));
  const slotById = new Map(source.timeSlots.map((s) => [s.id, s]));
  const umbrellaTypes: UmbrellaTypeDTO[] = source.umbrellaTypes.map((t) => ({
    id: t.id,
    name: t.name,
    sortOrder: t.sortOrder,
    icon: t.icon ?? undefined,
  }));

  // stato di (umbrella, slot): la PRIMA prenotazione la cui fascia si sovrappone vince
  // (le `bookings` arrivano già ordinate per createdAt dal service).
  const stateFor = (umbrellaId: string, slot: TimeSlot): SlotState => {
    for (const b of source.bookings) {
      if (b.umbrellaId !== umbrellaId) continue;
      const bookedSlot = slotById.get(b.timeSlotId);
      if (bookedSlot && slotsOverlap(bookedSlot, slot)) return STATE_BY_TYPE[b.type];
    }
    return 'free';
  };

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
          stateBySlot: Object.fromEntries(source.timeSlots.map((slot) => [slot.id, stateFor(u.id, slot)])),
        }),
      ),
    })),
  }));
  return { date, umbrellaTypes, timeSlots, sectors };
}
