import type { EstablishmentOverviewDTO } from '@coralyn/contracts';

export interface RawSeason {
  name: string;
  startDate: Date;
  endDate: Date;
}

export interface OverviewRaw {
  establishment: { id: string; name: string };
  seasons: RawSeason[];
  timeSlots: { id: string; name: string }[];
  structure: EstablishmentOverviewDTO['structure'];
  todayIso: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function pickActiveSeason(
  seasons: RawSeason[],
  todayIso: string,
): EstablishmentOverviewDTO['activeSeason'] {
  // Stagioni assunte non sovrapposte: primo match vince (in pratica ne esiste al più una per data).
  const active = seasons.find((s) => iso(s.startDate) <= todayIso && todayIso <= iso(s.endDate));
  return active ? { name: active.name, startDate: iso(active.startDate), endDate: iso(active.endDate) } : null;
}

// Nessun dato personale in questa proiezione: vedi il commento su EstablishmentOverviewDTO (D-064).
export function toEstablishmentOverview(raw: OverviewRaw): EstablishmentOverviewDTO {
  return {
    establishment: raw.establishment,
    activeSeason: pickActiveSeason(raw.seasons, raw.todayIso),
    timeSlots: raw.timeSlots,
    structure: raw.structure,
  };
}
