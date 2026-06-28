import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Ruolo } from '@driftly/contracts';

const TENANT_DEV = '00000000-0000-0000-0000-000000000001';

export const useSessionStore = defineStore('session', () => {
  const stabilimentoId = ref<string>(TENANT_DEV); // provvisorio, Piano 2 -> JWT
  const nomeStabilimento = ref<string>('Lido Sole');
  const dataAttiva = ref<string>('2026-06-27'); // ISO yyyy-mm-dd
  const ruolo = ref<Ruolo>(Ruolo.Staff);
  return { stabilimentoId, nomeStabilimento, dataAttiva, ruolo };
});
