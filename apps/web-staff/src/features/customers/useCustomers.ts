import type { CustomerDTO, CreateCustomerInput, UpdateCustomerInput, CustomerBookingDTO, DeleteCustomerResult, BookingDTO, TerminateSubscriptionInput, SuspendSubscriptionInput, ReactivateSubscriptionInput, CededSubscriptionDTO, TransferSubscriptionInput, SetAbsenceConsentInput, ReleaseAbsenceInput, CustomerAccessStatusDTO, CustomerProvisionResponse } from '@coralyn/contracts';
import { Permission } from '@coralyn/contracts';
import { queryResource, mutationResource } from '@coralyn/data-layer';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';

/**
 * Gli id arrivano come THUNK, non per valore (stesso contratto di `useRates`). La ragione non è
 * stilistica: `RouterView` non ha `:key`, quindi passare da `/customers/A` a `/customers/B` PATCHA
 * la vista invece di ricrearla, e altrettanto fanno la card accesso e i modali, montati una volta
 * sola. Un id letto in `setup()` resta quello del cliente precedente: query key ferme (dati di A
 * sotto l'URL di B) e — peggio — mutation puntate su A mentre a schermo c'è B. Era AUD-009: la
 * generazione dell'accesso mostrava all'operatore QR e PIN di un altro bagnante.
 */
/**
 * ⚠️ Ogni query dichiara il permesso del suo endpoint (ADR-0064). L'anagrafica non è consultata
 * solo da `CustomersView`: Mappa, Noleggi, Prenotazioni e Rinnovi la compongono nei loro dati, e
 * dopo D-063 un operatore può avere il permesso della vista senza avere questo. Senza il gate
 * partirebbero due 403 (`retry: 1`) e il `?? []` dei chiamanti li renderebbe come «nessun cliente».
 * Presidiato da `query-permissions.spec.ts`.
 */
export function useCustomers() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customers(session.establishmentId),
    queryFn: () => apiFetch<CustomerDTO[]>('/customers'),
    enabled: () => session.hasPermission(Permission.CustomersManage),
  });
}

export function useCustomer(getId: () => string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customer(session.establishmentId, getId()),
    queryFn: () => apiFetch<CustomerDTO>(`/customers/${getId()}`),
    enabled: () => session.hasPermission(Permission.CustomersManage),
  });
}

export function useCustomerBookings(getId: () => string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customerBookings(session.establishmentId, getId()),
    queryFn: () => apiFetch<CustomerBookingDTO[]>(`/customers/${getId()}/bookings`),
    enabled: () => session.hasPermission(Permission.CustomersManage),
  });
}

export function useUpdateCustomer(getId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: UpdateCustomerInput) =>
      apiFetch<CustomerDTO>(`/customers/${getId()}`, { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customers(session.establishmentId), queryKeys.customer(session.establishmentId, getId())],
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
export function useDeleteCustomer(getId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: () => apiFetch<DeleteCustomerResult>(`/customers/${getId()}`, { method: 'DELETE' }),
    invalidates: () => [queryKeys.customers(session.establishmentId), queryKeys.customer(session.establishmentId, getId())],
  });
}

/** Disdetta anticipata di un abbonamento (D-013, admin-only). Invalida lo storico della Scheda
 *  cliente così la card riflette lo stato disdetto. `quiet`: il modale mostra l'errore inline. */
export function useTerminateSubscription(getCustomerId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: TerminateSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/terminate`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, getCustomerId())],
    quiet: true,
  });
}

/** Sospensione temporanea (D-013, admin-only). Invalida la Scheda cliente. Errore inline nel modale. */
export function useSuspendSubscription(getCustomerId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: SuspendSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/suspend`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, getCustomerId())],
    quiet: true,
  });
}

/** Riattivazione di una sospensione aperta (D-013, admin-only). Invalida la Scheda cliente. */
export function useReactivateSubscription(getCustomerId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: ReactivateSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/reactivate`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, getCustomerId())],
    quiet: true,
  });
}

/** Cessione/subentro (D-013, admin-only). Invalida la Scheda cliente (bookings + ceded). Errore inline nel modale. */
export function useTransferSubscription(getCustomerId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: TransferSubscriptionInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/transfer`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [
      queryKeys.customerBookings(session.establishmentId, getCustomerId()),
      queryKeys.cededSubscriptions(session.establishmentId, getCustomerId()),
    ],
    quiet: true,
  });
}

/** Grant/revoke consenso "assenze comunicate" (D-035, admin-only). Invalida la Scheda cliente.
 *  Azione diretta (no modale): NON quiet, così un errore server (es. abbonamento non più valido)
 *  affiora nel toast globale invece di fallire in silenzio. */
export function useSetAbsenceConsent(getCustomerId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: SetAbsenceConsentInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/absence-consent`, { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, getCustomerId())],
  });
}

/** Registra un'assenza comunicata (D-035, admin-only). Invalida la Scheda cliente. */
export function useReleaseAbsence(getCustomerId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: ReleaseAbsenceInput }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/absence-releases`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, getCustomerId())],
    quiet: true,
  });
}

/** Annulla un'assenza comunicata non rivenduta (D-035, admin-only). Invalida la Scheda cliente.
 *  Azione diretta (no modale): NON quiet, così il 409 RESOLD (giorno già rivenduto tra render e click)
 *  affiora nel toast globale invece di fallire in silenzio. */
export function useCancelAbsenceRelease(getCustomerId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, releaseId }: { id: string; releaseId: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/absence-releases/${releaseId}/cancel`, { method: 'POST' }),
    invalidates: () => [queryKeys.customerBookings(session.establishmentId, getCustomerId())],
  });
}

/** Cessioni EFFETTUATE da questo cliente (sezione read-only nella sua Scheda). */
export function useCededSubscriptions(getId: () => string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.cededSubscriptions(session.establishmentId, getId()),
    queryFn: () => apiFetch<CededSubscriptionDTO[]>(`/customers/${getId()}/ceded-subscriptions`),
    enabled: () => session.hasPermission(Permission.CustomersManage),
  });
}

/** Stato accesso cliente per la Scheda (D-051). Chiave per bookingId rappresentativo del cliente. */
export function useCustomerAccessStatus(getBookingId: () => string) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.customerAccess(session.establishmentId, getBookingId()),
    queryFn: () => apiFetch<CustomerAccessStatusDTO>(`/bookings/${getBookingId()}/customer-access`),
    // ⚠️ NON `customers.manage`: questo endpoint è annotato `customer-access.manage`
    // (`bookings.controller.ts:121`), che il default di fabbrica NON dà allo staff.
    enabled: () => session.hasPermission(Permission.CustomerAccessManage),
  });
}

/** (Ri)genera l'accesso cliente (D-051, admin-only). `quiet`: il chiamante mostra i segreti nel modale;
 *  un eventuale errore affiora via toast solo se non quiet — qui NON quiet così un fallimento è visibile. */
export function useProvisionCustomerAccess(getBookingId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: () =>
      apiFetch<CustomerProvisionResponse>(`/bookings/${getBookingId()}/customer-access`, { method: 'POST' }),
    invalidates: () => [queryKeys.customerAccess(session.establishmentId, getBookingId())],
  });
}

/** Revoca l'accesso cliente (D-051, admin-only). Invalida lo stato accesso. */
export function useRevokeCustomerAccess(getBookingId: () => string) {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: () =>
      apiFetch<void>(`/bookings/${getBookingId()}/customer-access/revoke`, { method: 'POST' }),
    invalidates: () => [queryKeys.customerAccess(session.establishmentId, getBookingId())],
  });
}
