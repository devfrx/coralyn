import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { http, HttpResponse } from 'msw';
import { CREDENTIAL_SETUP_VALID_TOKEN, server } from '@/mocks/server';
import SetPasswordView from './SetPasswordView.vue';

const push = vi.fn();
let query: Record<string, string> = {};
vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query }),
}));
// AuthLayout importa un asset (logo) che vitest non risolve: lo sostituiamo con uno
// stub che renderizza solo lo slot di default e footer, come nelle altre spec auth.
vi.mock('@/app/AuthLayout.vue', () => ({ default: { template: '<div><slot /><slot name="footer" /></div>' } }));

const stubs = {
  RouterLink: { props: ['to'], template: '<a><slot /></a>' },
};

async function settle() {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

function mountSetPassword() {
  return mount(SetPasswordView, { global: { stubs } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  push.mockClear();
  query = { token: CREDENTIAL_SETUP_VALID_TOKEN };
});

describe('SetPasswordView', () => {
  it('token valido (invito): carica il contesto, intestazione "Attiva" e email', async () => {
    const w = mountSetPassword();
    await settle();

    // Il seed MSW ha purpose 'invite' → intestazione di primo accesso.
    expect(w.find('h1').text()).toBe('Attiva il tuo accesso');
    expect(w.find('[data-testid="sp-email"]').text()).toBe('nuovo.staff@coralyn.dev');
    expect(w.find('[data-testid="sp-submit"]').exists()).toBe(true);
  });

  it('token valido (reset): intestazione "Reimposta la password"', async () => {
    // Override MSW: stesso token valido ma purpose 'reset'.
    server.use(
      http.get('/api/auth/credential-setup/:token', () =>
        HttpResponse.json({ email: 'admin@coralyn.dev', purpose: 'reset' })),
    );
    const w = mountSetPassword();
    await settle();

    expect(w.find('h1').text()).toBe('Reimposta la password');
    expect(w.find('[data-testid="sp-email"]').text()).toBe('admin@coralyn.dev');
  });

  it('token invalido: mostra lo stato di errore con link al login', async () => {
    query = { token: 'token-inesistente' };
    const w = mountSetPassword();
    await settle();

    expect(w.text().toLowerCase()).toContain('non valido');
    const link = w.find('a');
    expect(link.exists()).toBe(true);
    expect(link.text().toLowerCase()).toContain('login');
    expect(w.find('[data-testid="sp-submit"]').exists()).toBe(false);
  });

  it('submit valido: imposta la password e naviga al login', async () => {
    const w = mountSetPassword();
    await settle();

    await w.find('[data-testid="sp-password"]').setValue('password-lunga-1');
    await w.find('[data-testid="sp-confirm"]').setValue('password-lunga-1');
    await w.find('form').trigger('submit.prevent');
    await settle();

    expect(push).toHaveBeenCalledWith({ name: 'login', query: { setPassword: '1' } });
  });

  it('password troppo corta: mostra errore e non chiama il backend', async () => {
    const w = mountSetPassword();
    await settle();

    await w.find('[data-testid="sp-password"]').setValue('corta');
    await w.find('[data-testid="sp-confirm"]').setValue('corta');
    await w.find('form').trigger('submit.prevent');
    await settle();

    expect(w.find('[data-testid="sp-error"]').text()).toContain('almeno 10 caratteri');
    expect(push).not.toHaveBeenCalled();
  });

  it('password e conferma diverse: mostra errore e non chiama il backend', async () => {
    const w = mountSetPassword();
    await settle();

    await w.find('[data-testid="sp-password"]').setValue('password-lunga-1');
    await w.find('[data-testid="sp-confirm"]').setValue('password-lunga-2');
    await w.find('form').trigger('submit.prevent');
    await settle();

    expect(w.find('[data-testid="sp-error"]').text()).toContain('non coincidono');
    expect(push).not.toHaveBeenCalled();
  });

  it('POST fallito: mostra il messaggio del server, non naviga e riabilita il submit', async () => {
    const w = mountSetPassword();
    await settle();

    // Override MSW solo per questo test: il redeem fallisce (es. token scaduto lato server).
    // afterEach (setup.ts) chiama server.resetHandlers(): l'override non contamina gli altri test.
    server.use(
      http.post('/api/auth/credential-setup', () =>
        HttpResponse.json({ statusCode: 404, message: 'Link non valido o scaduto' }, { status: 404 })),
    );

    await w.find('[data-testid="sp-password"]').setValue('password-lunga-1');
    await w.find('[data-testid="sp-confirm"]').setValue('password-lunga-1');
    await w.find('form').trigger('submit.prevent');
    await settle();

    expect(w.find('[data-testid="sp-error"]').text()).toContain('Link non valido o scaduto');
    expect(push).not.toHaveBeenCalled();
    expect(w.find('[data-testid="sp-submit"]').attributes('disabled')).toBeUndefined();
  });
});
