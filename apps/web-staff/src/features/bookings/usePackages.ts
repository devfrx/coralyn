import type { PackageDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource } from '@/lib/useQueryResource';

/** Lista dei pacchetti del tenant per il selettore del modale. */
export function usePackages() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.packages(session.establishmentId),
    queryFn: () => apiFetch<PackageDTO[]>('/packages'),
  });
}
