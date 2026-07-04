import type {
  EstablishmentOverviewDTO,
  UpdateEstablishmentInput,
  CreateStaffUserInput,
  UpdateStaffUserInput,
  EstablishmentMemberDTO,
} from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useEstablishmentOverview() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentOverview(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentOverviewDTO>('/establishment/overview'),
  });
}

export function useRenameEstablishment() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: UpdateEstablishmentInput) =>
      apiFetch<{ id: string; name: string }>('/establishment', { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentOverview(session.establishmentId)],
  });
}

export function useCreateStaffUser() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateStaffUserInput) =>
      apiFetch<EstablishmentMemberDTO>('/establishment/users', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentOverview(session.establishmentId)],
  });
}

export function useSetStaffUserDisabled() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateStaffUserInput) =>
      apiFetch<EstablishmentMemberDTO>(`/establishment/users/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ disabled: vars.disabled }) }),
    invalidates: () => [queryKeys.establishmentOverview(session.establishmentId)],
  });
}
