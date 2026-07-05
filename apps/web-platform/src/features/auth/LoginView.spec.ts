import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { Role } from '@coralyn/contracts';
import LoginView from './LoginView.vue';
import { mountApp } from '@/test/utils';
import * as http from '@/lib/http';

const push = vi.fn();
vi.mock('vue-router', async (orig) => ({ ...(await orig<any>()), useRouter: () => ({ push }) }));

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('LoginView (platform)', () => {
  beforeEach(() => { push.mockReset(); vi.restoreAllMocks(); localStorage.clear(); });

  it('login superuser → naviga a establishments', async () => {
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ accessToken: 't', user: { id: 'su', email: 's@p.test', role: Role.Superuser, establishmentId: null } } as any);
    const w = mountApp(LoginView, { attachTo: document.body });
    await w.find('[data-testid="login-email"]').setValue('s@p.test');
    await w.find('[data-testid="login-password"]').setValue('pw');
    await w.find('[data-testid="login-submit"]').trigger('submit');
    await settle();
    expect(push).toHaveBeenCalledWith({ name: 'establishments' });
    w.unmount();
  });

  it('login non-superuser → messaggio "riservato", nessuna navigazione', async () => {
    vi.spyOn(http, 'apiFetch').mockResolvedValue({ accessToken: 't', user: { id: 'a', email: 'a@lido.test', role: Role.Admin, establishmentId: 'e-1' } } as any);
    const w = mountApp(LoginView, { attachTo: document.body });
    await w.find('[data-testid="login-email"]').setValue('a@lido.test');
    await w.find('[data-testid="login-password"]').setValue('pw');
    await w.find('[data-testid="login-submit"]').trigger('submit');
    await settle();
    expect(w.find('[data-testid="login-error"]').text()).toContain('riservato');
    expect(push).not.toHaveBeenCalled();
    w.unmount();
  });
});
