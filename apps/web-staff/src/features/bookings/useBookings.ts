import { type Ref } from 'vue';
import type { BookingDTO, CreateBookingInput, SettlePaymentInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useDayBookings(date: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.bookings(session.establishmentId, date.value),
    queryFn: () => apiFetch<BookingDTO[]>(`/bookings?date=${date.value}`),
  });
}

export function useCreateBooking() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateBookingInput) =>
      apiFetch<BookingDTO>('/bookings', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [
      queryKeys.bookings(session.establishmentId, session.activeDate),
      queryKeys.dayMap(session.establishmentId, session.activeDate),
    ],
  });
}

export function useCancelBooking() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<BookingDTO>(`/bookings/${id}`, { method: 'DELETE' }),
    invalidates: () => [
      queryKeys.bookings(session.establishmentId, session.activeDate),
      queryKeys.dayMap(session.establishmentId, session.activeDate),
    ],
  });
}

export function useSettlePayment() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: SettlePaymentInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/payment`, { method: 'PATCH', body: JSON.stringify(input) }),
    // L'incasso non cambia lo stato della mappa (A1 §10): invalida solo la lista del giorno.
    invalidates: () => [queryKeys.bookings(session.establishmentId, session.activeDate)],
  });
}
