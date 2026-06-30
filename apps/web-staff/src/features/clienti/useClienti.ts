import { computed } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { ClienteDTO, CreaClienteInput, ModificaClienteInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useClienti() {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.clienti(session.stabilimentoId)),
    queryFn: () => apiFetch<ClienteDTO[]>('/clienti'),
  });
}

export function useCliente(id: string) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.cliente(session.stabilimentoId, id)),
    queryFn: () => apiFetch<ClienteDTO>(`/clienti/${id}`),
  });
}

export function useModificaCliente(id: string) {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ModificaClienteInput) =>
      apiFetch<ClienteDTO>(`/clienti/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
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
    mutationFn: (input: CreaClienteInput) =>
      apiFetch<ClienteDTO>('/clienti', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.clienti(session.stabilimentoId) }),
  });
}
