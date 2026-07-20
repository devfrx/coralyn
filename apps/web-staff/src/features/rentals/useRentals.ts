import { type Ref } from 'vue';
import type { CheckoutRentalInput, RentalDTO, RentalsDayDTO, SettlePaymentInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Banco noleggi del giorno: noleggi attivi/rientrati/annullati + disponibilità per articolo (D-052). */
export function useRentals(date: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.rentals(session.establishmentId, date.value),
    queryFn: () => apiFetch<RentalsDayDTO>(`/rentals?date=${date.value}`),
  });
}

function invalidate(session: ReturnType<typeof useSessionStore>) {
  return [queryKeys.rentals(session.establishmentId, session.activeDate)];
}

/** Uscita (checkout) di un articolo: il prezzo è calcolato e snapshottato lato server (anteprima FE = solo display). */
export function useCheckoutRental() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CheckoutRentalInput) =>
      apiFetch<RentalDTO>('/rentals', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => invalidate(session),
  });
}

export function useReturnRental() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RentalDTO>(`/rentals/${id}/return`, { method: 'PATCH' }),
    invalidates: () => invalidate(session),
  });
}

/** Annullo un noleggio. NON quiet: un eventuale 409 ("storna l'incasso prima") deve affiorare col
 *  messaggio esatto del server nel toast globale (mirror del delete-guard fasce orarie, PricingView). */
export function useCancelRental() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<RentalDTO>(`/rentals/${id}/cancel`, { method: 'PATCH' }),
    invalidates: () => invalidate(session),
  });
}

/** Registra l'incasso (D-052, mirror di useSettlePayment su Bookings). `quiet`: il modale di incasso
 *  mostra già l'errore inline, niente doppio feedback col toast. */
export function useSettleRentalPayment() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: ({ id, input }: { id: string; input: SettlePaymentInput }) =>
      apiFetch<RentalDTO>(`/rentals/${id}/payment`, { method: 'PATCH', body: JSON.stringify(input) }),
    invalidates: () => invalidate(session),
    quiet: true,
  });
}
