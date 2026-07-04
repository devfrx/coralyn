import type { ReportPeriod, SlotState } from '@coralyn/contracts';

const WEEKDAY = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
type RevRow = { date: string; amount: number };

function lastNDays(todayIso: string, n: number): string[] {
  const out: string[] = [];
  const t = new Date(`${todayIso}T00:00:00Z`);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(t);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function revenueKpi(rows: RevRow[], period: ReportPeriod, todayIso: string): number {
  const inScope = period === 'today' ? rows.filter((r) => r.date === todayIso) : rows;
  return inScope.reduce((s, r) => s + r.amount, 0);
}

export function revenueBuckets(rows: RevRow[], period: ReportPeriod, todayIso: string): { label: string; value: number }[] {
  // v1: today+week → ultimi 7 giorni giornalieri; season → stessa vista giornaliera (bucket settimanali = deferito).
  const days = lastNDays(todayIso, 7);
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.amount);
  return days.map((iso) => ({ label: WEEKDAY[new Date(`${iso}T00:00:00Z`).getUTCDay()], value: byDate.get(iso) ?? 0 }));
}

export function occupancyPct(occupied: number, total: number): number {
  return total === 0 ? 0 : Math.round((occupied / total) * 100);
}

export function stateMix(states: SlotState[]): { state: SlotState; count: number; pct: number }[] {
  const total = states.length;
  const counts = new Map<SlotState, number>();
  for (const s of states) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].map(([state, count]) => ({ state, count, pct: total === 0 ? 0 : Math.round((count / total) * 100) }));
}
