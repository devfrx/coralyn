import { computed } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import type { CustomerDTO, CreateCustomerInput, UpdateCustomerInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

export function useCustomers() {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.customers(session.establishmentId)),
    queryFn: () => apiFetch<CustomerDTO[]>('/customers'),
  });
}

export function useCustomer(id: string) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => queryKeys.customer(session.establishmentId, id)),
    queryFn: () => apiFetch<CustomerDTO>(`/customers/${id}`),
  });
}

export function useUpdateCustomer(id: string) {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCustomerInput) =>
      apiFetch<CustomerDTO>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers(session.establishmentId) });
      qc.invalidateQueries({ queryKey: queryKeys.customer(session.establishmentId, id) });
    },
  });
}

export function useCreateCustomer() {
  const session = useSessionStore();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      apiFetch<CustomerDTO>('/customers', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.customers(session.establishmentId) }),
  });
}
