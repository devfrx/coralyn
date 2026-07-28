import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { Permission, Role } from '@coralyn/contracts';
import { mountApp, permissionsOfRole } from '@/test/utils';
import MapView from '@/features/map/MapView.vue';
import RentalsView from '@/features/rentals/RentalsView.vue';
import RentalCatalogView from '@/features/rentals/RentalCatalogView.vue';
import RenewalsView from '@/features/renewals/RenewalsView.vue';

/**
 * Un'assenza DA PERMESSO si dice, non si rende come un vuoto qualunque (ADR-0063).
 *
 * Il gate di `query-permissions.spec.ts` impedisce i 403; questo impedisce la conseguenza opposta,
 * che è quella che ha reso il difetto invisibile: senza `customers.manage` la Mappa rendeva
 * «Nessun cliente. Crea un cliente.», cioè un'affermazione FALSA con un invito ad agire. Il
 * `?? []` dei chiamanti fa sembrare un permesso mancante un insieme vuoto.
 *
 * ⚠️ Ogni caso porta il suo CONTROLLO: col permesso l'avviso NON deve comparire. Senza, il test
 * sarebbe verde anche se l'avviso fosse cablato sempre acceso.
 */
async function monta(view: unknown, senza: Permission[]) {
  // ⚠️ Sessione al MOUNT: montare da admin e restringere dopo lascerebbe in cache i dati già
  // scaricati, e la vista mostrerebbe cose che l'operatore ristretto non può avere.
  const w = mountApp(view as never, { attachTo: document.body }, {
    user: {
      id: 'u-1', email: 'bagnino@lido.it', role: Role.Staff,
      establishmentId: 'e-1', establishmentName: 'Lido',
      permissions: permissionsOfRole(Role.Staff).filter((p) => !senza.includes(p)),
    },
  });
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  return w;
}

/** Il testo dell'avviso, ovunque sia reso (alcuni vivono dentro un Modal teleportato). */
function testo(): string {
  return `${document.body.textContent ?? ''}`;
}

describe('un permesso mancante si dichiara, non si rende come un vuoto (ADR-0063)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  /** Il dettaglio ombrellone (e i bottoni di prenotazione) vivono nel Drawer, che reka-ui monta
   *  solo a selezione avvenuta: stessa apertura di `MapView.spec.ts`. */
  async function apriDrawerMappa(w: Awaited<ReturnType<typeof monta>>) {
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
  }

  it('Mappa senza bookings.manage: niente bottoni di prenotazione, e lo dice', async () => {
    const w = await monta(MapView, [Permission.BookingsManage]);
    await apriDrawerMappa(w);
    expect(testo()).not.toContain('Nuova prenotazione');
    expect(testo()).toContain('Non hai il permesso di gestire le prenotazioni');
  });

  it('CONTROLLO — Mappa con tutti i permessi: i bottoni di prenotazione ci sono', async () => {
    const w = await monta(MapView, []);
    await apriDrawerMappa(w);
    expect(testo()).toContain('Nuova prenotazione');
    expect(testo()).not.toContain('Non hai il permesso di gestire le prenotazioni');
  });

  it('Mappa senza customers.manage: lo dice invece di «Nessun cliente. Crea un cliente»', async () => {
    const w = await monta(MapView, [Permission.CustomersManage]);
    await apriDrawerMappa(w);
    // apre «Nuova prenotazione» dal footer del Drawer
    const bottoni = Array.from(
      document.body.querySelector('[data-test="drawer-body"]')?.closest('[role="dialog"]')?.querySelectorAll('button') ?? [],
    ) as HTMLButtonElement[];
    bottoni.find((b) => b.textContent?.includes('Nuova prenotazione'))?.click();
    await flushPromises();
    expect(document.querySelector('[data-testid="customers-denied"]')).not.toBeNull();
    expect(testo()).not.toContain('Crea un cliente');
  });

  it('Noleggi senza rental-catalog.manage: lo dice', async () => {
    const w = await monta(RentalsView, [Permission.RentalCatalogManage]);
    await w.find('[data-test="new-rental"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="rental-catalog-denied"]')).not.toBeNull();
  });

  it('CONTROLLO — Noleggi con rental-catalog.manage: nessun avviso', async () => {
    const w = await monta(RentalsView, []);
    await w.find('[data-test="new-rental"]').trigger('click');
    await flushPromises();
    expect(document.querySelector('[data-testid="rental-catalog-denied"]')).toBeNull();
  });

  /** L'editor tariffe compare solo con un articolo selezionato. */
  async function selezionaArticolo(w: Awaited<ReturnType<typeof monta>>) {
    await w.get('[data-test="select-item-ri-1"]').trigger('click');
    await flushPromises();
  }

  it('Listino noleggi senza pricing.manage: lo dice (è l’esempio di ADR-0063)', async () => {
    const w = await monta(RentalCatalogView, [Permission.PricingManage]);
    await selezionaArticolo(w);
    expect(document.querySelector('[data-testid="seasons-denied"]')).not.toBeNull();
  });

  it('CONTROLLO — Listino noleggi con pricing.manage: nessun avviso', async () => {
    const w = await monta(RentalCatalogView, []);
    await selezionaArticolo(w);
    expect(document.querySelector('[data-testid="seasons-denied"]')).toBeNull();
  });

  it('Rinnovi senza bookings.manage: lo dice invece di «Nessun abbonato»', async () => {
    await monta(RenewalsView, [Permission.BookingsManage]);
    expect(document.querySelector('[data-testid="subscriptions-denied"]')).not.toBeNull();
  });

  it('CONTROLLO — Rinnovi con bookings.manage: nessun avviso', async () => {
    await monta(RenewalsView, []);
    expect(document.querySelector('[data-testid="subscriptions-denied"]')).toBeNull();
  });
});
