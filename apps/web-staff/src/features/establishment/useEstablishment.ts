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

/** Intestazione del lido, caricata dall'app-shell a ogni navigazione.
 *  ⚠️ `establishment.read` è nel default di fabbrica dello staff, ma dopo D-063 è revocabile:
 *  senza il gate un operatore ristretto pagherebbe due 403 (`retry: 1`) a ogni caricamento. */
export function useEstablishmentOverview() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentOverview(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentOverviewDTO>('/establishment/overview'),
    enabled: () => session.hasPermission(Permission.EstablishmentRead),
  });
}

/** Team del lido (sotto `team.manage`: disabilitata per chi non ce l'ha, come `useSetupStatus`).
 *  Query separata dall'overview di proposito: l'overview la carica l'app-shell a ogni
 *  navigazione ed è leggibile **da chiunque abbia `establishment.read`** — che è nel default di
 *  fabbrica dello staff ma da D-063 è revocabile, quindi non «da tutto lo staff» —, e proprio per
 *  questo non può portare le email degli operatori (D-064). Senza il gate, ogni operatore che apre
 *  Stabilimento farebbe un 403.
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
    // ⚠️ `establishmentTeam` è qui come **PREFISSO**, e la riga è PORTANTE, non ridondante:
    // `invalidateQueries` fa match di prefisso, e `staffPermissions(t, id)` =
    // `[...establishmentTeam(t), id, 'permissions']` (`lib/queryKeys.ts`). È quindi questa riga —
    // e solo questa — a far rileggere i permessi quando il modale viene riaperto entro
    // `staleTime` (30 s). Appiattire quella chiave fuori dal prefisso romperebbe la freschezza
    // **senza far cadere un test**, perché ogni spec costruisce un QueryClient nuovo.
    //
    // ⚠️ Resta il caso «ho configurato me stesso», in cui la sessione in `UserDTO` diventa stantia.
    // NON è impedito dal fatto che l'admin non sia configurabile — un `staff` a cui è stato
    // concesso `team.manage` **può** revocarselo, e ADR-0063 lo dice nelle Note dichiarando che
    // sul server non c'è una guardia. È impedito **da questa UI**: `EstablishmentView.vue` nasconde
    // l'intera barra di azioni sulla propria riga (`v-if="!u.you"`), quindi il bottone «Permessi»
    // su se stessi non esiste. Chi chiamasse il PUT direttamente resterebbe con i permessi vecchi
    // in sessione fino al prossimo `/auth/me`, e vedrebbe porte che il server nega comunque: la
    // protezione è il 403, questo è cortesia (ADR-0063).
    invalidates: () => [queryKeys.establishmentTeam(session.establishmentId)],
  });
}

export function useLegalProfile() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.legalProfile(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentLegalProfileDTO>('/establishment/legal-profile'),
    enabled: () => session.hasPermission(Permission.LegalProfileManage),
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
