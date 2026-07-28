import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp, permissionsOfRole } from '@/test/utils';
import { Permission, Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import Sidebar from './Sidebar.vue';

const tick = () => new Promise((r) => setTimeout(r, 0));

function setUser(establishmentName: string, role: Role = Role.Admin, permissions?: Permission[]) {
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role, establishmentId: 'e-1', establishmentName, permissions: permissions ?? permissionsOfRole(role) };
  return s;
}

describe('Sidebar', () => {
  it('mostra nel banner il nome dello stabilimento dalla sessione', async () => {
    const w = mountApp(Sidebar);
    setUser('Lido Delle Palme');
    await w.vm.$nextTick();
    expect(w.text()).toContain('Lido Delle Palme');
  });

  it('mostra il ruolo reale dalla sessione (Amministratore per Admin)', async () => {
    const w = mountApp(Sidebar);
    setUser('Lido Uno', Role.Admin);
    await w.vm.$nextTick();
    expect(w.text()).toContain('Amministratore');
  });

  it('non etichetta come Amministratore un utente Staff', async () => {
    const w = mountApp(Sidebar);
    setUser('Lido Uno', Role.Staff);
    await w.vm.$nextTick();
    expect(w.text()).not.toContain('Amministratore');
    expect(w.text()).toContain('Staff');
  });

  it('mostra il nome della stagione attiva reale dall\'overview, non un literal hardcoded', async () => {
    const w = mountApp(Sidebar);
    setUser('Lido Uno');
    await flushPromises();
    await tick();
    await flushPromises();
    // Seed MSW (mocks/server.ts): activeSeason.name = 'Estate 2026'.
    expect(w.text()).toContain('Estate 2026');
    expect(w.text()).not.toContain('Stagione 2026');
  });

  it('il logout è un bottone con testo «Esci» che sgancia la sessione (5.1, allineato a web-platform)', async () => {
    const w = mountApp(Sidebar);
    const s = setUser('Lido Uno');
    await w.vm.$nextTick();
    const esci = w.findAll('button').find((b) => b.text() === 'Esci');
    expect(esci).toBeDefined();
    await esci!.trigger('click');
    expect(s.user).toBeNull();
  });

  it('admin vede la sezione Amministrazione con la voce Struttura (5.1)', async () => {
    const w = mountApp(Sidebar);
    setUser('Lido Uno', Role.Admin);
    await w.vm.$nextTick();
    expect(w.text()).toContain('Amministrazione');
    expect(w.text()).toContain('Struttura');
  });

  it('la voce Struttura punta a /establishment/structure (5.1)', async () => {
    // Stub locale che espone `to` nel DOM: quello di default non lo rende osservabile.
    const w = mountApp(Sidebar, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-to="to"><slot /></a>' } } } });
    setUser('Lido Uno', Role.Admin);
    await w.vm.$nextTick();
    const link = w.findAll('a').find((a) => a.attributes('data-to') === '/establishment/structure');
    expect(link).toBeDefined();
    expect(link!.text()).toContain('Struttura');
  });

  it('staff NON vede la sezione Amministrazione né Struttura (5.1)', async () => {
    const w = mountApp(Sidebar);
    setUser('Lido Uno', Role.Staff);
    await w.vm.$nextTick();
    expect(w.text()).not.toContain('Amministrazione');
    expect(w.text()).not.toContain('Struttura');
  });

  it('riflette reattivamente un cambio di nome', async () => {
    const w = mountApp(Sidebar);
    const s = setUser('Lido Uno');
    await w.vm.$nextTick();
    expect(w.text()).toContain('Lido Uno');
    s.user = { ...s.user!, establishmentName: 'Lido Due' };
    await w.vm.$nextTick();
    expect(w.text()).toContain('Lido Due');
    expect(w.text()).not.toContain('Lido Uno');
  });

  // ADR-0063. ⚠️ Prima di questa slice `operativeNav` era mostrato a OGNI ruolo senza alcun gate:
  // la revoca configurata dall'admin non si sarebbe vista da nessuna parte.
  describe('le voci seguono i permessi, non il ruolo', () => {
    it('con il Listino revocato sparisce QUELLA voce, e il Listino noleggi resta', async () => {
      // ⚠️ Si asserisce sulle DESTINAZIONI e non sul testo: «Listino» è sottostringa di «Listino
      // noleggi», e un `toContain` non saprebbe distinguere due permessi diversi.
      const w = mountApp(Sidebar, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :data-to="to"><slot /></a>' } } } });
      const senzaListino = permissionsOfRole(Role.Staff).filter((p) => p !== Permission.PricingManage);
      setUser('Lido Uno', Role.Staff, senzaListino);
      await w.vm.$nextTick();
      const destinazioni = w.findAll('a').map((a) => a.attributes('data-to'));
      expect(destinazioni).not.toContain('/pricing');
      expect(destinazioni).toContain('/rentals/catalogo');
      expect(destinazioni).toContain('/map');
    });

    it('uno STAFF con structure.manage concesso vede Amministrazione, che il suo ruolo non darebbe', async () => {
      // È il senso della slice: il ruolo non ha più voce in capitolo.
      const w = mountApp(Sidebar);
      setUser('Lido Uno', Role.Staff, [...permissionsOfRole(Role.Staff), Permission.StructureManage]);
      await w.vm.$nextTick();
      expect(w.text()).toContain('Amministrazione');
      expect(w.text()).toContain('Struttura');
    });

    it('senza alcun permesso non resta nessuna voce né intestazione di sezione', async () => {
      const w = mountApp(Sidebar);
      setUser('Lido Uno', Role.Staff, []);
      await w.vm.$nextTick();
      expect(w.text()).not.toContain('Operativo');
      expect(w.text()).not.toContain('Amministrazione');
      expect(w.text()).not.toContain('Mappa');
      // Il lido resta identificato: il nome viene dalla sessione, non dall'endpoint negato.
      expect(w.text()).toContain('Lido Uno');
    });

    it('senza establishment.read la card del lido non è più un bottone', async () => {
      const w = mountApp(Sidebar);
      const senzaScheda = permissionsOfRole(Role.Staff).filter((p) => p !== Permission.EstablishmentRead);
      setUser('Lido Uno', Role.Staff, senzaScheda);
      await w.vm.$nextTick();
      const versoStabilimento = w.findAll('button').filter((b) => b.text().includes('Lido Uno'));
      expect(versoStabilimento).toHaveLength(0);
      expect(w.text()).toContain('Lido Uno');
    });
  });
});
