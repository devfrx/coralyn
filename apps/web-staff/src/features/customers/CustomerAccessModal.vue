<script setup lang="ts">
import { ref, watch } from 'vue';
import QRCode from 'qrcode';
import { Modal, Button, Icon } from '@coralyn/ui-kit';
import type { CustomerProvisionResponse } from '@coralyn/contracts';

const open = defineModel<boolean>('open', { required: true });
const props = defineProps<{ result: CustomerProvisionResponse | null }>();

const qrDataUrl = ref('');
const copied = ref<'link' | 'pin' | null>(null);

const EXPIRES_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
function fmtExpires(iso: string | undefined): string {
  return iso ? EXPIRES_FMT.format(new Date(iso)) : '—';
}

watch(
  () => props.result?.activationUrl,
  async (url) => {
    qrDataUrl.value = url ? await QRCode.toDataURL(url, { margin: 1, width: 220 }) : '';
  },
  { immediate: true },
);

async function copy(kind: 'link' | 'pin', value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
  copied.value = kind;
  setTimeout(() => { if (copied.value === kind) copied.value = null; }, 1500);
}
</script>

<template>
  <Modal v-model:open="open" title="Accesso cliente generato" eyebrow="Consegna una volta sola">
    <div v-if="result" class="flex flex-col gap-4">
      <p class="text-sm text-[var(--color-text)]">
        Consegna questi dati al cliente <strong>ora</strong>: non saranno più recuperabili. Se li perdi, genera un nuovo accesso.
      </p>
      <div class="flex justify-center">
        <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR di attivazione" data-testid="access-qr" width="220" height="220" class="rounded-[var(--radius-md)] border border-[var(--color-border)]" />
      </div>
      <div class="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-raised)] p-4">
        <div class="mb-1 text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">Link di attivazione</div>
        <div class="flex items-center gap-2">
          <div data-testid="access-link" class="min-w-0 flex-1 truncate text-sm font-medium text-[var(--color-text)]">{{ result.activationUrl }}</div>
          <Button variant="secondary" size="sm" data-testid="copy-link" @click="copy('link', result.activationUrl)"><Icon name="copy" :size="15" />{{ copied === 'link' ? 'Copiato' : 'Copia' }}</Button>
        </div>
        <div class="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">PIN</div>
        <div class="flex items-center gap-2">
          <div data-testid="access-pin" class="flex-1 text-lg font-bold tabular-nums tracking-[.2em] text-[var(--color-text)]">{{ result.pin }}</div>
          <Button variant="secondary" size="sm" data-testid="copy-pin" @click="copy('pin', result.pin)"><Icon name="copy" :size="15" />{{ copied === 'pin' ? 'Copiato' : 'Copia' }}</Button>
        </div>
        <div class="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-caps text-[var(--color-text-muted)]">Scade il</div>
        <div data-testid="access-expires" class="text-sm font-semibold tabular-nums text-[var(--color-text)]">{{ fmtExpires(result.expiresAt) }}</div>
      </div>
      <p class="text-xs text-[var(--color-text-muted)]">Il QR e il link funzionano solo se l'app cliente è configurata (in sviluppo il link è relativo).</p>
    </div>
    <template #footer>
      <div class="flex justify-end">
        <Button data-testid="access-done" @click="open = false">Fatto</Button>
      </div>
    </template>
  </Modal>
</template>
