import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/establishments' },
  { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/establishments', name: 'establishments', component: () => import('@/features/establishments/EstablishmentsListView.vue'), meta: { title: 'Lidi', role: Role.Superuser } },
  { path: '/establishments/:id', name: 'establishment-detail', component: () => import('@/features/establishments/EstablishmentDetailView.vue'), meta: { title: 'Dettaglio lido', role: Role.Superuser } },
  // Pagine legali OPERATORI (D-061, ADR-0056): titolare = Coralyn. Stesso testo di web-staff, dal
  // package condiviso. PUBBLICHE e `bare` di proposito (art. 7 D.Lgs. 70/2003; art. 14.3.a GDPR).
  //
  // NON usare `/privacy`: quel path appartiene all'informativa del BAGNANTE servita da
  // `web-customer`. Vedi il commento esteso nel router di web-staff.
  { path: '/legale/informativa', name: 'legal-privacy', component: () => import('@coralyn/legal').then((m) => m.PrivacyPolicyView), meta: { public: true, bare: true } },
  { path: '/legale/note', name: 'legal-imprint', component: () => import('@coralyn/legal').then((m) => m.ImprintView), meta: { public: true, bare: true } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'login' };
  const required = to.meta.role as Role | undefined;
  if (required && session.role !== required) return { name: 'login' };
  return true;
});
