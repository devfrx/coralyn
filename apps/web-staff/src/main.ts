import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import { useSessionStore } from './stores/session';
import './styles/main.css';

async function enableMocking() {
  if (!import.meta.env.DEV) return;
  const { worker } = await import('./mocks/browser');
  // Nessun mock in dev (handlers vuoto): tutte le /api passano al backend reale via proxy.
  await worker.start({ onUnhandledRequest: 'bypass' });
}

async function bootstrap() {
  await enableMocking();
  const app = createApp(App);
  app.use(createPinia()).use(VueQueryPlugin, { queryClient });
  // Reidrata la sessione da un eventuale token persistito (valida via /me) PRIMA di
  // montare il router, così il primo navigation guard vede lo stato corretto.
  await useSessionStore().rehydrate();
  app.use(router);
  app.mount('#app');
}

void bootstrap();
