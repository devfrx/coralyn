import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { BookingQuoteDTO } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { useSessionStore } from '@/stores/session';

export interface QuoteParams {
  umbrellaId: string;
  timeSlotId: string;
  date: string;
  packageId?: string; // A3.2: opzionale (nessun pacchetto = assente)
}

/** Preventivo di prezzo per il modale (abilitato solo quando i parametri sono completi). */
export function useBookingQuote(params: Ref<QuoteParams | null>) {
  const session = useSessionStore();
  return useQuery({
    queryKey: computed(() => [
      'quote',
      session.establishmentId,
      params.value?.umbrellaId ?? '',
      params.value?.timeSlotId ?? '',
      params.value?.date ?? '',
      params.value?.packageId ?? '',
    ]),
    queryFn: () => {
      const p = params.value!;
      const pkg = p.packageId ? `&packageId=${p.packageId}` : '';
      return apiFetch<BookingQuoteDTO>(
        `/bookings/quote?umbrellaId=${p.umbrellaId}&timeSlotId=${p.timeSlotId}&date=${p.date}${pkg}`,
      );
    },
    enabled: computed(
      () => !!params.value?.umbrellaId && !!params.value?.timeSlotId && !!params.value?.date,
    ),
  });
}
