import { mount } from '@vue/test-utils';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { defineComponent, h } from 'vue';

/** Monta un componente-guscio il cui solo scopo è dare un contesto di setup ai composable sotto
 *  test. Diversamente da `mountApp` delle app, qui NON servono Pinia né il router: il data-layer
 *  non li conosce, ed esigerli nel test suggerirebbe una dipendenza che non esiste. */
export function mountHook<T>(setupFn: () => T, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  let api!: T;
  const Host = defineComponent({
    setup() {
      api = setupFn();
      return () => h('div');
    },
  });
  const w = mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
  return { w, api: () => api };
}
