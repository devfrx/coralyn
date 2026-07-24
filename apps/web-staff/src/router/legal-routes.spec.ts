import { describe, expect, it } from 'vitest';
import { router } from './index';

// D-061 / ADR-0056. Due invarianti distinte.
describe('rotte legali operatori', () => {
  // 1. DEVONO essere raggiungibili da sloggati: l'imprint va reso accessibile «in modo diretto e
  // permanente» (art. 7 D.Lgs. 70/2003) e l'informativa va resa a chi non ha ancora un account
  // (art. 14.3.a GDPR). Se qualcuno le rendesse autenticate, la conformita' salterebbe in silenzio.
  it.each(['legal-privacy', 'legal-imprint'])('la rotta %s esiste ed e pubblica', (name) => {
    const route = router.getRoutes().find((r) => r.name === name);
    expect(route, `rotta "${name}" non registrata`).toBeDefined();
    expect(route?.meta.public, `rotta "${name}" non e pubblica`).toBe(true);
  });

  it('non richiedono un ruolo', () => {
    for (const name of ['legal-privacy', 'legal-imprint']) {
      expect(router.getRoutes().find((r) => r.name === name)?.meta.role).toBeUndefined();
    }
  });

  // 2. `/privacy` NON deve esistere qui. Quel path appartiene all'informativa del BAGNANTE, servita
  // da web-customer con ?e=<establishmentId> e titolare = il lido. Se riapparisse in web-staff, un
  // URL relativo o un VITE_WEB_CUSTOMER_URL mal configurato tornerebbe a mostrare in silenzio la
  // policy operatori al posto dell'informativa del cliente: e' successo davvero.
  it('NON registra /privacy: quel path e del bagnante, su un altra app', () => {
    const collisione = router.getRoutes().find((r) => r.path === '/privacy');
    expect(collisione, 'path /privacy ricomparso in web-staff').toBeUndefined();
  });

  it('le rotte legali vivono sotto /legale/', () => {
    for (const name of ['legal-privacy', 'legal-imprint']) {
      expect(router.getRoutes().find((r) => r.name === name)?.path).toMatch(/^\/legale\//);
    }
  });
});
