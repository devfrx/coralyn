import type { CreatePackageInput, PackageDTO, UpdatePackageInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Lista dei pacchetti del tenant per il selettore del modale. */
export function usePackages() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.packages(session.establishmentId),
    queryFn: () => apiFetch<PackageDTO[]>('/packages'),
  });
}

/** Lista COMPLETA (attivi + archiviati) per l'editor Listino. */
export function useAllPackages() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.allPackages(session.establishmentId),
    queryFn: () => apiFetch<PackageDTO[]>('/packages?includeArchived=true'),
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
