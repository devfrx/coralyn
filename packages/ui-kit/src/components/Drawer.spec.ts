import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Drawer from './Drawer.vue';

const mountDrawer = async (props: Record<string, unknown> = {}) => {
  const w = mount(Drawer, { props: { open: true, title: 'Dettaglio', ...props }, attachTo: document.body });
  await nextTick();
  return w;
};
afterEach(() => { document.body.innerHTML = ''; });

describe('Drawer', () => {
  it('rende il titolo e il ruolo dialog', async () => {
    await mountDrawer();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Dettaglio');
  });
  it('applica le animazioni slide su data-state', async () => {
    await mountDrawer();
    const cls = document.body.querySelector('[role="dialog"]')!.getAttribute('class') ?? '';
    expect(cls).toContain('data-[state=open]:[animation:drawer-in');
    expect(cls).toContain('data-[state=closed]:[animation:drawer-out');
  });
  it('ha un bottone di chiusura accessibile', async () => {
    await mountDrawer();
    expect(document.body.querySelector('button[aria-label="Chiudi"]')).not.toBeNull();
  });
  it('il body scrolla e il footer (se presente) è in una regione dedicata', async () => {
    mount(Drawer, {
      props: { open: true, title: 'Dettaglio' },
      slots: { default: '<p>corpo</p>', footer: '<button data-test="d-cta">Azione</button>' },
      attachTo: document.body,
    });
    await nextTick();
    const body = document.body.querySelector('[data-test="drawer-body"]')!;
    expect(body.className).toContain('overflow-auto');
    const footer = document.body.querySelector('[data-test="drawer-footer-region"]')!;
    expect(footer).not.toBeNull();
    expect(footer.contains(document.body.querySelector('[data-test="d-cta"]'))).toBe(true);
    document.body.innerHTML = '';
  });

  it('senza slot #footer non rende la regione footer', async () => {
    mount(Drawer, { props: { open: true, title: 'X' }, slots: { default: 'x' }, attachTo: document.body });
    await nextTick();
    expect(document.body.querySelector('[data-test="drawer-footer-region"]')).toBeNull();
  });
});
