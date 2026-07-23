import { describe, it, expect, vi, afterEach } from 'vitest';
import { nextTick } from 'vue';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useToasts } from '@/lib/toasts';
import { useSessionStore } from '@/stores/session';
import { mapSeed3 } from '@/mocks/data/seed';
import MapView from './MapView.vue';

// reka-ui Popper (Popover della legenda) misura il contenuto via ResizeObserver,
// assente in jsdom — stesso stub guardato di HoverCard.spec/Popover.spec (ui-kit).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

/**
 * Il dettaglio ombrellone vive ora nel Drawer (ui-kit), portato fuori dal DOM del
 * wrapper via reka-ui DialogPortal — stesso motivo per cui i test del Modal in questo
 * file leggono da `document.body` invece che dal wrapper VTU. `data-test="drawer-body"`
 * è univoco al Drawer (il Modal usa "modal-body"), quindi risalendo al suo antenato
 * `[role="dialog"]` otteniamo l'elemento giusto anche quando Drawer e Modal sono aperti
 * insieme. Quando il Drawer è chiuso, reka-ui non monta affatto il contenuto: torna null.
 */
function drawerEl(): HTMLElement | null {
  const body = document.body.querySelector('[data-test="drawer-body"]');
  return (body?.closest('[role="dialog"]') as HTMLElement | null) ?? null;
}
function drawerButtons(): HTMLButtonElement[] {
  return Array.from(drawerEl()?.querySelectorAll('button') ?? []);
}
async function mountMap() {
  const w = mountApp(MapView, { attachTo: document.body });
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
  return w;
}

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

  it('admin: senza settori mostra l\'empty-state di onboarding con CTA verso /onboarding', async () => {
    server.use(http.get('/api/map', () => HttpResponse.json({
      date: '2026-06-27', umbrellaTypes: [], timeSlots: [], sectors: [],
    })));
    const w = mountApp(MapView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.find('[data-testid="map-empty-onboarding"]').exists()).toBe(true);
    expect(w.find('[data-testid="map-open-onboarding"]').exists()).toBe(true);
    w.unmount();
  });

  it('staff: senza settori mostra l\'empty-state di onboarding senza CTA', async () => {
    server.use(http.get('/api/map', () => HttpResponse.json({
      date: '2026-06-27', umbrellaTypes: [], timeSlots: [], sectors: [],
    })));
    const w = await mountMap();
    expect(w.find('[data-testid="map-empty-onboarding"]').exists()).toBe(true);
    expect(w.find('[data-testid="map-open-onboarding"]').exists()).toBe(false);
    w.unmount();
  });

  it('D-056: un settore kind=special è reso come blocco dedicato (non tab) qualunque sia il nome', async () => {
    const mapKind = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [{ id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 }],
      sectors: [
        { id: 's-c', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
          { id: 'u1', label: '1', umbrellaTypeId: null, rowId: 'r1', stateBySlot: { 'f-mat': 'free' } },
        ] }] },
        { id: 's-v', name: 'VIP', sortOrder: 2, kind: 'special', rows: [{ id: 'r2', label: 'Palme', sortOrder: 1, umbrellas: [
          { id: 'u2', label: 'V1', umbrellaTypeId: 't1', rowId: 'r2', stateBySlot: { 'f-mat': 'free' } },
        ] }] },
      ],
    };
    server.use(http.get('/api/map', () => HttpResponse.json(mapKind)));
    const w = await mountMap();
    const block = w.find('[data-test="special-block"]');
    expect(block.exists()).toBe(true);
    expect(block.text()).toContain('VIP');
    expect(block.text()).toContain('V1');
    const seg = w.findComponent({ name: 'SegmentedControl' });
    expect((seg.props('options') as Array<{ label: string }>).map((o) => o.label)).toEqual(['Centro']);
    w.unmount();
  });

  it('D-056: un settore chiamato «Speciali» ma kind=grid è un tab normale, senza blocco dedicato', async () => {
    const mapGrid = {
      date: '2026-06-27',
      umbrellaTypes: [],
      timeSlots: [{ id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 }],
      sectors: [
        { id: 's-sp', name: 'Speciali', sortOrder: 1, kind: 'grid', rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
          { id: 'u1', label: 'S1', umbrellaTypeId: null, rowId: 'r1', stateBySlot: { 'f-mat': 'free' } },
        ] }] },
      ],
    };
    server.use(http.get('/api/map', () => HttpResponse.json(mapGrid)));
    const w = await mountMap();
    expect(w.find('[data-test="special-block"]').exists()).toBe(false);
    const seg = w.findComponent({ name: 'SegmentedControl' });
    expect((seg.props('options') as Array<{ label: string }>).map((o) => o.label)).toEqual(['Speciali']);
    expect(w.text()).toContain('S1');
    w.unmount();
  });

  it('su un abbonamento non offre «Annulla prenotazione» ma rimanda alla disdetta', async () => {
    server.use(
      http.get('/api/bookings', () =>
        HttpResponse.json([
          { id: 'b-sub', umbrellaId: 'o-1', timeSlotId: 'f-mat', customerId: 'c-1', startDate: '2026-07-01', endDate: '2026-09-30', type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800 },
        ]),
      ),
    );
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    const drawer = drawerEl();
    expect(drawer).not.toBeNull();
    expect(drawer!.textContent).toContain('Registra incasso');
    expect(drawer!.textContent).not.toContain('Annulla prenotazione');
    expect(drawer!.textContent).toContain('Gestisci abbonamento');
  });

  it('su una prenotazione giornaliera offre «Annulla prenotazione»', async () => {
    server.use(
      http.get('/api/bookings', () =>
        HttpResponse.json([
          { id: 'b-day', umbrellaId: 'o-1', timeSlotId: 'f-mat', customerId: 'c-1', startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed', totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0 },
        ]),
      ),
    );
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    const drawer = drawerEl();
    expect(drawer!.textContent).toContain('Annulla prenotazione');
  });

  it('apre il drawer selezionando un ombrellone e mostra il modale con "Nuova prenotazione"', async () => {
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Il drawer non è ancora visibile
    expect(drawerEl()).toBeNull();

    // Clicca sul primo UmbrellaCell (il button interno emette 'select' → open())
    const firstCell = w.findComponent({ name: 'UmbrellaCell' });
    expect(firstCell.exists()).toBe(true);
    await firstCell.find('button').trigger('click');
    await flushPromises();

    // Ora il drawer è visibile (portato in document.body dal DialogPortal)
    expect(drawerEl()).not.toBeNull();

    // Clicca il pulsante "Nuova prenotazione" (nel footer del Drawer, anch'esso in portal)
    const btn = drawerButtons().find((b) => b.textContent?.includes('Nuova prenotazione'));
    expect(btn).toBeTruthy();
    btn!.click();
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
    drawerButtons().find((b) => b.textContent?.includes('Nuova prenotazione'))!.click();
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
    drawerButtons().find((b) => b.textContent?.includes('Nuova prenotazione'))!.click();
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
    drawerButtons().find((b) => b.textContent?.includes('Nuova prenotazione'))!.click();
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
    drawerButtons().find((b) => b.textContent?.includes('Nuova prenotazione'))!.click();
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

  it('rende N spicchi per N fasce: la fascia "piena" NON viene più scartata (regressione anti-compressione)', async () => {
    // 3 fasce, tra cui una "Giornata intera" che copre l'intera banda: col vecchio codice veniva scartata.
    const map3 = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
        { id: 'giorno', name: 'Giornata intera', startTime: '08:00', endTime: '19:00', sortOrder: 3 },
      ],
      sectors: [{
        id: 'sec', name: 'Centro', sortOrder: 1,
        rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
          { id: 'u-mat', label: '2', umbrellaTypeId: 't1', rowId: 'r1',
            stateBySlot: { mat: 'daily', pom: 'free', giorno: 'free' } },
        ] }],
      }],
    };
    server.use(http.get('/api/map', () => HttpResponse.json(map3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    const cell = w.findComponent({ name: 'UmbrellaCell' });
    // Tutte e 3 le fasce nell'ordine sortOrder (nessuna scartata)
    expect(cell.props('slotStates')).toEqual(['daily', 'free', 'free']);
    // aria-label elenca le 3 fasce reali col loro stato
    expect(cell.find('button').attributes('aria-label')).toContain('Mattina Giornaliero');
    expect(cell.find('button').attributes('aria-label')).toContain('Pomeriggio Libero');
    expect(cell.find('button').attributes('aria-label')).toContain('Giornata intera Libero');

    w.unmount();
  });

  it('drawer con N box reali: nomi delle fasce reali, fascia centrale selezionabile', async () => {
    server.use(http.get('/api/map', () => HttpResponse.json(mapSeed3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Apri il drawer sul primo ombrellone (o-mid)
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();

    const drawer = drawerEl();
    expect(drawer).not.toBeNull();
    // Nomi reali, NON "Mattina"/"Pomeriggio" hardcoded
    expect(drawer!.textContent).toContain('Alba');
    expect(drawer!.textContent).toContain('Pieno giorno');
    expect(drawer!.textContent).toContain('Tramonto');

    // La fascia centrale è selezionabile: clic sul box "Pieno giorno" → aria-pressed=true
    const midBox = drawerButtons().find((b) => b.textContent?.includes('Pieno giorno'));
    expect(midBox).toBeTruthy();
    midBox!.click();
    await flushPromises();
    expect(midBox!.getAttribute('aria-pressed')).toBe('true');

    w.unmount();
  });

  it('messaggio disponibilità: alcune fasce libere → "Libera nelle fasce: <nomi>"', async () => {
    server.use(http.get('/api/map', () => HttpResponse.json(mapSeed3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // o-mid: alba/tramonto libere, giorno occupato; nessuna prenotazione reale → drawer mostra il messaggio
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();

    const drawer = drawerEl();
    expect(drawer!.textContent).toContain('Libera nelle fasce:');
    expect(drawer!.textContent).toContain('Alba');
    expect(drawer!.textContent).toContain('Tramonto');
    expect(drawer!.textContent).not.toContain("l'intera giornata");

    w.unmount();
  });

  it('messaggio disponibilità: tutte le fasce libere → "Postazione libera tutto il giorno"', async () => {
    server.use(http.get('/api/map', () => HttpResponse.json(mapSeed3)));

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Secondo ombrellone (o-free): tutte le fasce libere
    const cells = w.findAllComponents({ name: 'UmbrellaCell' });
    await cells[1].find('button').trigger('click');
    await flushPromises();

    const drawer = drawerEl();
    expect(drawer!.textContent).toContain('Postazione libera tutto il giorno');

    w.unmount();
  });

  it('la riga di spiegazione cambia col tipo di prenotazione', async () => {
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    drawerButtons().find((b) => b.textContent?.includes('Nuova prenotazione'))!.click();
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
    drawerButtons().find((b) => b.textContent?.includes('Nuova prenotazione'))!.click();
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

    const drawer = drawerEl();
    expect(drawer).not.toBeNull();
    // Bug: selectedSlotId parte su Mattina, la prenotazione è su Pomeriggio → "Postazione disponibile".
    // Atteso: la fascia CON prenotazione è auto-selezionata → dettaglio + azioni incasso/annulla.
    expect(drawer!.textContent).toContain('Registra incasso');
    expect(drawer!.textContent).toContain('Annulla prenotazione');
    expect(drawer!.textContent).not.toContain('Postazione disponibile');

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

    const drawer = drawerEl()!;
    // Default: la prima fascia con prenotazione (Mattina) → €30.
    expect(drawer.textContent).toContain('30');

    // Clic sul box "Pomeriggio" → mostra la prenotazione pomeridiana (€55).
    const pomBox = drawerButtons().find((b) => b.textContent?.includes('Pomeriggio'));
    expect(pomBox).toBeTruthy();
    pomBox!.click();
    await flushPromises();
    expect(drawer.textContent).toContain('55');

    // Clic sul box "Mattina" → torna alla prenotazione mattutina (€30).
    const matBox = drawerButtons().find((b) => b.textContent?.includes('Mattina'));
    expect(matBox).toBeTruthy();
    matBox!.click();
    await flushPromises();
    expect(drawer.textContent).toContain('30');

    w.unmount();
  });

  it('il bottone «Abbonamento» apre il modale con Tipo preimpostato su Abbonamento', async () => {
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Apri il drawer su un ombrellone.
    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();

    // Clic sul bottone «Abbonamento» del drawer (oggi morto → il modale non si apre).
    const abbBtn = drawerButtons().find((b) => b.textContent?.includes('Abbonamento'));
    expect(abbBtn).toBeTruthy();
    abbBtn!.click();
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // Modale aperto e Tipo preimpostato su Abbonamento (help text specifico + valore del select).
    expect(document.body.textContent).toContain('Conferma prenotazione');
    expect(document.body.textContent).toContain('Tutta la stagione, prezzo forfait.');
    const typeSelect = document.body.querySelectorAll('select')[0] as HTMLSelectElement;
    expect(typeSelect.value).toBe('subscription');

    w.unmount();
  });

  it('il bottone «Presenza» è stato rimosso dal drawer', async () => {
    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();

    const drawer = drawerEl();
    expect(drawer).not.toBeNull();
    expect(drawerButtons().some((b) => b.textContent?.includes('Presenza'))).toBe(false);

    w.unmount();
  });

  it('fascia coperta (metà prenotate → full-day coperta): box "Non disponibile" + dettaglio copritori, senza azioni', async () => {
    const mapOv = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
        { id: 'full', name: 'Giornata int.', startTime: '08:00', endTime: '19:00', sortOrder: 3 },
      ],
      sectors: [{ id: 'sec', name: 'Centro', sortOrder: 1, rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'o9', label: '9', umbrellaTypeId: 't1', rowId: 'r1',
          stateBySlot: { mat: 'daily', pom: 'booked', full: 'covered' },
          coveredBySlot: { full: ['mat', 'pom'] } },
      ] }] }],
    };
    server.use(
      http.get('/api/map', () => HttpResponse.json(mapOv)),
      http.get('/api/bookings', () => HttpResponse.json([
        { id: 'bm', customerId: 'c-1', umbrellaId: 'o9', timeSlotId: 'mat', startDate: '2026-06-27', endDate: '2026-06-27', type: 'daily', status: 'confirmed', totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0 },
        { id: 'bp', customerId: 'c-1', umbrellaId: 'o9', timeSlotId: 'pom', startDate: '2026-06-27', endDate: '2026-06-27', type: 'periodic', status: 'confirmed', totalPrice: 55, paymentStatus: 'unpaid', amountCollected: 0 },
      ])),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    const drawer = drawerEl()!;

    // Il box "Giornata int." mostra "Non disponibile"
    const fullBox = drawerButtons().find((b) => b.textContent?.includes('Giornata int.'));
    expect(fullBox).toBeTruthy();
    expect(fullBox!.textContent).toContain('Non disponibile');

    // Selezionandolo → dettaglio copertura: fasce copritrici + clienti + importi; nessuna azione di booking
    fullBox!.click();
    await flushPromises();
    expect(drawer.textContent).toContain('coperta da');
    expect(drawer.textContent).toContain('Mattina');
    expect(drawer.textContent).toContain('Pomeriggio');
    expect(drawer.textContent).toContain('30');
    expect(drawer.textContent).toContain('55');
    expect(drawer.textContent).not.toContain('Registra incasso');

    w.unmount();
  });

  it('fascia coperta (full-day prenotata → metà coperte): la metà nomina la full-day come copritrice', async () => {
    const mapOv2 = {
      date: '2026-06-27',
      umbrellaTypes: [{ id: 't1', name: 'Palma', sortOrder: 1, icon: 'palmtree' }],
      timeSlots: [
        { id: 'mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
        { id: 'pom', name: 'Pomeriggio', startTime: '13:00', endTime: '19:00', sortOrder: 2 },
        { id: 'full', name: 'Giornata int.', startTime: '08:00', endTime: '19:00', sortOrder: 3 },
      ],
      sectors: [{ id: 'sec', name: 'Centro', sortOrder: 1, rows: [{ id: 'r1', label: 'Fila 1', sortOrder: 1, umbrellas: [
        { id: 'o9', label: '9', umbrellaTypeId: 't1', rowId: 'r1',
          stateBySlot: { mat: 'covered', pom: 'covered', full: 'season' },
          coveredBySlot: { mat: ['full'], pom: ['full'] } },
      ] }] }],
    };
    server.use(
      http.get('/api/map', () => HttpResponse.json(mapOv2)),
      http.get('/api/bookings', () => HttpResponse.json([
        { id: 'bf', customerId: 'c-1', umbrellaId: 'o9', timeSlotId: 'full', startDate: '2026-06-27', endDate: '2026-06-27', type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'unpaid', amountCollected: 0 },
      ])),
    );

    const w = mountApp(MapView, { attachTo: document.body });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.findComponent({ name: 'UmbrellaCell' }).find('button').trigger('click');
    await flushPromises();
    const drawer = drawerEl()!;

    // Seleziona la fascia "Mattina" (coperta dalla full-day)
    const matBox = drawerButtons().find((b) => b.textContent?.includes('Mattina'));
    expect(matBox).toBeTruthy();
    matBox!.click();
    await flushPromises();
    expect(drawer.textContent).toContain('coperta da');
    expect(drawer.textContent).toContain('Giornata int.');
    expect(drawer.textContent).toContain('800');

    w.unmount();
  });

  it('i tab settore mostrano la % di occupazione operativa (hint)', async () => {
    const w = mountApp(MapView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    // seed: Centro ha o-1 (daily/daily), o-2 (free/free), o-8 (booked/free) → 2/3 = 67%
    expect(w.find('[data-test="seg-hint"]').text()).toBe('67%');
  });

  it('ogni fila mostra il righello occupate/totali', async () => {
    const w = mountApp(MapView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    const ruler = w.find('[data-test="row-ruler"]');
    expect(ruler.exists()).toBe(true);
    expect(ruler.text()).toContain('2/3');
  });

  it('legenda operativa: clic su "Libero" attenua le celle senza fasce libere', async () => {
    const w = mountApp(MapView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    await w.get('[data-test="legend-chip"][data-state="free"]').trigger('click');
    const cells = w.findAllComponents({ name: 'UmbrellaCell' });
    const byLabel = (l: string) => cells.find((c) => c.props('label') === l)!;
    expect(byLabel('1').props('dimmed')).toBe(true); // daily/daily: nessuna fascia libera
    expect(byLabel('2').props('dimmed')).toBe(false); // free/free
    expect(byLabel('8').props('dimmed')).toBe(false); // booked/free: ha una fascia libera

    // secondo clic: filtro spento, niente dimmed
    await w.get('[data-test="legend-chip"][data-state="free"]').trigger('click');
    expect(byLabel('1').props('dimmed')).toBe(false);
  });

  it('legenda informativa: chiusa di default, il click sulla pillola apre il pannello nel portal', async () => {
    const w = mountApp(MapView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    // chiusa di default: il contenuto informativo non è montato
    expect(document.body.textContent).not.toContain('Stato misto');
    expect(document.body.textContent).not.toContain('Mini-palma');

    await w.get('[data-test="legend-pill"]').trigger('click');
    await flushPromises();
    const panel = document.body.querySelector('[data-test="legend-panel"]');
    expect(panel).not.toBeNull();
    expect(panel!.textContent).toContain('Stato misto');
    expect(panel!.textContent).toContain('Tipologia');
    expect(panel!.textContent).toContain('Mini-palma');
  });

  it('ricerca per etichetta: la cella matchata pulsa (found)', async () => {
    const w = mountApp(MapView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    vi.useFakeTimers();
    try {
      await w.get('[data-test="map-find"]').setValue('8');
      vi.advanceTimersByTime(200);
      await nextTick();
      const cells = w.findAllComponents({ name: 'UmbrellaCell' });
      expect(cells.find((c) => c.props('label') === '8')!.props('found')).toBe(true);
      expect(cells.find((c) => c.props('label') === '2')!.props('found')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ricerca per cliente: matcha gli ombrelloni prenotati da quel cliente', async () => {
    // override bookings del giorno: Mario Rossi (c-1, già nel seed clienti) su o-8
    server.use(http.get('/api/bookings', () => HttpResponse.json([
      { id: 'b-x', customerId: 'c-1', umbrellaId: 'o-8', timeSlotId: 'f-mat',
        startDate: '2026-06-27', endDate: '2026-06-27', type: 'daily', status: 'confirmed',
        totalPrice: 25, paymentStatus: 'unpaid', amountCollected: 0 },
    ])));

    const w = mountApp(MapView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();

    vi.useFakeTimers();
    try {
      await w.get('[data-test="map-find"]').setValue('rossi');
      vi.advanceTimersByTime(200);
      await nextTick();
      const cells = w.findAllComponents({ name: 'UmbrellaCell' });
      expect(cells.find((c) => c.props('label') === '8')!.props('found')).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('hovercard: su ambienti senza hover (jsdom) le celle NON sono avvolte da HoverCardRoot', async () => {
    const w = await mountMap();
    // il trigger renderizzato è direttamente il button della cella, nessun contenuto card nel body
    expect(document.body.innerHTML).not.toContain('data-reka-hover-card');
    expect(w.findAllComponents({ name: 'UmbrellaCell' }).length).toBeGreaterThan(0);
    // La prova reale del path disabled: il contenuto della hovercard (slot content) NON deve
    // essere montato — se :disabled fosse invertito o mancante, questo testo apparirebbe nel body.
    expect(document.body.innerHTML).not.toContain('Clic per aprire il dettaglio');
    w.unmount();
  });

  afterEach(() => { vi.restoreAllMocks(); });
});
