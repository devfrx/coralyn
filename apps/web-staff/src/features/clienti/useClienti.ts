import { computed } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { ClienteDTO, ModificaClienteInput } from '@driftly/contracts';
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

export function useCliente(id: string) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.cliente(session.stabilimentoId, id)),
    queryFn: () => apiFetch<ClienteDTO>(`/clienti/${id}`, { tenantId: session.stabilimentoId }),
  });
}

export function useModificaCliente(id: string) {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ModificaClienteInput) =>
      apiFetch<ClienteDTO>(`/clienti/${id}`, { tenantId: session.stabilimentoId, method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.clienti(session.stabilimentoId) });
      qc.invalidateQueries({ queryKey: queryKeys.cliente(session.stabilimentoId, id) });
    },
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
