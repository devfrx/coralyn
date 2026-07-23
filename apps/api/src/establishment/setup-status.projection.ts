import type { SetupStatusDTO, SetupStepKey } from '@coralyn/contracts';

/** Count grezzi tenant-scoped da cui derivare lo stato (calcolati dal service, la projection è pura). */
export interface SetupStatusCounts {
  sectors: number;
  rows: number;
  activeUmbrellas: number;      // retiredAt IS NULL (ADR-0053: i ritirati non contano)
  timeSlots: number;
  usableSeasons: number;        // endDate >= oggi (Europe/Rome)
  ratesInUsableSeasons: number;
  usableSeasonsWithRates: number;
  hasCatchAll: boolean;         // esiste una Rate tutta-wildcard su una stagione usable
}

export function computeSetupStatus(c: SetupStatusCounts): SetupStatusDTO {
  const structure = {
    sectors: c.sectors, rows: c.rows, activeUmbrellas: c.activeUmbrellas,
    complete: c.sectors > 0 && c.rows > 0 && c.activeUmbrellas > 0,
  };
  const timeSlots = { count: c.timeSlots, complete: c.timeSlots > 0 };
  const seasons = { usable: c.usableSeasons, complete: c.usableSeasons > 0 };
  // Criterio «il lido può incassare»: basta una stagione usable con almeno una tariffa.
  const rates = { count: c.ratesInUsableSeasons, hasCatchAll: c.hasCatchAll, complete: c.usableSeasonsWithRates > 0 };
  const steps: [SetupStepKey, boolean][] = [
    ['structure', structure.complete],
    ['timeSlots', timeSlots.complete],
    ['seasons', seasons.complete],
    ['rates', rates.complete],
  ];
  const firstIncomplete = steps.find(([, ok]) => !ok);
  return {
    structure, timeSlots, seasons, rates,
    complete: !firstIncomplete,
    firstIncompleteStep: firstIncomplete ? firstIncomplete[0] : null,
  };
}
