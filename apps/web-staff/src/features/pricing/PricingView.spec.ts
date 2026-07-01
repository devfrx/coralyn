import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import PricingView from './PricingView.vue';

const settle = async () => {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
};

describe('PricingView', () => {
  it('mostra la stagione, i pacchetti e le tariffe reali dal mock', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('Estate 2026'); // stagione dal mock
    expect(w.text()).toContain('Standard');    // pacchetto dal mock
    expect(w.text()).toContain('28');          // tariffa catch-all (28/giorno)
  });

  it('crea un pacchetto dal modale e compare tra le card', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-package"]').trigger('click');
    await flushPromises();
    const set = (name: string, val: string) => {
      const el = document.querySelector(`[data-test="form-package"] input[name="${name}"]`) as HTMLInputElement;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('name', 'Prestige');
    (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Prestige');
  });

  it('crea una tariffa dal modale e compare in tabella', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-rate"]').trigger('click');
    await flushPromises();
    const setPrice = (val: string) => {
      const el = document.querySelector('[data-test="form-rate"] input[name="price"]') as HTMLInputElement;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setPrice('42');
    (document.querySelector('[data-test="form-rate"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('42');
  });

  it('modifica il nome di un pacchetto dal modale e la card si aggiorna', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="edit-pkg-pkg-1"]').trigger('click');
    await flushPromises();
    const nameInput = document.querySelector('[data-test="form-package"] input[name="name"]') as HTMLInputElement;
    nameInput.value = 'Deluxe';
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-package"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('Deluxe');
    expect(w.text()).not.toContain('Standard');
  });

  it('modifica il prezzo di una tariffa dal modale e la tabella si aggiorna', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="edit-rate-ra-1"]').trigger('click');
    await flushPromises();
    const priceInput = document.querySelector('[data-test="form-rate"] input[name="price"]') as HTMLInputElement;
    priceInput.value = '55';
    priceInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-rate"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(w.text()).toContain('55');
  });

  it('modifica una tariffa svuotando il pacchetto: la dimensione viene azzerata (non resta il vecchio valore)', async () => {
    const w = mountApp(PricingView, { attachTo: document.body });
    await settle();

    // Crea una tariffa CON pacchetto (dal mock: pkg-1 = "Standard").
    await w.get('[data-test="new-rate"]').trigger('click');
    await flushPromises();
    const form = document.querySelector('[data-test="form-rate"]') as HTMLFormElement;
    const packageSelect = form.querySelectorAll('select')[2] as HTMLSelectElement; // Tipo, Settore, Pacchetto, Fascia
    packageSelect.value = 'pkg-1';
    packageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const priceInput = form.querySelector('input[name="price"]') as HTMLInputElement;
    priceInput.value = '60';
    priceInput.dispatchEvent(new Event('input', { bubbles: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    // La riga appena creata mostra il pacchetto "Standard".
    const rows = document.querySelectorAll('tbody tr, tr');
    const newRow = Array.from(rows).find((r) => r.textContent?.includes('60') && r.textContent?.includes('Standard'));
    expect(newRow).toBeTruthy();
    const editBtn = newRow!.querySelector('[data-test^="edit-rate-"]') as HTMLElement;
    const rateId = editBtn.getAttribute('data-test')!.replace('edit-rate-', '');

    // Riapri in modifica e svuota il pacchetto (torna a "Nessuno").
    await w.get(`[data-test="edit-rate-${rateId}"]`).trigger('click');
    await flushPromises();
    const editForm = document.querySelector('[data-test="form-rate"]') as HTMLFormElement;
    const editPackageSelect = editForm.querySelectorAll('select')[2] as HTMLSelectElement;
    expect(editPackageSelect.value).toBe('pkg-1'); // precompilato correttamente
    editPackageSelect.value = '';
    editPackageSelect.dispatchEvent(new Event('change', { bubbles: true }));
    editForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();

    // La riga con prezzo 60 non deve più mostrare "Standard" come pacchetto.
    const updatedRows = Array.from(document.querySelectorAll('tbody tr, tr'));
    const updatedRow = updatedRows.find((r) => r.textContent?.includes('60'));
    expect(updatedRow).toBeTruthy();
    expect(updatedRow!.textContent).not.toContain('Standard');
  });

  describe('elimina stagione: conferma obbligatoria (cascata su tutte le tariffe)', () => {
    afterEach(() => { vi.restoreAllMocks(); });

    it('annullando la conferma NON elimina la stagione', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      expect(w.text()).toContain('Estate 2026');

      await w.get('[data-test="delete-season"]').trigger('click');
      await settle();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(confirmSpy.mock.calls[0][0]).toContain('Estate 2026');
      expect(w.text()).toContain('Estate 2026'); // la stagione resta
    });

    it('confermando elimina la stagione (e le sue tariffe)', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const w = mountApp(PricingView, { attachTo: document.body });
      await settle();
      expect(w.text()).toContain('Estate 2026');
      expect(w.text()).toContain('28'); // tariffa catch-all della stagione

      await w.get('[data-test="delete-season"]').trigger('click');
      await settle();

      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(w.text()).not.toContain('Estate 2026');
    });
  });
});
