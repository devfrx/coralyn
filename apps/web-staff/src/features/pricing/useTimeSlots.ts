import type { CreateTimeSlotInput, TimeSlotDTO, UpdateTimeSlotInput } from '@coralyn/contracts';
import { apiFetch } from '@/lib/http';
import { queryKeys } from '@/lib/queryKeys';
import { useSessionStore } from '@/stores/session';
import { queryResource, mutationResource } from '@/lib/useQueryResource';

/** Le mutazioni fasce invalidano sia la lista sia la mappa (le fasce cambiano la cella e le opzioni tariffa). */
export function useTimeSlots() {
  const session = useSessionStore();
  return queryResource({
    queryKey: () => queryKeys.timeSlots(session.establishmentId),
    queryFn: () => apiFetch<TimeSlotDTO[]>('/time-slots'),
  });
}

function invalidateSlotsAndMap(session: ReturnType<typeof useSessionStore>) {
  return [
    queryKeys.timeSlots(session.establishmentId),
    ['map', session.establishmentId],
    queryKeys.setupStatus(session.establishmentId),
  ];
}

export function useCreateTimeSlot() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (input: CreateTimeSlotInput) =>
      apiFetch<TimeSlotDTO>('/time-slots', { method: 'POST', body: JSON.stringify(input) }),
    invalidates: () => invalidateSlotsAndMap(session),
  });
}

export function useUpdateTimeSlot() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (vars: { id: string; input: UpdateTimeSlotInput }) =>
      apiFetch<TimeSlotDTO>(`/time-slots/${vars.id}`, { method: 'PATCH', body: JSON.stringify(vars.input) }),
    invalidates: () => invalidateSlotsAndMap(session),
  });
}

export function useDeleteTimeSlot() {
  const session = useSessionStore();
  return mutationResource({
    mutationFn: (id: string) => apiFetch<TimeSlotDTO>(`/time-slots/${id}`, { method: 'DELETE' }),
    invalidates: () => invalidateSlotsAndMap(session),
  });
}
