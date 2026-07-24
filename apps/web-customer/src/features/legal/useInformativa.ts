import type { PublicTitolareDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryResource } from '@/lib/useQueryResource';
import { queryKeys } from '@/lib/queryKeys';

export function useMyInformativa() {
  return queryResource({
    queryKey: () => queryKeys.myInformativa(),
    queryFn: () => apiFetch<PublicTitolareDTO>('/customer/me/informativa'),
  });
}

export function usePublicInformativa(establishmentId: string) {
  return queryResource({
    queryKey: () => queryKeys.publicInformativa(establishmentId),
    queryFn: () => apiFetch<PublicTitolareDTO>(`/public/informativa/${establishmentId}`, {}, { retryOn401: false }),
  });
}
