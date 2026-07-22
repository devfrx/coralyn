import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import EstablishmentStructureView from './EstablishmentStructureView.vue';
import { STRUCTURE_FIXTURE } from './structure.fixtures';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flushPromises(); await tick(); await flushPromises(); };
const useFixture = () => server.use(http.get('/api/establishment/structure', () => HttpResponse.json(STRUCTURE_FIXTURE)));

// La shell registra un listener keydown globale su `window` (onMounted/onUnmounted, per l'Esc —
// vedi EstablishmentStructureView.vue). L'afterEach comune di src/test/setup.ts fa solo
// `document.body.innerHTML = ''`, che NON invoca il lifecycle unmount di Vue: un wrapper mai
// smontato esplicitamente resta un'istanza "zombie" con reattività (e quel listener) ancora vivi
// anche a DOM strappato. Se un test successivo in questo file dispatcha un keydown Escape reale su
// `window`, l'onKeydown zombie scatta comunque, chiama reset() e Vue tenta di aggiornare/rimuovere
// nodi ormai orfani → TypeError in removeFragment (nextSibling di null), riportato come unhandled
// rejection e attribuito a qualunque test sia in corso in quel momento — non è un bug di reka-ui o
// di jsdom, è la mancanza di unmount(). `enableAutoUnmount` di vue-test-utils smonta ogni wrapper
// tracciato da mount()/mountApp() nell'hook indicato (qui l'afterEach del file): idempotente sui
// test che già chiamano w.unmount() esplicitamente (Vue.app.unmount() è un no-op con warning su
// un'app già smontata, non lancia). Elimina la classe di bug alla radice, senza toccare i test.
enableAutoUnmount(afterEach);

// jsdom non implementa window.matchMedia (vedi useMediaQuery.spec.ts): senza stub, useMediaQuery
// resta sempre false e la shell renderebbe SOLO il ramo Drawer (chiuso quando selection === beach,
// quindi senza [data-testid="inspector"] nel DOM). Questi spec esercitano deliberatamente il ramo
// desktop (aside inline) per poter asserire sull'ispettore in ogni stato di selezione.
function stubDesktopMatchMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}
beforeEach(() => stubDesktopMatchMedia());
afterEach(() => vi.unstubAllGlobals());

