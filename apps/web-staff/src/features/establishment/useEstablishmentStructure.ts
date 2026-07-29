import type { EstablishmentStructureDTO, UmbrellaTypeDTO, CreateUmbrellaTypeInput, UpdateUmbrellaTypeInput, StructureSectorDTO, StructureRowDTO, CreateSectorInput, UpdateSectorInput, CreateRowInput, UpdateRowInput, StructureUmbrellaDTO, CreateUmbrellaInput, UpdateUmbrellaInput, GenerateUmbrellasInput, GenerateUmbrellasResultDTO, BulkDeleteUmbrellasInput, BulkDeleteUmbrellasResultDTO, BulkAssignUmbrellaTypeInput, BulkAssignUmbrellaTypeResultDTO, RetiredUmbrellaDTO, RestoreUmbrellaInput, MoveUmbrellaInput } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { queryResource, mutationResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

// setupStatus: ogni mutazione di struttura può cambiare lo stato dell'onboarding.
//
// ⚠️ `dayMap` è nella lista perché la Mappa operativa ordina con gli STESSI campi dell'editor
// (`map.service.ts:22,25,26`): senza, chi ha la Mappa aperta al banco resta con la disposizione
// vecchia. Non riguarda solo lo spostamento — anche creare, eliminare o riassegnare la tipologia
// cambia ciò che la Mappa mostra, e nessuna di quelle mutazioni la invalidava.
// La chiave porta la data attiva, come già fa `useBookings.ts:25`: la Mappa è sempre interrogata
// per `session.activeDate`, quindi è quella la voce di cache da scadere.
function structureKeys(establishmentId: string, activeDate: string) {
  return [
    queryKeys.establishmentStructure(establishmentId),
    queryKeys.establishmentOverview(establishmentId),
    queryKeys.setupStatus(establishmentId),
    queryKeys.dayMap(establishmentId, activeDate),
  ];
}

export function useEstablishmentStructure() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.establishmentStructure(session.establishmentId),
    queryFn: () => apiFetch<EstablishmentStructureDTO>('/establishment/structure'),
    enabled: () => session.hasPermission(Permission.StructureManage),
  });
}

export function useCreateUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateUmbrellaTypeInput) =>
      apiFetch<UmbrellaTypeDTO>('/establishment/umbrella-types', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useUpdateUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateUmbrellaTypeInput) =>
      apiFetch<UmbrellaTypeDTO>(`/establishment/umbrella-types/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ name: vars.name, icon: vars.icon }) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useDeleteUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<UmbrellaTypeDTO>(`/establishment/umbrella-types/${id}`, { method: 'DELETE' }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useCreateSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateSectorInput) =>
      apiFetch<StructureSectorDTO>('/establishment/sectors', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useUpdateSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateSectorInput) =>
      apiFetch<StructureSectorDTO>(`/establishment/sectors/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ name: vars.name, kind: vars.kind }) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useDeleteSector() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureSectorDTO>(`/establishment/sectors/${id}`, { method: 'DELETE' }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useCreateRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateRowInput) =>
      apiFetch<StructureRowDTO>('/establishment/rows', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useUpdateRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateRowInput) =>
      apiFetch<StructureRowDTO>(`/establishment/rows/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ label: vars.label }) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useDeleteRow() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureRowDTO>(`/establishment/rows/${id}`, { method: 'DELETE' }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useCreateUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>('/establishment/umbrellas', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useUpdateUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & UpdateUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${vars.id}`, { method: 'PATCH', body: JSON.stringify({ label: vars.label, umbrellaTypeId: vars.umbrellaTypeId }) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useDeleteUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${id}`, { method: 'DELETE' }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useGenerateUmbrellas() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: GenerateUmbrellasInput) =>
      apiFetch<GenerateUmbrellasResultDTO>('/establishment/umbrellas/generate', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useBulkDeleteUmbrellas() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: BulkDeleteUmbrellasInput) =>
      apiFetch<BulkDeleteUmbrellasResultDTO>('/establishment/umbrellas/bulk-delete', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

export function useBulkAssignUmbrellaType() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: BulkAssignUmbrellaTypeInput) =>
      apiFetch<BulkAssignUmbrellaTypeResultDTO>('/establishment/umbrellas/bulk-assign-type', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

/** Sposta un ombrellone attivo: `position` è l'indice FINALE 0-based nella fila di destinazione. */
export function useMoveUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & MoveUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${vars.id}/move`, { method: 'POST', body: JSON.stringify({ rowId: vars.rowId, position: vars.position }) }),
    invalidates: () => structureKeys(session.establishmentId, session.activeDate),
  });
}

// Ritiro ombrelloni: estende structureKeys con retiredUmbrellas per invalidazione congiunta
function retireKeys(establishmentId: string, activeDate: string) {
  return [...structureKeys(establishmentId, activeDate), queryKeys.retiredUmbrellas(establishmentId)];
}

export function useRetiredUmbrellas() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.retiredUmbrellas(session.establishmentId),
    queryFn: () => apiFetch<RetiredUmbrellaDTO[]>('/establishment/umbrellas/retired'),
    // `structure.read` e non `structure.manage`: l'endpoint è aperto anche allo staff proprio
    // perché lo storico deve poter mostrare la label di un ombrellone ritirato (D-060).
    enabled: () => session.hasPermission(Permission.StructureRead),
  });
}

export function useRetireUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) =>
      apiFetch<RetiredUmbrellaDTO>(`/establishment/umbrellas/${id}/retire`, { method: 'POST' }),
    invalidates: () => retireKeys(session.establishmentId, session.activeDate),
  });
}

export function useRestoreUmbrella() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string } & RestoreUmbrellaInput) =>
      apiFetch<StructureUmbrellaDTO>(`/establishment/umbrellas/${vars.id}/restore`, { method: 'POST', body: JSON.stringify({ rowId: vars.rowId }) }),
    invalidates: () => retireKeys(session.establishmentId, session.activeDate),
  });
}
