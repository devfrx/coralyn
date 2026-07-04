<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import '../echarts'; // registrazione moduli (side-effect)
import { buildDonutOption, type DonutDatum } from './echarts-option';

const props = defineProps<{ data: DonutDatum[]; ariaLabel: string }>();
const option = computed(() => buildDonutOption(props.data));

// Registrazione esplicita locale: garantisce che VTU risolva lo stub `VChart` nei test
// (il componente di `vue-echarts` espone `name: "echarts"`, non corrispondente al tag usato).
defineOptions({ components: { VChart } });
</script>

<template>
  <div class="relative h-[180px] w-full">
    <VChart :option="option" autoresize aria-hidden="true" />
    <!-- Fallback a11y: equivalente testuale del grafico per screen reader. -->
    <table :aria-label="ariaLabel" class="sr-only">
      <thead><tr><th>Stato</th><th>Percentuale</th></tr></thead>
      <tbody>
        <tr v-for="d in data" :key="d.label"><td>{{ d.label }}</td><td>{{ d.value }}%</td></tr>
      </tbody>
    </table>
  </div>
</template>
