import { computed } from 'vue';
import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/vue-query';
// Subpath, non il barrel: `@coralyn/ui-kit` esporta anche gli SFC e con essi i moduli virtuali
// `~icons/lucide/*`, che questo package dovrebbe saper compilare per una funzione da dieci righe.
import { pushToast } from '@coralyn/ui-kit/toasts';

/**
 * Factory dei composable server-state (ADR-0033 §5.3). Riduce il boilerplate di
 * `useQuery({ queryKey: computed(...), queryFn })` senza nascondere le query key (esplicite,
 * dichiarate dal chiamante). Per le mutation, `invalidates` è un THUNK valutato al momento
 * (le chiavi possono dipendere da stato reattivo come la data attiva). La factory non indovina nulla.
 * `mutationResource` pubblica di default un toast globale col `message` dell'errore su fallimento
 * della mutation; passare `quiet: true` quando il chiamante mostra già l'errore inline.
 *
 * ⚠️ L'invalidazione sta in `onSettled`, non in `onSuccess`: gli errori più probabili di una
 * scrittura su un albero condiviso («quella fila non esiste più», «quella posizione è fuori dalla
 * fila») dicono proprio che la cache è vecchia, e prima nessuno la rinfrescava dopo un fallimento.
 * Il toast d'errore resta in `onError`, che query-core esegue comunque prima di `onSettled`.
 *
 * ⚠️ La promise dell'invalidazione è SCARTATA di proposito, e non è una svista. Restituirla
 * terrebbe `isPending` vero fino alla rilettura — utile, perché toglierebbe il rimbalzo alle
 * anteprime ottimistiche condizionate a `isPending` — ma le callback passate alla singola
 * `mutate(vars, { onSuccess })` scattano solo se il componente è ANCORA montato, e attendendo la
 * rilettura si dà a quest'ultima il tempo di smontarlo. Misurato: i toast di conferma delle azioni
 * distruttive del Cantiere sparivano. Prima di attendere qui va tolta quella dipendenza là.
 */
export function queryResource<T>(opts: { queryKey: () => QueryKey; queryFn: () => Promise<T>; enabled?: () => boolean }) {
  return useQuery({
    queryKey: computed(opts.queryKey),
    queryFn: opts.queryFn,
    ...(opts.enabled ? { enabled: computed(opts.enabled) } : {}),
  });
}

export function mutationResource<TInput, TOutput>(opts: {
  mutationFn: (input: TInput) => Promise<TOutput>;
  invalidates: () => QueryKey[];
  /** true = niente toast globale su errore (il chiamante mostra l'errore inline). */
  quiet?: boolean;
}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.mutationFn,
    onError: (error) => {
      if (!opts.quiet) pushToast(error instanceof Error ? error.message : String(error));
    },
    onSettled: () => {
      for (const key of opts.invalidates()) qc.invalidateQueries({ queryKey: key });
    },
  });
}
