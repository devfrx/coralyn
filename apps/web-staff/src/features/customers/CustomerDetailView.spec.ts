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

  it('mostra i placeholder delle sezioni in arrivo', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('In arrivo');
    expect(w.text()).toContain('Storico prenotazioni');
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
