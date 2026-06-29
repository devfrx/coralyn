import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import ClientiView from './ClientiView.vue';

describe('ClientiView', () => {
  it('mostra i clienti dal mock', async () => {
    const w = mountApp(ClientiView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('Rossi');
  });

  it('crea un cliente dal modal e compare in tabella', async () => {
    const w = mountApp(ClientiView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.get('[data-test="nuovo-cliente"]').trigger('click');
    await flushPromises();
    const set = (name: string, val: string) => {
      const el = document.querySelector(`input[name="${name}"]`) as HTMLInputElement;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('nome', 'Anna');
    set('cognome', 'Verdi');
    (document.querySelector('[data-test="form-nuovo-cliente"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.text()).toContain('Verdi');
  });

  it('ogni riga linka alla scheda del cliente', async () => {
    const w = mountApp(ClientiView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    const link = w.find('a');
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain('Rossi');
  });
});
