import type { CustomerBookingDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useMySubscriptions() {
  return queryResource({
    queryKey: () => queryKeys.mySubscriptions(),
    queryFn: () => apiFetch<CustomerBookingDTO[]>('/customer/me/subscriptions'),
  });
}

export function useReleaseAbsence(bookingId: () => string) {
  return mutationResource({
    mutationFn: (input: { date: string; reason?: string }) =>
      apiFetch(`/customer/subscriptions/${bookingId()}/absence-releases`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.mySubscriptions()],
  });
}

export function useCancelRelease(bookingId: () => string) {
  return mutationResource({
    mutationFn: (releaseId: string) =>
      apiFetch(`/customer/subscriptions/${bookingId()}/absence-releases/${releaseId}/cancel`, { method: 'POST' }),
    invalidates: () => [queryKeys.mySubscriptions()],
  });
}
