<script setup lang="ts">
defineProps<{ modelValue: string; options: { value: string; label: string; hint?: string }[] }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
<template>
  <div role="radiogroup" class="inline-flex gap-0.5 rounded-[var(--radius-md)] border border-[var(--color-warm-border-seg)] bg-[var(--color-warm-250)] p-[3px]">
    <button v-for="o in options" :key="o.value" role="radio" :aria-checked="o.value === modelValue"
      class="inline-flex items-baseline gap-1.5 rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-medium transition-colors focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      :class="o.value === modelValue ? 'bg-[var(--color-surface)] font-semibold text-[var(--color-text)] [box-shadow:var(--shadow-soft)]' : 'text-[var(--color-ink-600)] hover:text-[var(--color-text)]'"
      @click="$emit('update:modelValue', o.value)">{{ o.label }}<span v-if="o.hint" data-test="seg-hint"
        class="text-[10px] font-bold tabular-nums" :class="o.value === modelValue ? 'text-[var(--color-accent)]' : 'text-[var(--color-stage-2)]'">{{ o.hint }}</span></button>
  </div>
</template>
