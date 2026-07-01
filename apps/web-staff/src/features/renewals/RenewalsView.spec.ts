import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import RenewalsView from './RenewalsView.vue';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('RenewalsView', () => {
  it('elenca gli abbonati con anzianità e nome cliente risolto', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('Rossi');     // c-1 risolto dalla query clienti
    expect(w.text()).toContain('Anzianità');  // header colonna
    expect(w.text()).toContain('stagione');   // "1 stagione" (seniority di sub-1)
  });

  it('Rinnova è disabilitato senza data di destinazione e si abilita impostandola', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    const renewBtn = () => w.findAll('button').find((b) => b.text().includes('Rinnova'));
    expect(renewBtn()?.attributes('disabled')).toBeDefined();
    const target = w.findAll('input[type="date"]')[1]; // [0] origine, [1] destinazione
    await target.setValue('2027-07-01');
    await flushPromises();
    expect(renewBtn()?.attributes('disabled')).toBeUndefined();
  });
});
