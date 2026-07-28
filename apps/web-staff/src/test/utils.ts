import { mount, flushPromises, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createRouter, createMemoryHistory } from 'vue-router';
import { nextTick, type Component } from 'vue';
import { Permission, Role } from '@coralyn/contracts';

/**
 * I permessi effettivi di un ruolo secondo il **default di fabbrica** (ADR-0063), per i test.
 *
 * Derivati dall'enum e non scritti a mano: un permesso nuovo entra da solo, e nessuno spec resta
 * a esercitare un utente incompleto senza che il compilatore lo dica.
 *
 * ⚠️ Riproduce `PERMISSION_ROLES` dell'API. Non è una duplicazione che può divergere in silenzio:
 * `authorization-staff.e2e-spec.ts` asserisce le stesse superfici sul backend vero, quindi una
 * divergenza fa cadere quella suite.
 */
const STAFF_DEFAULT: readonly Permission[] = [
  Permission.MapRead, Permission.BookingsManage, Permission.CustomersManage,
  Permission.RentalsOperate, Permission.RentalCatalogManage, Permission.PricingManage,
  Permission.RenewalsManage, Permission.ReportsRead, Permission.EstablishmentRead,
  Permission.StructureRead, Permission.SessionRead,
];

export function permissionsOfRole(role: Role): Permission[] {
  if (role === Role.Superuser) return [Permission.PlatformAdminister, Permission.SessionRead];
  if (role === Role.Staff) return [...STAFF_DEFAULT];
  // Admin: tutto tranne il permesso di piattaforma, che non è del lido.
  return Object.values(Permission).filter((p) => p !== Permission.PlatformAdminister);
}

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

/** Apre il Popover-calendario (click sul trigger) e clicca il giorno indicato del mese mostrato.
 *  Il contenuto del Popover è portalato: le celle vivono in document.body SOLO a popover aperto.
 *  Le celle fuori-mese (data-outside-view) sono escluse per non colpire numeri di mesi adiacenti. */
export async function pickCalendarDay(trigger: { element: Element } | Element, day: number): Promise<void> {
  const el = (trigger instanceof Element ? trigger : trigger.element) as HTMLElement;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick(); await nextTick();
  const cells = Array.from(document.body.querySelectorAll('[data-reka-calendar-cell-trigger]:not([data-outside-view])'));
  const target = cells.find((c) => c.textContent?.trim() === String(day));
  if (!target) throw new Error(`pickCalendarDay: giorno ${day} non trovato. Presenti: ${cells.map((c) => c.textContent?.trim()).join(' ')}`);
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick(); await nextTick();
  await flushPromises();
}
