import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { useToasts } from '@/lib/toasts';
import RentalsView from './RentalsView.vue';

const settle = async () => {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
};

// Bottoni teleportati (reka-ui DialogPortal): si cercano su document.body per testo, come
// PricingView/RentalCatalogView.spec.ts.
const dialogBtn = (label: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

const setSelect = (selector: string, val: string) => {
  const el = document.querySelector(selector) as HTMLSelectElement;
  el.value = val;
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const setInput = (selector: string, val: string) => {
  const el = document.querySelector(selector) as HTMLInputElement;
  el.value = val;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

/** Apre il modale "Nuovo noleggio", seleziona SUP (ri-1) / tariffa Mezza giornata (rt-1, € 15),
 *  imposta le unità e conferma. Ritorna il wrapper dopo che il noleggio è comparso in tabella. */
async function checkoutSup(w: ReturnType<typeof mountApp>, units = 1) {
  await w.get('[data-test="new-rental"]').trigger('click');
  await settle();
  setSelect('[data-test="new-rental-item"]', 'ri-1');
  await settle();
  setSelect('[data-test="new-rental-tariff"]', 'rt-1');
  await settle();
  if (units !== 1) setInput('[data-test="new-rental-units"]', String(units));
  await settle();
  dialogBtn('Conferma noleggio')!.click();
  await settle();
  return w;
}

describe('RentalsView', () => {
  it('mostra empty-state quando non ci sono noleggi', async () => {
    const w = mountApp(RentalsView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('Nessun noleggio per questa data.');
  });

  it('nuovo noleggio: anteprima prezzo = tariffa × unità, poi checkout', async () => {
    const w = mountApp(RentalsView, { attachTo: document.body });
    await settle();
    await w.get('[data-test="new-rental"]').trigger('click');
    await settle();
    setSelect('[data-test="new-rental-item"]', 'ri-1');
    await settle();
    setSelect('[data-test="new-rental-tariff"]', 'rt-1');
    await settle();
    // Anteprima client-side: 15 € (tariffa) × 1 unità (default) = 15.00, NESSUNA chiamata quote.
    expect(document.querySelector('[data-test="new-rental-preview"]')?.textContent).toContain('15.00');
    setInput('[data-test="new-rental-units"]', '2');
    await settle();
    expect(document.querySelector('[data-test="new-rental-preview"]')?.textContent).toContain('30.00');

    dialogBtn('Conferma noleggio')!.click();
    await settle();

    expect(w.text()).toContain('SUP');
    expect(w.text()).toContain('Mezza giornata');
    expect(w.text()).toContain('Attivo');
    expect(w.text()).toContain('30.00'); // totale registrato (checkout server-side: price × units)
  });

  it('rientro: il noleggio passa a Rientrato e le azioni attive scompaiono', async () => {
    const w = mountApp(RentalsView, { attachTo: document.body });
    await settle();
    await checkoutSup(w);
    expect(w.text()).toContain('Attivo');

    await w.get('[data-test="return-rn-1"]').trigger('click');
    await settle();

    expect(w.text()).toContain('Rientrato');
    expect(w.find('[data-test="return-rn-1"]').exists()).toBe(false);
    expect(w.find('[data-test="cancel-rn-1"]').exists()).toBe(false);
  });

  it('incasso: registra il pagamento e il totale risulta saldato', async () => {
    const w = mountApp(RentalsView, { attachTo: document.body });
    await settle();
    await checkoutSup(w);

    await w.get('[data-test="settle-rn-1"]').trigger('click');
    await settle();
    // L'importo è precompilato al totale dovuto (€ 15.00): confermo direttamente.
    dialogBtn('Conferma incasso')!.click();
    await settle();

    expect(w.text()).toContain('15.00 / € 15.00');
  });

  it('annulla bloccato dopo incasso: il BE risponde 409 e il messaggio arriva al toast', async () => {
    const w = mountApp(RentalsView, { attachTo: document.body });
    await settle();
    await checkoutSup(w);

    await w.get('[data-test="settle-rn-1"]').trigger('click');
    await settle();
    dialogBtn('Conferma incasso')!.click();
    await settle();

    await w.get('[data-test="cancel-rn-1"]').trigger('click');
    await settle();
    expect(document.body.textContent).toContain('Annullare il noleggio?');
    dialogBtn('Annulla noleggio')!.click();
    await settle();

    expect(useToasts().items.map((t) => t.message)).toEqual(["Storna l'incasso prima di annullare il noleggio."]);
    // Niente annullamento ottimistico: il noleggio resta Attivo.
    expect(w.text()).toContain('Attivo');
  });
});
