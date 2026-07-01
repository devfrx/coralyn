import { computed, type Ref } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { BookingDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** Abbonati della stagione che contiene `date` (campagna rinnovi). */
export function useSubscriptions(date: Ref<string>) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.subscriptions(session.establishmentId, date.value)),
    queryFn: () => apiFetch<SubscriptionListItemDTO[]>(`/bookings/subscriptions?date=${date.value}`),
    enabled: computed(() => !!date.value),
  });
}

/** Rinnova un abbonamento nella stagione di destinazione (`startDate`). */
export function useRenewBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, startDate }: { id: string; startDate: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/renew`, { method: 'POST', body: JSON.stringify({ startDate }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['map'] });
    },
  });
}
