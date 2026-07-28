import type { DayMapDTO } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { queryResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** La day-map non serve solo alla Mappa: `useEntityLabels` la usa per risolvere le label
 *  ombrellone, e il Listino per l'anteprima. Il gate è sul permesso dell'ENDPOINT (`map.read`),
 *  non su quello della vista che la chiama. */
export function useDayMap() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.dayMap(session.establishmentId, session.activeDate),
    queryFn: () => apiFetch<DayMapDTO>(`/map?date=${session.activeDate}`),
    enabled: () => session.hasPermission(Permission.MapRead),
  });
}
