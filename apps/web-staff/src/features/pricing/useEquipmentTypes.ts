import type { CreateEquipmentTypeInput, EquipmentTypeDTO, UpdateEquipmentTypeInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Lista dei tipi di dotazione attivi (per il compositore pacchetto). */
export function useEquipmentTypes() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.equipmentTypes(session.establishmentId),
    queryFn: () => apiFetch<EquipmentTypeDTO[]>('/equipment-types'),
  });
}

/** Lista COMPLETA (attivi + archiviati) per l'editor catalogo in Listino. */
export function useAllEquipmentTypes() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.allEquipmentTypes(session.establishmentId),
    queryFn: () => apiFetch<EquipmentTypeDTO[]>('/equipment-types?includeArchived=true'),
  });
}

const invalidate = (session: ReturnType<typeof useSessionStore>) => [
  queryKeys.equipmentTypes(session.establishmentId),
  queryKeys.allEquipmentTypes(session.establishmentId),
];

export function useCreateEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateEquipmentTypeInput) =>
      apiFetch<EquipmentTypeDTO>('/equipment-types', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => invalidate(session),
  });
}

export function useUpdateEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdateEquipmentTypeInput }) =>
      apiFetch<EquipmentTypeDTO>(`/equipment-types/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => invalidate(session),
  });
}

export function useArchiveEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<EquipmentTypeDTO>(`/equipment-types/${id}/archive`, { method: 'POST' }),
    invalidates: () => invalidate(session),
  });
}

export function useRestoreEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<EquipmentTypeDTO>(`/equipment-types/${id}/restore`, { method: 'POST' }),
    invalidates: () => invalidate(session),
  });
}

export function useDeleteEquipmentType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<EquipmentTypeDTO>(`/equipment-types/${id}`, { method: 'DELETE' }),
    invalidates: () => invalidate(session),
  });
}
