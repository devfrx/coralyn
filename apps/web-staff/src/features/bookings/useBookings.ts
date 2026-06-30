import { computed, type Ref } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { BookingDTO, CreateBookingInput, SettlePaymentInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useDayBookings(date: Ref<string>) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.bookings(session.establishmentId, date.value)),
    queryFn: () => apiFetch<BookingDTO[]>(`/bookings?date=${date.value}`),
  });
}

export function useCreateBooking() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      apiFetch<BookingDTO>('/bookings', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings(session.establishmentId, session.activeDate) });
      qc.invalidateQueries({ queryKey: queryKeys.dayMap(session.establishmentId, session.activeDate) });
    },
  });
}

export function useCancelBooking() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<BookingDTO>(`/bookings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings(session.establishmentId, session.activeDate) });
      qc.invalidateQueries({ queryKey: queryKeys.dayMap(session.establishmentId, session.activeDate) });
    },
  });
}

export function useSettlePayment() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SettlePaymentInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/payment`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      // L'incasso non cambia lo stato della mappa (A1 §10): invalida solo la lista del giorno.
      qc.invalidateQueries({ queryKey: queryKeys.bookings(session.establishmentId, session.activeDate) });
    },
  });
}
