import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { QueryClient } from '@tanstack/vue-query';
import { Permission, Role } from '@coralyn/contracts';
import { mountApp, selectOption, permissionsOfRole } from '@/test/utils';
import { server } from '@/mocks/server';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import EstablishmentStructureView from './EstablishmentStructureView.vue';
import StructureScene from './StructureScene.vue';
import { STRUCTURE_FIXTURE } from './structure.fixtures';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flushPromises(); await tick(); await flushPromises(); };
const useFixture = () => server.use(http.get('/api/establishment/structure', () => HttpResponse.json(STRUCTURE_FIXTURE)));

/**
 * Costruisce lo stato «dati presenti, permesso di gestione assente» per i test di difesa in
 * profondità sui pannelli (`can-manage`).
 *
 * ⚠️ Va costruito a mano perché **non è raggiungibile dall'API**: dopo ADR-0063 la rotta
 * `/establishment/structure` richiede `structure.manage` e la sua query pure, quindi chi vede
 * questa schermata può sempre gestirla. Prima questi test ci arrivavano per caso, montando senza
 * sessione: `hasPermission` negava *tutto*, e il verde non provava niente sul ruolo staff.
 */
const senzaGestioneStruttura = async () => {
  useSessionStore().user = {
    id: 'u-2', email: 'bagnino@lido.it', role: Role.Staff,
    establishmentId: 'e-1', establishmentName: 'Lido Maestrale',
    permissions: permissionsOfRole(Role.Staff).filter((p) => p !== Permission.StructureManage),
  };
  await settle();
};

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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    await w.find('[data-testid="scene-row"] .st-rail-name').trigger('click');
    await w.find('[data-testid="row-clear"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Svuotare la fila?');
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Svuota')!.click();
    await settle();
    expect(bulk).toEqual({ ids: ['u-1', 'u-2'] });
    const { useToasts } = await import('@coralyn/ui-kit');
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    const { useToasts } = await import('@coralyn/ui-kit');
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    const insp = w.find('[data-testid="inspector"]');
    await insp.find('[data-testid="umbrella-label"]').setValue('A1-bis');
    await insp.find('[data-testid="umbrella-form"]').trigger('submit');
    await settle();
    expect(patched).toEqual({ label: 'A1-bis', umbrellaTypeId: null });
    const { useToasts } = await import('@coralyn/ui-kit');
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.find('[data-testid="umbrella-retire"]').trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain("Ritirare l'ombrellone?");
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ritira')!.click();
    await settle();
    expect(retiredId).toBe('u-1');
    const { useToasts } = await import('@coralyn/ui-kit');
    expect(useToasts().items.some((t) => t.message.includes('Ombrellone ritirato'))).toBe(true);
    expect(w.find('[data-testid="inspector"]').text()).toContain('Spiaggia'); // close → beach
    w.unmount();
  });

  /**
   * ⚠️ La conferma di un'azione distruttiva NON deve dipendere dal fatto che il pannello sia
   * sopravvissuto alla rilettura. Qui la seconda lettura della struttura torna senza `u-1`, quindi
   * `watch(selectedUmbrella)` riporta la selezione alla Spiaggia e smonta il pannello Ombrellone:
   * il toast passa comunque, perché query-core conclude la mutation prima che la rilettura atterri.
   * Se un domani l'invalidazione di `mutationResource` venisse ATTESA, la callback passata alla
   * singola `mutate()` scatterebbe a pannello già smontato e il toast sparirebbe: è la ragione per
   * cui quella promise è scartata, e questo test è ciò che lo tiene fermo.
   */
  it('il toast del ritiro passa anche se la rilettura smonta il pannello', async () => {
    let letture = 0;
    server.use(http.get('/api/establishment/structure', () => {
      letture += 1;
      if (letture === 1) return HttpResponse.json(STRUCTURE_FIXTURE);
      return HttpResponse.json({
        ...STRUCTURE_FIXTURE,
        sectors: STRUCTURE_FIXTURE.sectors.map((s) => (s.id !== 's-1' ? s
          : { ...s, rows: s.rows.map((r) => ({ ...r, umbrellas: r.umbrellas.filter((u) => u.id !== 'u-1') })) })),
      });
    }));
    server.use(http.post('/api/establishment/umbrellas/:id/retire', () =>
      HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null }, { status: 201 })));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    asAdmin();
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.find('[data-testid="umbrella-retire"]').trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ritira')!.click();
    await settle();
    await settle();
    const { useToasts } = await import('@coralyn/ui-kit');
    expect(letture).toBe(2);
    expect(useToasts().items.some((t) => t.message.includes('Ombrellone ritirato'))).toBe(true);
    w.unmount();
  });

  it('D-055: staff non vede «Ritira»', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    await settle();
    await senzaGestioneStruttura();
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    const insp = w.find('[data-testid="inspector"]');
    expect(insp.text()).toContain('2 ombrelloni');
    await selectOption(insp.get('[data-testid="multi-type"]'), 'Gazebo');
    await settle();
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    await w.find('[data-testid="select-mode"]').trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click');
    await w.find('[data-testid="multi-delete"]').trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina')!.click();
    await settle();
    const { useToasts } = await import('@coralyn/ui-kit');
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    await settle();
    await senzaGestioneStruttura();
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.findAll('[data-testid="scene-cell"] button')[1].trigger('click', { shiftKey: true });
    const insp = w.find('[data-testid="inspector"]');
    await selectOption(insp.get('[data-testid="multi-type"]'), 'Normale');
    await settle();
    await insp.find('[data-testid="multi-assign"]').trigger('click');
    await settle();
    expect(assigned).toEqual({ ids: ['u-1', 'u-2'], umbrellaTypeId: null });
  });

  it('multi: senza scelta (sentinel «») il bottone Applica è disabilitato', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    await selectOption(w.get('[data-testid="retired-restore-row"]'), 'Centro · Fila 1');
    await settle();
    await w.find('[data-testid="retired-restore"]').trigger('click');
    await settle();
    expect(restoredId).toBe('u-r');
    expect(restoredBody).toEqual({ rowId: 'r-1' });
    const { useToasts } = await import('@coralyn/ui-kit');
    expect(useToasts().items.some((t) => t.message.includes('Ombrellone ripristinato'))).toBe(true);
  });

  it('D-055: staff non vede le azioni di ripristino', async () => {
    useFixture();
    server.use(http.get('/api/establishment/umbrellas/retired', () => HttpResponse.json([
      { id: 'u-r', label: '12', umbrellaTypeId: null, retiredAt: '2026-06-20T09:00:00.000Z', retiredFrom: 'Centro · Fila 1' },
    ])));
    const w = mountApp(EstablishmentStructureView);
    await settle();
    await senzaGestioneStruttura();
    expect(w.find('[data-testid="retired-row"]').exists()).toBe(true);
    expect(w.find('[data-testid="retired-restore-row"]').exists()).toBe(false);
    expect(w.find('[data-testid="retired-restore"]').exists()).toBe(false);
  });

  it('rail fila: ⚡ Genera e 🗑 Svuota/elimina portano a sezioni DIVERSE del pannello (non fanno la stessa cosa)', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    const insp = () => w.get('[data-testid="inspector"]');
    // ⚡ Genera → pannello fila con il generatore evidenziato, zona rischiosa no.
    await w.findAll('[data-testid="rail-generate"]')[0].trigger('click');
    await settle();
    expect(insp().get('[data-testid="row-generate-section"]').attributes('data-focus')).toBe('on');
    expect(insp().get('[data-testid="row-danger-section"]').attributes('data-focus')).toBeUndefined();
    // 🗑 Svuota/elimina → stessa fila, ma ora è evidenziata la zona rischiosa, non il generatore.
    await w.findAll('[data-testid="rail-danger"]')[0].trigger('click');
    await settle();
    expect(insp().get('[data-testid="row-danger-section"]').attributes('data-focus')).toBe('on');
    expect(insp().get('[data-testid="row-generate-section"]').attributes('data-focus')).toBeUndefined();
  });

  // D-038 §5.3: il trascinamento è dichiaratamente solo `lg+`. La coppia di test sotto è l'unica
  // che prova il gating dove vive davvero — la shell possiede la media query — e va letta insieme:
  // se passassero entrambi con lo stesso stub, il gating non starebbe facendo nulla.
  it('lg+: la maniglia di trascinamento è nel DOM', async () => {
    useFixture();
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    expect(w.findAll('[data-testid="drag-handle"]')).toHaveLength(2);
  });

  it('sotto lg la maniglia NON si rende: là il Drawer azzera i pointer-events (D-071)', async () => {
    useFixture();
    // Sovrascrive lo stub desktop del beforeEach, come già fa il test del Drawer sopra.
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
    await settle();
    expect(w.findAll('[data-testid="drag-handle"]')).toHaveLength(0);
    // L'assenza dev'essere MIRATA: se sparisse tutta la scena il test sopra passerebbe lo stesso,
    // e direbbe soltanto che il componente non è stato reso.
    expect(w.findAll('[data-testid="scene-cell"]')).toHaveLength(2);
  });

  /**
   * jsdom restituisce rettangoli a ZERO: senza queste misure la geometria non verrebbe esercitata
   * e il calcolo della posizione direbbe sempre 0, qualunque sia il puntatore. Sono quelle vere:
   * cella 40px (`structure-scene.css:35`), gap 9px (`:17`).
   */
  function layoutCells(w: ReturnType<typeof mountApp>): void {
    w.findAll('[data-testid="scene-cell"]').forEach((c, i) => {
      const left = i * 49;
      c.element.getBoundingClientRect = () =>
        ({ left, right: left + 40, top: 0, bottom: 40, x: left, y: 0, width: 40, height: 40, toJSON: () => ({}) }) as DOMRect;
    });
  }
  const asAdmin = () => {
    useSessionStore().user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale', permissions: permissionsOfRole(Role.Admin) };
  };

  it('il rilascio manda POST :id/move con la posizione calcolata dalla geometria', async () => {
    useFixture();
    let movedId: string | null = null;
    let body: unknown = null;
    server.use(http.post('/api/establishment/umbrellas/:id/move', async ({ request, params }) => {
      movedId = params.id as string;
      body = await request.json();
      return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    asAdmin();
    await settle();
    layoutCells(w);

    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragstart');
    // Oltre l'ultima cella: A1 esce dal calcolo, resta la sola metà di A2 (69), superata.
    await w.find('.st-cells').trigger('drop', { clientX: 300, clientY: 20 });
    await settle();

    expect(movedId).toBe('u-1');
    expect(body).toEqual({ rowId: 'r-1', position: 1 });
  });

  it('anteprima ottimistica: le celle si riordinano PRIMA che il server risponda', async () => {
    useFixture();
    let release: () => void = () => {};
    server.use(http.post('/api/establishment/umbrellas/:id/move', async () => {
      await new Promise<void>((resolve) => { release = resolve; });
      return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    asAdmin();
    await settle();
    layoutCells(w);
    expect(w.findAll('[data-testid="scene-cell"] button').map((b) => b.text())).toEqual(['A1', 'A2']);

    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragstart');
    await w.find('.st-cells').trigger('drop', { clientX: 300, clientY: 20 });
    await settle();

    // La mutation è ancora pending e il server non ha detto nulla: se questo passasse senza
    // anteprima, la cella resterebbe ferma fino alla risposta e poi salterebbe.
    expect(w.findAll('[data-testid="scene-cell"] button').map((b) => b.text())).toEqual(['A2', 'A1']);
    release();
    await settle();
  });

  // L'albero come il server lo restituisce DOPO lo spostamento: A2 prima di A1.
  const MOSSO = {
    ...STRUCTURE_FIXTURE,
    sectors: STRUCTURE_FIXTURE.sectors.map((s) => (s.id !== 's-1' ? s
      : { ...s, rows: s.rows.map((r) => ({ ...r, umbrellas: [...r.umbrellas].reverse() })) })),
  };

  /**
   * Il RIMBALZO, che il test sopra da solo non vede: quello guarda la finestra PRIMA della risposta
   * al POST, questo quella fra la risposta al POST e la rilettura della struttura. Le due risposte
   * sono rilasciate a mano, una per volta, e la GET restituisce l'albero POST-spostamento: così si
   * distingue l'anteprima ottimistica dalla rilettura e si legge la sequenza vera. Attesa:
   * nuovo → nuovo. Con l'anteprima condizionata al solo `isPending`: nuovo → **vecchio** → nuovo.
   */
  it('fra la risposta al POST e la rilettura le celle NON tornano indietro', async () => {
    let letture = 0;
    let releaseGet: () => void = () => {};
    server.use(http.get('/api/establishment/structure', async () => {
      letture += 1;
      if (letture === 1) return HttpResponse.json(STRUCTURE_FIXTURE);
      await new Promise<void>((resolve) => { releaseGet = resolve; });
      return HttpResponse.json(MOSSO);
    }));
    let releasePost: () => void = () => {};
    server.use(http.post('/api/establishment/umbrellas/:id/move', async () => {
      await new Promise<void>((resolve) => { releasePost = resolve; });
      return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    asAdmin();
    await settle();
    layoutCells(w);
    const celle = () => w.findAll('[data-testid="scene-cell"] button').map((b) => b.text());

    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragstart');
    await w.find('.st-cells').trigger('drop', { clientX: 300, clientY: 20 });
    await settle();
    expect(celle()).toEqual(['A2', 'A1']); // anteprima: il POST non ha ancora risposto

    releasePost();
    await settle();
    expect(letture).toBe(2); // la rilettura è partita ed è ancora in volo
    expect(celle()).toEqual(['A2', 'A1']); // ⚠️ qui casca il rimbalzo

    releaseGet();
    await settle();
    await settle();
    expect(celle()).toEqual(['A2', 'A1']); // ora è il server a dirlo, non l'anteprima
  });

  /**
   * Il verso opposto, che il test del rimbalzo non copre: dopo un RIFIUTO le `variables` della
   * mutation restano dove sono, e la rilettura parte lo stesso (`mutationResource` invalida su
   * entrambi gli esiti). Se l'anteprima si accontentasse di «la struttura sta rileggendo», in
   * quella finestra rimetterebbe a schermo uno spostamento che il server ha appena respinto.
   */
  it('dopo un rifiuto la rilettura NON rimette a schermo lo spostamento respinto', async () => {
    let letture = 0;
    let releaseGet: () => void = () => {};
    server.use(http.get('/api/establishment/structure', async () => {
      letture += 1;
      if (letture === 1) return HttpResponse.json(STRUCTURE_FIXTURE);
      await new Promise<void>((resolve) => { releaseGet = resolve; });
      return HttpResponse.json(STRUCTURE_FIXTURE); // il rifiuto non ha cambiato nulla
    }));
    server.use(http.post('/api/establishment/umbrellas/:id/move', () =>
      HttpResponse.json({ message: 'Posizione fuori dalla fila.' }, { status: 422 })));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    asAdmin();
    await settle();
    layoutCells(w);
    const celle = () => w.findAll('[data-testid="scene-cell"] button').map((b) => b.text());

    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragstart');
    await w.find('.st-cells').trigger('drop', { clientX: 300, clientY: 20 });
    await settle();

    expect(letture).toBe(2); // la rilettura è partita ed è ancora in volo
    expect(celle()).toEqual(['A1', 'A2']); // ⚠️ nessun fantasma dello spostamento respinto

    releaseGet();
    await settle();
    expect(celle()).toEqual(['A1', 'A2']);
  });

  /**
   * Il fantasma che azzerare `treeAtWrite` ad ogni invio esiste apposta per escludere: un secondo
   * spostamento lanciato mentre la rilettura del PRIMO (riuscito) è ancora in volo, e che viene
   * RESPINTO, non deve lasciare la finestra aperta sulle `variables` del rifiuto. Senza
   * l'azzeramento, `treeAtWrite` resterebbe quello del primo successo; la rilettura del primo non è
   * ancora atterrata (stessa `dataUpdatedAt`), e l'anteprima mostrerebbe lo spostamento respinto
   * come se fosse ancora quello in corso.
   */
  it('un rifiuto lanciato mentre la rilettura del move precedente è ancora in volo non lascia la finestra aperta sul rifiuto', async () => {
    let letture = 0;
    let releaseGet: () => void = () => {};
    server.use(http.get('/api/establishment/structure', async () => {
      letture += 1;
      if (letture === 1) return HttpResponse.json(STRUCTURE_FIXTURE);
      await new Promise<void>((resolve) => { releaseGet = resolve; });
      return HttpResponse.json(STRUCTURE_FIXTURE); // qui conta solo che questa rilettura non atterri
    }));
    let chiamate = 0;
    server.use(http.post('/api/establishment/umbrellas/:id/move', () => {
      chiamate += 1;
      if (chiamate === 1) return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
      return HttpResponse.json({ message: 'Posizione fuori dalla fila.' }, { status: 422 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    asAdmin();
    await settle();
    const celle = () => w.findAll('[data-testid="scene-cell"] button').map((b) => b.text());

    // 1. Primo spostamento: risolve, ma la sua rilettura resta in volo per tutto il test.
    w.findComponent(StructureScene).vm.$emit('move-umbrella', 'u-1', 'r-1', 1);
    await settle();
    expect(celle()).toEqual(['A2', 'A1']); // anteprima del primo, in attesa della rilettura

    // 2. Secondo spostamento, lanciato mentre quella rilettura è ancora in volo: viene RESPINTO.
    w.findComponent(StructureScene).vm.$emit('move-umbrella', 'u-1', 'r-1', 1);
    await settle();

    // L'albero vero non è mai cambiato (la rilettura del primo non è atterrata): un rifiuto non
    // deve rimettere a schermo alcuna anteprima, né quella del primo né quella, respinta, del secondo.
    expect(celle()).toEqual(['A1', 'A2']);

    releaseGet();
    await settle();
    w.unmount();
  });

  /**
   * ⚠️ La finestra dell'anteprima si chiude alla rilettura di QUELLO spostamento e non si riapre
   * per innesco altrui. Legarla a «la struttura sta rileggendo» sembrava equivalente e non lo era:
   * lo stato di successo della mutation non torna mai indietro, quindi ogni rilettura successiva —
   * comprese quelle delle altre mutazioni di struttura — riapplicava lo spostamento VECCHIO a un
   * albero che nel frattempo era cambiato sotto.
   *
   * La sequenza qui è quella minima che lo smaschera: serve che l'albero sia derivato **due volte**
   * dopo lo spostamento, perché durante una rilettura a schermo c'è ancora l'albero precedente.
   * Spostato A1 all'indice 1 l'albero è [A2, A1, A3]; eliminato A2 diventa [A1, A3], e su quello
   * `applyMove(…, 'r-1', 1)` non è affatto l'identità: toglie A1, e reinserirlo all'indice 1 di
   * [A3] dà **[A3, A1]**. Due celle scambiate per tutta la durata della terza GET, e poi il salto.
   */
  it('una rilettura innescata da un\'altra mutazione non riapre l\'anteprima dello spostamento vecchio', async () => {
    const TRE = {
      umbrellaTypes: [],
      sectors: [{ id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid' as const, hasDedicatedRates: false, rows: [
        { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
          { id: 'u-1', label: 'A1', umbrellaTypeId: null },
          { id: 'u-2', label: 'A2', umbrellaTypeId: null },
          { id: 'u-3', label: 'A3', umbrellaTypeId: null },
        ] },
      ] }],
    };
    const soloLabel = (labels: string[]) => ({
      ...TRE,
      sectors: [{ ...TRE.sectors[0], rows: [{ ...TRE.sectors[0].rows[0],
        umbrellas: labels.map((l) => TRE.sectors[0].rows[0].umbrellas.find((u) => u.label === l)!) }] }],
    });
    // 1ª lettura: l'albero di partenza. 2ª: dopo lo spostamento di A1 all'indice 1.
    // 3ª: dopo l'eliminazione di A2. 4ª: tenuta in volo, è quella in cui si vedeva lo scambio.
    const alberi = [['A1', 'A2', 'A3'], ['A2', 'A1', 'A3'], ['A1', 'A3'], ['A1', 'A3']];
    let letture = 0;
    let releaseGet: () => void = () => {};
    server.use(http.get('/api/establishment/structure', async () => {
      letture += 1;
      if (letture >= 4) await new Promise<void>((resolve) => { releaseGet = resolve; });
      return HttpResponse.json(soloLabel(alberi[Math.min(letture, alberi.length) - 1]));
    }));
    let posizione: unknown = null;
    server.use(http.post('/api/establishment/umbrellas/:id/move', async ({ request }) => {
      posizione = ((await request.json()) as { position: number }).position;
      return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
    }));
    // L'id nella risposta segue quello richiesto (non un `u-2` fisso): la seconda eliminazione di
    // questa sequenza colpisce l'indice 0 di [A1, A3], cioè A1, non A2.
    server.use(http.delete('/api/establishment/umbrellas/:id', ({ params }) =>
      HttpResponse.json({ id: params.id as string, label: 'x', umbrellaTypeId: null })));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    asAdmin();
    await settle();
    layoutCells(w);
    const celle = () => w.findAll('[data-testid="scene-cell"] button').map((b) => b.text());

    // 1. Sposta A1 all'indice 1. Escluso A1, i mezzi delle altre due celle stanno a 69 e 118:
    //    un rilascio a 80 ne oltrepassa una sola.
    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragstart');
    await w.find('.st-cells').trigger('drop', { clientX: 80, clientY: 20 });
    await settle();
    expect(posizione).toBe(1);
    expect(celle()).toEqual(['A2', 'A1', 'A3']);

    // 2. Elimina A2 dal pannello Ombrellone: l'albero diventa [A1, A3].
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.find('[data-testid="umbrella-delete"]').trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina')!.click();
    await settle();
    await settle();
    expect(celle()).toEqual(['A1', 'A3']);

    // 3. Una qualunque mutazione successiva rilegge la struttura. Durante quella GET l'anteprima
    //    NON deve tornare: `applyMove` su [A1, A3] darebbe [A3, A1].
    await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
    await w.find('[data-testid="umbrella-delete"]').trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina')!.click();
    await settle();
    expect(letture).toBe(4); // la quarta rilettura è in volo
    expect(celle()).toEqual(['A1', 'A3']);

    releaseGet();
    await settle();
  });

  // L'ordine dell'editor È l'ordine della Mappa operativa: `map.service.ts:22,25,26` ordina con gli
  // stessi campi. Senza questa invalidazione chi ha la Mappa aperta al banco resta con la
  // disposizione vecchia — e nessuna mutazione di struttura la invalidava, non solo il move.
  //
  // ⚠️ Di OGNI giornata, non solo di quella attiva: la data non entra nell'ordinamento, quindi uno
  // spostamento smentisce anche le mappe di altre date già in cache (la data si cambia dalla
  // topbar). Non basta guardare la forma della chiave: l'assertion la passa al matcher vero di
  // TanStack contro due giornate in cache, ed è quello a dire se le scade entrambe.
  it('il move invalida la Mappa di OGNI giornata in cache, non solo quella attiva', async () => {
    useFixture();
    server.use(http.post('/api/establishment/umbrellas/:id/move', () =>
      HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null })));
    const invalidate = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    asAdmin();
    await settle();
    layoutCells(w);

    await w.findAll('[data-testid="drag-handle"]')[0].trigger('dragstart');
    await w.find('.st-cells').trigger('drop', { clientX: 300, clientY: 20 });
    await settle();

    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: readonly unknown[] }).queryKey);
    invalidate.mockRestore();
    expect(keys).toContainEqual(['establishment', 'e-1', 'structure']);

    // ⚠️ In cache ci sono anche due voci che il prefisso NON deve toccare: la mappa di un altro
    // lido e una risorsa di dominio diverso. Senza, un prefisso troppo largo — `['map']`, o il
    // caso limite di una chiave vuota — passerebbe questo test insieme a quello giusto: il conteggio
    // atteso deve dire sia «le scade entrambe» sia «non scade nient'altro».
    const cache = new QueryClient();
    cache.setQueryData(queryKeys.dayMap('e-1', useSessionStore().activeDate), { sectors: [] });
    cache.setQueryData(queryKeys.dayMap('e-1', '2026-08-14'), { sectors: [] });
    cache.setQueryData(queryKeys.dayMap('e-2', '2026-08-14'), { sectors: [] });
    cache.setQueryData(queryKeys.bookings('e-1', '2026-08-14'), []);
    const scadute = new Set(keys.flatMap((queryKey) => cache.getQueryCache().findAll({ queryKey }).map((q) => q.queryHash)));
    expect(scadute).toEqual(new Set([
      JSON.stringify(queryKeys.dayMap('e-1', useSessionStore().activeDate)),
      JSON.stringify(queryKeys.dayMap('e-1', '2026-08-14')),
    ]));
  });

  /**
   * Disclosure sul prezzo (spec §2.5). I test entrano dal confine scena→shell invece di rifare la
   * coreografia del gesto — trascina, sosta sul tab, aspetta la molla, rilascia — che è già provata
   * in StructureRow.spec.ts e StructureScene.spec.ts. Qui si prova la DECISIONE, non il gesto.
   */
  describe('disclosure sul prezzo', () => {
    // Due settori grid: solo il primo ha tariffe dedicate. Serve un albero apposta perché
    // STRUCTURE_FIXTURE ha un solo grid, e uno spostamento fra settori non sarebbe rappresentabile.
    const TWO_GRIDS = {
      sectors: [
        { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid' as const, hasDedicatedRates: true, rows: [
          { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [{ id: 'u-1', label: 'A1', umbrellaTypeId: null }] },
        ] },
        { id: 's-3', name: 'Levante', sortOrder: 2, kind: 'grid' as const, hasDedicatedRates: false, rows: [
          { id: 'r-3', label: 'Fila 3', sortOrder: 1, umbrellas: [] },
        ] },
      ],
      umbrellaTypes: [],
    };

    // Caso specchio di TWO_GRIDS: qui è la DESTINAZIONE ad avere tariffe dedicate, l'origine no.
    const REVERSE_GRIDS = {
      sectors: [
        { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid' as const, hasDedicatedRates: false, rows: [
          { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [{ id: 'u-1', label: 'A1', umbrellaTypeId: null }] },
        ] },
        { id: 's-3', name: 'Levante', sortOrder: 2, kind: 'grid' as const, hasDedicatedRates: true, rows: [
          { id: 'r-3', label: 'Fila 3', sortOrder: 1, umbrellas: [] },
        ] },
      ],
      umbrellaTypes: [],
    };

    async function sceneMoves(structure: typeof TWO_GRIDS, rowId: string) {
      server.use(http.get('/api/establishment/structure', () => HttpResponse.json(structure)));
      let posted = false;
      server.use(http.post('/api/establishment/umbrellas/:id/move', () => {
        posted = true;
        return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
      }));
      const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
      asAdmin();
      await settle();
      w.findComponent(StructureScene).vm.$emit('move-umbrella', 'u-1', rowId, 0);
      await settle();
      return { w, posted: () => posted };
    }

    it('uscire da un settore con tariffe dedicate avvisa anche se l’arrivo non ne ha', async () => {
      const { w, posted } = await sceneMoves(TWO_GRIDS, 'r-3');
      expect(posted()).toBe(false);
      // reka-ui teleporta il dialogo fuori dall'albero del wrapper: si guarda su document.body.
      expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
      expect(document.body.textContent).toContain('Levante');
      // La destinazione qui NON ha tariffe dedicate: l'ombrellone la perde, non l'acquista.
      expect(document.body.textContent).toContain('che non le ha');
      expect(document.body.textContent).toContain('il listino generale');
      expect(document.body.textContent).not.toContain('saranno prezzati con le tariffe di «Levante»');
      expect(document.body.textContent).toContain('prenotazioni già registrate');
      w.unmount();
    });

    it('verso un settore con tariffe dedicate: il testo parla della destinazione', async () => {
      const { w, posted } = await sceneMoves(REVERSE_GRIDS, 'r-3');
      expect(posted()).toBe(false);
      expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
      // La destinazione qui HA tariffe dedicate: il testo può dirlo, non l'inverso.
      expect(document.body.textContent).toContain('dove il listino ha tariffe dedicate');
      expect(document.body.textContent).toContain('saranno prezzati con le tariffe di «Levante»');
      expect(document.body.textContent).not.toContain('il listino generale');
      expect(document.body.textContent).toContain('prenotazioni già registrate');
      w.unmount();
    });

    it('confermando, lo spostamento parte', async () => {
      const { w, posted } = await sceneMoves(TWO_GRIDS, 'r-3');
      const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Sposta comunque'))!;
      confirm.click();
      await settle();
      expect(posted()).toBe(true);
      w.unmount();
    });

    it('dentro lo stesso settore non chiede nulla: il prezzo non cambia base', async () => {
      const { w, posted } = await sceneMoves(TWO_GRIDS, 'r-1');
      expect(posted()).toBe(true);
      expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
      w.unmount();
    });

    it('senza tariffe dedicate da nessuna delle due parti il gesto è diretto', async () => {
      const senzaTariffe = { ...TWO_GRIDS, sectors: TWO_GRIDS.sectors.map((s) => ({ ...s, hasDedicatedRates: false })) };
      const { w, posted } = await sceneMoves(senzaTariffe, 'r-3');
      expect(posted()).toBe(true);
      expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
      w.unmount();
    });
  });

  describe('«Sposta» dal pannello (D-071)', () => {
    // Fixture propria: TWO_GRIDS della disclosure ha una fila da UN solo ombrellone, dove un
    // riordino dentro la fila non è rappresentabile — e allargarla toccherebbe cinque test verdi
    // che non c'entrano. STRUCTURE_FIXTURE non va bene per la stessa ragione dei suoi contatori.
    const ALBERO = {
      sectors: [
        { id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid' as const, hasDedicatedRates: true, rows: [
          { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [
            { id: 'u-1', label: 'A1', umbrellaTypeId: null },
            { id: 'u-2', label: 'A2', umbrellaTypeId: null },
          ] },
        ] },
        { id: 's-2', name: 'Levante', sortOrder: 2, kind: 'grid' as const, hasDedicatedRates: false, rows: [
          { id: 'r-2', label: 'Fila 2', sortOrder: 1, umbrellas: [] },
        ] },
      ],
      umbrellaTypes: [],
    };

    /** Monta la shell sull'albero qui sopra e apre il pannello del primo ombrellone (`u-1`). */
    async function shell() {
      let posted: unknown = null;
      server.use(
        http.get('/api/establishment/structure', () => HttpResponse.json(ALBERO)),
        http.post('/api/establishment/umbrellas/:id/move', async ({ request }) => {
          posted = await request.json();
          return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
        }),
      );
      const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
      asAdmin();
      await settle();
      await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
      await settle();
      return { w, posted: () => posted };
    }

    const spostato = async () => {
      const { useToasts } = await import('@coralyn/ui-kit');
      return useToasts().items.some((t) => t.message.includes('Ombrellone spostato'));
    };

    it('riordino dentro la fila: scrive senza chiedere nulla, e notifica', async () => {
      const { w, posted } = await shell();
      await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda');
      await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
      await settle();
      // «senza» u-1 la fila è [A2]: la coda è 1.
      expect(posted()).toEqual({ rowId: 'r-1', position: 1 });
      expect(document.body.textContent).not.toContain('Il prezzo dei rinnovi cambierà base');
      expect(await spostato()).toBe(true);
      w.unmount();
    });

    it('attraversando un confine con tariffe dedicate riusa la disclosure, e NON scrive', async () => {
      const { w, posted } = await shell();
      await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Levante · Fila 2');
      await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
      await settle();
      expect(posted()).toBeNull();
      expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
      // Esce da «Centro», che ha le tariffe dedicate, verso «Levante» che non le ha: le PERDE.
      expect(document.body.textContent).toContain('il listino generale');
      expect(await spostato()).toBe(false);
      w.unmount();
    });

    it('confermando la disclosure, la scrittura parte con la fila e la posizione scelte', async () => {
      const { w, posted } = await shell();
      await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Levante · Fila 2');
      await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
      await settle();
      const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Sposta comunque'))!;
      confirm.click();
      await settle();
      expect(posted()).toEqual({ rowId: 'r-2', position: 0 });
      expect(await spostato()).toBe(true);
      w.unmount();
    });

    /**
     * ⚠️ Il presidio del ramo <lg, ed è quello che conta di più: sotto quella soglia il controllo
     * «Sposta» è l'UNICO modo di riordinare, ed è la ragione per cui D-071 esiste. Scritto dopo una
     * mutazione che NON aveva prodotto rossi: staccando `@move-umbrella` dalla sola `InspectorPanels`
     * dentro il `Drawer`, tutti i 187 test di `features/establishment` restavano verdi — la mutazione
     * provava l'assenza di COPERTURA, non l'assenza del difetto. Lo stesso bug è già capitato in
     * questo file («i pannelli Fila cablati solo nell'aside»), ed è il motivo del commento a
     * `InspectorPanels.vue`: la shell monta quel componente DUE volte.
     */
    it('sotto lg il controllo vive nel Drawer, e da lì scrive davvero', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: false, media: query, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {},
        addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
      }));
      const { w, posted } = await shell();
      // Il Drawer (reka-ui DialogPortal) teleporta il contenuto fuori dall'albero del wrapper.
      const row = document.body.querySelector('[data-testid="umbrella-move-row"]')!;
      await selectOption(row, 'Levante · Fila 2');
      (document.body.querySelector('[data-testid="umbrella-move-submit"]') as HTMLButtonElement).click();
      await settle();
      // «Centro» ha tariffe dedicate e «Levante» no: la disclosure si apre anche da qui.
      expect(posted()).toBeNull();
      expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
      const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Sposta comunque'))!;
      confirm.click();
      await settle();
      expect(posted()).toEqual({ rowId: 'r-2', position: 0 });
      w.unmount();
    });

    /**
     * ⚠️ Review avversariale del 2026-07-31: `notify` viaggia dentro `pendingMove` perché la
     * conferma della disclosure arriva dopo, ma era provato solo nel ramo `true`. Fissandolo a
     * `true` in `confirmMove` non arrossava nulla: mancava il caso in cui è il TRASCINAMENTO ad
     * attraversare un confine con tariffe dedicate e la conferma a far partire la scrittura.
     */
    it('il trascinamento che passa dalla disclosure NON notifica nemmeno dopo la conferma', async () => {
      const { w, posted } = await shell();
      w.findComponent(StructureScene).vm.$emit('move-umbrella', 'u-1', 'r-2', 0);
      await settle();
      expect(posted()).toBeNull();
      expect(document.body.textContent).toContain('Il prezzo dei rinnovi cambierà base');
      const confirm = [...document.body.querySelectorAll('button')].find((b) => b.textContent?.includes('Sposta comunque'))!;
      confirm.click();
      await settle();
      expect(posted()).toEqual({ rowId: 'r-2', position: 0 });
      expect(await spostato()).toBe(false);
      w.unmount();
    });

    /**
     * ⚠️ Review avversariale del 2026-07-31, verdetto «incerto» poi misurato: il cablaggio di
     * `:move-pending` dalla shell al pannello non era esercitato da alcun test, e si poteva
     * ricablare a `false` senza un solo rosso. Il caso che lo vede è quello in cui l'operatore
     * sceglie una destinazione NUOVA mentre la scrittura precedente è ancora in volo: lì
     * `moveIsNoop` è falso, e a tenere spento il bottone resta solo `movePending`.
     */
    it('mentre una scrittura è in volo il bottone resta spento anche se si sceglie un’altra destinazione', async () => {
      let sblocca: (() => void) | null = null;
      const inVolo = new Promise<void>((r) => { sblocca = r; });
      server.use(
        http.get('/api/establishment/structure', () => HttpResponse.json(ALBERO)),
        http.post('/api/establishment/umbrellas/:id/move', async () => {
          await inVolo;
          return HttpResponse.json({ id: 'u-1', label: 'A1', umbrellaTypeId: null });
        }),
      );
      const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
      asAdmin();
      await settle();
      await w.findAll('[data-testid="scene-cell"] button')[0].trigger('click');
      await settle();
      await selectOption(w.get('[data-testid="umbrella-move-position"]'), 'In coda');
      await w.get('[data-testid="umbrella-move-submit"]').trigger('click');
      await settle(); // il POST è appeso: isPending resta true
      await selectOption(w.get('[data-testid="umbrella-move-row"]'), 'Levante · Fila 2');
      expect((w.get('[data-testid="umbrella-move-submit"]').element as HTMLButtonElement).disabled).toBe(true);
      sblocca!();
      await settle();
      w.unmount();
    });

    it('il trascinamento NON notifica: la cella si è già mossa sotto gli occhi', async () => {
      const { w, posted } = await shell();
      w.findComponent(StructureScene).vm.$emit('move-umbrella', 'u-1', 'r-1', 1);
      await settle();
      expect(posted()).toEqual({ rowId: 'r-1', position: 1 });
      expect(await spostato()).toBe(false);
      w.unmount();
    });
  });
});
