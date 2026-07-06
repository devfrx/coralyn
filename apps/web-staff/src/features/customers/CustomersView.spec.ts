import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import CustomersView from './CustomersView.vue';

describe('CustomersView', () => {
  it('mostra i clienti dal mock', async () => {
    const w = mountApp(CustomersView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('Rossi');
  });

  it('crea un cliente dal modal e compare in tabella', async () => {
    const w = mountApp(CustomersView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.get('[data-test="new-customer"]').trigger('click');
    await flushPromises();
    const set = (name: string, val: string) => {
      const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('firstName', 'Anna');
    set('lastName', 'Verdi');
    (document.querySelector('[data-test="form-new-customer"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.text()).toContain('Verdi');
  });

  it('ogni riga linka alla scheda del cliente', async () => {
    const w = mountApp(CustomersView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    const link = w.find('a');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('Rossi');
  });

  it('filtra per nome: "Rossi" mostra Rossi e nasconde Bianchi/Verdi', async () => {
    const w = mountApp(CustomersView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('input[aria-label="Cerca clienti"]').setValue('Rossi');
    expect(w.text()).toContain('Rossi');
    expect(w.text()).not.toContain('Bianchi');
    expect(w.text()).not.toContain('Verdi');
  });

  it('filtra per telefono: un frammento del numero seleziona Bianchi', async () => {
    const w = mountApp(CustomersView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('input[aria-label="Cerca clienti"]').setValue('333 2222');
    expect(w.text()).toContain('Bianchi');
    expect(w.text()).not.toContain('Rossi');
  });

  it('nessun risultato: mostra empty-state e contatore a 0', async () => {
    const w = mountApp(CustomersView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('input[aria-label="Cerca clienti"]').setValue('zzz');
    expect(w.text()).toContain('Nessun cliente trovato');
    expect(w.text()).toContain('0 clienti');
  });
});
