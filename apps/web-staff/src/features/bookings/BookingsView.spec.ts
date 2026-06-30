import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import BookingsView from './BookingsView.vue';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('BookingsView', () => {
  it('mostra empty-state quando non ci sono prenotazioni', async () => {
    const w = mountApp(BookingsView);
    await flushPromises();
    await tick();
    expect(w.text()).toContain('Nessuna prenotazione');
  });

  it('mostra le prenotazioni del giorno con stato pagamento', async () => {
    server.use(
      http.get('/api/bookings', () =>
        HttpResponse.json([
          {
            id: 'bk-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1',
            startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed',
            totalPrice: 28, paymentStatus: 'paid', amountCollected: 28, paymentMethod: 'cash', collectionDate: '2026-07-15',
          },
          {
            id: 'bk-2', customerId: 'c-1', umbrellaId: 'u2', timeSlotId: 's1',
            startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed',
            totalPrice: 30, paymentStatus: 'unpaid', amountCollected: 0,
          },
        ]),
      ),
    );
    const w = mountApp(BookingsView);
    await flushPromises();
    await tick();
    await flushPromises();
    // Nome cliente risolto client-side dalla query clienti (c-1 = Mario Rossi).
    expect(w.text()).toContain('Rossi');
    // Badge stato pagamento reali.
    expect(w.text()).toContain('Saldato');
    expect(w.text()).toContain('Da incassare');
  });
});
