import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { Role } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/establishments' },
  { path: '/login', name: 'login', component: () => import('@/features/auth/LoginView.vue'), meta: { public: true, bare: true } },
  { path: '/establishments', name: 'establishments', component: () => import('@/features/establishments/EstablishmentsListView.vue'), meta: { title: 'Lidi', role: Role.Superuser } },
  { path: '/establishments/:id', name: 'establishment-detail', component: () => import('@/features/establishments/EstablishmentDetailView.vue'), meta: { title: 'Dettaglio lido', role: Role.Superuser } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'login' };
  const required = to.meta.role as Role | undefined;
  if (required && session.role !== required) return { name: 'login' };
  return true;
});
