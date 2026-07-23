<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { SetupStatusDTO, SetupStepKey } from '@coralyn/contracts';
import { Card, SkeletonText, useDelayedLoading } from '@coralyn/ui-kit';
import { useSetupStatus } from './useSetupStatus';
import OnboardingStepper from './OnboardingStepper.vue';
import StepWelcome from './steps/StepWelcome.vue';
import StepStructure from './steps/StepStructure.vue';
import StepTimeSlots from './steps/StepTimeSlots.vue';
import StepSeasons from './steps/StepSeasons.vue';
import StepRates from './steps/StepRates.vue';
import StepSummary from './steps/StepSummary.vue';

const STEP_ORDER = ['welcome', 'structure', 'timeSlots', 'seasons', 'rates', 'summary'] as const;
export type WizardStep = (typeof STEP_ORDER)[number];
const STEP_LABEL: Record<WizardStep, string> = {
  welcome: 'Benvenuto', structure: 'Struttura', timeSlots: 'Fasce orarie',
  seasons: 'Stagione', rates: 'Listino', summary: 'Riepilogo',
};

const { data: status, isPending, isError } = useSetupStatus();
const skeletonVisible = useDelayedLoading(() => isPending.value);
const current = ref<WizardStep | null>(null);

// Ripresa: SOLO al primo load posiziona sul primo passo incompleto (o sul riepilogo).
watch(status, (s) => {
  if (!s || current.value !== null) return;
  current.value = s.complete ? 'summary' : (s.firstIncompleteStep as WizardStep);
}, { immediate: true });

function stepComplete(s: SetupStatusDTO, key: WizardStep): boolean {
  if (key === 'welcome') return true;
  if (key === 'summary') return s.complete;
  return s[key as SetupStepKey].complete;
}
const stepperItems = computed(() => STEP_ORDER.map((k) => ({
  key: k, label: STEP_LABEL[k],
  state: k === current.value ? ('active' as const) : status.value && stepComplete(status.value, k) ? ('done' as const) : ('todo' as const),
})));
function goNext() {
  const i = STEP_ORDER.indexOf(current.value ?? 'welcome');
  current.value = STEP_ORDER[Math.min(i + 1, STEP_ORDER.length - 1)];
}
function selectStep(key: string) {
  current.value = key as WizardStep;
}
</script>

<template>
  <section class="max-w-[860px] px-[26px] pb-[30px] pt-[22px]">
    <p v-if="isError" class="mb-4 text-sm text-[var(--color-danger)]">Impossibile caricare lo stato della configurazione.</p>

    <div v-if="skeletonVisible" aria-busy="true" class="p-5">
      <SkeletonText :lines="4" />
    </div>

    <template v-else-if="status && current">
      <OnboardingStepper class="mb-5" :items="stepperItems" @select="selectStep" />
      <Card>
        <div v-if="current === 'welcome'" data-testid="ob-step-welcome">
          <StepWelcome @next="goNext" />
        </div>
        <div v-else-if="current === 'structure'" data-testid="ob-step-structure">
          <StepStructure :status="status" @next="goNext" />
        </div>
        <div v-else-if="current === 'timeSlots'" data-testid="ob-step-timeSlots">
          <StepTimeSlots :status="status" @next="goNext" />
        </div>
        <div v-else-if="current === 'seasons'" data-testid="ob-step-seasons">
          <StepSeasons :status="status" @next="goNext" />
        </div>
        <div v-else-if="current === 'rates'" data-testid="ob-step-rates">
          <StepRates :status="status" @next="goNext" />
        </div>
        <div v-else-if="current === 'summary'" data-testid="ob-step-summary">
          <StepSummary :status="status" />
        </div>
        <div v-else :data-testid="'ob-step-' + current" class="p-8 text-center">
          <h2 class="m-0 text-[15px] font-bold text-[var(--color-text)]">{{ STEP_LABEL[current] }}</h2>
        </div>
      </Card>
    </template>
  </section>
</template>
