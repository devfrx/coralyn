import type { EstablishmentStructureDTO, UmbrellaTypeDTO, CreateUmbrellaTypeInput, UpdateUmbrellaTypeInput, StructureSectorDTO, StructureRowDTO, CreateSectorInput, UpdateSectorInput, CreateRowInput, UpdateRowInput, StructureUmbrellaDTO, CreateUmbrellaInput, UpdateUmbrellaInput, GenerateUmbrellasInput, GenerateUmbrellasResultDTO, BulkDeleteUmbrellasInput, BulkDeleteUmbrellasResultDTO, BulkAssignUmbrellaTypeInput, BulkAssignUmbrellaTypeResultDTO, RetiredUmbrellaDTO, RestoreUmbrellaInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

function structureKeys(establishmentId: string) {
  return [queryKeys.establishmentStructure(establishmentId), queryKeys.establishmentOverview(establishmentId)];
}

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
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useUpdateUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateUmbrellaTypeInput) =>
      apiFetch<UmbrellaTypeDTO>(`/establishment/umbrella-types/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ name: vars.name, icon: vars.icon }) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useDeleteUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<UmbrellaTypeDTO>(`/establishment/umbrella-types/${id}`, { method: 'DELETE' }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useCreateSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateSectorInput) =>
      apiFetch<StructureSectorDTO>('/establishment/sectors', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useUpdateSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateSectorInput) =>
      apiFetch<StructureSectorDTO>(`/establishment/sectors/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ name: vars.name, kind: vars.kind }) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useDeleteSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureSectorDTO>(`/establishment/sectors/${id}`, { method: 'DELETE' }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useCreateRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateRowInput) =>
      apiFetch<StructureRowDTO>('/establishment/rows', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useUpdateRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateRowInput) =>
      apiFetch<StructureRowDTO>(`/establishment/rows/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ label: vars.label }) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useDeleteRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureRowDTO>(`/establishment/rows/${id}`, { method: 'DELETE' }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useCreateUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>('/establishment/umbrellas', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useUpdateUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ label: vars.label, umbrellaTypeId: vars.umbrellaTypeId }) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useDeleteUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${id}`, { method: 'DELETE' }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useGenerateUmbrellas() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: GenerateUmbrellasInput) =>
      apiFetch<GenerateUmbrellasResultDTO>('/establishment/umbrellas/generate', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useBulkDeleteUmbrellas() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: BulkDeleteUmbrellasInput) =>
      apiFetch<BulkDeleteUmbrellasResultDTO>('/establishment/umbrellas/bulk-delete', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

export function useBulkAssignUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: BulkAssignUmbrellaTypeInput) =>
      apiFetch<BulkAssignUmbrellaTypeResultDTO>('/establishment/umbrellas/bulk-assign-type', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId),
  });
}

// Ritiro ombrelloni: estende structureKeys con retiredUmbrellas per invalidazione congiunta
function retireKeys(establishmentId: string) {
  return [...structureKeys(establishmentId), queryKeys.retiredUmbrellas(establishmentId)];
}

export function useRetiredUmbrellas() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.retiredUmbrellas(session.establishmentId),
    queryFn: () => apiFetch<RetiredUmbrellaDTO[]>('/establishment/umbrellas/retired'),
  });
}

export function useRetireUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) =>
      apiFetch<RetiredUmbrellaDTO>(`/establishment/umbrellas/${id}/retire`, { method: 'POST' }),
    invalidates: () => retireKeys(session.establishmentId),
  });
}

export function useRestoreUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & RestoreUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${vars.id}/restore`, { method: 'POST', body: JSON.stringify({ rowId: vars.rowId }) }),
    invalidates: () => retireKeys(session.establishmentId),
  });
}
