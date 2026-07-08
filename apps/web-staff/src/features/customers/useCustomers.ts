import type { CustomerDTO, CreateCustomerInput, UpdateCustomerInput, CustomerBookingDTO, DeleteCustomerResult, BookingDTO, TerminateSubscriptionInput, SuspendSubscriptionInput, ReactivateSubscriptionInput, CededSubscriptionDTO, TransferSubscriptionInput } from '@coralyn/contracts';
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

/** Disdetta anticipata di un abbonamento (D-013, admin-only). Invalida lo storico della Scheda
 *  cliente così la card riflette lo stato disdetto. `quiet`: il modale mostra l'errore inline. */
export function useTerminateSubscription(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: TerminateSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/terminate`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}

/** Sospensione temporanea (D-013, admin-only). Invalida la Scheda cliente. Errore inline nel modale. */
export function useSuspendSubscription(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: SuspendSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/suspend`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}

/** Riattivazione di una sospensione aperta (D-013, admin-only). Invalida la Scheda cliente. */
export function useReactivateSubscription(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: ReactivateSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/reactivate`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, customerId)],
    quiet: true,
  });
}

/** Cessione/subentro (D-013, admin-only). Invalida la Scheda cliente (bookings + ceded). Errore inline nel modale. */
export function useTransferSubscription(customerId: string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: TransferSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/transfer`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [
      queryKeys.customerBookings(session.establishmentId, customerId),
      queryKeys.cededSubscriptions(session.establishmentId, customerId),
    ],
    quiet: true,
  });
}

/** Cessioni EFFETTUATE da questo cliente (sezione read-only nella sua Scheda). */
export function useCededSubscriptions(id: string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.cededSubscriptions(session.establishmentId, id),
    queryFn: () => apiFetch<CededSubscriptionDTO[]>(`/customers/${id}/ceded-subscriptions`),
  });
}
