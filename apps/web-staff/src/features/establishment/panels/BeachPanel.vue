<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, IconButton, Icon, Field, Input, Select, ConfirmDialog } from '@coralyn/ui-kit';
import type { EstablishmentStructureDTO, UmbrellaTypeDTO } from '@coralyn/contracts';
import { pushToast } from '@/lib/toasts';
import { useCreateUmbrellaType, useUpdateUmbrellaType, useDeleteUmbrellaType, useRetiredUmbrellas, useRestoreUmbrella } from '../useEstablishmentStructure';

const props = defineProps<{ data: EstablishmentStructureDTO; isAdmin: boolean }>();

const counts = computed(() => {
  const rows = props.data.sectors.reduce((n, s) => n + s.rows.length, 0);
  const umbrellas = props.data.sectors.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.umbrellas.length, 0), 0);
  return { sectors: props.data.sectors.length, rows, umbrellas, types: props.data.umbrellaTypes.length };
});

const createType = useCreateUmbrellaType();
const updateType = useUpdateUmbrellaType();
const removeType = useDeleteUmbrellaType();

const editing = ref<'new' | string | null>(null); // null = lista; 'new' | id = form inline
const name = ref('');
const icon = ref<'umbrella' | 'leaf' | 'palmtree'>('umbrella');
function openNew() { editing.value = 'new'; name.value = ''; icon.value = 'umbrella'; }
function openEdit(t: UmbrellaTypeDTO) { editing.value = t.id; name.value = t.name; icon.value = (t.icon as typeof icon.value) ?? 'umbrella'; }
function submit() {
  const n = name.value.trim();
  if (!n) return;
  const done = { onSuccess: () => { pushToast(editing.value === 'new' ? 'Tipologia creata.' : 'Tipologia aggiornata.'); editing.value = null; } };
  if (editing.value === 'new') createType.mutate({ name: n, icon: icon.value }, done);
  else if (editing.value) updateType.mutate({ id: editing.value, name: n, icon: icon.value }, done);
}
const saving = computed(() => createType.isPending.value || updateType.isPending.value);

const deleting = ref<UmbrellaTypeDTO | null>(null);
function confirmDelete() {
  if (!deleting.value) return;
  removeType.mutate(deleting.value.id, { onSuccess: () => pushToast('Tipologia eliminata.') });
  deleting.value = null;
}

// Ombrelloni ritirati (D-055): archivio consultabile con ripristino in una fila scelta.
const RETIRED_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' });
function formatDate(iso: string) { return RETIRED_FMT.format(new Date(iso)); }
const retired = useRetiredUmbrellas();
const restore = useRestoreUmbrella();
const restoreRowByUmbrella = ref<Record<string, string>>({});
const allRows = computed(() =>
  props.data.sectors.flatMap((s) => s.rows.map((r) => ({ id: r.id, label: r.label, sectorName: s.name }))));
function onRestore(id: string) {
  const rowId = restoreRowByUmbrella.value[id];
  if (!rowId) return;
  restore.mutate({ id, rowId }, { onSuccess: () => pushToast('Ombrellone ripristinato.') });
}
</script>

