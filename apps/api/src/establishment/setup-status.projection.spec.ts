import { computeSetupStatus, type SetupStatusCounts } from './setup-status.projection';

const base: SetupStatusCounts = {
  sectors: 1, rows: 2, activeUmbrellas: 10, timeSlots: 1,
  usableSeasons: 1, ratesInUsableSeasons: 1, usableSeasonsWithRates: 1, hasCatchAll: true,
};

describe('computeSetupStatus', () => {
  it('tenant vuoto: tutto incompleto, primo passo structure', () => {
    const s = computeSetupStatus({ ...base, sectors: 0, rows: 0, activeUmbrellas: 0, timeSlots: 0, usableSeasons: 0, ratesInUsableSeasons: 0, usableSeasonsWithRates: 0, hasCatchAll: false });
    expect(s.complete).toBe(false);
    expect(s.firstIncompleteStep).toBe('structure');
    expect(s.structure.complete).toBe(false);
  });

  it('struttura senza ombrelloni attivi (tutti ritirati) resta incompleta', () => {
    const s = computeSetupStatus({ ...base, activeUmbrellas: 0 });
    expect(s.structure.complete).toBe(false);
    expect(s.firstIncompleteStep).toBe('structure');
  });

  it('struttura ok, niente fasce → firstIncompleteStep = timeSlots', () => {
    const s = computeSetupStatus({ ...base, timeSlots: 0 });
    expect(s.firstIncompleteStep).toBe('timeSlots');
  });

  it('nessuna stagione usable → firstIncompleteStep = seasons anche se esistono tariffe', () => {
    const s = computeSetupStatus({ ...base, usableSeasons: 0, ratesInUsableSeasons: 0, usableSeasonsWithRates: 0 });
    expect(s.firstIncompleteStep).toBe('seasons');
    expect(s.seasons.complete).toBe(false);
  });

  it('stagione usable senza tariffe → firstIncompleteStep = rates', () => {
    const s = computeSetupStatus({ ...base, ratesInUsableSeasons: 0, usableSeasonsWithRates: 0, hasCatchAll: false });
    expect(s.firstIncompleteStep).toBe('rates');
    expect(s.rates.complete).toBe(false);
  });

  it('configurazione completa: complete=true, firstIncompleteStep=null', () => {
    const s = computeSetupStatus(base);
    expect(s.complete).toBe(true);
    expect(s.firstIncompleteStep).toBeNull();
  });

  it('hasCatchAll è advisory: false non impedisce complete', () => {
    const s = computeSetupStatus({ ...base, hasCatchAll: false });
    expect(s.complete).toBe(true);
    expect(s.rates.hasCatchAll).toBe(false);
  });
});
