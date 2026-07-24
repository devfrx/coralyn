import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { useSessionStore } from '@/stores/session';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/abbonamenti' },
  { path: '/attiva', name: 'activation', component: () => import('@/features/subscriptions/ActivationView.vue'), meta: { public: true, bare: true } },
  { path: '/abbonamenti', name: 'my-subscriptions', component: () => import('@/features/subscriptions/MySubscriptionsView.vue'), meta: { title: 'I miei abbonamenti' } },
];

export const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const session = useSessionStore();
  if (!to.meta.public && !session.authenticated) return { name: 'activation' };
  return true;
});
