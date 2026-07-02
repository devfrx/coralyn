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
});
