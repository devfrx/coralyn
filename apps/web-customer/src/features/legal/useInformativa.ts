import type { PublicTitolareDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryResource } from '@/lib/useQueryResource';
import { queryKeys } from '@/lib/queryKeys';

export function useMyInformativa(enabled?: () => boolean) {
  return queryResource({
    queryKey: () => queryKeys.myInformativa(),
    queryFn: () => apiFetch<PublicTitolareDTO>('/customer/me/informativa'),
    ...(enabled ? { enabled } : {}),
  });
}

export function usePublicInformativa(establishmentId: string, enabled?: () => boolean) {
  return queryResource({
    queryKey: () => queryKeys.publicInformativa(establishmentId),
    queryFn: () => apiFetch<PublicTitolareDTO>(`/public/informativa/${establishmentId}`, {}, { retryOn401: false }),
    ...(enabled ? { enabled } : {}),
  });
}
