import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import StepStructure from './StepStructure.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

const STATUS = (overrides: Partial<SetupStatusDTO['structure']> = {}): SetupStatusDTO => ({
  structure: { sectors: 0, rows: 0, activeUmbrellas: 0, complete: false, ...overrides },
  timeSlots: { count: 0, complete: false },
  seasons: { usable: 0, complete: false },
  rates: { count: 0, hasCatchAll: false, complete: false },
  complete: false,
  firstIncompleteStep: 'structure',
});

function mountAsAdmin(status: SetupStatusDTO) {
  const w = mountApp(StepStructure, { props: { status } });
  const session = useSessionStore();
  session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
  return w;
}

describe('StepStructure', () => {
  afterEach(() => server.resetHandlers());

  it('struttura vuota: mostra il form settore; il POST parte con name e kind', async () => {
    const seen: unknown[] = [];
    server.use(
      http.get('/api/establishment/structure', () => HttpResponse.json({ sectors: [], umbrellaTypes: [] })),
      http.post('/api/establishment/sectors', async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({ id: 's-1', name: 'Centro', sortOrder: 0, kind: 'grid', rows: [] });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-sector-name"]').setValue('Centro');
    await w.find('[data-testid="ob-sector-save"]').trigger('submit');
    await settle();
    expect(seen[0]).toEqual({ name: 'Centro', kind: 'grid' });
  });

  it('con settore senza file: mostra il form fila legato al settore', async () => {
    const seen: unknown[] = [];
    server.use(
      http.get('/api/establishment/structure', () => HttpResponse.json({
        sectors: [{ id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [] }],
        umbrellaTypes: [],
      })),
      http.post('/api/establishment/rows', async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({ id: 'r-1', label: 'Fila 1', sortOrder: 0, umbrellas: [] });
      }),
    );
    const w = mountAsAdmin(STATUS({ sectors: 1 }));
    await settle();
    expect(w.find('[data-testid="ob-row-sector"]').exists()).toBe(true);
    await w.find('[data-testid="ob-row-label"]').setValue('Fila 1');
    await w.find('[data-testid="ob-row-save"]').trigger('submit');
    await settle();
    expect(seen[0]).toEqual({ sectorId: 's-1', label: 'Fila 1' });
  });

  it('con fila: rende il generatore (gen-form) per la fila selezionata', async () => {
    server.use(
      http.get('/api/establishment/structure', () => HttpResponse.json({
        sectors: [{ id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
          { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] },
        ] }],
        umbrellaTypes: [],
      })),
    );
    const w = mountAsAdmin(STATUS({ sectors: 1, rows: 1 }));
    await settle();
    expect(w.find('[data-testid="gen-form"]').exists()).toBe(true);
  });

  it('emette next dal bottone continua quando status.structure.complete', async () => {
    server.use(
      http.get('/api/establishment/structure', () => HttpResponse.json({
        sectors: [{ id: 's-1', name: 'Centro', sortOrder: 1, kind: 'grid', rows: [
          { id: 'r-1', label: 'Fila 1', sortOrder: 1, umbrellas: [] },
        ] }],
        umbrellaTypes: [],
      })),
    );
    const w = mountAsAdmin(STATUS({ sectors: 1, rows: 1, activeUmbrellas: 1, complete: true }));
    await settle();
    await w.find('[data-testid="ob-structure-next"]').trigger('click');
    expect(w.emitted('next')).toBeTruthy();
  });
});
