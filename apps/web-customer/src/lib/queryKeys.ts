export const queryKeys = {
  mySubscriptions: () => ['customer', 'subscriptions'] as const,
  myInformativa: () => ['customer', 'informativa'] as const,
  publicInformativa: (establishmentId: string) => ['public', 'informativa', establishmentId] as const,
};
