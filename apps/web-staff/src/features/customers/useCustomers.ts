import type { CustomerDTO, CreateCustomerInput, UpdateCustomerInput, CustomerBookingDTO, DeleteCustomerResult } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useCustomers() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customers(session.establishmentId),
    queryFn: () => apiFetch<CustomerDTO[]>('/customers'),
  });
}

export function useCustomer(id: string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customer(session.establishmentId, id),
    queryFn: () => apiFetch<CustomerDTO>(`/customers/${id}`),
  });
}

export function useCustomerBookings(id: string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customerBookings(session.establishmentId, id),
    queryFn: () => apiFetch<CustomerBookingDTO[]>(`/customers/${id}/bookings`),
  });
}

export function useUpdateCustomer(id: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: UpdateCustomerInput) =>
      apiFetch<CustomerDTO>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customers(session.establishmentId), queryKeys.customer(session.establishmentId, id)],
  });
}

export function useCreateCustomer() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateCustomerInput) =>
      apiFetch<CustomerDTO>('/customers', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customers(session.establishmentId)],
  });
}

/** Diritto all'oblio (GDPR D-024): DELETE reale se il cliente non ha prenotazioni, altrimenti
 *  anonimizzazione lato server (il `outcome` distingue i due esiti per il messaggio in UI). */
export function useDeleteCustomer(id: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: () => apiFetch<DeleteCustomerResult>(`/customers/${id}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.customers(session.establishmentId), queryKeys.customer(session.establishmentId, id)],
  });
}
