import type { DayMapDTO } from '@coralyn/contracts';
import { queryResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useDayMap() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.dayMap(session.establishmentId, session.activeDate),
    queryFn: () => apiFetch<DayMapDTO>(`/map?date=${session.activeDate}`),
  });
}
