<script setup lang="ts">
import { computed } from 'vue';
import { icons } from '../icons/registry';
import { getIconCatalog } from '../icons/registered-catalog';
import { resolveFromCatalog } from '../icons/catalog';

const props = withDefaults(defineProps<{ name: string; size?: number; label?: string }>(), { size: 16 });

/**
 * Glifo reso quando un nome non risolve: un quadrato tratteggiato con un punto interrogativo.
 *
 * È scritto QUI e non è una chiave, né del registry né del catalogo, e questa è la ragione per cui
 * funziona: nessuna tipologia può averlo addosso per scelta, quindi vederlo significa sempre e solo
 * «questo nome non risolve». Una chiave qualunque — anche `alert-triangle` — sarebbe sceglibile dal
 * picker, e allora un errore tornerebbe indistinguibile da una scelta: cioè il difetto che questo
 * cambiamento esiste per chiudere.
 */
const UNKNOWN_BODY =
  '<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="3" width="18" height="18" rx="3" stroke-dasharray="3 3"/>' +
  '<path d="M9.5 9.5a2.5 2.5 0 1 1 3 2.45V14"/><path d="M12 17.5v.01"/></g>';

// Catena dichiarata: registry del chrome -> catalogo registrato -> alias -> fallback VISIBILE.
// Il registry vince perche' le sue chiavi sono quelle del chrome, montate staticamente.
const comp = computed(() => icons[props.name]);
const body = computed(() => {
  if (comp.value) return null;
  const catalog = getIconCatalog();
  return (catalog ? resolveFromCatalog(catalog, props.name) : null) ?? UNKNOWN_BODY;
});
</script>

<template>
  <component
    :is="comp" v-if="comp" :width="size" :height="size"
    :aria-hidden="label ? undefined : true" :aria-label="label" :role="label ? 'img' : undefined"
    style="display:inline-block; vertical-align:-0.15em;"
  />
  <!-- Il body arriva da un file statico versionato dentro il bundle: mai dalla rete, mai
       dall'utente, mai dal database. Il nome, che dal database ci arriva, e' solo una chiave di
       lookup e non finisce mai nel markup. -->
  <svg
    v-else viewBox="0 0 24 24" :width="size" :height="size"
    :aria-hidden="label ? undefined : true" :aria-label="label" :role="label ? 'img' : undefined"
    style="display:inline-block; vertical-align:-0.15em;"
    v-html="body"
  />
</template>
