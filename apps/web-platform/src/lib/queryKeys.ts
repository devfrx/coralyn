export const queryKeys = {
  establishments: () => ['platform', 'establishments'] as const,
  establishment: (id: string) => ['platform', 'establishments', id] as const,
};
