import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import StepRates from './StepRates.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

const STATUS = (overrides: Partial<SetupStatusDTO['rates']> = {}): SetupStatusDTO => ({
  structure: { sectors: 1, rows: 1, activeUmbrellas: 1, complete: true },
  timeSlots: { count: 1, complete: true },
  seasons: { usable: 1, complete: true },
  rates: { count: 0, hasCatchAll: false, complete: false, ...overrides },
  complete: false,
  firstIncompleteStep: 'rates',
});

function mountAsAdmin(status: SetupStatusDTO) {
  const w = mountApp(StepRates, { props: { status } });
  const session = useSessionStore();
  session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
  return w;
}

describe('StepRates', () => {
  afterEach(() => server.resetHandlers());

  it('con una sola stagione usable selezionata, il submit POSTa /api/rates con { seasonId, price } (nessuna dimensione)', async () => {
    const seen: unknown[] = [];
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([])),
      http.post('/api/rates', async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({ id: 'r-1', seasonId: 's-1', price: 25 });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-rate-price"]').setValue('25');
    await w.find('[data-testid="ob-rate-save"]').trigger('submit');
    await settle();
    expect(seen[0]).toEqual({ seasonId: 's-1', price: 25 });
  });

  it('dopo il successo, il prezzo viene resettato al default', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([])),
      http.post('/api/rates', async ({ request }) => {
        await request.json();
        return HttpResponse.json({ id: 'r-1', seasonId: 's-1', price: 25 });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-rate-price"]').setValue('25');
    await w.find('[data-testid="ob-rate-save"]').trigger('submit');
    await settle();
    expect((w.find('[data-testid="ob-rate-price"]').element as HTMLInputElement).value).toBe('');
  });

  it('con una sola stagione usable, il selettore stagione ob-rate-season non compare', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([])),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    expect(w.find('[data-testid="ob-rate-season"]').exists()).toBe(false);
  });

  it('con più stagioni usable compare ob-rate-season, con la prima usable selezionata di default', async () => {
    const seen: unknown[] = [];
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
        { id: 's-2', name: 'Estate 2027', startDate: '2027-05-01', endDate: '2027-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([])),
      http.post('/api/rates', async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({ id: 'r-1', seasonId: 's-1', price: 25 });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    expect(w.find('[data-testid="ob-rate-season"]').exists()).toBe(true);
    await w.find('[data-testid="ob-rate-price"]').setValue('25');
    await w.find('[data-testid="ob-rate-save"]').trigger('submit');
    await settle();
    expect(seen[0]).toEqual({ seasonId: 's-1', price: 25 });
  });

  it('non elenca le stagioni non usable (endDate nel passato) né come default né nel selettore', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-old', name: 'Estate 2020', startDate: '2020-05-01', endDate: '2020-09-30' },
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2099-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([])),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    expect(w.find('[data-testid="ob-rate-season"]').exists()).toBe(false);
  });

  it('elenca le tariffe esistenti della stagione (conteggio + formatEuro)', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([
        { id: 'r-1', seasonId: 's-1', price: 25 },
      ])),
    );
    const w = mountAsAdmin(STATUS({ count: 1 }));
    await settle();
    expect(w.text()).toContain('€ 25.00');
  });

  it('Callout ob-no-catchall assente quando status.rates.count è 0', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([])),
    );
    const w = mountAsAdmin(STATUS({ count: 0, hasCatchAll: false }));
    await settle();
    expect(w.find('[data-testid="ob-no-catchall"]').exists()).toBe(false);
  });

  it('Callout ob-no-catchall visibile quando count > 0 e hasCatchAll è false', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([
        { id: 'r-1', seasonId: 's-1', price: 25, sectorId: 'sec-1' },
      ])),
    );
    const w = mountAsAdmin(STATUS({ count: 1, hasCatchAll: false }));
    await settle();
    expect(w.find('[data-testid="ob-no-catchall"]').exists()).toBe(true);
  });

  it('Callout ob-no-catchall assente quando count > 0 e hasCatchAll è true', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([
        { id: 'r-1', seasonId: 's-1', price: 25 },
      ])),
    );
    const w = mountAsAdmin(STATUS({ count: 1, hasCatchAll: true }));
    await settle();
    expect(w.find('[data-testid="ob-no-catchall"]').exists()).toBe(false);
  });

  it('ob-rates-next è disabilitato se status.rates.complete è false', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([])),
    );
    const w = mountAsAdmin(STATUS({ complete: false }));
    await settle();
    expect((w.find('[data-testid="ob-rates-next"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('ob-rates-next emette next quando status.rates.complete è true', async () => {
    server.use(
      http.get('/api/seasons', () => HttpResponse.json([
        { id: 's-1', name: 'Estate 2026', startDate: '2026-05-01', endDate: '2026-09-30' },
      ])),
      http.get('/api/rates', () => HttpResponse.json([
        { id: 'r-1', seasonId: 's-1', price: 25 },
      ])),
    );
    const w = mountAsAdmin(STATUS({ count: 1, hasCatchAll: true, complete: true }));
    await settle();
    const next = w.find('[data-testid="ob-rates-next"]');
    expect((next.element as HTMLButtonElement).disabled).toBe(false);
    await next.trigger('click');
    expect(w.emitted('next')).toBeTruthy();
  });
});
