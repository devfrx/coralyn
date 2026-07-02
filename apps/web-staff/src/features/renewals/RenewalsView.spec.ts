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

  async function setTargetDate(w: ReturnType<typeof mountApp>, date: string) {
    const target = w.findAll('input[type="date"]')[1]; // [0] origine, [1] destinazione
    await target.setValue(date);
    await flushPromises();
    await tick();
    await flushPromises();
  }

  it('senza campagna aperta (destinazione impostata) mostra il pannello "Apri campagna"', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    await setTargetDate(w, '2027-07-01');
    expect(w.text()).toContain('Apri campagna di prelazione');
  });

  it('dopo aver aperto la campagna compaiono la scadenza e il badge "Aperta"', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    await setTargetDate(w, '2027-07-01');

    const deadlineInput = w.findAll('input[type="date"]')[2]; // [0] origine, [1] destinazione, [2] scadenza
    await deadlineInput.setValue('2027-06-15');
    const openBtn = w.findAll('button').find((b) => b.text().includes('Apri campagna'));
    await openBtn?.trigger('click');
    await flushPromises();
    await tick();
    await flushPromises();

    expect(w.text()).toContain('2027-06-15');
    expect(w.text()).toContain('Aperta');
    expect(w.text()).toContain('Chiudi campagna');
  });

  it('"Chiudi campagna" invoca la DELETE e torna al pannello di apertura', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    await setTargetDate(w, '2027-07-01');

    const deadlineInput = w.findAll('input[type="date"]')[2];
    await deadlineInput.setValue('2027-06-15');
    const openBtn = w.findAll('button').find((b) => b.text().includes('Apri campagna'));
    await openBtn?.trigger('click');
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('Chiudi campagna');

    const closeBtn = w.findAll('button').find((b) => b.text().includes('Chiudi campagna'));
    await closeBtn?.trigger('click');
    await flushPromises();
    await tick();
    await flushPromises();

    expect(w.text()).toContain('Apri campagna di prelazione');
  });
});
