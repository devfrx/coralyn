import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { PackageDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/** Lista dei pacchetti del tenant per il selettore del modale. */
export function usePackages() {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.packages(session.establishmentId)),
    queryFn: () => apiFetch<PackageDTO[]>('/packages'),
  });
}
