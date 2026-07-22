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
import { formatDbTime } from '../common/time';

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
  const timeSlots: TimeSlotDTO[] = source.timeSlots.map((s) => ({
    id: s.id,
    name: s.name,
    startTime: formatDbTime(s.startTime),
    endTime: formatDbTime(s.endTime),
    sortOrder: s.sortOrder,
  }));
  const slotById = new Map(source.timeSlots.map((s) => [s.id, s]));
  const umbrellaTypes: UmbrellaTypeDTO[] = source.umbrellaTypes.map((t) => ({
    id: t.id,
    name: t.name,
    sortOrder: t.sortOrder,
    icon: t.icon ?? undefined,
  }));

  // Stato di (umbrella, slot) a DUE FASI: una prenotazione DIRETTA (timeSlotId === slot.id) prevale; altrimenti la
  // fascia è COPERTA se una prenotazione su un'ALTRA fascia si sovrappone; altrimenti libera. (bookings già ordinate
  // per createdAt dal service.) Ritorna anche gli ids delle fasce copritrici per una fascia coperta.
  const resolveSlot = (umbrellaId: string, slot: TimeSlot): { state: SlotState; coveredBy: string[] } => {
    const direct = source.bookings.find(
      (b) => b.umbrellaId === umbrellaId && b.timeSlotId === slot.id,
    );
    if (direct) return { state: STATE_BY_TYPE[direct.type], coveredBy: [] };
    const coveringSlotIds = source.bookings
      .filter((b) => {
        if (b.umbrellaId !== umbrellaId || b.timeSlotId === slot.id) return false;
        const bookedSlot = slotById.get(b.timeSlotId);
        return bookedSlot != null && slotsOverlap(bookedSlot, slot);
      })
      .map((b) => b.timeSlotId);
    if (coveringSlotIds.length > 0) return { state: 'covered', coveredBy: [...new Set(coveringSlotIds)] };
    return { state: 'free', coveredBy: [] };
  };

  const sectors: SectorDTO[] = source.sectors.map((s) => ({
    id: s.id,
    name: s.name,
    sortOrder: s.sortOrder,
    kind: s.kind,
    rows: s.rows.map((r) => ({
      id: r.id,
      label: r.label,
      sortOrder: r.sortOrder,
      umbrellas: r.umbrellas.map((u): UmbrellaDTO => {
        const stateBySlot: Record<string, SlotState> = {};
        const coveredBySlot: Record<string, string[]> = {};
        for (const slot of source.timeSlots) {
          const { state, coveredBy } = resolveSlot(u.id, slot);
          stateBySlot[slot.id] = state;
          if (state === 'covered') coveredBySlot[slot.id] = coveredBy;
        }
        return { id: u.id, label: u.label, umbrellaTypeId: u.umbrellaTypeId, rowId: r.id, stateBySlot, coveredBySlot };
      }),
    })),
  }));
  return { date, umbrellaTypes, timeSlots, sectors };
}
