<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import '../echarts'; // registrazione moduli (side-effect)
import { buildBarOption, type ChartDatum } from './echarts-option';

const props = defineProps<{ data: ChartDatum[]; color: string; ariaLabel: string }>();
const option = computed(() => buildBarOption(props.data, { color: props.color }));

// Registrazione esplicita locale: garantisce che VTU risolva lo stub `VChart` nei test
// (il componente di `vue-echarts` espone `name: "echarts"`, non corrispondente al tag usato).
defineOptions({ components: { VChart } });
</script>

<template>
  <div class="relative h-[200px] w-full">
    <VChart :option="option" autoresize aria-hidden="true" />
    <!-- Fallback a11y: equivalente testuale del grafico per screen reader. -->
    <table :aria-label="ariaLabel" class="sr-only">
      <thead><tr><th>Periodo</th><th>Valore</th></tr></thead>
      <tbody>
        <tr v-for="d in data" :key="d.label"><td>{{ d.label }}</td><td>{{ d.display ?? d.value }}</td></tr>
      </tbody>
    </table>
  </div>
</template>
