import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import Modal from './Modal.vue';

// reka-ui's DialogContent wraps children in a `Presence` component whose mount
// is driven by a `watch(..., { immediate: true })` that awaits a tick before
// flushing state into the DOM. So even though `open` is true from the first
// render, the dialog only appears in `document.body` after a `nextTick()`.
const mountModal = async (props: Record<string, unknown>) => {
  const wrapper = mount(Modal, { props: { open: true, title: 'Titolo', ...props }, attachTo: document.body });
  await nextTick();
  return wrapper;
};

afterEach(() => { document.body.innerHTML = ''; });

describe('Modal', () => {
  it('ha sempre aria-describedby che punta a un elemento reale (no warn reka-ui)', async () => {
    await mountModal({});
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).not.toBeNull();
  });

  it('con description la mostra come testo visibile sotto il titolo', async () => {
    await mountModal({ description: 'Compila i campi e salva.' });
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const desc = document.getElementById(dialog.getAttribute('aria-describedby')!)!;
    expect(desc.textContent).toContain('Compila i campi e salva.');
    expect(desc.className).not.toContain('sr-only');
  });

  it('senza description l\'elemento è sr-only (solo per screen reader)', async () => {
    await mountModal({});
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const desc = document.getElementById(dialog.getAttribute('aria-describedby')!)!;
    expect(desc.className).toContain('sr-only');
  });

  it('overlay e content portano le animazioni di entrata/uscita su data-state', async () => {
    await mountModal({});
    const overlay = document.body.querySelector('[data-reka-dialog-overlay], .fixed.inset-0')!;
    const content = document.body.querySelector('[role="dialog"]')!;
    const overlayCls = overlay.getAttribute('class') ?? '';
    const contentCls = content.getAttribute('class') ?? '';
    expect(overlayCls).toContain('data-[state=open]:[animation:overlay-in');
    expect(overlayCls).toContain('data-[state=closed]:[animation:overlay-out');
    expect(contentCls).toContain('data-[state=open]:[animation:dialog-in');
    expect(contentCls).toContain('data-[state=closed]:[animation:dialog-out');
  });

  it('rende lo slot #footer in una regione dedicata quando presente', async () => {
    mount(Modal, {
      props: { open: true, title: 'Titolo' },
      slots: { default: '<p>corpo</p>', footer: '<button data-test="cta">Salva</button>' },
      attachTo: document.body,
    });
    await nextTick();
    const footerBtn = document.body.querySelector('[data-test="cta"]');
    expect(footerBtn).not.toBeNull();
    const footerRegion = document.body.querySelector('[data-test="modal-footer-region"]')!;
    expect(footerRegion).not.toBeNull();
    expect(footerRegion.contains(footerBtn)).toBe(true);
  });

  it('senza slot #footer non rende la regione footer', async () => {
    mount(Modal, { props: { open: true, title: 'Titolo' }, slots: { default: 'x' }, attachTo: document.body });
    await nextTick();
    expect(document.body.querySelector('[data-test="modal-footer-region"]')).toBeNull();
  });

  it('il body è la regione scrollabile (overflow-auto), non il content', async () => {
    mount(Modal, { props: { open: true, title: 'Titolo' }, slots: { default: 'x' }, attachTo: document.body });
    await nextTick();
    const body = document.body.querySelector('[data-test="modal-body"]')!;
    expect(body.className).toContain('overflow-auto');
    const content = document.body.querySelector('[role="dialog"]')!;
    expect(content.className).not.toContain('overflow-auto');
  });
});
