import { type Ref } from 'vue';
import type { BookingDTO, RenewalCampaignDetailDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Abbonati della stagione che contiene `date` (campagna rinnovi). */
export function useSubscriptions(date: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.subscriptions(session.establishmentId, date.value),
    queryFn: () => apiFetch<SubscriptionListItemDTO[]>(`/bookings/subscriptions?date=${date.value}`),
    enabled: () => !!date.value,
  });
}

/** Rinnova un abbonamento nella stagione di destinazione (`startDate`). */
export function useRenewBooking() {
  return mutationResource({
    mutationFn: ({ id, startDate }: { id: string; startDate: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/renew`, { method: 'POST', body: JSON.stringify({ startDate }) }),
    // La riga diventa "Rinnovato" e il nuovo abbonamento appare nell'elenco della stagione di destinazione.
    // La finestra di prelazione (se una campagna è aperta per questa destinazione) passa a "esercitata".
    invalidates: () => [['subscriptions'], ['map'], ['renewalCampaign']],
  });
}

/** Campagna di prelazione per la stagione di destinazione (o null). */
export function useRenewalCampaign(destinationDate: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.renewalCampaign(session.establishmentId, destinationDate.value),
    queryFn: () => apiFetch<RenewalCampaignDetailDTO | null>(`/renewal-campaigns?destinationDate=${destinationDate.value}`),
    enabled: () => !!destinationDate.value,
  });
}

/** Apre una campagna (origine+destinazione+scadenza). */
export function useOpenCampaign() {
  return mutationResource({
    mutationFn: (input: { originDate: string; destinationDate: string; deadline: string }) =>
      apiFetch(`/renewal-campaigns`, { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => [['renewalCampaign']],
  });
}

/** Chiude una campagna (rilascia gli hold). */
export function useCloseCampaign() {
  return mutationResource({
    mutationFn: (id: string) => apiFetch(`/renewal-campaigns/${id}`, { method: 'DELETE' }),
    invalidates: () => [['renewalCampaign'], ['subscriptions'], ['map']],
  });
}
