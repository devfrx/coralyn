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
          matchedRate: { id: 'ra-row', seasonId: 'se-1', price: 40, unit: 'day', rowId: 'row-1' },
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

  afterEach(() => { vi.restoreAllMocks(); });
});