describe('EstablishmentStructureView — shell Cantiere', () => {
  it('rende scena + ispettore Spiaggia di default (contatori e tipologie)', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    await settle();
    expect(w.find('[data-testid="scene-sand"]').exists()).toBe(true);
    const insp = w.find('[data-testid="inspector"]');
    expect(insp.text()).toContain('Spiaggia');
    expect(insp.text()).toContain('Gazebo');
    expect(w.text()).toContain('2 settori');
    expect(w.text()).toContain('2 ombrelloni');
  });

  it('click su una cella → pannello Ombrellone col crumb; click sabbia → torna a Spiaggia', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    expect(w.find('[data-testid="inspector"]').text()).toContain('A1');
    await w.find('[data-testid="scene-sand"]').trigger('click');
    expect(w.find('[data-testid="inspector"]').text()).toContain('Spiaggia');
  });

  it('tipologie: crea inline dal pannello Spiaggia (POST + refetch)', async () => {
    useFixture();
    let posted: unknown = null;
    server.use(http.post('/api/establishment/umbrella-types', async ({ request }) => {
      posted = await request.json();
      return HttpResponse.json({ id: 'typ-2', name: 'Lettino', sortOrder: 2, icon: 'umbrella' });
    }));
    const w = mountApp(EstablishmentStructureView);
    // Il pulsante "Nuova" tipologia è admin-only: senza sessione autenticata il ruolo di default
    // è Staff (useSessionStore) e il bottone non verrebbe reso.
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="type-new"]').trigger('click');
    await w.find('[data-testid="type-name"]').setValue('Lettino');
    await w.find('[data-testid="type-save"]').trigger('submit');
    await settle();
    expect(posted).toEqual({ name: 'Lettino', icon: 'umbrella' });
  });

  it('tab settore → pannello Settore; rename → PATCH e toast', async () => {
    useFixture();
    let patched: unknown = null;
    server.use(http.patch('/api/establishment/sectors/s-1', async ({ request }) => {
      patched = await request.json();
      return HttpResponse.json({ id: 's-1', name: 'Centro Mare', sortOrder: 1, kind: 'grid', rows: [] });
    }));
    const w = mountApp(EstablishmentStructureView);
    // Il form del pannello Settore (rename) è admin-only.
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[role="tab"]')[0].trigger('click');
    expect(w.find('[data-testid="inspector"]').text()).toContain('Settore');
    await w.find('[data-testid="sector-name"]').setValue('Centro Mare');
    await w.find('[data-testid="sector-form"]').trigger('submit');
    await settle();
    expect(patched).toEqual({ name: 'Centro Mare', kind: 'grid' });
  });

  it('tab «+ Settore» → pannello di creazione → POST e selezione del nuovo', async () => {
    useFixture();
    server.use(http.post('/api/establishment/sectors', () =>
      HttpResponse.json({ id: 's-3', name: 'Nord', sortOrder: 3, kind: 'grid', rows: [] })));
    const w = mountApp(EstablishmentStructureView);
    // Il bottone «+ Settore» è admin-only.
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="ghost-sector"]').trigger('click');
    await w.find('[data-testid="sector-name"]').setValue('Nord');
    await w.find('[data-testid="sector-form"]').trigger('submit');
    await settle();
    expect(w.find('[data-testid="inspector"]').text()).toContain('Spiaggia'); // close → beach
  });

  it('rail fila → pannello Fila; generatore con anteprima; genera → POST generate + toast', async () => {
    useFixture();
    let generated: unknown = null;
    server.use(http.post('/api/establishment/umbrellas/generate', async ({ request }) => {
      generated = await request.json();
      return HttpResponse.json({ created: 3, skipped: 1, umbrellas: [] });
    }));
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="scene-row"] .st-rail-name').trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    expect(insp.text()).toContain('Genera');
    await insp.find('[data-testid="gen-prefix"]').setValue('A');
    await insp.find('[data-testid="gen-start"]').setValue(3);
    await insp.find('[data-testid="gen-count"]').setValue(4);
    expect(insp.text()).toContain('A3'); // anteprima live
    await insp.find('[data-testid="gen-form"]').trigger('submit');
    await settle();
    expect(generated).toEqual({ rowId: 'r-1', prefix: 'A', start: 3, count: 4, umbrellaTypeId: null });
  });

  it('generatore Fila: quantità oltre il cap (500) → hint «Massimo 500 per volta» + submit disabilitato, nessuna generate', async () => {
    useFixture();
    let called = false;
    server.use(http.post('/api/establishment/umbrellas/generate', async () => { called = true; return HttpResponse.json({ created: 0, skipped: 0, umbrellas: [] }); }));
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="scene-row"] .st-rail-name').trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    await insp.find('[data-testid="gen-count"]').setValue(501);
    expect(insp.text()).toContain('Massimo 500 per volta');
    expect(insp.find('[data-testid="gen-save"]').attributes('disabled')).toBeDefined();
    await insp.find('[data-testid="gen-form"]').trigger('submit');
    await settle();
    expect(called).toBe(false);
  });

  it('generatore Fila: quantità = 500 (cap) → anteprima corretta e submit abilitato', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="scene-row"] .st-rail-name').trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    await insp.find('[data-testid="gen-count"]').setValue(500);
    expect(insp.text()).toContain('(500)');
    expect(insp.text()).not.toContain('Massimo 500 per volta');
    expect(insp.find('[data-testid="gen-save"]').attributes('disabled')).toBeUndefined();
  });

  it('svuota fila → ConfirmDialog → bulk-delete con gli id della fila → toast eliminati/saltati', async () => {
    useFixture();
    let bulk: unknown = null;
    server.use(http.post('/api/establishment/umbrellas/bulk-delete', async ({ request }) => {
      bulk = await request.json();
      return HttpResponse.json({ deleted: 1, skipped: 1 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="scene-row"] .st-rail-name').trigger('click');
    await w.find('[data-testid="row-clear"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Svuotare la fila?');
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Svuota')!.click();
    await settle();
    expect(bulk).toEqual({ ids: ['u-1', 'u-2'] });
    const { useToasts } = await import('@/lib/toasts');
    expect(useToasts().items.some((t) => t.message.includes('Eliminati 1') && t.message.includes('saltati 1'))).toBe(true);
    w.unmount();
  });

  it('tab «+ Fila» → pannello di creazione → genera al submit → toast, chiude pannello prima del generate', async () => {
    useFixture();
    let createdRow: unknown = null;
    let generated: unknown = null;
    server.use(
      http.post('/api/establishment/rows', async ({ request }) => {
        createdRow = await request.json();
        return HttpResponse.json({ id: 'r-2', label: 'Fila 2', sortOrder: 2, umbrellas: [] });
      }),
      http.post('/api/establishment/umbrellas/generate', async ({ request }) => {
        generated = await request.json();
        return HttpResponse.json({ created: 4, skipped: 0, umbrellas: [] });
      }),
    );
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[role="tab"]')[0].trigger('click'); // Settore Centro selezionato
    await w.find('[data-testid="ghost-row"]').trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    expect(insp.text()).toContain('Nuova fila');
    await insp.find('[data-testid="row-label"]').setValue('Fila 2');
    await insp.find('[data-testid="gen-count"]').setValue(4);
    await insp.find('[data-testid="row-form"]').trigger('submit');
    await settle();
    expect(createdRow).toEqual({ sectorId: 's-1', label: 'Fila 2' });
    expect(generated).toEqual({ rowId: 'r-2', prefix: '', start: 1, count: 4, umbrellaTypeId: null });
    const { useToasts } = await import('@/lib/toasts');
    expect(useToasts().items.some((t) => t.message.includes('Fila creata') && t.message.includes('4 ombrelloni'))).toBe(true);
  });

  it('tab «+ Fila»: quantità oltre il cap (500) → hint + submit disabilitato, nessuna create/generate', async () => {
    useFixture();
    let createCalled = false;
    server.use(
      http.post('/api/establishment/rows', async () => { createCalled = true; return HttpResponse.json({ id: 'r-2', label: 'Fila 2', sortOrder: 2, umbrellas: [] }); }),
    );
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[role="tab"]')[0].trigger('click');
    await w.find('[data-testid="ghost-row"]').trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    await insp.find('[data-testid="row-label"]').setValue('Fila 2');
    await insp.find('[data-testid="gen-count"]').setValue(501);
    expect(insp.text()).toContain('Massimo 500 per volta');
    expect(insp.find('[data-testid="row-save"]').attributes('disabled')).toBeDefined();
    await insp.find('[data-testid="row-form"]').trigger('submit');
    await settle();
    expect(createCalled).toBe(false);
  });

  it('mobile: rail fila → Drawer con pannello Fila (ramo <lg, non solo l\'aside desktop)', async () => {
    useFixture();
    // Sovrascrive lo stub desktop del beforeEach: viewport mobile → StructureView monta il ramo
    // Drawer (v-else di isDesktop), non l'aside. Regression guard per il bug segnalato in review:
    // i pannelli Fila erano stati cablati solo nell'aside, lasciando il placeholder nel Drawer.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="scene-row"] .st-rail-name').trigger('click');
    await settle();
    // Il Drawer (reka-ui DialogPortal) teleporta il contenuto fuori dall'albero del wrapper: verifica
    // su document.body, come già fatto per ConfirmDialog nel test «svuota fila».
    expect(document.body.textContent).toContain('Genera'); // pannello Fila, non il placeholder 'row'
    w.unmount();
  });

  it('cella → pannello Ombrellone: salva etichetta+tipologia → PATCH e toast', async () => {
    useFixture();
    let patched: unknown = null;
    server.use(http.patch('/api/establishment/umbrellas/u-1', async ({ request }) => {
      patched = await request.json();
      return HttpResponse.json({ id: 'u-1', label: 'A1-bis', umbrellaTypeId: 'typ-1' });
    }));
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    await insp.find('[data-testid="umbrella-label"]').setValue('A1-bis');
    await insp.find('[data-testid="umbrella-form"]').trigger('submit');
    await settle();
    expect(patched).toEqual({ label: 'A1-bis', umbrellaTypeId: null });
    const { useToasts } = await import('@/lib/toasts');
    expect(useToasts().items.some((t) => t.message.includes('Ombrellone aggiornato'))).toBe(true);
  });

  it('ghost cella → pannello Nuovo ombrellone → POST sulla fila giusta', async () => {
    useFixture();
    let posted: unknown = null;
    server.use(http.post('/api/establishment/umbrellas', async ({ request }) => {
      posted = await request.json();
      return HttpResponse.json({ id: 'u-9', label: 'A9', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="ghost-cell"]').trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    await insp.find('[data-testid="umbrella-label"]').setValue('A9');
    await insp.find('[data-testid="umbrella-form"]').trigger('submit');
    await settle();
    expect(posted).toEqual({ rowId: 'r-1', label: 'A9', umbrellaTypeId: null });
  });

  it('elimina ombrellone → ConfirmDialog → DELETE → toast, chiude pannello', async () => {
    useFixture();
    let deletedId: string | null = null;
    server.use(http.delete('/api/establishment/umbrellas/:id', ({ params }) => {
      deletedId = params.id as string;
      return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.find('[data-testid="umbrella-delete"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain("Eliminare l'ombrellone?");
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina')!.click();
    await settle();
    expect(deletedId).toBe('u-1');
    expect(w.find('[data-testid="inspector"]').text()).toContain('Spiaggia'); // close → beach
    w.unmount();
  });

  it('D-055: «Ritira» chiede conferma, chiama la mutation e chiude il pannello con toast', async () => {
    useFixture();
    let retiredId: string | null = null;
    server.use(http.post('/api/establishment/umbrellas/:id/retire', ({ params }) => {
      retiredId = params.id as string;
      return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.find('[data-testid="umbrella-retire"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain("Ritirare l'ombrellone?");
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ritira')!.click();
    await settle();
    expect(retiredId).toBe('u-1');
    const { useToasts } = await import('@/lib/toasts');
    expect(useToasts().items.some((t) => t.message.includes('Ombrellone ritirato'))).toBe(true);
    expect(w.find('[data-testid="inspector"]').text()).toContain('Spiaggia'); // close → beach
    w.unmount();
  });

  it('D-055: staff non vede «Ritira»', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    await settle(); // nessuna sessione → ruolo Staff di default
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    expect(insp.find('[data-testid="umbrella-retire"]').exists()).toBe(false);
  });

  it('mobile: cella → Drawer con pannello Ombrellone (ramo <lg, non solo l\'aside desktop)', async () => {
    useFixture();
    // Stessa guardia di regressione della fila: senza cablaggio nel ramo Drawer resterebbe il placeholder.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await settle();
    expect(document.body.textContent).toContain('Numero fisico reale'); // pannello Ombrellone, non il placeholder 'umbrella'
    w.unmount();
  });

  it('shift+clic su due celle → pannello multi; assegna tipologia → bulk-assign-type', async () => {
    useFixture();
    let assigned: unknown = null;
    server.use(http.post('/api/establishment/umbrellas/bulk-assign-type', async ({ request }) => {
      assigned = await request.json();
      return HttpResponse.json({ updated: 2 });
    }));
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    const insp = w.find('[data-testid="inspector"]');
    expect(insp.text()).toContain('2 ombrelloni');
    await insp.find('[data-testid="multi-type"]').setValue('typ-1');
    await insp.find('[data-testid="multi-assign"]').trigger('click');
    await settle();
    expect(assigned).toEqual({ ids: ['u-1', 'u-2'], umbrellaTypeId: 'typ-1' });
  });

  it('Esc con il ConfirmDialog di «Elimina N» aperto non resetta la selezione multi; senza dialog resetta', async () => {
    // Guardia di regressione: il listener Esc globale della shell era registrato prima di ogni
    // dialog e collassava pannello+selezione anche quando l'utente voleva solo annullare la
    // conferma. Il fix guarda document.querySelector('[role="dialog"], [role="alertdialog"]')
    // prima di fare reset(). Test end-to-end col ConfirmDialog VERO di MultiPanel (non un
    // marcatore sintetico): apre «Elimina N», dispatcha un Escape reale su window — che risveglia
    // ANCHE il DismissableLayer di reka-ui (stesso target window), quindi il dialog si chiude da
    // sé — e verifica che il pannello sottostante resti su Selezione multipla (il guard ha
    // impedito reset()). Un secondo Escape, a dialog ormai chiuso, resetta normalmente a Spiaggia.
    useFixture();
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    await w.find('[data-testid="multi-delete"]').trigger('click');
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Eliminare 2 ombrelloni?');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(w.find('[data-testid="inspector"]').text()).toContain('Selezione multipla'); // NON resettato

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await settle();
    expect(w.find('[data-testid="inspector"]').text()).toContain('Spiaggia'); // senza dialog, Esc resetta
    w.unmount();
  });

  it('toggle Seleziona: click semplici accumulano; elimina bulk → conferma → bulk-delete + toast', async () => {
    useFixture();
    server.use(http.post('/api/establishment/umbrellas/bulk-delete', () => HttpResponse.json({ deleted: 2, skipped: 0 })));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="select-mode"]').trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click');
    await w.find('[data-testid="multi-delete"]').trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina')!.click();
    await settle();
    const { useToasts } = await import('@/lib/toasts');
    expect(useToasts().items.some((t) => t.message.includes('Eliminati 2'))).toBe(true);
    w.unmount();
  });

  it('mobile: shift+clic su due celle → Drawer con pannello Multi (ramo <lg, non solo l\'aside desktop)', async () => {
    useFixture();
    // Stessa guardia di regressione di fila/ombrellone: senza cablaggio nel ramo Drawer resterebbe
    // il placeholder invece del pannello Multi.
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    await settle();
    expect(document.body.textContent).toContain('Selezione multipla'); // pannello Multi, non il placeholder
    expect(document.body.textContent).toContain('2 ombrelloni');
    w.unmount();
  });

  it('staff (non admin): pannello Multi raggiungibile via shift+clic ma senza azioni (difesa in profondità)', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    await settle(); // nessuna sessione → ruolo Staff di default
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    const insp = w.find('[data-testid="inspector"]');
    expect(insp.text()).toContain('2 ombrelloni');
    expect(insp.find('[data-testid="multi-assign"]').exists()).toBe(false);
    expect(insp.find('[data-testid="multi-delete"]').exists()).toBe(false);
  });

  it('multi: «Normale» (sentinel __none__) → bulk-assign-type con umbrellaTypeId null', async () => {
    useFixture();
    let assigned: unknown = null;
    server.use(http.post('/api/establishment/umbrellas/bulk-assign-type', async ({ request }) => {
      assigned = await request.json();
      return HttpResponse.json({ updated: 2 });
    }));
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    const insp = w.find('[data-testid="inspector"]');
    await insp.find('[data-testid="multi-type"]').setValue('__none__');
    await insp.find('[data-testid="multi-assign"]').trigger('click');
    await settle();
    expect(assigned).toEqual({ ids: ['u-1', 'u-2'], umbrellaTypeId: null });
  });

  it('multi: senza scelta (sentinel «») il bottone Applica è disabilitato', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    expect(w.find('[data-testid="inspector"] [data-testid="multi-assign"]').attributes('disabled')).toBeDefined();
  });

  it('D-055: sezione Ritirati con etichetta, posizione e data; assente se lista vuota', async () => {
    useFixture();
    const w1 = mountApp(EstablishmentStructureView);
    await settle(); // MSW default GET retired → []
    expect(w1.find('[data-testid="retired-section"]').exists()).toBe(false);
    w1.unmount();

    server.use(http.get('/api/establishment/umbrellas/retired', () => HttpResponse.json([
      { id: 'u-r', label: '12', umbrellaTypeId: null, retiredAt: '2026-06-20T09:00:00.000Z', retiredFrom: 'Centro · Fila 1' },
    ])));
    const w2 = mountApp(EstablishmentStructureView);
    await settle();
    const row = w2.find('[data-testid="retired-row"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain('12');
    expect(row.text()).toContain('Centro · Fila 1');
  });

  it('D-055: Ripristina chiama la mutation con la fila scelta e mostra il toast', async () => {
    useFixture();
    server.use(http.get('/api/establishment/umbrellas/retired', () => HttpResponse.json([
      { id: 'u-r', label: '12', umbrellaTypeId: null, retiredAt: '2026-06-20T09:00:00.000Z', retiredFrom: 'Centro · Fila 1' },
    ])));
    let restoredId: string | null = null;
    let restoredBody: unknown = null;
    server.use(http.post('/api/establishment/umbrellas/:id/restore', async ({ params, request }) => {
      restoredId = params.id as string;
      restoredBody = await request.json();
      return HttpResponse.json({ id: params.id as string, label: '12', umbrellaTypeId: null }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="retired-restore-row"]').setValue('r-1');
    await w.find('[data-testid="retired-restore"]').trigger('click');
    await settle();
    expect(restoredId).toBe('u-r');
    expect(restoredBody).toEqual({ rowId: 'r-1' });
    const { useToasts } = await import('@/lib/toasts');
    expect(useToasts().items.some((t) => t.message.includes('Ombrellone ripristinato'))).toBe(true);
  });

  it('D-055: staff non vede le azioni di ripristino', async () => {
    useFixture();
    server.use(http.get('/api/establishment/umbrellas/retired', () => HttpResponse.json([
      { id: 'u-r', label: '12', umbrellaTypeId: null, retiredAt: '2026-06-20T09:00:00.000Z', retiredFrom: 'Centro · Fila 1' },
    ])));
    const w = mountApp(EstablishmentStructureView);
    await settle(); // nessuna sessione → ruolo Staff di default
    expect(w.find('[data-testid="retired-row"]').exists()).toBe(true);
    expect(w.find('[data-testid="retired-restore-row"]').exists()).toBe(false);
    expect(w.find('[data-testid="retired-restore"]').exists()).toBe(false);
  });
});
