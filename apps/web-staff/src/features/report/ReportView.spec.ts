import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { http, HttpResponse } from 'msw';
import ReportView from './ReportView.vue';

const stubs = { VChart: { name: 'VChart', props: ['option'], template: '<div />' } };

describe('ReportView', () => {
  afterEach(() => server.resetHandlers());

  it('mostra i KPI dai dati reali, incluso "Da incassare" (via "Presenze")', async () => {
    const w = mountApp(ReportView, { global: { stubs } });
    await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises();
    expect(w.text()).toContain('Da incassare');
    expect(w.text()).not.toContain('Presenze');
    expect(w.text()).toContain('64'); // abbonamenti attivi
  });

  it('cambiando periodo ri-interroga l\'endpoint', async () => {
    const seen: string[] = [];
    server.use(http.get('/api/reports/summary', ({ request }) => {
      const p = new URL(request.url).searchParams.get('period') ?? 'week';
      seen.push(p);
      return HttpResponse.json({ period: p, kpis: { revenue: 0, outstanding: 0, occupancyPct: 0, activeSubscriptions: 0 }, revenueSeries: [], umbrellaStateMix: [], expiringRenewals: [] });
    }));
    const w = mountApp(ReportView, { global: { stubs } });
    await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises();
    const seasonBtn = w.findAll('button').find((b) => b.text().includes('Stagione'));
    await seasonBtn!.trigger('click');
    await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises();
    expect(seen).toContain('season');
  });

  it('senza scadenze mostra un empty-state, non righe', async () => {
    server.use(http.get('/api/reports/summary', () =>
      HttpResponse.json({ period: 'week', kpis: { revenue: 0, outstanding: 0, occupancyPct: 0, activeSubscriptions: 0 }, revenueSeries: [], umbrellaStateMix: [], expiringRenewals: [] })));
    const w = mountApp(ReportView, { global: { stubs } });
    await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises();
    expect(w.text()).toContain('Nessun abbonamento in scadenza');
  });
});
