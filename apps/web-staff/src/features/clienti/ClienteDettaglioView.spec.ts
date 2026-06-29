import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import ClienteDettaglioView from './ClienteDettaglioView.vue';

async function settle(w: ReturnType<typeof mountApp>) {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

describe('ClienteDettaglioView', () => {
  it('mostra header e anagrafica del cliente', async () => {
    const w = mountApp(ClienteDettaglioView, { props: { id: 'c-1' } });
    await settle(w);
    expect(w.text()).toContain('Mario');
    expect(w.text()).toContain('Rossi');
    expect(w.text()).toContain('mario.rossi@email.it');
  });

  it('mostra i placeholder delle sezioni in arrivo', async () => {
    const w = mountApp(ClienteDettaglioView, { props: { id: 'c-1' } });
    await settle(w);
    expect(w.text()).toContain('in arrivo');
    expect(w.text()).toContain('Storico prenotazioni');
  });
});
