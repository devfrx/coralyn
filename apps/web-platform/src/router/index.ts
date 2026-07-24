import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/establishments' },
  { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/establishments', name: 'establishments', component: () => import('@/features/establishments/EstablishmentsListView.vue'), meta: { title: 'Lidi', role: Role.Superuser } },
  { path: '/establishments/:id', name: 'establishment-detail', component: () => import('@/features/establishments/EstablishmentDetailView.vue'), meta: { title: 'Dettaglio lido', role: Role.Superuser } },
  // Pagine legali (D-061, ADR-0056). PUBBLICHE e `bare` di proposito: l'imprint va reso accessibile
  // «in modo diretto e permanente» (art. 7 D.Lgs. 70/2003) e l'informativa va resa anche a chi non
  // ha ancora un account (art. 14.3.a GDPR). Stesso testo di web-staff, dal package condiviso.
  { path: '/privacy', name: 'privacy', component: () => import('@coralyn/legal').then((m) => m.PrivacyPolicyView), meta: { public: true, bare: true } },
  { path: '/note-legali', name: 'imprint', component: () => import('@coralyn/legal').then((m) => m.ImprintView), meta: { public: true, bare: true } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'login' };
  const required = to.meta.role as Role | undefined;
  if (required && session.role !== required) return { name: 'login' };
  return true;
});
