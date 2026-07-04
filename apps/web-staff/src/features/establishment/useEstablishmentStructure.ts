import type { EstablishmentStructureDTO, UmbrellaTypeDTO, CreateUmbrellaTypeInput, UpdateUmbrellaTypeInput, StructureSectorDTO, StructureRowDTO, CreateSectorInput, UpdateSectorInput, CreateRowInput, UpdateRowInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useEstablishmentStructure() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentStructure(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentStructureDTO>('/establishment/structure'),
  });
}

export function useCreateUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateUmbrellaTypeInput) =>
      apiFetch<UmbrellaTypeDTO>('/establishment/umbrella-types', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useUpdateUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateUmbrellaTypeInput) =>
      apiFetch<UmbrellaTypeDTO>(`/establishment/umbrella-types/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ name: vars.name, icon: vars.icon }) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useDeleteUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<UmbrellaTypeDTO>(`/establishment/umbrella-types/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useCreateSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateSectorInput) =>
      apiFetch<StructureSectorDTO>('/establishment/sectors', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useUpdateSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateSectorInput) =>
      apiFetch<StructureSectorDTO>(`/establishment/sectors/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ name: vars.name, kind: vars.kind }) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useDeleteSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureSectorDTO>(`/establishment/sectors/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useCreateRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateRowInput) =>
      apiFetch<StructureRowDTO>('/establishment/rows', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useUpdateRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateRowInput) =>
      apiFetch<StructureRowDTO>(`/establishment/rows/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ label: vars.label }) }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}

export function useDeleteRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureRowDTO>(`/establishment/rows/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.establishmentStructure(session.establishmentId)],
  });
}
