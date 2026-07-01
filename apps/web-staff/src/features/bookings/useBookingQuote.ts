import { computed, type Ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { BookingQuoteDTO, BookingType } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { useSessionStore } from '@/stores/session';

export interface QuoteParams {
  umbrellaId: string;
  timeSlotId: string;
  type: BookingType;
  startDate: string;
  endDate?: string;   // periodic
  packageId?: string; // opzionale
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
      params.value?.type ?? '',
      params.value?.startDate ?? '',
      params.value?.endDate ?? '',
      params.value?.packageId ?? '',
    ]),
    queryFn: () => {
      const p = params.value!;
      const end = p.endDate ? `&endDate=${p.endDate}` : '';
      const pkg = p.packageId ? `&packageId=${p.packageId}` : '';
      return apiFetch<BookingQuoteDTO>(
        `/bookings/quote?umbrellaId=${p.umbrellaId}&timeSlotId=${p.timeSlotId}&type=${p.type}&startDate=${p.startDate}${end}${pkg}`,
      );
    },
    enabled: computed(
      () => !!params.value?.umbrellaId && !!params.value?.timeSlotId && !!params.value?.startDate,
    ),
  });
}
