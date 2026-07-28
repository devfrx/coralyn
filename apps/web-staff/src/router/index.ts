import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Permission } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';
import { resolvePermissionGuard } from './permissionGuard';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/map' },
  { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/register', name: 'register', component: () => import('@/features/auth/RegisterView.vue'), meta: { public: true, bare: true } },
  { path: '/imposta-password', name: 'set-password', component: () => import('@/features/auth/SetPasswordView.vue'), meta: { public: true, bare: true } },
  // ⚠️ `meta.permission` sostituisce `meta.role` (ADR-0063), e non solo sulle due rotte che
  // avevano un ruolo: ogni rotta dichiara il permesso della propria superficie, così un operatore
  // a cui l'admin ha revocato un'area non ci arriva nemmeno digitando l'URL. Resta cortesia — la
  // protezione è il 403 del backend — ma evita la schermata vuota di AUD-012.
  { path: '/map', name: 'map', component: () => import('@/features/map/MapView.vue'), meta: { title: 'Mappa', subtitle: 'Vista per giornata', usesDate: true, permission: Permission.MapRead } },
  { path: '/bookings', name: 'bookings', component: () => import('@/features/bookings/BookingsView.vue'), meta: { title: 'Prenotazioni', subtitle: 'Prenotazioni e incassi della giornata', usesDate: true, permission: Permission.BookingsManage } },
  { path: '/renewals', name: 'renewals', component: () => import('@/features/renewals/RenewalsView.vue'), meta: { title: 'Rinnovi', subtitle: 'Campagna rinnovi abbonamenti', permission: Permission.RenewalsManage } },
  { path: '/customers', name: 'customers', component: () => import('@/features/customers/CustomersView.vue'), meta: { title: 'Clienti', subtitle: 'Anagrafica dei bagnanti', permission: Permission.CustomersManage } },
  { path: '/customers/:id', name: 'customer-detail', component: () => import('@/features/customers/CustomerDetailView.vue'), props: true, meta: { title: 'Scheda cliente', subtitle: 'Anagrafica e attività del bagnante', permission: Permission.CustomersManage } },
  { path: '/pricing', name: 'pricing', component: () => import('@/features/pricing/PricingView.vue'), meta: { title: 'Listino', subtitle: 'Pacchetti, tariffe e fasce', permission: Permission.PricingManage } },
  { path: '/rentals', name: 'rentals', component: () => import('@/features/rentals/RentalsView.vue'), meta: { title: 'Noleggi', subtitle: 'Banco noleggio della giornata', usesDate: true, permission: Permission.RentalsOperate } },
  { path: '/rentals/catalogo', name: 'rentals-catalog', component: () => import('@/features/rentals/RentalCatalogView.vue'), meta: { title: 'Listino noleggi', subtitle: 'Articoli e tariffe stagionali', permission: Permission.RentalCatalogManage } },
  { path: '/report', name: 'report', component: () => import('@/features/report/ReportView.vue'), meta: { title: 'Report', subtitle: 'Andamento della stagione', permission: Permission.ReportsRead } },
  { path: '/establishment', name: 'establishment', component: () => import('@/features/establishment/EstablishmentView.vue'), meta: { title: 'Stabilimento', subtitle: 'Configurazione e team', permission: Permission.EstablishmentRead } },
  { path: '/establishment/structure', name: 'establishment-structure', component: () => import('@/features/establishment/EstablishmentStructureView.vue'), meta: { title: 'Struttura', subtitle: 'Settori, file, ombrelloni e tipologie', permission: Permission.StructureManage } },
  { path: '/onboarding', name: 'onboarding', component: () => import('@/features/onboarding/OnboardingView.vue'), meta: { title: 'Configurazione guidata', subtitle: 'Prepara il lido a incassare la prima prenotazione', permission: Permission.EstablishmentManage } },
  // Pagine legali OPERATORI (D-061, ADR-0056): titolare = Coralyn, riguardano chi USA il gestionale.
  // PUBBLICHE e `bare` di proposito: l'imprint va reso accessibile «in modo diretto e permanente»
  // (art. 7 D.Lgs. 70/2003) e l'informativa va resa anche a chi non ha ancora un account
  // (art. 14.3.a GDPR). Testo condiviso da `@coralyn/legal`, mai duplicato.
  //
  // NON usare `/privacy`: quel path appartiene all'informativa del BAGNANTE, servita da
  // `web-customer` con `?e=<establishmentId>` e titolare = il lido. Sono documenti diversi, per
  // interessati diversi. Tenerli su path distinti rende strutturalmente impossibile che un URL
  // relativo o un origin mal configurato faccia comparire l'uno al posto dell'altro.
  { path: '/legale/informativa', name: 'legal-privacy', component: () => import('@coralyn/legal').then((m) => m.PrivacyPolicyView), meta: { public: true, bare: true } },
  { path: '/legale/note', name: 'legal-imprint', component: () => import('@coralyn/legal').then((m) => m.ImprintView), meta: { public: true, bare: true } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'login' };
  // La decisione vive in `permissionGuard.ts`, funzione pura e provata a parte: il ripiego
  // anti-loop è la parte delicata e non deve dipendere da Pinia per essere verificabile.
  return resolvePermissionGuard(session, { path: to.path, permission: to.meta.permission });
});
