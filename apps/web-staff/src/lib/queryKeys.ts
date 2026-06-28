export const queryKeys = {
  clienti: (tenantId: string) => ['clienti', tenantId] as const,
  mappaGiorno: (tenantId: string, data: string) => ['mappa', tenantId, data] as const,
};
