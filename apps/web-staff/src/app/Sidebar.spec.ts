import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import Sidebar from './Sidebar.vue';

const tick = () => new Promise((r) => setTimeout(r, 0));

function setUser(establishmentName: string, role: Role = Role.Admin) {
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role, establishmentId: 'e-1', establishmentName };
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
});
