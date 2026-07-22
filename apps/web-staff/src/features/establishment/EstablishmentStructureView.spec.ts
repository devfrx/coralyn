import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import EstablishmentStructureView from './EstablishmentStructureView.vue';
import { STRUCTURE_FIXTURE } from './structure.fixtures';

const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { await flushPromises(); await tick(); await flushPromises(); };
const useFixture = () => server.use(http.get('/api/establishment/structure', () => HttpResponse.json(STRUCTURE_FIXTURE)));

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
});
