<script setup lang="ts">
import { computed, getCurrentInstance } from 'vue';
import ErrorState from './ErrorState.vue';
import EmptyState from './EmptyState.vue';
import SkeletonText from './SkeletonText.vue';
import { useDelayedLoading } from '../useDelayedLoading';

/**
 * Contenitore dei tre stati non-felici di una query: guasto, attesa, vuoto (AUD-012, radice R-E).
 *
 * Esiste perché `queryResource` non ha un toast d'errore di default mentre `mutationResource` sì:
 * ogni vista avrebbe dovuto consultare `isError` da sé, e 9 su 12 non lo facevano — un guasto
 * finiva reso come «nessun dato». Concentrare la decisione qui rende la confusione impossibile per
 * costruzione invece che per disciplina di chi scrive la prossima vista.
 *
 * Precedenza: **errore → attesa → vuoto → contenuto**. L'errore vince sull'attesa perché TanStack
 * lascia `isLoading` a false ma `isFetching` a true durante un retry: senza questa precedenza un
 * guasto in ritentativo tornerebbe a mostrare lo scheletro, cioè di nuovo «sto lavorando» al posto
 * di «non ha funzionato».
 */
const props = withDefaults(
  defineProps<{
    loading?: boolean;
    /** L'errore della query. Passare `undefined`/`null` quando non c'è. */
    error?: unknown;
    /** Il chiamante decide cosa significa «vuoto»: solo lui conosce la forma dei dati. */
    empty?: boolean;
    emptyMessage?: string;
    emptyTitle?: string;
    emptyIcon?: string;
    errorTitle?: string;
    skeletonLines?: number;
  }>(),
  { loading: false, empty: false, skeletonLines: 3 },
);

const emit = defineEmits<{ retry: [] }>();

// Il listener si INOLTRA a ErrorState solo se il chiamante di QueryBoundary ne ha uno: legarlo
// sempre renderebbe `hasRetry` di ErrorState vero per costruzione, e ogni vista mostrerebbe un
// «Riprova» che non fa niente. È l'idioma di DataTable/ErrorState, applicato a un livello in più.
const hasRetry = !!getCurrentInstance()?.vnode.props?.onRetry;
const retryListener = computed(() => (hasRetry ? { retry: () => emit('retry') } : {}));

// Stesso gate anti-flicker del DataTable: niente scheletro-lampo su risposte rapide. Non si attiva
// mai in presenza di un errore, per non alternare scheletro e messaggio durante i retry.
const skeletonBusy = useDelayedLoading(() => props.loading && props.error == null);

const errorMessage = computed(() =>
  props.error instanceof Error ? props.error.message : props.error != null ? String(props.error) : undefined,
);
</script>
<template>
  <ErrorState
    v-if="error != null"
    :message="errorMessage"
    :title="errorTitle"
    v-on="retryListener"
  />
  <div v-else-if="skeletonBusy" data-test="boundary-skeleton" aria-busy="true">
    <slot name="skeleton"><SkeletonText :lines="skeletonLines" /></slot>
  </div>
  <!-- Finestra anti-flicker (loading sotto la soglia): non si rende NIENTE. Rendere qui lo stato
       «vuoto» darebbe un lampo di «nessun dato» subito prima dello scheletro, cioè esattamente la
       confusione guasto/attesa/vuoto che questo componente esiste per togliere. -->
  <template v-else-if="loading" />
  <EmptyState v-else-if="empty" :title="emptyTitle" :icon="emptyIcon">
    <slot name="empty">{{ emptyMessage }}</slot>
  </EmptyState>
  <slot v-else />
</template>
