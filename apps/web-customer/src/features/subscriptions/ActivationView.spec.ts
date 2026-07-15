import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import ActivationView from './ActivationView.vue';
import { useSessionStore } from '@/stores/session';

const push = vi.fn();
vi.mock('vue-router', async (orig) => ({
  ...(await orig<any>()),
  useRoute: () => ({ query: { token: 'enroll-tok' } }),
  useRouter: () => ({ push }),
}));

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('ActivationView', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('submit (token dalla query + PIN inserito) chiama session.activate(token, pin) e naviga a /abbonamenti', async () => {
    const w = mountApp(ActivationView, { attachTo: document.body });
    const session = useSessionStore();
    const activateSpy = vi.spyOn(session, 'activate').mockResolvedValue(undefined);

    const pinInput = document.querySelector('[data-testid="activation-pin"]') as HTMLInputElement;
    pinInput.value = '4321';
    pinInput.dispatchEvent(new Event('input'));
    await settle();

    (document.querySelector('[data-testid="activation-submit"]') as HTMLButtonElement).click();
    await settle();

    expect(activateSpy).toHaveBeenCalledWith('enroll-tok', '4321');
    expect(push).toHaveBeenCalledWith('/abbonamenti');
    w.unmount();
  });

  it('su fallimento mostra un messaggio generico (nessun dettaglio d\'auth) e non naviga', async () => {
    const w = mountApp(ActivationView, { attachTo: document.body });
    const session = useSessionStore();
    vi.spyOn(session, 'activate').mockRejectedValue(new Error('PIN errato per questo token'));

    const pinInput = document.querySelector('[data-testid="activation-pin"]') as HTMLInputElement;
    pinInput.value = '0000';
    pinInput.dispatchEvent(new Event('input'));
    await settle();

    (document.querySelector('[data-testid="activation-submit"]') as HTMLButtonElement).click();
    await settle();

    const error = document.querySelector('[data-testid="activation-error"]');
    expect(error?.textContent).not.toContain('PIN errato');
    expect(error?.textContent).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    w.unmount();
  });
});
