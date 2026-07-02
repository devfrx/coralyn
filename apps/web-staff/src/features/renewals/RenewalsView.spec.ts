import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useToasts } from '@/lib/toasts';
import type { RenewalCampaignDetailDTO } from '@coralyn/contracts';
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

  it('422 all\'apertura campagna → il messaggio del server diventa un toast (Slice A)', async () => {
    server.use(
      http.post('/api/renewal-campaigns', () =>
        HttpResponse.json(
          { statusCode: 422, message: 'La stagione di destinazione deve seguire quella di origine', error: 'Unprocessable Entity' },
          { status: 422 },
        ),
      ),
    );
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

    expect(useToasts().items.map((t) => t.message)).toEqual(['La stagione di destinazione deve seguire quella di origine']);
    expect(w.text()).toContain('Apri campagna di prelazione'); // la campagna NON risulta aperta
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

  it('finestre "exercised"/"expired" mostrano i badge corretti e "Rinnova" è disabilitato solo su esercitata', async () => {
    const multiStateCampaign: RenewalCampaignDetailDTO = {
      id: 'camp-multi',
      originSeasonId: 'se-1',
      destinationSeasonId: 'se-2',
      deadline: '2027-06-15',
      windows: [
        { sourceBookingId: 'sub-open', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', seniority: 1, state: 'open' },
        { sourceBookingId: 'sub-exercised', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', seniority: 2, state: 'exercised' },
        { sourceBookingId: 'sub-expired', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1', seniority: 3, state: 'expired' },
      ],
    };
    server.use(
      http.get('/api/renewal-campaigns', () => HttpResponse.json(multiStateCampaign)),
    );

    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    await setTargetDate(w, '2027-07-01');

    // I tre badge di stato sono tutti presenti.
    expect(w.text()).toContain('Aperta');
    expect(w.text()).toContain('Rinnovato');
    expect(w.text()).toContain('Scaduta');

    const rows = w.findAll('tbody tr');
    expect(rows).toHaveLength(3);

    const exercisedRow = rows.find((r) => r.text().includes('Rinnovato'));
    const expiredRow = rows.find((r) => r.text().includes('Scaduta'));
    const openRow = rows.find((r) => r.text().includes('Aperta'));

    // Rinnova è disabilitato SOLO sulla riga "esercitata".
    const renewBtnIn = (row: (typeof rows)[number]) => row.findAll('button').find((b) => b.text().includes('Rinnova'));
    expect(renewBtnIn(exercisedRow!)?.attributes('disabled')).toBeDefined();
    expect(renewBtnIn(expiredRow!)?.attributes('disabled')).toBeUndefined();
    expect(renewBtnIn(openRow!)?.attributes('disabled')).toBeUndefined();
  });
});
