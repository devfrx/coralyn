export const queryKeys = {
  clienti: (tenantId: string) => ['clienti', tenantId] as const,
  cliente: (tenantId: string, id: string) => ['cliente', tenantId, id] as const,
  mappaGiorno: (tenantId: string, data: string) => ['mappa', tenantId, data] as const,
};
