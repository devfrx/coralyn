import type { EstablishmentOverviewDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource } from '@/lib/useQueryResource';

export function useEstablishmentOverview() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentOverview(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentOverviewDTO>('/establishment/overview'),
  });
}
