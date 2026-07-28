import { computed } from 'vue';
import { Permission } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { useCustomers } from '@/features/customers/useCustomers';
import { useDayMap } from '@/features/map/useDayMap';
import { useAllPackages } from '@/features/bookings/usePackages';
import { useRetiredUmbrellas } from '@/features/establishment/useEstablishmentStructure';

/**
 * Risoluzione entità→etichetta condivisa (ADR-0033 §5.1, assorbe il follow-up "cleanup #2" della
 * review A4.2). `umbrellaLabel` usa `useDayMap()` deliberatamente: le label ombrellone non
 * dipendono dalla data (funziona anche per le viste che mostrano un'altra stagione, es. Rinnovi).
 * `packageName` usa `useAllPackages()` (include archiviati) e non il selettore attivi-soli
 * `usePackages()`: è un percorso di RISOLUZIONE, non un selettore di nuova prenotazione, quindi
 * deve restare in grado di mostrare il nome di un pacchetto archiviato sullo storico (spec
 * "Archiviazione pacchetti" §2/§5) — altrimenti le prenotazioni esistenti che referenziano un
 * pacchetto archiviato renderebbero "–" invece del nome.
 * Per la stessa regola `umbrellaLabel` fonde gli ombrelloni RITIRATI (ADR-0053) nella mappa: un
 * ritirato non ha fila e non compare nella day-map, ma lo storico che lo referenzia deve mostrarne
 * la label (D-060, `GET establishment/umbrellas/retired` aperto anche allo staff proprio per questo).
 * `retiredUmbrellaIds` permette alle viste il badge «Ritirato» come nella Scheda cliente.
 * `initials` NON è ri-esportato da qui: è una util pura senza dominio, le viste la importano
 * direttamente da `@coralyn/ui-kit`.
 */
export function useEntityLabels() {
  const session = useSessionStore();
  const { data: customers } = useCustomers();
  const { data: map } = useDayMap();
  const { data: packages } = useAllPackages();
  const { data: retired } = useRetiredUmbrellas();

  /**
   * ⚠️ Il ripiego `: id` è per il singolo cliente non trovato in una lista che c'è — un caso di
   * dato incoerente, dove mostrare l'id aiuta a diagnosticare. Non vale quando l'anagrafica NON è
   * stata letta affatto: dopo [ADR-0064](../../../../docs/architecture/decisions/0064-permessi-vicini-gate-per-query.md)
   * `useCustomers` non parte senza `customers.manage`, e senza questa distinzione Prenotazioni e
   * Rinnovi renderebbero un UUID **al posto del nome** in ogni riga — che non è un vuoto, è un
   * dato illeggibile presentato come nome, con pure l'avatar ridotto a una lettera.
   */
  const canReadCustomers = computed(() => session.hasPermission(Permission.CustomersManage));

  function customerName(id: string): string {
    const c = (customers.value ?? []).find((x) => x.id === id);
    if (c) return `${c.firstName} ${c.lastName}`;
    return canReadCustomers.value ? id : 'Cliente non visibile';
  }

  const umbrellaLabel = computed(() => {
    const m = new Map<string, string>();
    for (const s of map.value?.sectors ?? []) for (const r of s.rows) for (const u of r.umbrellas) m.set(u.id, u.label);
    for (const u of retired.value ?? []) m.set(u.id, u.label);
    return m;
  });

  const retiredUmbrellaIds = computed(() => new Set((retired.value ?? []).map((u) => u.id)));

  const packageName = computed(() => {
    const m = new Map<string, string>();
    for (const p of packages.value ?? []) m.set(p.id, p.name);
    return m;
  });

  return { customerName, umbrellaLabel, retiredUmbrellaIds, packageName };
}
