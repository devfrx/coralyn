import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import EstablishmentView from './EstablishmentView.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('EstablishmentView', () => {
  afterEach(() => server.resetHandlers());

  it('rende nome, conteggi struttura, fasce e righe team dai dati reali', async () => {
    const w = mountApp(EstablishmentView);
    await settle();
    expect(w.text()).toContain('Lido Maestrale');
    expect(w.text()).toContain('41');
    expect(w.text()).toContain('Giornata · Mattina · Pomeriggio');
    expect(w.text()).toContain('marco@lidomaestrale.it');
    expect(w.text()).toContain('Estate 2026');
  });

  it('marca "Tu" solo sull\'utente corrente', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    const rows = w.findAll('[data-testid="team-row"]');
    const mine = rows.find((r) => r.text().includes('admin@coralyn.dev'));
    const other = rows.find((r) => r.text().includes('marco@lidomaestrale.it'));
    expect(mine!.text()).toContain('Tu');
    expect(other!.text()).not.toContain('Tu');
  });

  it('senza stagione attiva mostra l\'empty-state', async () => {
    server.use(http.get('/api/establishment/overview', () =>
      HttpResponse.json({
        establishment: { id: 'e-1', name: 'Lido Maestrale' },
        activeSeason: null,
        timeSlots: [{ id: 'ts-1', name: 'Giornata' }],
        structure: { sectors: 0, umbrellas: 0, types: 0, packages: 0 },
        team: [],
      })));
    const w = mountApp(EstablishmentView);
    await settle();
    expect(w.text()).toContain('Nessuna stagione attiva');
  });

  it('espone le affordance "in arrivo" e il logout', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    expect(w.text()).toContain('in arrivo');
    await w.find('[data-testid="sign-out"]').trigger('click');
    expect(session.authenticated).toBe(false);
  });

  it('su errore di rete mostra il banner d\'errore', async () => {
    server.use(http.get('/api/establishment/overview', () => HttpResponse.error()));
    const w = mountApp(EstablishmentView);
    await settle();
    expect(w.text()).toContain('Impossibile caricare i dati dello stabilimento');
  });

  it('admin: apre il modale «Modifica» e invia la rinomina', async () => {
    const seen: string[] = [];
    server.use(http.patch('/api/establishment', async ({ request }) => {
      const b = (await request.json()) as { name: string };
      seen.push(b.name);
      return HttpResponse.json({ id: 'e-1', name: b.name });
    }));
    const w = mountApp(EstablishmentView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="edit-establishment"]').trigger('click');
    await settle();
    // Il modale è teleportato (DialogPortal): leggiamo i nodi da document.body.
    const input = document.querySelector('[data-testid="establishment-name-input"]') as HTMLInputElement;
    input.value = 'Nuovo Nome Lido';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-testid="establishment-name-save"]') as HTMLButtonElement).click();
    await settle();
    expect(seen).toContain('Nuovo Nome Lido');
    w.unmount();
  });

  it('staff: nessun bottone «Modifica» attivo (resta "in arrivo")', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="edit-establishment"]').exists()).toBe(false);
    expect(w.text()).toContain('Modifica · in arrivo');
  });
});
