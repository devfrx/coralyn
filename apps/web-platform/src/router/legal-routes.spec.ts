import { describe, expect, it } from 'vitest';
import { router } from './index';

// D-061 / ADR-0056. Stessa guardia di web-staff: le pagine legali devono restare pubbliche.
// Il testo e' condiviso via @coralyn/legal, ma il ROUTING e' per-app: e' l'unico punto in cui le
// due app potrebbero ancora divergere, quindi va vincolato in entrambe.
describe('rotte legali', () => {
  it.each(['privacy', 'imprint'])('la rotta %s esiste ed e pubblica', (name) => {
    const route = router.getRoutes().find((r) => r.name === name);
    expect(route, `rotta "${name}" non registrata`).toBeDefined();
    expect(route?.meta.public, `rotta "${name}" non e pubblica`).toBe(true);
  });

  it('non richiedono il ruolo superuser', () => {
    for (const name of ['privacy', 'imprint']) {
      const route = router.getRoutes().find((r) => r.name === name);
      expect(route?.meta.role).toBeUndefined();
    }
  });
});
