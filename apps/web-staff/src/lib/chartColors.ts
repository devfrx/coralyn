import type { SlotState } from '@coralyn/contracts';

const STATE_VAR: Record<SlotState, string> = {
  free: '--color-state-free', season: '--color-state-season', daily: '--color-state-daily', booked: '--color-state-booked',
  covered: '--color-state-covered',
};

export function resolveVar(name: string): string {
  if (typeof window === 'undefined') return '#000';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#000';
}
export const stateColor = (s: SlotState): string => resolveVar(STATE_VAR[s]);
export const accentColor = (): string => resolveVar('--color-accent');
