import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import CustomerAccessCard from './CustomerAccessCard.vue';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRMOCK') } }));

function mockStatus(state: string, lastActivatedAt: string | null = null) {
  server.use(
    http.get('/api/bookings/:id/customer-access', () => HttpResponse.json({ state, lastActivatedAt })),
  );
}

async function settle() {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

describe('CustomerAccessCard', () => {
  it("stato 'none' → badge «Mai generato», bottone «Genera accesso», niente «Revoca»", async () => {
    mockStatus('none');
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: true } });
    await settle();
    expect(w.find('[data-testid="access-state"]').text()).toContain('Mai generato');
    expect(w.text()).toContain('Genera accesso');
    expect(w.find('[data-testid="access-revoke"]').exists()).toBe(false);
  });

  it("stato 'active' → badge «Attivo», bottone «Rigenera» + «Revoca»", async () => {
    mockStatus('active', '2026-07-01T09:00:00.000Z');
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: true } });
    await settle();
    expect(w.find('[data-testid="access-state"]').text()).toContain('Attivo');
    expect(w.text()).toContain('Rigenera');
    expect(w.find('[data-testid="access-revoke"]').exists()).toBe(true);
  });

  it('non-admin → nessun bottone azione (solo stato)', async () => {
    mockStatus('active', '2026-07-01T09:00:00.000Z');
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: false } });
    await settle();
    expect(w.find('[data-testid="access-generate"]').exists()).toBe(false);
    expect(w.find('[data-testid="access-revoke"]').exists()).toBe(false);
    expect(w.find('[data-testid="access-state"]').text()).toContain('Attivo');
  });

  // Il router non ri-crea CustomerDetailView quando cambia solo :id, e la card sta dietro un
  // v-if su un id sempre truthy: il componente viene PATCHATO, non rimontato. Se l'id fosse letto
  // per valore in setup, generazione e revoca resterebbero puntate sull'abbonamento precedente —
  // cioe' l'operatore vedrebbe QR e PIN di un altro bagnante (AUD-009).
  it('cambiando bookingId, stato e azioni seguono il nuovo abbonamento', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/bookings/:id/customer-access', ({ params }) => {
        seen.push(`GET:${String(params.id)}`);
        return HttpResponse.json({ state: 'none', lastActivatedAt: null });
      }),
      http.post('/api/bookings/:id/customer-access', ({ params }) => {
        seen.push(`POST:${String(params.id)}`);
        return HttpResponse.json({ activationUrl: '/attiva?token=z', pin: '111222', expiresAt: '2026-08-01T00:00:00.000Z' });
      }),
    );
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: true } });
    await settle();
    await w.setProps({ bookingId: 'b2' });
    await settle();
    await w.find('[data-testid="access-generate"]').trigger('click');
    await settle();

    expect(seen).toContain('GET:b2');
    expect(seen).toContain('POST:b2');
    expect(seen).not.toContain('POST:b1');
  });

  it('«Genera accesso» emette provisioned con la response', async () => {
    mockStatus('none');
    server.use(
      http.post('/api/bookings/:id/customer-access', () =>
        HttpResponse.json({ activationUrl: '/attiva?token=z', pin: '111222', expiresAt: '2026-08-01T00:00:00.000Z' }),
      ),
    );
    const w = mountApp(CustomerAccessCard, { props: { bookingId: 'b1', isAdmin: true } });
    await settle();
    await w.find('[data-testid="access-generate"]').trigger('click');
    await settle();
    expect(w.emitted('provisioned')?.[0]?.[0]).toMatchObject({ pin: '111222' });
  });
});
