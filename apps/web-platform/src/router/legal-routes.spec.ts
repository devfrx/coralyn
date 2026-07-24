import { describe, expect, it } from 'vitest';
import { router } from './index';

// D-061 / ADR-0056. Stesse invarianti di web-staff: il testo e' condiviso via @coralyn/legal, ma il
// ROUTING e' per-app, quindi e' l'unico punto in cui le due app possono ancora divergere.
describe('rotte legali operatori', () => {
  it.each(['legal-privacy', 'legal-imprint'])('la rotta %s esiste ed e pubblica', (name) => {
    const route = router.getRoutes().find((r) => r.name === name);
    expect(route, `rotta "${name}" non registrata`).toBeDefined();
    expect(route?.meta.public, `rotta "${name}" non e pubblica`).toBe(true);
  });

  it('non richiedono il ruolo superuser', () => {
    for (const name of ['legal-privacy', 'legal-imprint']) {
      expect(router.getRoutes().find((r) => r.name === name)?.meta.role).toBeUndefined();
    }
  });

  it('NON registra /privacy: quel path e del bagnante, su un altra app', () => {
    expect(router.getRoutes().find((r) => r.path === '/privacy')).toBeUndefined();
  });

  it('le rotte legali vivono sotto /legale/', () => {
    for (const name of ['legal-privacy', 'legal-imprint']) {
      expect(router.getRoutes().find((r) => r.name === name)?.path).toMatch(/^\/legale\//);
    }
  });
});
