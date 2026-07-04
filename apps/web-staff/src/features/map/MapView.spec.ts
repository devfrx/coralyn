import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useToasts } from '@/lib/toasts';
import MapView from './MapView.vue';

describe('MapView', () => {
  it('rende settori e ombrelloni dal mock MSW', async () => {
    const w = mountApp(MapView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.text()).toContain('Centro');
    expect(w.text()).toContain('Speciali');
    // un paio di etichette dal seed
    expect(w.text()).toContain('P1');
  });

  it('apre il drawer selezionando un ombrellone e mostra il modale con "Nuova prenotazione"', async () => {
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Il drawer non è ancora visibile
    expect(w.find('aside').exists()).toBe(false);

    // Clicca sul primo UmbrellaCell (il button interno emette 'select' → open())
    const firstCell = w.findComponent({ name: 'UmbrellaCell' });
    expect(firstCell.exists()).toBe(true);
    await firstCell.find('button').trigger('click');
    await flushPromises();

    // Ora il drawer è visibile
    expect(w.find('aside').exists()).toBe(true);

    // Clicca il pulsante "Nuova prenotazione"
    const btn = w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'));
    expect(btn).toBeTruthy();
    await btn!.trigger('click');
    await flushPromises();

    // Il modale è portato fuori dal wrapper (DialogPortal), leggiamo da document.body
    expect(document.body.textContent).toContain('Conferma prenotazione');

    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(document.body.textContent).toContain('28');

    // Il selettore Pacchetto è presente con l'opzione di default e quella del MSW.
    const select = Array.from(document.body.querySelectorAll('select')).find((s) =>
      s.textContent?.includes('Nessun pacchetto'),
    ) as HTMLSelectElement | undefined;
    expect(select).toBeTruthy();
    expect(select!.textContent).toContain('Standard');

    // Scegliendo il pacchetto, il prezzo si ricalcola (MSW: 35 col pacchetto).
    select!.value = 'pkg-1';
    select!.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(document.body.textContent).toContain('35');

    // Cambiando il Tipo in Abbonamento, il prezzo si ricalcola (MSW: 800 per subscription).
    const typeSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
      s.textContent?.includes('Abbonamento'),
    ) as HTMLSelectElement | undefined;
    expect(typeSelect).toBeTruthy();
    typeSelect!.value = 'subscription';
    typeSelect!.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(document.body.textContent).toContain('800');

    w.unmount();
  });

  it('mostra la tariffa applicata (provenienza) nel modale', async () => {
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Apri drawer sul primo ombrellone libero + modale "Nuova prenotazione" (stessi passi del test sopra).
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    expect(document.body.textContent).toContain('Tariffa applicata');
    expect(document.body.textContent).toContain('Tariffa base del listino'); // catch-all (nessuna dimensione)

    w.unmount();
  });

  it('mostra il nome della fila quando la tariffa è matchata per rowId (provenienza)', async () => {
    server.use(
      http.get('/api/bookings/quote', () =>
        HttpResponse.json({
          totalPrice: 40,
          matchedRate: { id: 'ra-row', seasonId: 'se-1', price: 40, rowId: 'row-1' },
        }),
      ),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Apri drawer sul primo ombrellone libero + modale "Nuova prenotazione" (stessi passi del test sopra).
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    expect(document.body.textContent).toContain('Tariffa applicata');
    expect(document.body.textContent).toContain('Fila 1'); // rowId matchato → nome fila, non "base"
    expect(document.body.textContent).not.toContain('Tariffa base del listino');

    w.unmount();
  });

  it('mostra il periodo quando la tariffa è matchata per sotto-periodo (provenienza, cleanup B2)', async () => {
    server.use(
      http.get('/api/bookings/quote', () =>
        HttpResponse.json({
          totalPrice: 45,
          matchedRate: {
            id: 'ra-period', seasonId: 'se-1', price: 45,
            periodStart: '2026-08-01', periodEnd: '2026-08-31',
          },
        }),
      ),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Apri drawer sul primo ombrellone libero + modale "Nuova prenotazione" (stessi passi del test sopra).
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    expect(document.body.textContent).toContain('Tariffa applicata');
    expect(document.body.textContent).toContain('Periodo'); // periodStart matchato → segmento periodo, non "base"
    expect(document.body.textContent).not.toContain('Tariffa base del listino');

    w.unmount();
  });

  it('errore 409 alla conferma: toast del server, modale resta aperto, nessun unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onRej = (e: PromiseRejectionEvent) => { rejections.push(e.reason); e.preventDefault(); };
    window.addEventListener('unhandledrejection', onRej);
    server.use(
      http.post('/api/bookings', () =>
        HttpResponse.json(
          { statusCode: 409, message: 'Ombrellone già prenotato per questa fascia', error: 'Conflict' },
          { status: 409 },
        ),
      ),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
    await flushPromises();

    // Scegli un cliente (necessario perché confirmBooking esce se customerId è vuoto).
    const custSelect = Array.from(document.body.querySelectorAll('select')).find((s) =>
      s.textContent?.includes('Seleziona un cliente'),
    ) as HTMLSelectElement;
    custSelect.value = 'c-1';
    custSelect.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const confirm = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes('Conferma prenotazione'))!;
    confirm.click();
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    expect(useToasts().items.map((t) => t.message)).toContain('Ombrellone già prenotato per questa fascia');
    expect(document.body.textContent).toContain('Conferma prenotazione'); // modale ANCORA aperto
    expect(rejections).toEqual([]); // niente unhandled promise rejection

    window.removeEventListener('unhandledrejection', onRej);
    w.unmount();
  });

  it('deriva le due metà dagli orari: Giornata intera occupa mattina+pomeriggio', async () => {
    const map3 = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'giorno', name: 'Giornata intera', startTime: '08:00', endTime: '19:00', sortOrder: 3 },
        { id: 'mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
      ],
      sectors: [{
        id: 'sec', name: 'Centro', sortOrder: 1,
        rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
          // Giornata intera occupata → overlap segna occupate tutte e 3 le fasce
          { id: 'u-full', label: '1', umbrellaTypeId: 't1', rowId: 'r1',
            stateBySlot: { giorno: 'daily', mat: 'daily', pom: 'daily' } },
          // Solo Mattina occupata
          { id: 'u-mat', label: '2', umbrellaTypeId: 't1', rowId: 'r1',
            stateBySlot: { giorno: 'free', mat: 'daily', pom: 'free' } },
        ] }],
      }],
    };
    server.use(http.get('/api/map', () => HttpResponse.json(map3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const cells = w.findAllComponents({ name: 'UmbrellaCell' });
    expect(cells.length).toBe(2);

    // u-full: Giornata intera prenotata → entrambe le metà "Giornaliero" (overlap-aware)
    expect(cells[0].props('morningState')).toBe('daily');
    expect(cells[0].props('afternoonState')).toBe('daily');
    expect(cells[0].find('button').attributes('aria-label')).toMatch(/mattina Giornaliero, pomeriggio Giornaliero/);

    // u-mat: solo Mattina occupata → mattina Giornaliero, pomeriggio Libero
    expect(cells[1].props('morningState')).toBe('daily');
    expect(cells[1].props('afternoonState')).toBe('free');
    expect(cells[1].find('button').attributes('aria-label')).toMatch(/mattina Giornaliero, pomeriggio Libero/);

    w.unmount();
  });

  it('la riga di spiegazione cambia col tipo di prenotazione', async () => {
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
    await flushPromises();

    // Il modale è teleportato (DialogPortal): il primo <select> in document.body è il Tipo.
    const typeSelect = document.body.querySelectorAll('select')[0] as HTMLSelectElement;
    typeSelect.value = 'subscription';
    typeSelect.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.body.textContent).toContain('Tutta la stagione, prezzo forfait.');

    typeSelect.value = 'periodic';
    typeSelect.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.body.textContent).toContain('paghi a giornata');

    typeSelect.value = 'daily';
    typeSelect.dispatchEvent(new Event('change'));
    await flushPromises();
    expect(document.body.textContent).toContain('Un giorno.');
    w.unmount();
  });

  it('il suffisso della tariffa applicata deriva dal tipo: subscription → forfait', async () => {
    server.use(
      http.get('/api/bookings/quote', () =>
        HttpResponse.json({ totalPrice: 800, matchedRate: { id: 'ra-sub', seasonId: 'se-1', price: 800, type: 'subscription' } }),
      ),
    );
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await w.findAll('button').find((b) => b.text().includes('Nuova prenotazione'))!.trigger('click');
    await flushPromises();
    const typeSelect = document.body.querySelectorAll('select')[0] as HTMLSelectElement;
    typeSelect.value = 'subscription';
    typeSelect.dispatchEvent(new Event('change'));
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(document.body.textContent).toContain('forfait stagione');
    w.unmount();
  });

  it('mostra dettaglio + azioni per una prenotazione SOLO pomeridiana (bug fascia §5)', async () => {
    // Ombrellone la cui UNICA prenotazione è sulla fascia Pomeriggio.
    const mapPom = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'f-pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
      ],
      sectors: [{
        id: 'sec', name: 'Centro', sortOrder: 1,
        rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
          { id: 'o-pom', label: '7', umbrellaTypeId: 't1', rowId: 'r1',
            stateBySlot: { 'f-mat': 'free', 'f-pom': 'daily' } },
        ] }],
      }],
    };
    server.use(
      http.get('/api/map', () => HttpResponse.json(mapPom)),
      http.get('/api/bookings', () => HttpResponse.json([
        { id: 'bk-pom', customerId: 'c-1', umbrellaId: 'o-pom', timeSlotId: 'f-pom',
          startDate: '2026-06-27', endDate: '2026-06-27', type: 'daily', status: 'confirmed',
          totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0 },
      ])),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const aside = w.find('aside');
    expect(aside.exists()).toBe(true);
    // Bug: selectedSlotId parte su Mattina, la prenotazione è su Pomeriggio → "Postazione disponibile".
    // Atteso: la fascia CON prenotazione è auto-selezionata → dettaglio + azioni incasso/annulla.
    expect(aside.text()).toContain('Registra incasso');
    expect(aside.text()).toContain('Annulla prenotazione');
    expect(aside.text()).not.toContain('Postazione disponibile');

    w.unmount();
  });

  it('cliccando le fasce Mattina/Pomeriggio cambia la prenotazione mostrata (fix §5b)', async () => {
    // Ombrellone con DUE prenotazioni distinte: mattina (€30) e pomeriggio (€55).
    const mapBoth = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'f-pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
      ],
      sectors: [{
        id: 'sec', name: 'Centro', sortOrder: 1,
        rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
          { id: 'o-both', label: '9', umbrellaTypeId: 't1', rowId: 'r1',
            stateBySlot: { 'f-mat': 'daily', 'f-pom': 'daily' } },
        ] }],
      }],
    };
    server.use(
      http.get('/api/map', () => HttpResponse.json(mapBoth)),
      http.get('/api/bookings', () => HttpResponse.json([
        { id: 'bk-m', customerId: 'c-1', umbrellaId: 'o-both', timeSlotId: 'f-mat',
          startDate: '2026-06-27', endDate: '2026-06-27', type: 'daily', status: 'confirmed',
          totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0 },
        { id: 'bk-p', customerId: 'c-1', umbrellaId: 'o-both', timeSlotId: 'f-pom',
          startDate: '2026-06-27', endDate: '2026-06-27', type: 'daily', status: 'confirmed',
          totalPrice: 55, paymentStatus: 'unpaid', amountCollected: 0 },
      ])),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const aside = w.find('aside');
    // Default: la prima fascia con prenotazione (Mattina) → €30.
    expect(aside.text()).toContain('30');

    // Clic sul box "Pomeriggio" → mostra la prenotazione pomeridiana (€55).
    const pomBox = aside.findAll('button').find((b) => b.text().includes('Pomeriggio'));
    expect(pomBox).toBeTruthy();
    await pomBox!.trigger('click');
    await flushPromises();
    expect(aside.text()).toContain('55');

    // Clic sul box "Mattina" → torna alla prenotazione mattutina (€30).
    const matBox = aside.findAll('button').find((b) => b.text().includes('Mattina'));
    expect(matBox).toBeTruthy();
    await matBox!.trigger('click');
    await flushPromises();
    expect(aside.text()).toContain('30');

    w.unmount();
  });

  afterEach(() => { vi.restoreAllMocks(); });
});
