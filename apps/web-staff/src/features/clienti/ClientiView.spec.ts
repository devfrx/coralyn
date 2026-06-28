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

  it('crea un cliente e invalida la lista (compare in tabella)', async () => {
    const w = mountApp(ClientiView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    const inputs = w.findAll('input');
    await inputs[0].setValue('Anna');     // Nome
    await inputs[1].setValue('Verdi');    // Cognome
    await w.find('form').trigger('submit.prevent');
    // attende mutation -> onSuccess invalidate -> refetch -> re-render
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.text()).toContain('Verdi');
  });
});
