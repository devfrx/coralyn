import { describe, it, expect, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import ConfirmDialog from './ConfirmDialog.vue';

// Come Modal.spec: reka-ui monta il contenuto del dialog nel document.body dopo un tick.
const mountDialog = async (props: Record<string, unknown>) => {
  const w = mount(ConfirmDialog, {
    props: { open: true, title: 'Eliminare?', confirmLabel: 'Elimina', ...props },
    attachTo: document.body,
  });
  await nextTick();
  return w;
};

const confirmBtn = () =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina');
const cancelBtn = () =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Annulla');

afterEach(() => { document.body.innerHTML = ''; });

describe('ConfirmDialog', () => {
  it('rende title e description dentro il dialog', async () => {
    await mountDialog({ description: 'Operazione irreversibile.' });
    expect(document.body.textContent).toContain('Eliminare?');
    expect(document.body.textContent).toContain('Operazione irreversibile.');
  });

  it('emette "confirm" al click sul bottone di conferma', async () => {
    const w = await mountDialog({});
    confirmBtn()!.click();
    await nextTick();
    expect(w.emitted('confirm')).toHaveLength(1);
  });

  it('emette "cancel" al click su Annulla e chiude (update:open false)', async () => {
    const w = await mountDialog({});
    cancelBtn()!.click();
    await nextTick();
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('update:open')!.at(-1)).toEqual([false]);
  });

  it('tone="danger" colora il bottone di conferma col token danger', async () => {
    await mountDialog({ tone: 'danger' });
    expect(confirmBtn()!.className).toContain('bg-[var(--color-danger-bg)]');
  });

  it('cancelLabel personalizzabile', async () => {
    await mountDialog({ cancelLabel: 'Torna indietro' });
    const btn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Torna indietro');
    expect(btn).toBeTruthy();
  });

  it('emette "cancel" alla chiusura via X (DialogClose)', async () => {
    const w = await mountDialog({});
    const x = document.body.querySelector('[aria-label="Chiudi"]') as HTMLElement;
    x.click();
    await nextTick();
    expect(w.emitted('cancel')).toHaveLength(1);
    expect(w.emitted('confirm')).toBeUndefined();
  });

  it('monta i bottoni nella regione footer del Modal', async () => {
    await mountDialog({});
    const footer = document.body.querySelector('[data-test="modal-footer-region"]')!;
    expect(footer).not.toBeNull();
    expect(footer.textContent).toContain('Elimina');
  });
});
