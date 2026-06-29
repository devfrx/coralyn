<script setup lang="ts">
import { Card, Badge, Icon } from '@driftly/ui-kit';
</script>
<template>
  <section class="px-[26px] pb-[30px] pt-[22px]">
    <Card>
      <div class="flex items-start gap-3.5 p-5">
        <span class="grid size-10 flex-none place-items-center rounded-[11px] bg-[var(--color-accent-tint)] text-[var(--color-accent)]"><Icon name="shield" :size="20" /></span>
        <div class="flex-1">
          <div class="flex items-center gap-2"><span class="text-sm font-bold text-[var(--color-text)]">Console superuser</span><Badge tone="soon">in arrivo</Badge></div>
          <p class="mt-1 text-xs leading-relaxed text-[var(--color-text-muted)]">Strumenti di piattaforma cross-stabilimento (osservabilità, gestione tenant). Visibile solo al ruolo Superuser.</p>
        </div>
      </div>
    </Card>
  </section>
</template>
