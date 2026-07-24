<script setup lang="ts">
import { ref, watch } from 'vue';
import { Modal, Field, Input, Select, Option, Button } from '@coralyn/ui-kit';
import { pushToast } from '@/lib/toasts';
import { useLegalProfile, useUpdateLegalProfile } from './useEstablishment';

const open = defineModel<boolean>('open', { required: true });
const { data } = useLegalProfile();
const update = useUpdateLegalProfile();

const legalName = ref('');
const registeredAddress = ref('');
const vatOrTaxId = ref('');
const contactEmail = ref('');
const pec = ref('');
const legalRepresentative = ref('');
const dataRightsContact = ref('');
const dpoNominated = ref<'no' | 'si'>('no');
const dpoContact = ref('');

// Precompila (e risincronizza all'apertura) dai valori correnti del profilo legale.
watch(
  () => [open.value, data.value] as const,
  ([isOpen]) => {
    if (!isOpen || !data.value) return;
    legalName.value = data.value.legalName ?? '';
    registeredAddress.value = data.value.registeredAddress ?? '';
    vatOrTaxId.value = data.value.vatOrTaxId ?? '';
    contactEmail.value = data.value.contactEmail ?? '';
    pec.value = data.value.pec ?? '';
    legalRepresentative.value = data.value.legalRepresentative ?? '';
    dataRightsContact.value = data.value.dataRightsContact ?? '';
    dpoNominated.value = data.value.dpoNominated ? 'si' : 'no';
    dpoContact.value = data.value.dpoContact ?? '';
  },
  { immediate: true },
);

function n(v: string): string | null {
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function submit(): void {
  update.mutate(
    {
      legalName: n(legalName.value),
      registeredAddress: n(registeredAddress.value),
      vatOrTaxId: n(vatOrTaxId.value),
      contactEmail: n(contactEmail.value),
      pec: n(pec.value),
      legalRepresentative: n(legalRepresentative.value),
      dataRightsContact: n(dataRightsContact.value),
      dpoNominated: dpoNominated.value === 'si',
      dpoContact: dpoNominated.value === 'si' ? n(dpoContact.value) : null,
    },
    {
      onSuccess: () => {
        pushToast('Dati per l’informativa salvati.');
        open.value = false;
      },
    },
  );
}
</script>

<template>
  <Modal v-model:open="open" title="Dati per l'informativa privacy">
    <form id="form-legal-profile" data-test="form-legal-profile" class="flex flex-col gap-4" @submit.prevent="submit">
      <p class="text-xs leading-relaxed text-[var(--color-text-muted)]">
        Questi dati compaiono nell'informativa privacy mostrata ai tuoi clienti come titolare del
        trattamento. I campi lasciati vuoti appariranno come da compilare.
      </p>
      <Field label="Denominazione / ragione sociale"><Input data-test="legal-legalName" v-model="legalName" /></Field>
      <Field label="Sede legale"><Input data-test="legal-registeredAddress" v-model="registeredAddress" /></Field>
      <Field label="P.IVA / Codice Fiscale"><Input data-test="legal-vatOrTaxId" v-model="vatOrTaxId" /></Field>
      <div class="flex gap-3.5">
        <div class="flex-1"><Field label="Email di contatto"><Input data-test="legal-contactEmail" v-model="contactEmail" type="email" /></Field></div>
        <div class="flex-1"><Field label="PEC"><Input data-test="legal-pec" v-model="pec" type="email" /></Field></div>
      </div>
      <Field label="Legale rappresentante"><Input data-test="legal-legalRepresentative" v-model="legalRepresentative" /></Field>
      <Field label="Contatto per l'esercizio dei diritti"><Input data-test="legal-dataRightsContact" v-model="dataRightsContact" type="email" /></Field>
      <Field label="DPO nominato?">
        <Select data-testid="legal-dpoNominated" v-model="dpoNominated">
          <Option value="no">No</Option>
          <Option value="si">Sì</Option>
        </Select>
      </Field>
      <Field v-if="dpoNominated === 'si'" label="Contatti DPO"><Input data-test="legal-dpoContact" v-model="dpoContact" /></Field>
    </form>
    <template #footer>
      <div class="flex justify-end gap-2.5">
        <Button variant="secondary" type="button" @click="open = false">Annulla</Button>
        <Button type="submit" form="form-legal-profile" :loading="update.isPending.value">Salva</Button>
      </div>
    </template>
  </Modal>
</template>
