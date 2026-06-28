import { computed } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { ClienteDTO } from '@driftly/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useClienti() {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.clienti(session.stabilimentoId)),
    queryFn: () => apiFetch<ClienteDTO[]>('/clienti', { tenantId: session.stabilimentoId }),
  });
}

export function useCreaCliente() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { nome: string; cognome: string }) =>
      apiFetch<ClienteDTO>('/clienti', { tenantId: session.stabilimentoId, method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.clienti(session.stabilimentoId) }),
  });
}
