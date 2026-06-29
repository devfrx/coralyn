import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Ruolo } from '@driftly/contracts';

const TENANT_DEV = '00000000-0000-0000-0000-000000000001';

export const useSessionStore = defineStore('session', () => {
  const stabilimentoId = ref<string>(TENANT_DEV); // provvisorio, sostituito dal JWT
  const nomeStabilimento = ref<string>('Lido Maestrale');
  const dataAttiva = ref<string>('2026-06-27'); // ISO yyyy-mm-dd
  const ruolo = ref<Ruolo>(Ruolo.Admin);
  const utenteEmail = ref<string>('giulia@lidomaestrale.it');
  // Seam auth FE (mock): il vero login→JWT vive sul branch backend. authenticated=true in dev
  // così l'app è visibile; login()/logout() pilotano il guard.
  const authenticated = ref<boolean>(true);
  function login() { authenticated.value = true; }
  function logout() { authenticated.value = false; }
  return { stabilimentoId, nomeStabilimento, dataAttiva, ruolo, utenteEmail, authenticated, login, logout };
});
