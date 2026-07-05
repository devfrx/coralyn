import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import { useSessionStore } from './stores/session';
import './styles/main.css';

async function cleanupDevServiceWorker(): Promise<boolean> {
  // In dev NON usiamo mock nel browser: tutte le /api vanno al backend reale via proxy Vite,
  // quindi in dev non registriamo alcun service worker. Rimuoviamo però un eventuale worker MSW
  // registrato in passato: resta "sticky" e intercetta le navigazioni SPA, facendone fallire il
  // passthrough (TypeError: Failed to fetch su richieste mode: 'navigate'). La produzione usa il
  // SW di VitePWA e non è toccata (guardia su import.meta.env.DEV).
  if (!import.meta.env.DEV || !('serviceWorker' in navigator)) return false;
  const registrations = await navigator.serviceWorker.getRegistrations();
  if (registrations.length === 0) return false;
  await Promise.all(registrations.map((r) => r.unregister()));
  // Un worker già attivo continua a controllare QUESTA pagina finché non la si ricarica senza
  // controller. Se ci sta controllando, forziamo un reload one-shot: al giro successivo la pagina
  // non è più controllata (controller === null → nessun loop) e l'errore di passthrough sparisce.
  if (navigator.serviceWorker.controller) {
    window.location.reload();
    return true;
  }
  return false;
}

async function bootstrap() {
  if (await cleanupDevServiceWorker()) return; // stiamo ricaricando senza SW: non montare ora
  const app = createApp(App);
  app.use(createPinia()).use(VueQueryPlugin, { queryClient });
  // Reidrata la sessione da un eventuale token persistito (valida via /me) PRIMA di
  // montare il router, così il primo navigation guard vede lo stato corretto.
  await useSessionStore().rehydrate();
  app.use(router);
  app.mount('#app');
}

void bootstrap();
