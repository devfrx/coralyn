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

  it('admin: crea un settore (nome + disposizione)', async () => {
    const seen: Array<{ name: string; kind: string }> = [];
    server.use(http.post('/api/establishment/sectors', async ({ request }) => {
      const b = (await request.json()) as { name: string; kind: string };
      seen.push(b);
      return HttpResponse.json({ id: 'sec-new', name: b.name, sortOrder: 9, kind: b.kind, rows: [] }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-sector"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="sector-name"]') as HTMLInputElement).value = 'Ponente';
    (document.querySelector('[data-testid="sector-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    const kind = document.querySelector('[data-testid="sector-kind"]') as HTMLSelectElement;
    kind.value = 'special';
    kind.dispatchEvent(new Event('change'));
    (document.querySelector('[data-testid="sector-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ name: 'Ponente', kind: 'special' }]);
    w.unmount();
  });

  it('admin: rinomina un settore', async () => {
    const seen: Array<{ id: string; name?: string }> = [];
    server.use(http.patch('/api/establishment/sectors/:id', async ({ params, request }) => {
      const b = (await request.json()) as { name?: string };
      seen.push({ id: params.id as string, name: b.name });
      return HttpResponse.json({ id: params.id as string, name: b.name ?? 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="edit-sector"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="sector-name"]') as HTMLInputElement).value = 'Centro Mare';
    (document.querySelector('[data-testid="sector-name"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="sector-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ id: 'sec-1', name: 'Centro Mare' }]);
    w.unmount();
  });

  it('admin: elimina un settore solo dopo conferma', async () => {
    const seen: string[] = [];
    server.use(http.delete('/api/establishment/sectors/:id', ({ params }) => {
      seen.push(params.id as string);
      return HttpResponse.json({ id: params.id as string, name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="delete-sector"]').trigger('click');
    await settle();
    expect(seen).toEqual([]);
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina');
    confirmBtn!.click();
    await settle();
    expect(seen).toEqual(['sec-1']);
    w.unmount();
  });

  it('admin: crea una fila nel settore selezionato', async () => {
    const seen: Array<{ sectorId: string; label: string }> = [];
    server.use(http.post('/api/establishment/rows', async ({ request }) => {
      const b = (await request.json()) as { sectorId: string; label: string };
      seen.push(b);
      return HttpResponse.json({ id: 'row-new', label: b.label, sortOrder: 9, umbrellas: [] }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-row"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).value = 'Fila 2';
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="row-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ sectorId: 'sec-1', label: 'Fila 2' }]);
    w.unmount();
  });

  it('admin: rinomina una fila', async () => {
    const seen: Array<{ id: string; label?: string }> = [];
    server.use(http.patch('/api/establishment/rows/:id', async ({ params, request }) => {
      const b = (await request.json()) as { label?: string };
      seen.push({ id: params.id as string, label: b.label });
      return HttpResponse.json({ id: params.id as string, label: b.label ?? 'Fila 1', sortOrder: 1, umbrellas: [] });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="edit-row"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).value = 'Fila A';
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="row-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ id: 'row-1', label: 'Fila A' }]);
    w.unmount();
  });

  it('admin: elimina una fila solo dopo conferma', async () => {
    const seen: string[] = [];
    server.use(http.delete('/api/establishment/rows/:id', ({ params }) => {
      seen.push(params.id as string);
      return HttpResponse.json({ id: params.id as string, label: 'Fila 1', sortOrder: 1, umbrellas: [] });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="delete-row"]').trigger('click');
    await settle();
    expect(seen).toEqual([]);
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina');
    confirmBtn!.click();
    await settle();
    expect(seen).toEqual(['row-1']);
    w.unmount();
  });

  it('staff: editor read-only (nessun add/edit/delete di settori e file)', async () => {
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="add-sector"]').exists()).toBe(false);
    expect(w.find('[data-testid="add-row"]').exists()).toBe(false);
    expect(w.find('[data-testid="edit-sector"]').exists()).toBe(false);
    expect(w.find('[data-testid="delete-sector"]').exists()).toBe(false);
    expect(w.find('[data-testid="edit-row"]').exists()).toBe(false);
    expect(w.find('[data-testid="delete-row"]').exists()).toBe(false);
  });

  it('admin: aggiunge un ombrellone alla fila', async () => {
    const seen: Array<{ rowId: string; label: string; umbrellaTypeId: string | null }> = [];
    server.use(http.post('/api/establishment/umbrellas', async ({ request }) => {
      const b = (await request.json()) as { rowId: string; label: string; umbrellaTypeId: string | null };
      seen.push(b);
      return HttpResponse.json({ id: 'omb-new', label: b.label, umbrellaTypeId: b.umbrellaTypeId }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-umbrella"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="umbrella-label"]') as HTMLInputElement).value = '3';
    (document.querySelector('[data-testid="umbrella-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="umbrella-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ rowId: 'row-1', label: '3', umbrellaTypeId: null }]);
    w.unmount();
  });

  it('admin: modifica un ombrellone (click sul chip)', async () => {
    const seen: Array<{ id: string; label?: string }> = [];
    server.use(http.patch('/api/establishment/umbrellas/:id', async ({ params, request }) => {
      const b = (await request.json()) as { label?: string };
      seen.push({ id: params.id as string, label: b.label });
      return HttpResponse.json({ id: params.id as string, label: b.label ?? '1', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.findAll('[data-testid="umbrella-chip"]')[0].trigger('click');
    await settle();
    (document.querySelector('[data-testid="umbrella-label"]') as HTMLInputElement).value = '9';
    (document.querySelector('[data-testid="umbrella-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="umbrella-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ id: 'omb-1', label: '9' }]);
    w.unmount();
  });

  it('admin: elimina un ombrellone solo dopo conferma', async () => {
    const seen: string[] = [];
    server.use(http.delete('/api/establishment/umbrellas/:id', ({ params }) => {
      seen.push(params.id as string);
      return HttpResponse.json({ id: params.id as string, label: '1', umbrellaTypeId: null });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.findAll('[data-testid="umbrella-chip"]')[0].trigger('click');
    await settle();
    (document.querySelector('[data-testid="umbrella-delete"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([]);
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Elimina');
    confirmBtn!.click();
    await settle();
    expect(seen).toEqual(['omb-1']);
    w.unmount();
  });

  it('admin: genera ombrelloni su una fila', async () => {
    const seen: Array<{ rowId: string; prefix: string; start: number; count: number }> = [];
    server.use(http.post('/api/establishment/umbrellas/generate', async ({ request }) => {
      const b = (await request.json()) as { rowId: string; prefix: string; start: number; count: number };
      seen.push(b);
      return HttpResponse.json({ created: b.count, skipped: 0, umbrellas: [] }, { status: 201 });
    }));
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="generate-umbrellas"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="gen-prefix"]') as HTMLInputElement).value = 'P';
    (document.querySelector('[data-testid="gen-prefix"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).value = '4';
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="gen-save"]') as HTMLElement).click();
    await settle();
    expect(seen).toEqual([{ rowId: 'row-1', prefix: 'P', start: 1, count: 4, umbrellaTypeId: null }]);
    w.unmount();
  });

  it('admin: «Nuova fila» crea la fila e genera gli ombrelloni', async () => {
    const rows: Array<{ sectorId: string; label: string }> = [];
    const gens: Array<{ rowId: string; count: number }> = [];
    server.use(
      http.post('/api/establishment/rows', async ({ request }) => {
        const b = (await request.json()) as { sectorId: string; label: string };
        rows.push(b);
        return HttpResponse.json({ id: 'row-new', label: b.label, sortOrder: 9, umbrellas: [] }, { status: 201 });
      }),
      http.post('/api/establishment/umbrellas/generate', async ({ request }) => {
        const b = (await request.json()) as { rowId: string; count: number };
        gens.push({ rowId: b.rowId, count: b.count });
        return HttpResponse.json({ created: b.count, skipped: 0, umbrellas: [] }, { status: 201 });
      }),
    );
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-row"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).value = 'Fila Nuova';
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).value = '6';
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="row-save"]') as HTMLElement).click();
    await settle();
    expect(rows).toEqual([{ sectorId: 'sec-1', label: 'Fila Nuova' }]);
    expect(gens).toEqual([{ rowId: 'row-new', count: 6 }]);
    w.unmount();
  });

  it('«Nuova fila»: se il generate fallisce, la fila è creata una sola volta e la modale si chiude', async () => {
    const rows: Array<{ sectorId: string; label: string }> = [];
    server.use(
      http.post('/api/establishment/rows', async ({ request }) => {
        rows.push((await request.json()) as { sectorId: string; label: string });
        return HttpResponse.json({ id: 'row-new', label: 'Fila Z', sortOrder: 9, umbrellas: [] }, { status: 201 });
      }),
      http.post('/api/establishment/umbrellas/generate', () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
    );
    const w = mountApp(EstablishmentStructureView, { attachTo: document.body });
    const session = useSessionStore();
    session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1' };
    await settle();
    await w.find('[data-testid="add-row"]').trigger('click');
    await settle();
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).value = 'Fila Z';
    (document.querySelector('[data-testid="row-label"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).value = '3';
    (document.querySelector('[data-testid="gen-count"]') as HTMLInputElement).dispatchEvent(new Event('input'));
    (document.querySelector('[data-testid="row-save"]') as HTMLElement).click();
    await settle();
    expect(rows).toHaveLength(1);
    expect(document.querySelector('[data-testid="row-label"]')).toBeNull(); // modale chiusa
    w.unmount();
  });

  it('staff: ombrelloni non editabili (nessun chip cliccabile né Genera/Aggiungi)', async () => {
    const w = mountApp(EstablishmentStructureView);
    const session = useSessionStore();
    session.user = { id: 'u-2', email: 'marco@lidomaestrale.it', role: Role.Staff, establishmentId: 'e-1' };
    await settle();
    expect(w.find('[data-testid="umbrella-chip"]').exists()).toBe(false);
    expect(w.find('[data-testid="add-umbrella"]').exists()).toBe(false);
    expect(w.find('[data-testid="generate-umbrellas"]').exists()).toBe(false);
  });
});
