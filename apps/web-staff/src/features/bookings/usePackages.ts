import type { CreatePackageInput, PackageDTO, UpdatePackageInput } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { queryResource, mutationResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** Lista dei pacchetti del tenant per il selettore del modale.
 *  Il permesso è `pricing.manage` e non quello della vista chiamante: i pacchetti stanno sotto il
 *  listino (`packages.controller.ts:10`), e Mappa e Prenotazioni li compongono nei loro dati. */
export function usePackages() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.packages(session.establishmentId),
    queryFn: () => apiFetch<PackageDTO[]>('/packages'),
    enabled: () => session.hasPermission(Permission.PricingManage),
  });
}

/** Lista COMPLETA (attivi + archiviati) per l'editor Listino. */
export function useAllPackages() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.allPackages(session.establishmentId),
    queryFn: () => apiFetch<PackageDTO[]>('/packages?includeArchived=true'),
    enabled: () => session.hasPermission(Permission.PricingManage),
  });
}

export function useArchivePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PackageDTO>(`/packages/${id}/archive`, { method: 'POST' }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}

export function useRestorePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PackageDTO>(`/packages/${id}/restore`, { method: 'POST' }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}

export function useCreatePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreatePackageInput) =>
      apiFetch<PackageDTO>('/packages', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}

export function useUpdatePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdatePackageInput }) =>
      apiFetch<PackageDTO>(`/packages/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}

export function useDeletePackage() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<PackageDTO>(`/packages/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.packages(session.establishmentId)],
  });
}
