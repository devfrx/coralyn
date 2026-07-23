import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import StepSeasons from './StepSeasons.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

const STATUS = (overrides: Partial<SetupStatusDTO['seasons']> = {}): SetupStatusDTO => ({
  structure: { sectors: 1, rows: 1, activeUmbrellas: 1, complete: true },
  timeSlots: { count: 1, complete: true },
  seasons: { usable: 0, complete: false, ...overrides },
  rates: { count: 0, hasCatchAll: false, complete: false },
  complete: false,
  firstIncompleteStep: 'seasons',
});

function mountAsAdmin(status: SetupStatusDTO) {
  const w = mountApp(StepSeasons, { props: { status } });
  const session = useSessionStore();
  session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
  return w;
}

describe('StepSeasons', () => {
  afterEach(() => server.resetHandlers());

  it('elenca le stagioni esistenti', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    expect(w.text()).toContain('Estate 2026');
  });

  it('il submit del form POSTa /api/seasons con name, startDate, endDate', async () => {
    const seen: unknown[] = [];
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([])),
      http.post('/api/seasons', async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({ id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-season-name"]').setValue('Estate 2026');
    await w.find('[data-testid="ob-season-start"]').setValue('2026-05-01');
    await w.find('[data-testid="ob-season-end"]').setValue('2026-09-30');
    await w.find('[data-testid="ob-season-save"]').trigger('submit');
    await settle();
    expect(seen[0]).toEqual({ name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' });
  });

  it('dopo il successo, il form viene resettato ai default', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([])),
      http.post('/api/seasons', async ({ request }) => {
        await request.json();
        return HttpResponse.json({ id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-season-name"]').setValue('Estate 2026');
    await w.find('[data-testid="ob-season-start"]').setValue('2026-05-01');
    await w.find('[data-testid="ob-season-end"]').setValue('2026-09-30');
    await w.find('[data-testid="ob-season-save"]').trigger('submit');
    await settle();
    expect((w.find('[data-testid="ob-season-name"]').element as HTMLInputElement).value).toBe('');
    expect((w.find('[data-testid="ob-season-start"]').element as HTMLInputElement).value).toBe('');
    expect((w.find('[data-testid="ob-season-end"]').element as HTMLInputElement).value).toBe('');
  });

  it('avviso data passata: assente quando la endDate digitata non è nel passato', async () => {
    server.use(http.get('/api/seasons', () => HttpResponse.json([])));
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-season-end"]').setValue('2099-09-30');
    await settle();
    expect(w.find('[data-testid="ob-season-past-warning"]').exists()).toBe(false);
  });

  it('avviso data passata: visibile quando la endDate digitata è precedente a oggi, e non blocca il submit', async () => {
    const seen: unknown[] = [];
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([])),
      http.post('/api/seasons', async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({ id: 's-1', name: 'Stagione storica', startDate: '2020-05-01', endDate: '2020-09-30' });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-season-name"]').setValue('Stagione storica');
    await w.find('[data-testid="ob-season-start"]').setValue('2020-05-01');
    await w.find('[data-testid="ob-season-end"]').setValue('2020-09-30');
    await settle();
    expect(w.find('[data-testid="ob-season-past-warning"]').exists()).toBe(true);
    await w.find('[data-testid="ob-season-save"]').trigger('submit');
    await settle();
    expect(seen[0]).toEqual({ name: 'Stagione storica', startDate: '2020-05-01', endDate: '2020-09-30' });
  });

  it('ob-seasons-next è disabilitato se status.seasons.complete è false', async () => {
    server.use(http.get('/api/seasons', () => HttpResponse.json([])));
    const w = mountAsAdmin(STATUS({ complete: false }));
    await settle();
    expect((w.find('[data-testid="ob-seasons-next"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('ob-seasons-next emette next quando status.seasons.complete è true', async () => {
    server.use(http.get('/api/seasons', () => HttpResponse.json([
      { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
    ])));
    const w = mountAsAdmin(STATUS({ usable: 1, complete: true }));
    await settle();
    const next = w.find('[data-testid="ob-seasons-next"]');
    expect((next.element as HTMLButtonElement).disabled).toBe(false);
    await next.trigger('click');
    expect(w.emitted('next')).toBeTruthy();
  });
});
