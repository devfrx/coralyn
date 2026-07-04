import type { EstablishmentOverviewDTO, UpdateEstablishmentInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useEstablishmentOverview() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentOverview(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentOverviewDTO>('/establishment/overview'),
  });
}

export function useRenameEstablishment() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: UpdateEstablishmentInput) =>
      apiFetch<{ id: string; name: string }>('/establishment', { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentOverview(session.establishmentId)],
  });
}
