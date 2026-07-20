import type { CreateRentalItemInput, RentalItemDTO, UpdateRentalItemInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Lista dei soli articoli attivi (per superfici che non gestiscono l'archivio, es. banco). */
export function useRentalItems() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.rentalItems(session.establishmentId),
    queryFn: () => apiFetch<RentalItemDTO[]>('/rental-items'),
  });
}

/** Lista COMPLETA (attivi + archiviati) per l'editor catalogo noleggio. */
export function useAllRentalItems() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.allRentalItems(session.establishmentId),
    queryFn: () => apiFetch<RentalItemDTO[]>('/rental-items?includeArchived=true'),
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
