import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import OnboardingView from './OnboardingView.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

const partial = (firstIncompleteStep: string, overrides = {}) => ({
  structure: { sectors: 0, rows: 0, activeUmbrellas: 0, complete: false },
  timeSlots: { count: 0, complete: false },
  seasons: { usable: 0, complete: false },
  rates: { count: 0, hasCatchAll: false, complete: false },
  complete: false,
  firstIncompleteStep,
  ...overrides,
});

function mountAsAdmin() {
  const w = mountApp(OnboardingView);
  const session = useSessionStore();
  session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
  return w;
}

describe('OnboardingView', () => {
  afterEach(() => server.resetHandlers());

  it('lido vergine: parte dal passo structure (ripresa dal primo incompleto)', async () => {
    server.use(http.get('/api/establishment/setup-status', () => HttpResponse.json(partial('structure'))));
    const w = mountAsAdmin();
    await settle();
    expect(w.find('[data-testid="ob-step-structure"]').exists()).toBe(true);
  });

  it('configurazione a metà: riprende da rates', async () => {
    server.use(http.get('/api/establishment/setup-status', () => HttpResponse.json(partial('rates', {
      structure: { sectors: 1, rows: 1, activeUmbrellas: 5, complete: true },
      timeSlots: { count: 1, complete: true },
      seasons: { usable: 1, complete: true },
    }))));
    const w = mountAsAdmin();
    await settle();
    expect(w.find('[data-testid="ob-step-rates"]').exists()).toBe(true);
  });

  it('configurazione completa: mostra il riepilogo con le spunte', async () => {
    const w = mountAsAdmin(); // handler default: complete
    await settle();
    expect(w.find('[data-testid="ob-step-summary"]').exists()).toBe(true);
    expect(w.text()).toContain('Configurazione completa');
  });

  it('lo stepper consente di rivisitare un passo completato', async () => {
    const w = mountAsAdmin(); // complete
    await settle();
    await w.find('[data-testid="stepper-structure"]').trigger('click');
    expect(w.find('[data-testid="ob-step-structure"]').exists()).toBe(true);
  });
});
