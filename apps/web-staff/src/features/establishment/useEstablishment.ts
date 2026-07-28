import type {
  EstablishmentOverviewDTO,
  UpdateEstablishmentInput,
  CreateStaffUserInput,
  UpdateStaffUserInput,
  EstablishmentMemberDTO,
  ResetStaffPasswordResponse,
  EstablishmentLegalProfileDTO,
  UpdateEstablishmentLegalProfileInput,
  StaffPermissionsDTO,
  UpdateStaffPermissionsInput,
} from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
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

/** Team del lido (sotto `team.manage`: disabilitata per chi non ce l'ha, come `useSetupStatus`).
 *  Query separata dall'overview di proposito: l'overview la carica l'app-shell a ogni
 *  navigazione ed è leggibile da tutto lo staff, quindi non può portare le email degli
 *  operatori (D-064). Senza il gate, ogni operatore che apre Stabilimento farebbe un 403.
 *  ⚠️ Il gate è sul PERMESSO e non più sul ruolo (ADR-0063): un operatore a cui l'admin ha
 *  concesso `team.manage` deve vedere il team, e col controllo sul ruolo non lo vedrebbe. */
export function useEstablishmentTeam() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentTeam(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentMemberDTO[]>('/establishment/users'),
    enabled: () => session.hasPermission(Permission.TeamManage),
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

/** Permessi effettivi di un operatore (ADR-0063). `id` vuoto = modale chiusa, query disattivata. */
export function useStaffPermissions(id: () => string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.staffPermissions(session.establishmentId, id()),
    queryFn: () => apiFetch<StaffPermissionsDTO>(`/establishment/users/${id()}/permissions`),
    enabled: () => id() !== '' && session.hasPermission(Permission.TeamManage),
  });
}

export function useSetStaffPermissions() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateStaffPermissionsInput) =>
      apiFetch<StaffPermissionsDTO>(`/establishment/users/${vars.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({ permissions: vars.permissions }),
      }),
    // Il team NON cambia, ma i permessi di chi sta configurando sì se ha configurato se stesso:
    // invalidare la sua sessione sarebbe fuori portata di questo hook, e il caso è impedito a
    // monte (l'admin non è configurabile, ADR-0063 §2.2).
    invalidates: () => [queryKeys.establishmentTeam(session.establishmentId)],
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
