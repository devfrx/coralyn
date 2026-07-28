import type { CreateSeasonInput, SeasonDTO } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { queryResource, mutationResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** ⚠️ Le stagioni stanno sotto `pricing.manage` (`seasons.controller.ts:9`) e sono lette anche da
 *  Noleggi, Rinnovi e Listino noleggi per risolvere la stagione che copre la data attiva. È il
 *  caso che ha reso visibile D-063: quelle viste hanno un permesso proprio, la loro query no. */
export function useSeasons() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.seasons(session.establishmentId),
    queryFn: () => apiFetch<SeasonDTO[]>('/seasons'),
    enabled: () => session.hasPermission(Permission.PricingManage),
  });
}

export function useCreateSeason() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateSeasonInput) =>
      apiFetch<SeasonDTO>('/seasons', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.seasons(session.establishmentId), queryKeys.setupStatus(session.establishmentId)],
  });
}

export function useDeleteSeason() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<SeasonDTO>(`/seasons/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.seasons(session.establishmentId), queryKeys.setupStatus(session.establishmentId)],
  });
}
