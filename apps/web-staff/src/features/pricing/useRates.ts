import type { CreateRateInput, RateDTO, UpdateRateInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** `getSeasonId` è un thunk: la stagione attiva è stato reattivo della vista. */
export function useRates(getSeasonId: () => string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.rates(session.establishmentId, getSeasonId()),
    queryFn: () => apiFetch<RateDTO[]>(`/rates?seasonId=${getSeasonId()}`),
    enabled: () => !!getSeasonId(),
  });
}

export function useCreateRate(getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateRateInput) =>
      apiFetch<RateDTO>('/rates', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.rates(session.establishmentId, getSeasonId())],
  });
}

export function useUpdateRate(getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdateRateInput }) =>
      apiFetch<RateDTO>(`/rates/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => [queryKeys.rates(session.establishmentId, getSeasonId())],
  });
}

export function useDeleteRate(getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RateDTO>(`/rates/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.rates(session.establishmentId, getSeasonId())],
  });
}
