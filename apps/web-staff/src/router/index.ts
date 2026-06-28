import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Ruolo } from '@driftly/contracts';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/mappa' },
  { path: '/mappa', name: 'mappa', component: () => import('@/features/mappa/MappaView.vue') },
  { path: '/prenotazioni', name: 'prenotazioni', component: () => import('@/features/prenotazioni/PrenotazioniView.vue') },
  { path: '/clienti', name: 'clienti', component: () => import('@/features/clienti/ClientiView.vue') },
  { path: '/listino', name: 'listino', component: () => import('@/features/listino/ListinoView.vue') },
  { path: '/report', name: 'report', component: () => import('@/features/report/ReportView.vue') },
  { path: '/console', name: 'console', component: () => import('@/features/console/ConsoleView.vue'), meta: { ruolo: Ruolo.Superuser } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const required = to.meta.ruolo as Ruolo | undefined;
  if (!required) return true;
  return useSessionStore().ruolo === required ? true : { name: 'mappa' };
});
