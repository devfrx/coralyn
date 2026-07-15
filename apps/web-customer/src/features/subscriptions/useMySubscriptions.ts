import type { CustomerBookingDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

export function useMySubscriptions() {
  return queryResource({
    queryKey: () => queryKeys.mySubscriptions(),
    queryFn: () => apiFetch<CustomerBookingDTO[]>('/customer/me/subscriptions'),
  });
}

// Segnala un'assenza (D-035 S4). Azione modale (AbsenceReleaseModal): `quiet` perché il
// modale mostra già l'errore inline (409/422/altro), come in web-staff useReleaseAbsence.
export function useReleaseAbsence(bookingId: () => string) {
  return mutationResource({
    mutationFn: (input: { date: string; reason?: string }) =>
      apiFetch(`/customer/subscriptions/${bookingId()}/absence-releases`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [queryKeys.mySubscriptions()],
    quiet: true,
  });
}

// Annulla un'assenza comunicata (D-035 S4). Azione INLINE in riga (bottone "Annulla", nessun
// modale) — a differenza di useReleaseAbsence sopra, qui NON c'è un errore inline già mostrato
// dal chiamante, quindi NON è `quiet`: l'utente ha bisogno del toast per sapere perché l'azione
// è fallita, in particolare il 409 "giorno già rivenduto" (non annullabile), per cui il backend
// restituisce già un messaggio di dominio pulito in italiano. Impostare `quiet: true` qui
// silenzierebbe quel feedback senza che nessun'altra UI lo sostituisca — scelta intenzionale.
export function useCancelRelease(bookingId: () => string) {
  return mutationResource({
    mutationFn: (releaseId: string) =>
      apiFetch(`/customer/subscriptions/${bookingId()}/absence-releases/${releaseId}/cancel`, { method: 'POST' }),
    invalidates: () => [queryKeys.mySubscriptions()],
  });
}
