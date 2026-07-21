import { describe, it, expect, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import EstablishmentsListView from './EstablishmentsListView.vue';
import { mountApp } from '@/test/utils';
import { resetPlatformSeed } from '@/mocks/server';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('EstablishmentsListView', () => {
  beforeEach(() => resetPlatformSeed());

  it('mostra i lidi seed con il badge Sospeso', async () => {
    const w = mountApp(EstablishmentsListView, { attachTo: document.body });
    await settle();
    // Le righe sono generate dal DataTable data-driven (niente più data-testid sul <tr>).
    expect(w.findAll('tbody tr')).toHaveLength(2);
    expect(w.html()).toContain('Lido Alpha');
    expect(w.html()).toContain('Sospeso');
    w.unmount();
  });

  it('crea un lido → mostra la conferma di invito email (nessuna password)', async () => {
    const w = mountApp(EstablishmentsListView, { attachTo: document.body });
    await settle();
    await w.find('[data-testid="new-establishment"]').trigger('click');
    await settle();
    const name = document.querySelector('[data-testid="create-name"]') as HTMLInputElement;
    name.value = 'Lido Gamma'; name.dispatchEvent(new Event('input', { bubbles: true }));
    const mail = document.querySelector('[data-testid="create-admin-email"]') as HTMLInputElement;
    mail.value = 'a@gamma.test'; mail.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('#form-create-establishment') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(document.querySelector('[data-testid="invite-email"]')!.textContent).toContain('a@gamma.test');
    expect(document.querySelector('[data-testid="invite-expires"]')!.textContent).toBeTruthy();
    expect(document.querySelector('[data-testid="temp-password"]')).toBeNull();
    w.unmount();
  });

  it('sospende un lido attivo → la riga passa a Sospeso', async () => {
    const w = mountApp(EstablishmentsListView, { attachTo: document.body });
    await settle();
    await w.find('[data-testid="suspend-e-1"]').trigger('click');
    await settle();
    const confirmBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('Sospendi'));
    confirmBtn!.click();
    await settle();
    expect(w.html()).toContain('Sospeso');
    w.unmount();
  });
});
