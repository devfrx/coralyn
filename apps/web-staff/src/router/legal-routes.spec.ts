import { describe, expect, it } from 'vitest';
import { router } from './index';

// D-061 / ADR-0056. Le pagine legali DEVONO essere raggiungibili da sloggati: l'imprint va reso
// accessibile «in modo diretto e permanente» (art. 7 D.Lgs. 70/2003) e l'informativa va resa anche
// a chi non ha ancora un account (art. 14.3.a GDPR). Se qualcuno le rendesse autenticate, la
// conformita' salterebbe in silenzio: questo test e' la guardia.
describe('rotte legali', () => {
  it.each(['privacy', 'imprint'])('la rotta %s esiste ed e pubblica', (name) => {
    const route = router.getRoutes().find((r) => r.name === name);
    expect(route, `rotta "${name}" non registrata`).toBeDefined();
    expect(route?.meta.public, `rotta "${name}" non e pubblica`).toBe(true);
  });

  it('non richiedono un ruolo', () => {
    for (const name of ['privacy', 'imprint']) {
      const route = router.getRoutes().find((r) => r.name === name);
      expect(route?.meta.role).toBeUndefined();
    }
  });
});
