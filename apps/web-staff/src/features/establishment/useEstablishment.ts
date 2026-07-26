import type {
  EstablishmentOverviewDTO,
  UpdateEstablishmentInput,
  CreateStaffUserInput,
  UpdateStaffUserInput,
  EstablishmentMemberDTO,
  ResetStaffPasswordResponse,
  EstablishmentLegalProfileDTO,
  UpdateEstablishmentLegalProfileInput,
} from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { queryResource, mutationResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useEstablishmentOverview() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentOverview(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentOverviewDTO>('/establishment/overview'),
  });
}

/** Team del lido (admin-only: disabilitata per lo staff, come `useSetupStatus`).
 *  Query separata dall'overview di proposito: l'overview la carica l'app-shell a ogni
 *  navigazione ed è leggibile da tutto lo staff, quindi non può portare le email degli
 *  operatori (D-064). Senza il gate, ogni staff che apre Stabilimento farebbe un 403. */
export function useEstablishmentTeam() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentTeam(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentMemberDTO[]>('/establishment/users'),
    enabled: () => session.role === Role.Admin,
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
    invalidates: () => [queryKeys.establishmentTeam(session.establishmentId)],
  });
}

export function useSetStaffUserDisabled() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateStaffUserInput) =>
      apiFetch<EstablishmentMemberDTO>(`/establishment/users/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ disabled: vars.disabled }) }),
    invalidates: () => [queryKeys.establishmentTeam(session.establishmentId)],
  });
}

export function useResetStaffPassword() {
  return mutationResource({
    mutationFn: (id: string) =>
      apiFetch<ResetStaffPasswordResponse>(`/establishment/users/${id}/reset-password`, { method: 'POST' }),
    // Il reset non modifica l'overview: nessuna query da invalidare.
    invalidates: () => [],
  });
}

export function useLegalProfile() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.legalProfile(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentLegalProfileDTO>('/establishment/legal-profile'),
  });
}

export function useUpdateLegalProfile() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: UpdateEstablishmentLegalProfileInput) =>
      apiFetch<EstablishmentLegalProfileDTO>('/establishment/legal-profile', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    invalidates: () => [queryKeys.legalProfile(session.establishmentId)],
  });
}
