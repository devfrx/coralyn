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
