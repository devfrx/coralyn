import { type Ref } from 'vue';
import type { BookingDTO, RenewalCampaignDetailDTO, SubscriptionListItemDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Abbonati della stagione `seasonId` (campagna rinnovi). */
export function useSubscriptions(seasonId: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.subscriptions(session.establishmentId, seasonId.value),
    queryFn: () => apiFetch<SubscriptionListItemDTO[]>(`/bookings/subscriptions?seasonId=${seasonId.value}`),
    enabled: () => !!seasonId.value,
  });
}

/** Rinnova un abbonamento nella stagione di destinazione (per id). */
export function useRenewBooking() {
  return mutationResource({
    mutationFn: ({ id, destinationSeasonId }: { id: string; destinationSeasonId: string }) =>
      apiFetch<BookingDTO>(`/bookings/${id}/renew`, { method: 'POST', body: JSON.stringify({ destinationSeasonId }) }),
    // La riga diventa "Rinnovato" e il nuovo abbonamento appare nell'elenco della stagione di destinazione.
    // La finestra di prelazione (se una campagna è aperta per questa destinazione) passa a "esercitata".
    invalidates: () => [['subscriptions'], ['map'], ['renewalCampaign']],
  });
}

/** Campagna di prelazione per la stagione di destinazione (per id, o null). */
export function useRenewalCampaign(destinationSeasonId: Ref<string>) {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.renewalCampaign(session.establishmentId, destinationSeasonId.value),
    queryFn: () => apiFetch<RenewalCampaignDetailDTO | null>(`/renewal-campaigns?destinationSeasonId=${destinationSeasonId.value}`),
    enabled: () => !!destinationSeasonId.value,
  });
}

/** Apre una campagna (origine+destinazione per id + scadenza). */
export function useOpenCampaign() {
  return mutationResource({
    mutationFn: (input: { originSeasonId: string; destinationSeasonId: string; deadline: string }) =>
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
