import type { CreateSeasonInput, SeasonDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useSeasons() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.seasons(session.establishmentId),
    queryFn: () => apiFetch<SeasonDTO[]>('/seasons'),
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
