import { mount, flushPromises, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createRouter, createMemoryHistory } from 'vue-router';
import { nextTick, type Component } from 'vue';

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

/** Apre un Select di ui-kit (trigger [role=combobox]) e seleziona l'option con la label data.
 *  Il menu è portalato: le option vivono in document.body SOLO a menu aperto.
 *  Selezione su pointerup: è l'evento che reka-ui ascolta (SelectItem.js:119). */
export async function selectOption(trigger: { element: Element } | Element, optionLabel: string): Promise<void> {
  const el = (trigger instanceof Element ? trigger : trigger.element) as HTMLElement;
  el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }));
  await nextTick(); await nextTick();
  const options = Array.from(document.body.querySelectorAll('[role="option"]'));
  const target = options.find((o) => o.textContent?.trim() === optionLabel.trim());
  if (!target) throw new Error(`selectOption: option «${optionLabel}» non trovata. Presenti: ${options.map((o) => o.textContent?.trim()).join(' | ')}`);
  target.dispatchEvent(new Event('pointerup', { bubbles: true }));
  await nextTick(); await nextTick();
  await flushPromises();
}
