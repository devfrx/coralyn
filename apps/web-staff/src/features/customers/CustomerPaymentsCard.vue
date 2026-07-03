<script setup lang="ts">
import { computed } from 'vue';
import { Card, Badge } from '@coralyn/ui-kit';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { PAY_LABEL, PAY_TONE } from '@/lib/statusMaps';

const props = defineProps<{ bookings: CustomerBookingDTO[] }>();
const active = computed(() => props.bookings.filter((b) => b.status !== 'cancelled'));
const balance = computed(() => active.value.reduce((s, b) => s + (b.totalPrice - b.amountCollected), 0));
const collected = computed(() => active.value.reduce((s, b) => s + b.amountCollected, 0));
</script>
<template>
  <Card class="p-5">
    <div class="mb-3 text-sm font-bold text-[var(--color-text)]">Pagamenti e saldo</div>
    <p v-if="bookings.length === 0" class="text-sm text-[var(--color-text-muted)]">Nessuna prenotazione.</p>
    <template v-else>
      <div class="mb-4 flex gap-6">
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Saldo aperto</div>
          <div class="tabular-nums text-lg font-bold" :class="balance > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text)]'">{{ balance.toFixed(2) }} €</div>
        </div>
        <div>
          <div class="text-[11px] font-semibold uppercase tracking-[.05em] text-[var(--color-text-muted)]">Incassato</div>
          <div class="tabular-nums text-lg font-bold text-[var(--color-text)]">{{ collected.toFixed(2) }} €</div>
        </div>
      </div>
      <ul class="flex flex-col gap-1.5">
        <li v-for="b in active" :key="b.id"
            :class="['flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-2 text-[13px]', b.paymentStatus !== 'paid' ? 'border-[var(--color-warning)]' : 'border-[var(--color-border)]']">
          <span class="tabular-nums text-[var(--color-text-2nd)]">{{ b.startDate }}</span>
          <span class="flex items-center gap-2">
            <span class="tabular-nums">{{ b.amountCollected.toFixed(2) }} / {{ b.totalPrice.toFixed(2) }} €</span>
            <Badge :tone="PAY_TONE[b.paymentStatus]">{{ PAY_LABEL[b.paymentStatus] }}</Badge>
          </span>
        </li>
      </ul>
    </template>
  </Card>
</template>
