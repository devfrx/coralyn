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
    // Il messaggio vive dentro la tabella (emptyMessage in-card), non come EmptyState esterno.
    expect(w.find('tbody').text()).toContain('Nessuna prenotazione');
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

  it('colonna Pacchetto: nome risolto da packageId, "–" se assente', async () => {
    server.use(
      http.get('/api/packages', () =>
        HttpResponse.json([{ id: 'pkg-1', name: 'Standard', equipment: [{ equipmentTypeId: 'eq-1', name: 'Lettino', quantity: 2 }] }]),
      ),
      http.get('/api/bookings', () =>
        HttpResponse.json([
          {
            id: 'bk-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1',
            startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed',
            totalPrice: 60, paymentStatus: 'unpaid', amountCollected: 0, packageId: 'pkg-1',
          },
          {
            id: 'bk-2', customerId: 'c-1', umbrellaId: 'u2', timeSlotId: 's1',
            startDate: '2026-07-15', endDate: '2026-07-15', type: 'daily', status: 'confirmed',
            totalPrice: 28, paymentStatus: 'unpaid', amountCollected: 0,
          },
        ]),
      ),
    );
    const w = mountApp(BookingsView);
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('Pacchetto'); // header colonna
    expect(w.text()).toContain('Standard'); // risolto per bk-1
    // bk-2 non ha packageId: la cella Pacchetto rende il segnaposto '–'.
    const bk2Row = w.findAll('tbody tr').find((r) => !r.text().includes('Standard'));
    expect(bk2Row).toBeDefined();
    expect(bk2Row!.text()).toContain('–');
  });

  it('ombrellone RITIRATO: label storica risolta dalla lista retired + badge "Ritirato" (D-060)', async () => {
    server.use(
      http.get('/api/establishment/umbrellas/retired', () =>
        HttpResponse.json([{ id: 'o-rit', label: 'R7', umbrellaTypeId: null, retiredAt: '2026-06-27T10:00:00.000Z', retiredFrom: 'Centro · Fila 1' }]),
      ),
      http.get('/api/bookings', () =>
        HttpResponse.json([
          {
            id: 'bk-1', customerId: 'c-1', umbrellaId: 'o-rit', timeSlotId: 's1',
            startDate: '2026-07-10', endDate: '2026-07-10', type: 'daily', status: 'confirmed',
            totalPrice: 28, paymentStatus: 'paid', amountCollected: 28,
          },
        ]),
      ),
    );
    const w = mountApp(BookingsView);
    await flushPromises();
    await tick();
    await flushPromises();
    const cell = w.findAll('tbody td').find((td) => td.text().includes('R7'));
    expect(cell).toBeDefined();
    expect(cell!.text()).toContain('Ritirato');
  });

  it('colonna Tipo: etichetta IT dal type; Periodo mostra il range per periodic/subscription', async () => {
    server.use(
      http.get('/api/bookings', () =>
        HttpResponse.json([
          {
            id: 'bk-1', customerId: 'c-1', umbrellaId: 'u1', timeSlotId: 's1',
            startDate: '2026-07-24', endDate: '2026-07-26', type: 'periodic', status: 'confirmed',
            totalPrice: 84, paymentStatus: 'unpaid', amountCollected: 0,
          },
          {
            id: 'bk-2', customerId: 'c-1', umbrellaId: 'u2', timeSlotId: 's1',
            startDate: '2026-05-01', endDate: '2026-09-30', type: 'subscription', status: 'confirmed',
            totalPrice: 800, paymentStatus: 'unpaid', amountCollected: 0,
          },
        ]),
      ),
    );
    const w = mountApp(BookingsView);
    await flushPromises();
    await tick();
    await flushPromises();
    expect(w.text()).toContain('Periodica');
    expect(w.text()).toContain('Abbonamento');
    expect(w.text()).toContain('2026-07-24 → 2026-07-26'); // range periodica
  });
});
