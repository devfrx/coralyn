import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import type { PlatformEstablishmentDTO } from '@coralyn/contracts';
import EstablishmentsListView from './EstablishmentsListView.vue';
import { mountApp } from '@/test/utils';
import { server, resetPlatformSeed } from '@/mocks/server';

function makeEstablishment(over: Partial<PlatformEstablishmentDTO> & { id: string; name: string }): PlatformEstablishmentDTO {
  return {
    createdAt: '2026-01-01T00:00:00.000Z', suspendedAt: null,
    sectors: 0, rows: 0, umbrellas: 0, staffUsersActive: 1, lastActivityAt: null,
    revenueSeasonTotal: 0, activeSubscriptions: 0, bookingsThisSeason: 0, occupancyPctToday: 0,
    setupComplete: true,
    ...over,
  };
}

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

  it('senza lidi: messaggio vuoto in-card dentro la tabella', async () => {
    server.use(http.get('/api/platform/establishments', () => HttpResponse.json([])));
    const w = mountApp(EstablishmentsListView, { attachTo: document.body });
    await settle();
    expect(w.find('tbody').text()).toContain('Nessun lido registrato');
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

  it('mostra «Da configurare» per un lido attivo con setupComplete=false', async () => {
    server.use(http.get('/api/platform/establishments', () => HttpResponse.json([
      makeEstablishment({ id: 'e-10', name: 'Lido Incompleto', setupComplete: false }),
      makeEstablishment({ id: 'e-11', name: 'Lido Completo', setupComplete: true }),
    ])));
    const w = mountApp(EstablishmentsListView, { attachTo: document.body });
    await settle();
    expect(w.text()).toContain('Da configurare');
    expect(w.findAll('[data-testid="setup-incomplete"]')).toHaveLength(1);
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
