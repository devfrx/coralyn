import { describe, it, expect } from 'vitest';
import { Permission } from '@coralyn/contracts';
import { resolvePermissionGuard, NO_ACCESS_PATH } from './permissionGuard';

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

  it('NON entra in loop quando il ripiego coincide con la rotta negata', () => {
    // ⚠️ La fixture è questa: l'operatore HA `map.read`, quindi il ripiego calcolato è `/map` —
    // che è anche la rotta su cui sta entrando. Rimandarcelo sarebbe un redirect su se stesso,
    // all'infinito: la guardia lascia passare e il 403 del backend fa il resto.
    // (Il commento precedente descriveva il caso OPPOSTO — `map.read` revocato — che questa
    // fixture non instanzia affatto: quello è il test «con NESSUN permesso» qui sotto.)
    const s = withPermissions(Permission.MapRead);
    expect(resolvePermissionGuard(s, { path: '/map', permission: Permission.PricingManage })).toBe(true);
  });

  /**
   * ⚠️ Regressione trovata dalla review avversariale su questa stessa sessione (ADR-0064).
   * Il ramo terminale restituiva `true`, motivato con «la vista mostra il proprio errore». Da
   * quando ogni query dichiara il permesso del suo endpoint quella query NON PARTE, quindi la
   * vista non ha né errore né caricamento: la Mappa rendeva una spiaggia vuota e muta come
   * schermata di atterraggio dopo il login.
   */
  it('con NESSUN permesso porta allo stato terminale dichiarato, non su una vista muta', () => {
    const s = withPermissions();
    expect(resolvePermissionGuard(s, { path: '/map', permission: Permission.MapRead })).toEqual({ path: NO_ACCESS_PATH });
  });

  it('e su quella rotta NON rimbalza: è lo stato terminale, non un altro salto', () => {
    const s = withPermissions();
    // due vie indipendenti: la rotta non dichiara permesso (ramo 1), e anche se lo dichiarasse
    // il ramo terminale riconosce di esserci già.
    expect(resolvePermissionGuard(s, { path: NO_ACCESS_PATH })).toBe(true);
    expect(resolvePermissionGuard(s, { path: NO_ACCESS_PATH, permission: Permission.MapRead })).toBe(true);
  });

  it('con ALMENO una destinazione accessibile NON va allo stato terminale: dirotta lì', () => {
    // Il caso di controllo: `/nessun-accesso` deve restare irraggiungibile per chi ha qualcosa.
    const s = withPermissions(Permission.ReportsRead);
    expect(resolvePermissionGuard(s, { path: '/pricing', permission: Permission.PricingManage })).toEqual({ path: '/report' });
  });


  it('non dirotta su una destinazione che l’operatore non può aprire', () => {
    const s = withPermissions(Permission.StructureManage);
    const esito = resolvePermissionGuard(s, { path: '/pricing', permission: Permission.PricingManage });
    // L'unica voce che ha è quella di amministrazione: ci finisce, e non su una operativa negata.
    expect(esito).toEqual({ path: '/establishment/structure' });
  });
});
