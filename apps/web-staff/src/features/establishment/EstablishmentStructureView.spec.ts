import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import EstablishmentStructureView from './EstablishmentStructureView.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('EstablishmentStructureView', () => {
  afterEach(() => server.resetHandlers());

  it('rende contatori, albero e tipologie dai dati reali', async () => {
    const w = mountApp(EstablishmentStructureView);
    await settle();
    expect(w.text()).toContain('Struttura della spiaggia');
    expect(w.text()).toContain('Centro');
    expect(w.text()).toContain('Fila 1');
    expect(w.text()).toContain('Palma');
    expect(w.text()).toContain('Mini-palma');
  });

  it('admin: crea una tipologia', async () => {
    const seen: Array<{ name: string; icon: string }> = [];
    server.use(http.post('/api/establishment/umbrella-types', async ({ request }) => {
      const b = (await request.json()) as { name: string; icon: string };
      seen.push(b);
      return HttpResponse.json({ id: 'typ-new', name: b.name, sortOrder: 9, icon: b.icon }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-type"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="type-name"]') as HTMLInputElement).value = 'Gazebo';
    (document.querySelector('[data-testid="type-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="type-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ name: 'Gazebo', icon: 'umbrella' }]);
    w.unmount();
  });

  it('admin: elimina una tipologia solo dopo conferma nel ConfirmDialog', async () => {
    const seen: string[] = [];
    server.use(http.delete('/api/establishment/umbrella-types/:id', ({ params }) => {
      seen.push(params.id as string);
      return HttpResponse.json({ id: params.id as string, name: 'Palma', sortOrder: 1, icon: 'palmtree' });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    // Click sul cestino apre il dialog ma NON invia ancora la DELETE.
    await w.find('[data-testid="delete-type"]').trigger('click');
    await settle();
    expect(seen).toEqual([]);
    // Conferma via ConfirmDialog (teleportato nel body): bottone con testo "Elimina".
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina');
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();
    await settle();
    expect(seen).toEqual(['typ-1']);
    w.unmount();
  });

  it('staff: tipologie read-only (nessun bottone gestione)', async () => {
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="add-type"]').exists()).toBe(false);
  });
});
