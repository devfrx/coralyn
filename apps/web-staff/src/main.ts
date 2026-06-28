import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import { router } from './router';
import { queryClient } from './lib/queryClient';
import './styles/main.css';

async function enableMocking() {
  if (!import.meta.env.DEV) return;
  const { worker } = await import('./mocks/browser');
  // Mappa mockata; /api/clienti non gestito -> passa al backend reale via proxy.
  await worker.start({ onUnhandledRequest: 'bypass' });
}
enableMocking().then(() => {
  createApp(App).use(createPinia()).use(router).use(VueQueryPlugin, { queryClient }).mount('#app');
});
