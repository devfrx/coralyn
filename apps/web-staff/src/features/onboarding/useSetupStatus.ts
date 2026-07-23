import type { SetupStatusDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource } from '@/lib/useQueryResource';

/** Stato di completezza della prima configurazione (admin-only: disabilitata per lo staff). */
export function useSetupStatus() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.setupStatus(session.establishmentId),
    queryFn: () => apiFetch<SetupStatusDTO>('/establishment/setup-status'),
    enabled: () => session.role === Role.Admin,
  });
}
