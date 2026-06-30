export const queryKeys = {
  customers: (tenantId: string) => ['customers', tenantId] as const,
  customer: (tenantId: string, id: string) => ['customer', tenantId, id] as const,
  dayMap: (tenantId: string, date: string) => ['map', tenantId, date] as const,
};
