import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import type { Component } from 'vue';

const RouterLinkStub = { props: ['to'], template: '<a><slot /></a>' };

export function mountApp<C extends Component>(comp: C, options: ComponentMountingOptions<C> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(comp, {
    ...options,
    global: {
      plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      stubs: { RouterLink: RouterLinkStub },
      ...(options.global ?? {}),
    },
  });
}
