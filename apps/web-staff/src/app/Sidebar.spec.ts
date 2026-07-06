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
