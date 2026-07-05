import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import EstablishmentDetailView from './EstablishmentDetailView.vue';
import { mountApp } from '@/test/utils';
import { resetPlatformSeed } from '@/mocks/server';

vi.mock('vue-router', async (orig) => ({ ...(await orig<any>()), useRoute: () => ({ params: { id: 'e-1' } }) }));

const settle = async () => {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
};

beforeEach(() => resetPlatformSeed());

describe('EstablishmentDetailView', () => {
  it('mostra nome e metriche del lido', async () => {
    const w = mountApp(EstablishmentDetailView, { attachTo: document.body });
    await settle();
    expect(w.find('[data-testid="detail-name"]').text()).toContain('Lido Alpha');
    expect(w.find('[data-testid="detail-status"]').text()).toContain('Attivo');
    expect(w.html()).toContain('40'); // ombrelloni
    expect(w.html()).toContain('55'); // occupazione oggi %
    w.unmount();
  });

  it('id inesistente → messaggio "non trovato"', async () => {
    const { server } = await import('@/mocks/server');
    const { http, HttpResponse } = await import('msw');
    server.use(http.get('/api/platform/establishments/:id', () => new HttpResponse(null, { status: 404 })));

    const w = mountApp(EstablishmentDetailView, { attachTo: document.body });
    await settle();
    expect(w.html()).toMatch(/non trovato/i);
    w.unmount();
  });

  it('reset password admin: conferma → invia invito e mostra toast di successo', async () => {
    const { useToasts, clearToasts } = await import('@/lib/toasts');
    clearToasts();
    const toasts = useToasts();
    const w = mountApp(EstablishmentDetailView, { attachTo: document.body });
    await settle();

    await w.find('[data-testid="reset-admin"]').trigger('click');
    await settle();

    const confirmBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Invia invito di reset'));
    expect(confirmBtn).toBeTruthy();
    confirmBtn!.click();
    await settle();

    expect(toasts.items.some((t) => t.message.includes('Invito di reset inviato a admin@lido.test'))).toBe(true);
    w.unmount();
  });
});
