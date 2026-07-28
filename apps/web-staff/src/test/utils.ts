import { mount, flushPromises, type ComponentMountingOptions } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { createRouter, createMemoryHistory } from 'vue-router';
import { nextTick, type Component } from 'vue';
import { Permission, Role, permissionsOfRoleDefault, type UserDTO } from '@coralyn/contracts';
import { useSessionStore } from '@/stores/session';

/**
 * I permessi effettivi di un ruolo secondo il **default di fabbrica** (ADR-0063).
 *
 * ⚠️ **Derivati davvero**, da `PERMISSION_ROLES` in `@coralyn/contracts` (ADR-0064). Prima qui
 * c'era una lista dello staff **ricopiata a mano** sotto un commento che la dichiarava derivata,
 * e nulla la legava all'originale: con il gating per query, una divergenza avrebbe fatto
 * esercitare all'intera suite un operatore che nel backend non esiste.
 */
export function permissionsOfRole(role: Role): Permission[] {
  return [...permissionsOfRoleDefault(role)];
}

const RouterLinkStub = { props: ['to'], template: '<a><slot /></a>' };

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] });
}

/** Operatore di default del banco di prova: admin, cioè tutti i permessi del lido. */
export const DEFAULT_TEST_USER: UserDTO = {
  id: 'u-test', email: 'admin@coralyn.dev', role: Role.Admin,
  establishmentId: 'e-1', establishmentName: 'Lido',
  permissions: permissionsOfRole(Role.Admin),
};

/**
 * ⚠️ **Monta con una sessione autenticata**, non con `user = null`.
 *
 * Da [ADR-0064](../../../../docs/architecture/decisions/0064-permessi-vicini-gate-per-query.md)
 * ogni query dichiara il permesso del suo endpoint (`enabled`), e a sessione assente
 * `hasPermission` nega tutto — fail-closed, per costruzione. Montare senza sessione significa
 * quindi non far partire NESSUNA query. **Dei 61 spec, 39 usano `mountApp` e 23 di questi non
 * impostavano alcuna sessione**: esercitavano uno stato che nell'app non esiste, perché ogni vista
 * sta dietro il guard d'autenticazione.
 *
 * Il default è l'**admin** perché è il ruolo per cui tutte le query partono, come accadeva prima.
 * ⚠️ Non è però una trasformazione neutra: tre test di `EstablishmentStructureView.spec.ts`
 * dichiaravano «staff» affidandosi all'assenza di sessione — che nega *tutto*, non solo ciò che lo
 * staff non ha — e sono stati resi espliciti. Chi deve provare un operatore RISTRETTO passa `user`
 * al mount (terzo argomento), che è l'unico modo corretto: riscrivere `session.user` DOPO il mount
 * lascia in cache i dati già scaricati da admin.
 */
export function mountApp<C extends Component>(
  comp: C,
  options: ComponentMountingOptions<C> = {},
  session: { user?: UserDTO | null } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pinia = createPinia();
  setActivePinia(pinia);
  useSessionStore().user = session.user === undefined ? DEFAULT_TEST_USER : session.user;
  return mount(comp, {
    ...options,
    global: {
      plugins: [pinia, [VueQueryPlugin, { queryClient }], makeRouter()],
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
