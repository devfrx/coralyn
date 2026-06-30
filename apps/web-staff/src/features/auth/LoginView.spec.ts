import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { useSessionStore } from '@/stores/session';
import { clearToken } from '@/lib/authToken';
import LoginView from './LoginView.vue';

const push = vi.fn();
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }));
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
});

function mountLogin() {
  return mount(LoginView, { global: { stubs } });
}

describe('LoginView', () => {
  it('login valido autentica la sessione e naviga a /mappa', async () => {
    const w = mountLogin();
    await w.find('input[type="email"]').setValue('admin@driftly.dev');
    await w.find('input[type="password"]').setValue('driftly-admin');
    await w.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(useSessionStore().authenticated).toBe(true);
    expect(push).toHaveBeenCalledWith('/mappa');
  });

  it('credenziali errate mostrano un errore e non navigano', async () => {
    const w = mountLogin();
    await w.find('input[type="email"]').setValue('admin@driftly.dev');
    await w.find('input[type="password"]').setValue('sbagliata');
    await w.find('form').trigger('submit.prevent');
    await flushPromises();

    expect(useSessionStore().authenticated).toBe(false);
    expect(push).not.toHaveBeenCalled();
    expect(w.text()).toContain('Email o password non corretti');
  });
});
