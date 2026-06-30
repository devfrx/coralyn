import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { MappaGiornoDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useMappaGiorno() {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.mappaGiorno(session.stabilimentoId, session.dataAttiva)),
    // NOTE slice 2: quando il backend espone /mappa reale, passare anche session.dataAttiva
    // (forma del parametro da concordare nell'handshake). Per ora il mock MSW ignora i parametri.
    queryFn: () => apiFetch<MappaGiornoDTO>('/mappa'),
  });
}
