<!-- packages/ui-kit/src/components/IconPicker.vue -->
<script setup lang="ts">
import { computed, inject, ref, useAttrs } from 'vue';
import Icon from './Icon.vue';
import Popover from './Popover.vue';
import SearchInput from './SearchInput.vue';
import { FIELD_LABEL_ID } from './field-context';
import { getIconCatalog } from '../icons/registered-catalog';
import { searchCatalog } from '../icons/catalog';
import { SUGGESTED_ICONS } from '../icons/suggested';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ limit?: number; defaultOpen?: boolean }>(), {
  limit: 60, defaultOpen: false,
});
const model = defineModel<string>({ default: '' });

const query = ref('');

// Senza query si mostrano le suggerite; con query si cerca su TUTTO il catalogo.
const risultati = computed(() => {
  const catalog = getIconCatalog();
  if (!catalog) return { names: [] as string[], total: 0 };
  if (!query.value.trim()) {
    return { names: SUGGESTED_ICONS.filter((n) => catalog.icons[n]).slice(0, props.limit), total: 0 };
  }
  return searchCatalog(catalog, query.value, props.limit);
});
const troncato = computed(() => risultati.value.total > risultati.value.names.length);
const vuoto = computed(() => query.value.trim().length > 0 && risultati.value.names.length === 0);

/**
 * Nome accessibile del trigger (AUD-013, WCAG 4.1.2), stessa regola di `Select`: un `<button>` non
 * e' etichettabile da un `<label>`, quindi senza questo lo screen reader annuncerebbe il valore
 * (`tree-palm`) invece di «Icona sulla mappa». Un aria-* del chiamante VINCE.
 */
const attrs = useAttrs();
const fieldLabelId = inject(FIELD_LABEL_ID, null);
const labelledBy = computed(() =>
  attrs['aria-label'] || attrs['aria-labelledby'] ? undefined : (fieldLabelId ?? undefined),
);

function scegli(name: string) { model.value = name; }
</script>

<template>
  <Popover :default-open="defaultOpen" align="start">
    <template #trigger>
      <button
        v-bind="$attrs" type="button" data-testid="icon-picker-trigger" :aria-labelledby="labelledBy"
        class="flex w-full items-center justify-between gap-2 rounded-[var(--radius-md)] border-[1.5px] border-[var(--color-border-input)] bg-[var(--color-surface)] px-3.5 py-3 text-left text-[13.5px] text-[var(--color-text)] outline-none focus-visible:border-[var(--color-brand)] focus-visible:[box-shadow:var(--ring-focus)]"
      >
        <span class="inline-flex items-center gap-2 truncate">
          <Icon :name="model" :size="18" /><span class="truncate">{{ model }}</span>
        </span>
        <Icon name="chevron-down" :size="16" class="flex-none text-[var(--color-text-muted)]" />
      </button>
    </template>

    <template #content>
      <div class="w-[268px]">
        <SearchInput v-model="query" placeholder="Cerca un'icona…" aria-label="Cerca un'icona" />

        <div v-if="vuoto" data-testid="icon-empty" class="px-1 py-3 text-[12px] text-[var(--color-text-muted)]">
          Nessuna icona per «{{ query }}».
        </div>

        <div v-else class="mt-2.5 grid max-h-[240px] grid-cols-6 gap-1 overflow-y-auto">
          <button
            v-for="n in risultati.names" :key="n" type="button"
            data-testid="icon-option" :data-icon="n" :title="n" :aria-label="n"
            :aria-pressed="n === model"
            class="grid size-9 place-items-center rounded-[9px] text-[var(--color-text-2nd)] hover:bg-[var(--color-raised)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] aria-pressed:bg-[var(--color-raised)] aria-pressed:text-[var(--color-brand)]"
            @click="scegli(n)"
          ><Icon :name="n" :size="18" /></button>
        </div>

        <!-- Un elenco troncato senza avviso si confonde con un elenco esaurito, e chi cerca
             conclude che l'icona non esista. -->
        <p v-if="troncato" data-testid="icon-count" class="mt-2 text-[11px] text-[var(--color-text-muted)]">
          Mostrate {{ risultati.names.length }} di {{ risultati.total }} — restringi la ricerca.
        </p>
      </div>
    </template>
  </Popover>
</template>
