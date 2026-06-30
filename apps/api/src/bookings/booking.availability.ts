/** Intervallo orario di una fascia (valori @db.Time letti come Date a 1970-01-01). */
export interface SlotInterval {
  startTime: Date;
  endTime: Date;
}

/** Due fasce si sovrappongono? Intervalli semiaperti [start, end): contigue non collidono. */
export function slotsOverlap(a: SlotInterval, b: SlotInterval): boolean {
  return a.startTime.getTime() < b.endTime.getTime() && b.startTime.getTime() < a.endTime.getTime();
}

/** Due intervalli di date si sovrappongono? Estremi inclusi. */
export function dateRangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}
