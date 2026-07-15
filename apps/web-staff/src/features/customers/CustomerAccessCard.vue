<script setup lang="ts">
import { computed, ref } from 'vue';
import { SectionCard, Badge, Button, Icon, ConfirmDialog } from '@coralyn/ui-kit';
import type { CustomerAccessState, CustomerProvisionResponse } from '@coralyn/contracts';
import { useCustomerAccessStatus, useProvisionCustomerAccess, useRevokeCustomerAccess } from './useCustomers';

const props = defineProps<{ bookingId: string; isAdmin: boolean }>();
const emit = defineEmits<{ provisioned: [CustomerProvisionResponse] }>();

const { data: status } = useCustomerAccessStatus(props.bookingId);
const provision = useProvisionCustomerAccess(props.bookingId);
const revoke = useRevokeCustomerAccess(props.bookingId);

const state = computed<CustomerAccessState>(() => status.value?.state ?? 'none');
const hasAccess = computed(() => state.value === 'issued' || state.value === 'active');

const STATE_META: Record<CustomerAccessState, { label: string; tone: 'neutral' | 'warning' | 'success' | 'danger' }> = {
  none: { label: 'Mai generato', tone: 'neutral' },
  issued: { label: 'Emesso, in attesa di attivazione', tone: 'warning' },
  active: { label: 'Attivo', tone: 'success' },
  revoked: { label: 'Revocato', tone: 'danger' },
};
const meta = computed(() => STATE_META[state.value]);

const ACT_FMT = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Rome' });
const lastActivated = computed(() =>
  status.value?.lastActivatedAt ? ACT_FMT.format(new Date(status.value.lastActivatedAt)) : null,
);

async function onGenerate(): Promise<void> {
  const res = await provision.mutateAsync(undefined);
  emit('provisioned', res);
}

const confirmRevoke = ref(false);
function onRevoke(): void {
  revoke.mutate(undefined);
  confirmRevoke.value = false;
}
</script>

<template>
  <SectionCard title="Accesso cliente" icon="smartphone">
    <div class="flex items-center justify-between gap-3">
      <div>
        <Badge :tone="meta.tone" data-testid="access-state">{{ meta.label }}</Badge>
        <div v-if="lastActivated" class="mt-1.5 text-xs text-[var(--color-text-muted)]">Ultima attivazione: {{ lastActivated }}</div>
      </div>
      <div v-if="isAdmin" class="flex shrink-0 gap-2">
        <Button variant="secondary" data-testid="access-generate" :loading="provision.isPending.value" @click="onGenerate">
          <Icon name="smartphone" :size="15" />{{ hasAccess ? 'Rigenera' : 'Genera accesso' }}
        </Button>
        <Button v-if="hasAccess" variant="danger" data-testid="access-revoke" @click="confirmRevoke = true"><Icon name="x" :size="15" />Revoca</Button>
      </div>
    </div>
    <p v-if="isAdmin && hasAccess" class="mt-2 text-xs text-[var(--color-text-muted)]">
      «Rigenera» invalida il link e il PIN precedenti e disconnette il cliente.
    </p>
    <ConfirmDialog
      v-model:open="confirmRevoke"
      title="Revocare l'accesso del cliente?"
      description="Il cliente non potrà più accedere. Potrai generare un nuovo accesso in seguito."
      confirm-label="Revoca"
      tone="danger"
      @confirm="onRevoke"
    />
  </SectionCard>
</template>
