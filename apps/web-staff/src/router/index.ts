import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Ruolo } from '@driftly/contracts';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/mappa' },
  { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/registrazione', name: 'registrazione', component: () => import('@/features/auth/RegistrazioneView.vue'), meta: { public: true, bare: true } },
  { path: '/mappa', name: 'mappa', component: () => import('@/features/mappa/MappaView.vue'), meta: { title: 'Mappa', subtitle: 'Lido Maestrale · 47 ombrelloni · vista per giornata' } },
  { path: '/prenotazioni', name: 'prenotazioni', component: () => import('@/features/prenotazioni/PrenotazioniView.vue'), meta: { title: 'Prenotazioni', subtitle: 'Prenotazioni e incassi della giornata' } },
  { path: '/clienti', name: 'clienti', component: () => import('@/features/clienti/ClientiView.vue'), meta: { title: 'Clienti', subtitle: 'Anagrafica dei bagnanti' } },
  { path: '/clienti/:id', name: 'cliente-dettaglio', component: () => import('@/features/clienti/ClienteDettaglioView.vue'), props: true, meta: { title: 'Scheda cliente', subtitle: 'Anagrafica e attività del bagnante' } },
  { path: '/listino', name: 'listino', component: () => import('@/features/listino/ListinoView.vue'), meta: { title: 'Listino', subtitle: 'Pacchetti, tariffe e fasce' } },
  { path: '/report', name: 'report', component: () => import('@/features/report/ReportView.vue'), meta: { title: 'Report', subtitle: 'Andamento della stagione' } },
  { path: '/console', name: 'console', component: () => import('@/features/console/ConsoleView.vue'), meta: { title: 'Console', subtitle: 'Strumenti di piattaforma', ruolo: Ruolo.Superuser } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'login' };
  const required = to.meta.ruolo as Ruolo | undefined;
  if (required && session.ruolo !== required) return { name: 'mappa' };
  return true;
});
