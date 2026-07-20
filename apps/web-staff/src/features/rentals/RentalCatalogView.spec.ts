import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import RentalCatalogView from './RentalCatalogView.vue';

const settle = async () => {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
};

// Helper: trova il bottone del ConfirmDialog per testo, nel document.body (stesso pattern di PricingView.spec.ts).
const dialogBtn = (label: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

const setInput = (selector: string, val: string) => {
  const el = document.querySelector(selector) as HTMLInputElement;
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

describe('RentalCatalogView', () => {
  it('mostra gli articoli del catalogo dal mock', async () => {
    const w = mountApp(RentalCatalogView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('SUP');
    expect(w.text()).toContain('Kayak');
    expect(w.text()).toContain('5 in scorta');
    expect(w.text()).toContain('Scorta illimitata'); // Kayak: stock null
  });

  it('crea un articolo dal modale e compare tra le card', async () => {
    const w = mountApp(RentalCatalogView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-item"]').trigger('click');
    await flushPromises();
    setInput('[data-test="form-item"] input[name="name"]', 'Pedalò');
    (document.querySelector('[data-test="form-item"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Pedalò');
  });

  it('imposta la scorta di un articolo a vuoto: torna "Scorta illimitata" (null, non 0)', async () => {
    const w = mountApp(RentalCatalogView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="edit-item-ri-1"]').trigger('click');
    await flushPromises();
    const stockInput = document.querySelector('[data-test="form-item"] input[name="stock"]') as HTMLInputElement;
    expect(stockInput.value).toBe('5'); // precompilato
    stockInput.value = '';
    stockInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-item"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    // La card di SUP non mostra più "5 in scorta" ma "Scorta illimitata".
    const card = Array.from(document.querySelectorAll('*')).find((el) => el.textContent?.trim() === 'SUP')?.closest('[data-test="select-item-ri-1"]');
    expect(card).toBeTruthy();
    expect(card!.textContent).toContain('Scorta illimitata');
    expect(card!.textContent).not.toContain('5 in scorta');
  });

  it('seleziona un articolo, sceglie la stagione e aggiunge una tariffa dal modale', async () => {
    const w = mountApp(RentalCatalogView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="select-item-ri-1"]').trigger('click');
    await settle();
    expect(w.text()).toContain('Mezza giornata'); // tariffa seed per ri-1/se-1
    await w.get('[data-test="new-tariff"]').trigger('click');
    await flushPromises();
    setInput('[data-test="form-tariff"] input[name="label"]', 'Giornata intera');
    setInput('[data-test="form-tariff"] input[name="price"]', '25');
    (document.querySelector('[data-test="form-tariff"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Giornata intera');
    expect(w.text()).toContain('25');
  });

  describe('ciclo di vita articolo: archivia / ripristina / elimina definitivamente', () => {
    it('archiviando, l\'articolo sparisce dagli attivi e compare tra gli archiviati', async () => {
      const w = mountApp(RentalCatalogView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-item-ri-1"]').trigger('click');
      await settle();
      expect(w.get('[data-test="toggle-archived-items"]').text()).toContain('Archiviati (1)');
      expect(document.querySelector('[data-test="select-item-ri-1"]')).toBeNull();
    });

    it('ripristina un articolo archiviato', async () => {
      const w = mountApp(RentalCatalogView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-item-ri-1"]').trigger('click');
      await settle();
      await w.get('[data-test="toggle-archived-items"]').trigger('click');
      await settle();
      await w.get('[data-test="restore-item-ri-1"]').trigger('click');
      await settle();
      expect(w.get('[data-test="select-item-ri-1"]')).toBeTruthy();
      expect(document.querySelector('[data-test="toggle-archived-items"]')).toBeNull();
    });

    it('"Elimina definitivamente" richiede conferma via ConfirmDialog', async () => {
      const w = mountApp(RentalCatalogView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="archive-item-ri-1"]').trigger('click');
      await settle();
      await w.get('[data-test="toggle-archived-items"]').trigger('click');
      await settle();
      await w.get('[data-test="del-item-ri-1"]').trigger('click');
      await settle();
      expect(document.body.textContent).toContain('Eliminare definitivamente?');
      dialogBtn('Annulla')!.click();
      await settle();
      expect(w.get('[data-test="toggle-archived-items"]').text()).toContain('Archiviati (1)'); // annullato: resta archiviato

      await w.get('[data-test="del-item-ri-1"]').trigger('click');
      await settle();
      dialogBtn('Elimina')!.click();
      await settle();
      expect(document.querySelector('[data-test="toggle-archived-items"]')).toBeNull();
      expect(w.text()).not.toContain('SUP');
    });
  });

  describe('ciclo di vita tariffa: archivia / ripristina / elimina definitivamente', () => {
    it('archivia e ripristina una tariffa', async () => {
      const w = mountApp(RentalCatalogView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="select-item-ri-1"]').trigger('click');
      await settle();
      await w.get('[data-test="archive-tariff-rt-1"]').trigger('click');
      await settle();
      expect(w.get('[data-test="toggle-archived-tariffs"]').text()).toContain('Archiviati (1)');
      await w.get('[data-test="toggle-archived-tariffs"]').trigger('click');
      await settle();
      await w.get('[data-test="restore-tariff-rt-1"]').trigger('click');
      await settle();
      expect(document.querySelector('[data-test="toggle-archived-tariffs"]')).toBeNull();
      expect(w.text()).toContain('Mezza giornata');
    });

    it('elimina una tariffa: richiede conferma via ConfirmDialog', async () => {
      const w = mountApp(RentalCatalogView, { attachTo: document.body });
      await settle();
      await w.get('[data-test="select-item-ri-1"]').trigger('click');
      await settle();
      await w.get('[data-test="archive-tariff-rt-1"]').trigger('click');
      await settle();
      await w.get('[data-test="toggle-archived-tariffs"]').trigger('click');
      await settle();
      await w.get('[data-test="del-tariff-rt-1"]').trigger('click');
      await settle();
      expect(document.body.textContent).toContain('Eliminare definitivamente?');
      dialogBtn('Elimina')!.click();
      await settle();
      expect(document.querySelector('[data-test="toggle-archived-tariffs"]')).toBeNull();
      expect(w.text()).not.toContain('Mezza giornata');
    });
  });
});
