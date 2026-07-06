import { computed } from 'vue';
import { useEstablishmentOverview } from '@/features/establishment/useEstablishment';

/**
 * Nome della stagione attiva (quella che copre oggi) per l'app-shell.
 * Vive in lib/ — come useEntityLabels — così lo shell (Sidebar) legge un read-model
 * condiviso senza importare direttamente da features/ (convenzione shell → solo session/lib).
 * `null` quando nessuna stagione copre oggi: il chiamante non mostra dati finti.
 */
export function useActiveSeason() {
  const { data } = useEstablishmentOverview();
  const name = computed<string | null>(() => data.value?.activeSeason?.name ?? null);
  return { name };
}
