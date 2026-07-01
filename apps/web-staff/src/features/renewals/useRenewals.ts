import { type Ref } from 'vue';
import type { BookingDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Abbonati della stagione che contiene `date` (campagna rinnovi). */
export function useSubscriptions(date: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.subscriptions(session.establishmentId, date.value),
    queryFn: () => apiFetch<SubscriptionListItemDTO[]>(`/bookings/subscriptions?date=${date.value}`),
    enabled: () => !!date.value,
  });
}

/** Rinnova un abbonamento nella stagione di destinazione (`startDate`). */
export function useRenewBooking() {
  return mutationResource({
    mutationFn: ({ id, startDate }: { id: string; startDate: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/renew`, { method: 'POST', body: JSON.stringify({ startDate }) }),
    // La riga diventa "Rinnovato" e il nuovo abbonamento appare nell'elenco della stagione di destinazione.
    invalidates: () => [['subscriptions'], ['map']],
  });
}
