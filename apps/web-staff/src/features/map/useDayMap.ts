import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { DayMapDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useDayMap() {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.dayMap(session.establishmentId, session.activeDate)),
    queryFn: () => apiFetch<DayMapDTO>(`/map?date=${session.activeDate}`),
  });
}
