import { describe, it, expect } from 'vitest';
import { Permission } from '@coralyn/contracts';
import { resolvePermissionGuard } from './permissionGuard';

/** Sessione finta: solo ciò che la guardia guarda. */
const withPermissions = (...granted: Permission[]) => ({
  hasPermission: (p: Permission) => granted.includes(p),
});

describe('resolvePermissionGuard (ADR-0063)', () => {
  it('lascia passare una rotta senza permesso dichiarato', () => {
    expect(resolvePermissionGuard(withPermissions(), { path: '/login' })).toBe(true);
  });

  it('lascia passare se il permesso è detenuto', () => {
    const s = withPermissions(Permission.PricingManage);
    expect(resolvePermissionGuard(s, { path: '/pricing', permission: Permission.PricingManage })).toBe(true);
  });

  it('dirotta sulla prima destinazione accessibile se il permesso manca', () => {
    // Ha solo i Noleggi: non deve finire sulla Mappa, che non può aprire.
    const s = withPermissions(Permission.RentalsOperate);
    expect(resolvePermissionGuard(s, { path: '/pricing', permission: Permission.PricingManage })).toEqual({ path: '/rentals' });
  });

  it('rispetta l’ordine della sidebar nella scelta del ripiego', () => {
    const s = withPermissions(Permission.ReportsRead, Permission.MapRead);
    // `map` viene prima di `report` in OPERATIVE_NAV, e il ripiego deve seguire quell'ordine.
    expect(resolvePermissionGuard(s, { path: '/pricing', permission: Permission.PricingManage })).toEqual({ path: '/map' });
  });

  it('NON entra in loop quando manca il permesso della destinazione di ripiego stessa', () => {
    // Il difetto che il predecessore avrebbe avuto: rimandava sempre a `map`, e con `map.read`
    // configurabile la guardia avrebbe rimbalzato su se stessa all'infinito.
    const s = withPermissions(Permission.MapRead);
    expect(resolvePermissionGuard(s, { path: '/map', permission: Permission.PricingManage })).toBe(true);
  });

  it('con NESSUN permesso lascia passare invece di girare a vuoto', () => {
    // Non è un varco: il backend risponde comunque 403. È l'unico stato terminale possibile.
    const s = withPermissions();
    expect(resolvePermissionGuard(s, { path: '/pricing', permission: Permission.PricingManage })).toBe(true);
  });

  it('non dirotta su una destinazione che l’operatore non può aprire', () => {
    const s = withPermissions(Permission.StructureManage);
    const esito = resolvePermissionGuard(s, { path: '/pricing', permission: Permission.PricingManage });
    // L'unica voce che ha è quella di amministrazione: ci finisce, e non su una operativa negata.
    expect(esito).toEqual({ path: '/establishment/structure' });
  });
});
