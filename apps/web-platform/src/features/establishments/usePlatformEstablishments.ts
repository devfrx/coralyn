import type { CreateEstablishmentInput, CreateEstablishmentResponse, PlatformEstablishmentDTO, ResetAdminPasswordResponse } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useEstablishmentsList() {
  return queryResource({
    queryKey: () => queryKeys.establishments(),
    queryFn: () => apiFetch<PlatformEstablishmentDTO[]>('/platform/establishments'),
  });
}

export function useEstablishmentDetail(id: () => string) {
  return queryResource({
    queryKey: () => queryKeys.establishment(id()),
    queryFn: () => apiFetch<PlatformEstablishmentDTO>(`/platform/establishments/${id()}`),
  });
}

export function useCreateEstablishment() {
  return mutationResource({
    mutationFn: (input: CreateEstablishmentInput) =>
      apiFetch<CreateEstablishmentResponse>('/platform/establishments', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishments()],
  });
}

export function useSuspendEstablishment() {
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PlatformEstablishmentDTO>(`/platform/establishments/${id}/suspend`, { method: 'POST' }),
    invalidates: () => [queryKeys.establishments()],
  });
}

export function useReactivateEstablishment() {
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PlatformEstablishmentDTO>(`/platform/establishments/${id}/reactivate`, { method: 'POST' }),
    invalidates: () => [queryKeys.establishments()],
  });
}

export function useResetAdminPassword() {
  return mutationResource({
    mutationFn: (id: string) =>
      apiFetch<ResetAdminPasswordResponse>(`/platform/establishments/${id}/reset-admin-password`, { method: 'POST' }),
    invalidates: () => [],
  });
}