<template>
  <div>
    <div class="px-[18px] pb-3 pt-3.5 border-b border-[var(--color-border-row)]">
      <div class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Ispettore</div>
      <div class="mt-0.5 text-[15.5px] font-extrabold tracking-[-.01em]">Spiaggia</div>
    </div>
    <div class="flex flex-col gap-3.5 p-[18px]">
      <div class="grid grid-cols-2 gap-2">
        <div v-for="(v, k) in { Settori: counts.sectors, File: counts.rows, Ombrelloni: counts.umbrellas, Tipologie: counts.types }" :key="k"
          class="rounded-[var(--radius-md)] border border-[var(--color-border-row)] bg-[var(--color-surface)] px-3 py-2.5">
          <b class="block text-[18px] font-extrabold [font-variant-numeric:tabular-nums]">{{ v }}</b>
          <span class="text-[11px] text-[var(--color-text-muted)]">{{ k }}</span>
        </div>
      </div>
      <hr class="border-0 border-t border-[var(--color-border-row)]">
      <div>
        <div class="mb-1.5 flex items-center justify-between">
          <span class="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Tipologie</span>
          <Button v-if="isAdmin && editing === null" data-testid="type-new" variant="secondary" size="sm" @click="openNew"><Icon name="plus" :size="13" />Nuova</Button>
        </div>
        <form v-if="editing !== null" data-testid="type-save" class="flex flex-col gap-3" @submit.prevent="submit">
          <Field label="Nome"><Input name="type-name" data-testid="type-name" v-model="name" placeholder="es. Gazebo" /></Field>
          <Field label="Icona sulla mappa">
            <Select v-model="icon" data-testid="type-icon">
              <option value="umbrella">Ombrellone</option><option value="leaf">Paglia</option><option value="palmtree">Palma</option>
            </Select>
          </Field>
          <div class="flex justify-end gap-2">
            <Button variant="secondary" type="button" size="sm" @click="editing = null">Annulla</Button>
            <Button type="submit" size="sm" :loading="saving">Salva</Button>
          </div>
        </form>
        <div v-else class="flex flex-col">
          <div v-for="t in data.umbrellaTypes" :key="t.id" data-testid="type-row" class="flex items-center gap-2.5 border-b border-[var(--color-border-row)] py-2 last:border-0">
            <span class="grid size-7 place-items-center rounded-[9px] bg-[var(--color-raised)] text-[var(--color-text-2nd)]"><Icon :name="t.icon ?? 'umbrella'" :size="14" /></span>
            <span class="flex-1 text-[12.5px] font-bold">{{ t.name }}</span>
            <template v-if="isAdmin">
              <IconButton icon="edit" label="Modifica tipologia" variant="ghost" size="sm" data-testid="type-edit" @click="openEdit(t)" />
              <IconButton icon="trash-2" label="Elimina tipologia" variant="danger" size="sm" data-testid="type-delete" @click="deleting = t" />
            </template>
          </div>
          <p v-if="data.umbrellaTypes.length === 0" class="py-1.5 text-[12px] text-[var(--color-text-muted)]">Nessuna tipologia.</p>
        </div>
        <p class="mt-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Classificano l'ombrellone (icona sulla Mappa), non ne fissano il prezzo. «Normale» è la predefinita.</p>
      </div>
      <template v-if="retired.data.value?.length">
        <hr class="border-0 border-t border-[var(--color-border-row)]">
        <div data-testid="retired-section">
          <div class="mb-1.5 text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--color-text-muted)]">Ritirati ({{ retired.data.value.length }})</div>
          <div v-for="u in retired.data.value" :key="u.id" data-testid="retired-row" class="border-b border-[var(--color-border-row)] py-2 last:border-0">
            <div class="flex items-baseline gap-2">
              <span class="text-[12.5px] font-bold">{{ u.label }}</span>
              <span class="text-[11px] text-[var(--color-text-muted)]">{{ u.retiredFrom ?? 'posizione sconosciuta' }} · ritirato il {{ formatDate(u.retiredAt) }}</span>
            </div>
            <div v-if="isAdmin" class="mt-1.5 flex items-center gap-2">
              <Select v-model="restoreRowByUmbrella[u.id]" data-testid="retired-restore-row" class="flex-1">
                <option value="" disabled>Fila di destinazione…</option>
                <option v-for="r in allRows" :key="r.id" :value="r.id">{{ r.sectorName }} · {{ r.label }}</option>
              </Select>
              <Button size="sm" data-testid="retired-restore" :disabled="!restoreRowByUmbrella[u.id] || restore.isPending.value"
                :loading="restore.isPending.value" @click="onRestore(u.id)">Ripristina</Button>
            </div>
          </div>
          <p class="mt-2 text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Un ritirato non è in spiaggia né prenotabile; lo storico resta. Ripristinandolo torna in coda alla fila scelta.</p>
        </div>
      </template>
      <hr class="border-0 border-t border-[var(--color-border-row)]">
      <p class="text-[11.5px] leading-relaxed text-[var(--color-text-muted)]">Clicca un settore, una fila o un ombrellone nella scena per modificarlo. Le forme tratteggiate creano.</p>
    </div>
    <ConfirmDialog :open="deleting !== null" @update:open="(v: boolean) => { if (!v) deleting = null; }"
      title="Eliminare definitivamente?" :description="`«${deleting?.name}» verrà rimossa dal catalogo. Se è in uso da ombrelloni non sarà eliminata.`"
      confirm-label="Elimina" tone="danger" @confirm="confirmDelete" />
  </div>
</template>
