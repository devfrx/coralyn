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
    await setDestination(w, 'se-2');
    expect(w.text()).toContain('Rossi');     // c-1 risolto dalla query clienti
    expect(w.text()).toContain('Anzianità');  // header colonna
    expect(w.text()).toContain('stagione');   // "1 stagione" (seniority di sub-1)
  });

  it('senza destinazione mostra l\'empty-state; impostandola compare la lista rinnovabile abilitata', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    // Nessuna destinazione: empty-state guida, nessun bottone Rinnova.
    expect(w.text()).toContain('Scegli una stagione di destinazione');
    expect(w.findAll('button').find((b) => b.text().includes('Rinnova'))).toBeUndefined();
    // Impostata la destinazione: compare la lista abbonati con Rinnova abilitato (sub-1 non rinnovato).
    await setDestination(w, 'se-2');
    const renewBtn = w.findAll('button').find((b) => b.text().includes('Rinnova'));
    expect(renewBtn?.attributes('disabled')).toBeUndefined();
  });

  async function setDestination(w: ReturnType<typeof mountApp>, seasonId: string) {
    const sel = w.get('[data-test="destination-season"]').element as HTMLSelectElement;
    sel.value = seasonId;
    sel.dispatchEvent(new Event('change'));
    await flushPromises();
    await tick();
    await flushPromises();
  }

  it('senza campagna aperta (destinazione impostata) mostra il pannello "Apri campagna"', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    await setDestination(w, 'se-2');
    expect(w.text()).toContain('Apri campagna di prelazione');
  });

  it('mentre la campagna è in fetch NON mostra il pannello "Apri campagna" (anti-flicker), poi rivela la campagna', async () => {
    // GET campagna tenuto pending: coglie la finestra di caricamento, che altrimenti dura ~10-30ms in locale.
    let release!: () => void;
    const pending = new Promise<Response>((r) => {
      release = () =>
        r(
          HttpResponse.json({
            id: 'camp-load',
            originSeasonId: 'se-1',
            destinationSeasonId: 'se-2',
            deadline: '2027-06-15',
            windows: [],
          } satisfies RenewalCampaignDetailDTO),
        );
    });
    server.use(http.get('/api/renewal-campaigns', () => pending));

    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    await setDestination(w, 'se-2');

    // Fetch in corso: il pannello "Apri campagna" NON deve lampeggiare finché non sappiamo se una campagna esiste.
    expect(w.text()).not.toContain('Apri campagna di prelazione');

    // Campagna arrivata: compare la vista campagna.
    release();
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('Chiudi campagna');
  });

  it('dopo aver aperto la campagna compaiono la scadenza e il badge "Aperta"', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    await setDestination(w, 'se-2');

    const deadlineInput = w.findAll('input[type="date"]')[0]; // ora l'unico input date è la scadenza
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
    await setDestination(w, 'se-2');

    const deadlineInput = w.findAll('input[type="date"]')[0]; // ora l'unico input date è la scadenza
    await deadlineInput.setValue('2027-06-15');
    const openBtn = w.findAll('button').find((b) => b.text().includes('Apri campagna'));
    await openBtn?.trigger('click');
    await flushPromises();
    await tick();
    await flushPromises();

    expect(useToasts().items.map((t) => t.message)).toEqual(['La stagione di destinazione deve seguire quella di origine']);
    expect(w.text()).toContain('Apri campagna di prelazione'); // la campagna NON risulta aperta
  });

  it('mostra intestazione esplicativa e legenda badge', async () => {
    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('prelazione'); // spiegazione della campagna
    expect(w.text()).toContain('diritto di precedenza'); // microcopy chiave
    expect(w.text()).toContain('scadenza unica');
    expect(w.text()).toContain('non va reimpostata');
  });

  it('"Chiudi campagna" richiede conferma via ConfirmDialog prima della DELETE', async () => {
    const w = mountApp(RenewalsView, { attachTo: document.body });
    await flushPromises();
    await tick();
    await flushPromises();
    await setDestination(w, 'se-2');

    const deadlineInput = w.findAll('input[type="date"]')[0];
    await deadlineInput.setValue('2027-06-15');
    await w.findAll('button').find((b) => b.text().includes('Apri campagna'))?.trigger('click');
    await flushPromises(); await tick(); await flushPromises();
    expect(w.text()).toContain('Chiudi campagna');

    // Il click su "Chiudi campagna" apre la conferma, NON chiude subito.
    await w.findAll('button').find((b) => b.text().includes('Chiudi campagna'))?.trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Chiudere la campagna?');
    expect(w.text()).toContain('Chiudi campagna'); // ancora aperta finché non confermi

    // Conferma nel dialog → DELETE → torna al pannello apertura.
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Chiudi')!.click();
    await flushPromises(); await tick(); await flushPromises();
    expect(w.text()).toContain('Apri campagna di prelazione');

    w.unmount();
  });

  it('campagna senza finestre: messaggio vuoto in-card dentro la tabella', async () => {
    const emptyCampaign: RenewalCampaignDetailDTO = {
      id: 'camp-empty',
      originSeasonId: 'se-1',
      destinationSeasonId: 'se-2',
      deadline: '2027-06-15',
      windows: [],
    };
    server.use(
      http.get('/api/renewal-campaigns', () => HttpResponse.json(emptyCampaign)),
    );

    const w = mountApp(RenewalsView);
    await flushPromises();
    await tick();
    await flushPromises();
    await setDestination(w, 'se-2');

    expect(w.find('tbody').text()).toContain('Nessuna finestra di prelazione');
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
    await setDestination(w, 'se-2');

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
