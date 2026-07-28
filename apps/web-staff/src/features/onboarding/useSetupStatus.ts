import type { SetupStatusDTO } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { queryResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** Stato di completezza della prima configurazione. Il gate è sul permesso dell'endpoint
 *  (`establishment.manage`, come `GET /establishment/setup-status`) e non più sul ruolo:
 *  altrimenti un operatore a cui l'admin lo ha concesso vedrebbe comunque una card vuota. */
export function useSetupStatus() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.setupStatus(session.establishmentId),
    queryFn: () => apiFetch<SetupStatusDTO>('/establishment/setup-status'),
    enabled: () => session.hasPermission(Permission.EstablishmentManage),
  });
}
