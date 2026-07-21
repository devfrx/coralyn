import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { clearToken } from '@/lib/authToken';
import LoginView from './LoginView.vue';

const push = vi.fn();
const routeMock: { query: Record<string, string> } = { query: {} };
vi.mock('vue-router', () => ({ useRouter: () => ({ push }), useRoute: () => routeMock }));
// AuthLayout importa un asset (logo) che vitest non risolve: lo sostituiamo con uno
// stub che renderizza solo lo slot di default (il form), che è ciò che testiamo.
vi.mock('@/app/AuthLayout.vue', () => ({ default: { template: '<div><slot /></div>' } }));

const stubs = {
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
};

beforeEach(() => {
  setActivePinia(createPinia());
  clearToken();
  push.mockClear();
  routeMock.query = {};
});

function mountLogin() {
  return mount(LoginView, { global: { stubs } });
}

describe('LoginView', () => {
  it('login valido autentica la sessione e naviga alla mappa', async () => {
    const w = mountLogin();
    await w.find('input[type="email"]').setValue('admin@coralyn.dev');
    await w.find('input[type="password"]').setValue('coralyn-admin');
    await w.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(useSessionStore().authenticated).toBe(true);
    expect(push).toHaveBeenCalledWith({ name: 'map' });
  });

  it('dopo il login torna alla rotta in ?redirect quando è un path interno sicuro (D-037)', async () => {
    routeMock.query = { redirect: '/customers/c-1' };
    const w = mountLogin();
    await w.find('input[type="email"]').setValue('admin@coralyn.dev');
    await w.find('input[type="password"]').setValue('coralyn-admin');
    await w.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(push).toHaveBeenCalledWith('/customers/c-1');
  });

  it('ignora un ?redirect non sicuro (open-redirect) e va alla mappa (D-037)', async () => {
    routeMock.query = { redirect: '//evil.example' };
    const w = mountLogin();
    await w.find('input[type="email"]').setValue('admin@coralyn.dev');
    await w.find('input[type="password"]').setValue('coralyn-admin');
    await w.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(push).toHaveBeenCalledWith({ name: 'map' });
  });

  it('credenziali errate mostrano un errore e non navigano', async () => {
    const w = mountLogin();
    await w.find('input[type="email"]').setValue('admin@coralyn.dev');
    await w.find('input[type="password"]').setValue('sbagliata');
    await w.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(useSessionStore().authenticated).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(w.text()).toContain('Email o password non corretti');
  });

  it('mostra la conferma quando si arriva da set-password (?setPassword=1)', () => {
    routeMock.query = { setPassword: '1' };
    const w = mountLogin();
    expect(w.find('[data-testid="login-set-password-ok"]').exists()).toBe(true);
    expect(w.text()).toContain('Password impostata');
  });

  it('nessuna conferma senza il parametro setPassword', () => {
    const w = mountLogin();
    expect(w.find('[data-testid="login-set-password-ok"]').exists()).toBe(false);
  });
});
