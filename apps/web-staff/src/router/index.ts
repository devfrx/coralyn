import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/map' },
  { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/register', name: 'register', component: () => import('@/features/auth/RegisterView.vue'), meta: { public: true, bare: true } },
  { path: '/imposta-password', name: 'set-password', component: () => import('@/features/auth/SetPasswordView.vue'), meta: { public: true, bare: true } },
  { path: '/map', name: 'map', component: () => import('@/features/map/MapView.vue'), meta: { title: 'Mappa', subtitle: 'Vista per giornata', usesDate: true } },
  { path: '/bookings', name: 'bookings', component: () => import('@/features/bookings/BookingsView.vue'), meta: { title: 'Prenotazioni', subtitle: 'Prenotazioni e incassi della giornata', usesDate: true } },
  { path: '/renewals', name: 'renewals', component: () => import('@/features/renewals/RenewalsView.vue'), meta: { title: 'Rinnovi', subtitle: 'Campagna rinnovi abbonamenti' } },
  { path: '/customers', name: 'customers', component: () => import('@/features/customers/CustomersView.vue'), meta: { title: 'Clienti', subtitle: 'Anagrafica dei bagnanti' } },
  { path: '/customers/:id', name: 'customer-detail', component: () => import('@/features/customers/CustomerDetailView.vue'), props: true, meta: { title: 'Scheda cliente', subtitle: 'Anagrafica e attività del bagnante' } },
  { path: '/pricing', name: 'pricing', component: () => import('@/features/pricing/PricingView.vue'), meta: { title: 'Listino', subtitle: 'Pacchetti, tariffe e fasce' } },
  { path: '/rentals', name: 'rentals', component: () => import('@/features/rentals/RentalsView.vue'), meta: { title: 'Noleggi', subtitle: 'Banco noleggio della giornata', usesDate: true } },
  { path: '/rentals/catalogo', name: 'rentals-catalog', component: () => import('@/features/rentals/RentalCatalogView.vue'), meta: { title: 'Listino noleggi', subtitle: 'Articoli e tariffe stagionali' } },
  { path: '/report', name: 'report', component: () => import('@/features/report/ReportView.vue'), meta: { title: 'Report', subtitle: 'Andamento della stagione' } },
  { path: '/establishment', name: 'establishment', component: () => import('@/features/establishment/EstablishmentView.vue'), meta: { title: 'Stabilimento', subtitle: 'Configurazione e team' } },
  { path: '/establishment/structure', name: 'establishment-structure', component: () => import('@/features/establishment/EstablishmentStructureView.vue'), meta: { title: 'Struttura', subtitle: 'Settori, file, ombrelloni e tipologie', role: Role.Admin } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'login' };
  const required = to.meta.role as Role | undefined;
  if (required && session.role !== required) return { name: 'map' };
  return true;
});
