import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import CustomerDetailView from './CustomerDetailView.vue';

async function settle() {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

describe('CustomerDetailView', () => {
  it('mostra header e anagrafica del cliente', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Mario');
    expect(w.text()).toContain('Rossi');
    // email/telefono sono campi editabili: il valore vive nel DOM dell'input, non nel testo
    expect((w.find('input[name="email"]').element as HTMLInputElement).value).toBe('mario.rossi@email.it');
    expect((w.find('input[name="phone"]').element as HTMLInputElement).value).toBe('+39 333 1111111');
  });

  it('mostra lo storico raggruppato per stagione, con la cancellata attenuata', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Estate 2026');
    expect(w.text()).toContain('Estate 2027');
    expect(w.text()).toContain('A12');
    expect(w.text()).toContain('Giornaliera');
    expect(w.text()).toContain('Abbonamento');
    // la cancellata è marcata (badge "Annullata")
    expect(w.text()).toContain('Annullata');
  });

  it('mostra anzianità e badge Rinnovato nella card abbonamento', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Rinnovato');
    // seniority renderizzata (es. "2ª stagione" o "2 stagioni")
    expect(w.text()).toMatch(/2\D*stagion/i);
  });

  it('mostra saldo e incassato nella card pagamenti', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    // saldo aperto = solo il daily non pagato non-cancellato (30). Le due subscription sono saldate.
    expect(w.text()).toContain('Saldo');
    expect(w.text()).toContain('30');
    // incassato totale = 320 + 300 = 620
    expect(w.text()).toContain('620');
  });

  it('mostra la nota di prelazione aperta nella card abbonamento', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Prelazione');
    expect(w.text()).toContain('Estate 2028');
    expect(w.text()).toContain('2028-04-30');
  });

  it('modifica il telefono e lo rilegge aggiornato', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    const tel = w.find('input[name="phone"]');
    await tel.setValue('+39 333 9999999');
    await w.find('form').trigger('submit.prevent');
    await settle();
    // dopo il PATCH, l'invalidazione rilegge il dettaglio e il watch ripopola l'input col valore salvato
    expect((w.find('input[name="phone"]').element as HTMLInputElement).value).toBe('+39 333 9999999');
  });
});
