import type { CreateRentalItemInput, RentalItemDTO, UpdateRentalItemInput } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { queryResource, mutationResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** Lista dei soli articoli attivi (per superfici che non gestiscono l'archivio, es. banco).
 *  ⚠️ Il catalogo sta sotto `rental-catalog.manage`, che è un permesso DIVERSO da quello del
 *  banco noleggi (`rentals.operate`): il banco lo compone, ma può non averlo. */
export function useRentalItems() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.rentalItems(session.establishmentId),
    queryFn: () => apiFetch<RentalItemDTO[]>('/rental-items'),
    enabled: () => session.hasPermission(Permission.RentalCatalogManage),
  });
}

/** Lista COMPLETA (attivi + archiviati) per l'editor catalogo noleggio. */
export function useAllRentalItems() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.allRentalItems(session.establishmentId),
    queryFn: () => apiFetch<RentalItemDTO[]>('/rental-items?includeArchived=true'),
    enabled: () => session.hasPermission(Permission.RentalCatalogManage),
  });
}

const invalidate = (session: ReturnType<typeof useSessionStore>) => [
  queryKeys.rentalItems(session.establishmentId),
  queryKeys.allRentalItems(session.establishmentId),
];

export function useCreateRentalItem() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateRentalItemInput) =>
      apiFetch<RentalItemDTO>('/rental-items', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => invalidate(session),
  });
}

export function useUpdateRentalItem() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdateRentalItemInput }) =>
      apiFetch<RentalItemDTO>(`/rental-items/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => invalidate(session),
  });
}

export function useArchiveRentalItem() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RentalItemDTO>(`/rental-items/${id}/archive`, { method: 'POST' }),
    invalidates: () => invalidate(session),
  });
}

export function useRestoreRentalItem() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RentalItemDTO>(`/rental-items/${id}/restore`, { method: 'POST' }),
    invalidates: () => invalidate(session),
  });
}

export function useDeleteRentalItem() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RentalItemDTO>(`/rental-items/${id}`, { method: 'DELETE' }),
    invalidates: () => invalidate(session),
  });
}
