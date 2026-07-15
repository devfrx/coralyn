import { computed } from 'vue';
import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/vue-query';
import { pushToast } from './toasts';

/**
 * Factory dei composable server-state (ADR-0033 §5.3). Riduce il boilerplate di
 * `useQuery({ queryKey: computed(...), queryFn })` senza nascondere le query key (esplicite,
 * dichiarate dal chiamante). Per le mutation, `invalidates` è un THUNK valutato in onSuccess
 * (le chiavi possono dipendere da stato reattivo come la data attiva — stesso comportamento del
 * codice a mano, che leggeva `session.activeDate` dentro onSuccess). La factory non indovina nulla.
 * `mutationResource` pubblica di default un toast globale col `message` dell'errore su fallimento
 * della mutation; passare `quiet: true` quando il chiamante mostra già l'errore inline.
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
    onSuccess: () => {
      for (const key of opts.invalidates()) qc.invalidateQueries({ queryKey: key });
    },
  });
}
