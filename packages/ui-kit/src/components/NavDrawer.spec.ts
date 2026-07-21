import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import NavDrawer from './NavDrawer.vue';

const mountNav = async (props: Record<string, unknown> = {}, slot = '<nav data-test="nav-content">voci</nav>') => {
  const w = mount(NavDrawer, { props: { open: true, ...props }, slots: { default: slot }, attachTo: document.body });
  await nextTick();
  return w;
};
afterEach(() => { document.body.innerHTML = ''; });

describe('NavDrawer', () => {
  it('quando open rende un dialog col contenuto slot', async () => {
    await mountNav();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('[data-test="nav-content"]')).not.toBeNull();
  });
  it('ha un titolo accessibile sr-only (default) senza chrome visibile titolo+X', async () => {
    await mountNav();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Menu di navigazione');
    const title = [...dialog.querySelectorAll('*')].find((el) => el.textContent === 'Menu di navigazione')!;
    expect(title.className).toContain('sr-only');
    expect(dialog.querySelector('button[aria-label="Chiudi"]')).toBeNull();
  });
  it('è ancorato a sinistra con lo sfondo sidebar e lo slide-in da sinistra', async () => {
    await mountNav();
    const cls = document.body.querySelector('[data-test="nav-drawer"]')!.getAttribute('class') ?? '';
    expect(cls).toContain('left-0');
    expect(cls).toContain('bg-[var(--color-sidebar-bg)]');
    expect(cls).toContain('data-[state=open]:[animation:nav-in');
  });
  it('quando chiuso non rende il dialog', async () => {
    await mountNav({ open: false });
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
