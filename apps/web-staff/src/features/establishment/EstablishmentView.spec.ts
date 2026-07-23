import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import { useToasts } from '@/lib/toasts';
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
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

  it('admin: mostra «Configura» attivo (struttura) e il logout', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    expect(w.find('[data-testid="configure-structure"]').exists()).toBe(true);
    await w.find('[data-testid="sign-out"]').trigger('click');
    expect(session.authenticated).toBe(false);
  });

  it('staff: la struttura resta "in arrivo"', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    expect(w.text()).toContain('Configura · in arrivo');
    expect(w.find('[data-testid="configure-structure"]').exists()).toBe(false);
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
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="edit-establishment"]').trigger('click');
    await settle();
    // Il modale è teleportato (DialogPortal): leggiamo i nodi da document.body.
    const input = document.querySelector('[data-testid="establishment-name-input"]') as HTMLInputElement;
    input.value = 'Nuovo Nome Lido';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('#form-rename-establishment') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(seen).toContain('Nuovo Nome Lido');
    w.unmount();
  });

  it('staff: nessun bottone «Modifica» attivo (resta "in arrivo")', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    expect(w.find('[data-testid="edit-establishment"]').exists()).toBe(false);
    expect(w.text()).toContain('Modifica · in arrivo');
  });

  it('admin: «Aggiungi utente» invia l\'invito (senza password) e mostra il toast', async () => {
    const seen: Array<{ email: string; role: string; hasPassword: boolean }> = [];
    server.use(http.post('/api/establishment/users', async ({ request }) => {
      const b = (await request.json()) as { email: string; role: 'admin' | 'staff'; password?: string };
      seen.push({ email: b.email, role: b.role, hasPassword: 'password' in b });
      return HttpResponse.json({ id: 'u-new', email: b.email, role: b.role, disabledAt: null }, { status: 201 });
    }));
    const w = mountApp(EstablishmentView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="add-user"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="new-user-email"]') as HTMLInputElement).value = 'nuovo@lido.it';
    (document.querySelector('[data-testid="new-user-email"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('#form-add-user') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(seen).toEqual([{ email: 'nuovo@lido.it', role: 'staff', hasPassword: false }]);
    expect(useToasts().items.map((t) => t.message)).toContain('Invito inviato a nuovo@lido.it.');
    w.unmount();
  });

  it('admin: disabilita una riga del team', async () => {
    const seen: Array<{ id: string; disabled: boolean }> = [];
    server.use(http.patch('/api/establishment/users/:id', async ({ params, request }) => {
      const b = (await request.json()) as { disabled: boolean };
      seen.push({ id: params.id as string, disabled: b.disabled });
      return HttpResponse.json({ id: params.id as string, email: 'marco@lidomaestrale.it', role: 'staff', disabledAt: '2026-07-04T10:00:00.000Z' });
    }));
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    const row = w.findAll('[data-testid="team-row"]').find((r) => r.text().includes('marco@lidomaestrale.it'))!;
    await row.find('[data-testid="toggle-user-disabled"]').trigger('click');
    await settle();
    expect(seen).toEqual([{ id: 'u-2', disabled: true }]);
  });

  it('staff: lista team read-only (nessun bottone gestione)', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    expect(w.find('[data-testid="add-user"]').exists()).toBe(false);
    expect(w.find('[data-testid="toggle-user-disabled"]').exists()).toBe(false);
  });

  it('mostra lo stato "Disabilitato" per i membri disabilitati', async () => {
    server.use(http.get('/api/establishment/overview', () =>
      HttpResponse.json({
        establishment: { id: 'e-1', name: 'Lido Maestrale' },
        activeSeason: null,
        timeSlots: [{ id: 'ts-1', name: 'Giornata' }],
        structure: { sectors: 0, umbrellas: 0, types: 0, packages: 0 },
        team: [
          { id: 'u-1', email: 'admin@coralyn.dev', role: 'admin', disabledAt: null },
          { id: 'u-2', email: 'marco@lidomaestrale.it', role: 'staff', disabledAt: '2026-07-04T10:00:00.000Z' },
        ],
      })));
    const w = mountApp(EstablishmentView);
    await settle();
    const row = w.findAll('[data-testid="team-row"]').find((r) => r.text().includes('marco@lidomaestrale.it'))!;
    expect(row.text()).toContain('Disabilitato');
  });

  it('admin: riabilita una riga disabilitata (PATCH disabled:false)', async () => {
    server.use(http.get('/api/establishment/overview', () =>
      HttpResponse.json({
        establishment: { id: 'e-1', name: 'Lido Maestrale' },
        activeSeason: null,
        timeSlots: [{ id: 'ts-1', name: 'Giornata' }],
        structure: { sectors: 0, umbrellas: 0, types: 0, packages: 0 },
        team: [
          { id: 'u-1', email: 'admin@coralyn.dev', role: 'admin', disabledAt: null },
          { id: 'u-2', email: 'marco@lidomaestrale.it', role: 'staff', disabledAt: '2026-07-04T10:00:00.000Z' },
        ],
      })));
    const seen: Array<{ id: string; disabled: boolean }> = [];
    server.use(http.patch('/api/establishment/users/:id', async ({ params, request }) => {
      const b = (await request.json()) as { disabled: boolean };
      seen.push({ id: params.id as string, disabled: b.disabled });
      return HttpResponse.json({ id: params.id as string, email: 'marco@lidomaestrale.it', role: 'staff', disabledAt: null });
    }));
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    const row = w.findAll('[data-testid="team-row"]').find((r) => r.text().includes('marco@lidomaestrale.it'))!;
    expect(row.find('[data-testid="toggle-user-disabled"]').text()).toContain('Riabilita');
    await row.find('[data-testid="toggle-user-disabled"]').trigger('click');
    await settle();
    expect(seen).toEqual([{ id: 'u-2', disabled: false }]);
  });

  it('admin: il modale create resta aperto in caso di 409', async () => {
    server.use(http.post('/api/establishment/users', () =>
      HttpResponse.json({ message: 'Email già in uso' }, { status: 409 })));
    const w = mountApp(EstablishmentView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    await w.find('[data-testid="add-user"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="new-user-email"]') as HTMLInputElement).value = 'esistente@lido.it';
    (document.querySelector('[data-testid="new-user-email"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('#form-add-user') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(document.querySelector('[data-testid="new-user-email"]')).not.toBeNull();
    w.unmount();
  });

  it('admin: «Reset password» su un membro apre la conferma e invia il reset con toast', async () => {
    const seen: string[] = [];
    server.use(http.post('/api/establishment/users/:id/reset-password', ({ params }) => {
      seen.push(params.id as string);
      return HttpResponse.json({ email: 'marco@lidomaestrale.it', expiresAt: '2026-07-08T10:00:00.000Z' });
    }));
    const w = mountApp(EstablishmentView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    const row = w.findAll('[data-testid="team-row"]').find((r) => r.text().includes('marco@lidomaestrale.it'))!;
    await row.find('[data-testid="reset-user-password"]').trigger('click');
    await settle();
    Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Invia link di reset')!.click();
    await settle();
    expect(seen).toEqual(['u-2']);
    expect(useToasts().items.map((t) => t.message)).toContain('Link di reset inviato a marco@lidomaestrale.it.');
    w.unmount();
  });

  it('staff: nessun bottone «Reset password»', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    expect(w.find('[data-testid="reset-user-password"]').exists()).toBe(false);
  });

  it('admin con setup incompleto: Callout con CTA verso /onboarding', async () => {
    server.use(http.get('/api/establishment/setup-status', () => HttpResponse.json({
      structure: { sectors: 0, rows: 0, activeUmbrellas: 0, complete: false },
      timeSlots: { count: 0, complete: false },
      seasons: { usable: 0, complete: false },
      rates: { count: 0, hasCatchAll: false, complete: false },
      complete: false, firstIncompleteStep: 'structure',
    })));
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    expect(w.find('[data-testid="setup-callout"]').exists()).toBe(true);
    expect(w.find('[data-testid="open-onboarding"]').exists()).toBe(true);
  });

  it('admin con setup completo: niente Callout, resta il link permanente', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    expect(w.find('[data-testid="setup-callout"]').exists()).toBe(false);
    expect(w.find('[data-testid="open-onboarding"]').exists()).toBe(true);
  });

  it('staff: nessun elemento onboarding', async () => {
    const w = mountApp(EstablishmentView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
    await settle();
    expect(w.find('[data-testid="setup-callout"]').exists()).toBe(false);
    expect(w.find('[data-testid="open-onboarding"]').exists()).toBe(false);
  });
});
