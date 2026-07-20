import type { CreateRentalTariffInput, RentalTariffDTO, UpdateRentalTariffInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** `getItemId`/`getSeasonId` sono thunk: articolo e stagione selezionati sono stato reattivo della vista
 *  (stesso pattern di `useRates`). Include sempre gli archiviati: l'editor cataogo li mostra a scomparsa. */
export function useRentalTariffs(getItemId: () => string, getSeasonId: () => string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.rentalTariffs(session.establishmentId, getItemId(), getSeasonId()),
    queryFn: () =>
      apiFetch<RentalTariffDTO[]>(
        `/rental-items/${getItemId()}/tariffs?seasonId=${getSeasonId()}&includeArchived=true`,
      ),
    enabled: () => !!getItemId() && !!getSeasonId(),
  });
}

export function useCreateRentalTariff(getItemId: () => string, getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateRentalTariffInput) =>
      apiFetch<RentalTariffDTO>(`/rental-items/${getItemId()}/tariffs?seasonId=${getSeasonId()}`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    invalidates: () => [queryKeys.rentalTariffs(session.establishmentId, getItemId(), getSeasonId())],
  });
}

export function useUpdateRentalTariff(getItemId: () => string, getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdateRentalTariffInput }) =>
      apiFetch<RentalTariffDTO>(`/rental-tariffs/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => [queryKeys.rentalTariffs(session.establishmentId, getItemId(), getSeasonId())],
  });
}

export function useArchiveRentalTariff(getItemId: () => string, getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RentalTariffDTO>(`/rental-tariffs/${id}/archive`, { method: 'POST' }),
    invalidates: () => [queryKeys.rentalTariffs(session.establishmentId, getItemId(), getSeasonId())],
  });
}

export function useRestoreRentalTariff(getItemId: () => string, getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RentalTariffDTO>(`/rental-tariffs/${id}/restore`, { method: 'POST' }),
    invalidates: () => [queryKeys.rentalTariffs(session.establishmentId, getItemId(), getSeasonId())],
  });
}

export function useDeleteRentalTariff(getItemId: () => string, getSeasonId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RentalTariffDTO>(`/rental-tariffs/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.rentalTariffs(session.establishmentId, getItemId(), getSeasonId())],
  });
}
