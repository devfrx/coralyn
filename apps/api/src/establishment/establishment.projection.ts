import type { EstablishmentOverviewDTO, EstablishmentMemberDTO } from '@coralyn/contracts';

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
  users: { id: string; email: string; role: string }[];
  todayIso: string;
}

const ROLE_RANK: Record<string, number> = { admin: 0, staff: 1 };

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

export function toEstablishmentOverview(raw: OverviewRaw): EstablishmentOverviewDTO {
  const team: EstablishmentMemberDTO[] = raw.users
    .filter((u) => u.role === 'admin' || u.role === 'staff')
    .map((u) => ({ id: u.id, email: u.email, role: u.role as 'admin' | 'staff' }))
    .sort((a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.email.localeCompare(b.email));
  return {
    establishment: raw.establishment,
    activeSeason: pickActiveSeason(raw.seasons, raw.todayIso),
    timeSlots: raw.timeSlots,
    structure: raw.structure,
    team,
  };
}
