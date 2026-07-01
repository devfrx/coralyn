export const queryKeys = {
  customers: (tenantId: string) => ['customers', tenantId] as const,
  customer: (tenantId: string, id: string) => ['customer', tenantId, id] as const,
  dayMap: (tenantId: string, date: string) => ['map', tenantId, date] as const,
  bookings: (tenantId: string, date: string) => ['bookings', tenantId, date] as const,
  packages: (tenantId: string) => ['packages', tenantId] as const,
  subscriptions: (tenantId: string, date: string) => ['subscriptions', tenantId, date] as const,
  seasons: (tenantId: string) => ['seasons', tenantId] as const,
  rates: (tenantId: string, seasonId: string) => ['rates', tenantId, seasonId] as const,
};
