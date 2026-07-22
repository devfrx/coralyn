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
});
