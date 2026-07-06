import { describe, it, expect } from 'vitest';
import { mountApp } from '@/test/utils';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import Sidebar from './Sidebar.vue';

function setUser(establishmentName: string) {
  const s = useSessionStore();
  s.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName };
  return s;
}

describe('Sidebar', () => {
  it('mostra nel banner il nome dello stabilimento dalla sessione', async () => {
    const w = mountApp(Sidebar);
    setUser('Lido Delle Palme');
    await w.vm.$nextTick();
    expect(w.text()).toContain('Lido Delle Palme');
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
