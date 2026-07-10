import {
  KEEP_LIST,
  assertResettableEnv,
  selectTablesToWipe,
  assertCoherence,
} from '../prisma/reset-dev.core';

describe('reset-dev core — funzioni pure', () => {
  it('selectTablesToWipe rimuove la keep-list dalle forced', () => {
    expect(selectTablesToWipe(['Booking', 'User', 'Customer'], KEEP_LIST)).toEqual(['Booking', 'Customer']);
  });

  it('assertResettableEnv rifiuta NODE_ENV=production', () => {
    expect(() => assertResettableEnv('production', 'coralyn_dev')).toThrow(/production/);
  });

  it('assertResettableEnv rifiuta un DB che non è dev/test', () => {
    expect(() => assertResettableEnv('development', 'coralyn_prod')).toThrow(/non sembra dev\/test/);
  });

  it('assertResettableEnv accetta dev', () => {
    expect(() => assertResettableEnv('development', 'coralyn_dev')).not.toThrow();
  });

  it('assertCoherence passa col carve-out di User (establishmentId ma non-RLS)', () => {
    expect(() =>
      assertCoherence(['Booking', 'Customer'], ['Booking', 'Customer', 'User'], KEEP_LIST),
    ).not.toThrow();
  });

  it('assertCoherence aborta se una tenant table (establishmentId) manca RLS FORCE', () => {
    expect(() => assertCoherence(['Booking'], ['Booking', 'Customer'], KEEP_LIST)).toThrow(
      /senza RLS FORCE.*Customer/,
    );
  });

  it('assertCoherence aborta se una forced non ha establishmentId', () => {
    expect(() => assertCoherence(['Booking', 'Weird'], ['Booking'], KEEP_LIST)).toThrow(
      /senza establishmentId.*Weird/,
    );
  });
});
