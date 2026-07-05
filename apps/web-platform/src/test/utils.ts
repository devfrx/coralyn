import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createRouter, createMemoryHistory } from 'vue-router';
import type { Component } from 'vue';

const RouterLinkStub = { props: ['to'], template: '<a><slot /></a>' };

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
}

export function mountApp<C extends Component>(comp: C, options: ComponentMountingOptions<C> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(comp, {
    ...options,
    global: {
      plugins: [createPinia(), [VueQueryPlugin, { queryClient }], makeRouter()],
      stubs: { RouterLink: RouterLinkStub },
      ...(options.global ?? {}),
    },
  });
}
