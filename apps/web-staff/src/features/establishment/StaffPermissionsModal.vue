<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Modal, Button, QueryBoundary, Skeleton, pushToast, useDelayedLoading } from '@coralyn/ui-kit';
import { CONFIGURABLE_PERMISSIONS, PERMISSION_LABELS, type Permission } from '@coralyn/contracts';
import { useStaffPermissions, useSetStaffPermissions } from './useEstablishment';

/**
 * I permessi di un operatore, un interruttore per voce (ADR-0063).
 *
 * Componente a sé e non altre 100 righe dentro `EstablishmentView.vue`, che è già oltre le 300:
 * qui la responsabilità è una sola, ed è la stessa scelta già fatta per `LegalProfileModal.vue`.
 *
 * ⚠️ Si mostrano i **17 configurabili**, non tutti e 19: `platform.administer` è di piattaforma e
 * `session.read` disabiliterebbe l'account invece di esprimere una divisione dei compiti. Il
 * backend rifiuta comunque entrambi con un 400 — questa è cortesia, non la protezione.
 */
const props = defineProps<{ userId: string; email: string }>();
const open = defineModel<boolean>('open', { required: true });

const { data, error, isPending, refetch } = useStaffPermissions(() => (open.value ? props.userId : ''));
const skeletonVisible = useDelayedLoading(() => open.value && isPending.value);
const save = useSetStaffPermissions();

/** Stato locale degli interruttori: solo i configurabili, l'ordine è quello dell'enum. */
const granted = ref<Set<Permission>>(new Set());

// Risincronizza all'apertura e a ogni nuova lettura: riaprire su un altro operatore non deve
// mostrare gli interruttori del precedente.
watch(
  () => [open.value, data.value] as const,
  ([isOpen, dto]) => {
    if (!isOpen || !dto) return;
    granted.value = new Set(dto.permissions.filter((p) => CONFIGURABLE_PERMISSIONS.includes(p)));
  },
  { immediate: true },
);

const rows = computed(() =>
  CONFIGURABLE_PERMISSIONS.map((p) => ({ permission: p, label: PERMISSION_LABELS[p], on: granted.value.has(p) })),
);
const grantedCount = computed(() => granted.value.size);

function toggle(p: Permission): void {
  const next = new Set(granted.value);
  if (next.has(p)) next.delete(p);
  else next.add(p);
  granted.value = next;
}

function submit(): void {
  // ⚠️ Senza i dati letti, `granted` è ancora l'insieme VUOTO iniziale, e il PUT lo tratta come
  // insieme completo desiderato: salverebbe una revoca totale con conferma di successo. Il footer
  // del Modal sta fuori dal QueryBoundary, quindi il gate visivo da solo non basta — questa è
  // l'invariante nel punto in cui l'effetto accade.
  if (!data.value) return;
  save.mutate(
    { id: props.userId, permissions: [...granted.value] },
    {
      onSuccess: () => {
        pushToast('Permessi aggiornati.');
        open.value = false;
      },
    },
  );
}
</script>

<template>
  <Modal v-model:open="open" title="Permessi dell'operatore">
    <QueryBoundary :error="error" error-title="Permessi non disponibili" @retry="refetch">
      <p class="mb-3.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
        Scegli cosa <strong class="text-[var(--color-text-2nd)]">{{ email }}</strong> puo' fare nel lido.
        Le voci spente spariscono dal suo menu e vengono rifiutate dal server.
        <span class="whitespace-nowrap">{{ grantedCount }} di {{ rows.length }} attive.</span>
      </p>
      <!-- ⚠️ La lista è gated su `data`, non sul solo skeleton ritardato. Renderla senza i dati
           mostrerebbe 17 interruttori tutti SPENTI, cioè «questo operatore non può fare nulla»:
           un guasto indistinguibile da un dato reale, e per giunta il più allarmante possibile
           (AUD-012). Trovato da `StaffPermissionsModal.spec.ts`, non a occhio. -->
      <div v-if="!data" aria-busy="true" class="flex flex-col gap-2">
        <template v-if="skeletonVisible"><Skeleton v-for="i in 6" :key="i" class="h-9" /></template>
      </div>
      <div v-else data-testid="permission-list" class="flex flex-col">
        <div
          v-for="r in rows"
          :key="r.permission"
          class="flex items-center justify-between gap-3 border-b border-[var(--color-border-row)] py-2.5 last:border-0"
        >
          <span class="min-w-0 text-sm text-[var(--color-text)]">{{ r.label }}</span>
          <!-- Idioma degli interruttori del repo: bottone con `aria-pressed`, non una checkbox
               (che in questa codebase non esiste da nessuna parte). -->
          <button
            type="button"
            :data-testid="`permission-${r.permission}`"
            :aria-pressed="r.on"
            :aria-label="r.label"
            class="relative h-6 w-11 flex-none rounded-full transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            :class="r.on ? 'bg-[var(--color-brand)]' : 'bg-[var(--color-border-row)]'"
            @click="toggle(r.permission)"
          >
            <span
              class="absolute top-0.5 size-5 rounded-full bg-white transition-[left]"
              :class="r.on ? 'left-[22px]' : 'left-0.5'"
            ></span>
          </button>
        </div>
      </div>
    </QueryBoundary>
    <!-- ⚠️ Il footer è uno slot del Modal e sta FUORI dal QueryBoundary: va gated sul dato per
         conto suo. `:disabled` deve ripetere `save.isPending` perché il fallthrough attr VINCE sul
         `:disabled="loading || undefined"` interno di `Button.vue` (misurato) — lasciarlo implicito
         riaprirebbe la finestra di doppio invio. Stesso idioma di `MultiPanel.vue` e `RowPanel.vue`. -->
    <template #footer>
      <div class="flex justify-end gap-2.5">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button
          data-testid="save-permissions"
          :disabled="!data || save.isPending.value"
          :loading="save.isPending.value"
          @click="submit"
        >Salva</Button>
      </div>
    </template>
  </Modal>
</template>
