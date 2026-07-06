import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';
import { http, HttpResponse } from 'msw';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import { useToasts, clearToasts } from '@/lib/toasts';
import CustomerDetailView from './CustomerDetailView.vue';

async function settle() {
  await flushPromises();
  await new Promise((r) => setTimeout(r, 0));
  await flushPromises();
}

// Le sezioni A/B/C/D (azione GDPR elimina/anonimizza) hanno bisogno di spiare router.push;
// manteniamo il resto del modulo reale (mountApp lo usa per i test esistenti sopra) e
// sovrascriviamo solo useRouter, mirroring di LoginView.spec.ts.
const push = vi.fn();
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>();
  return { ...actual, useRouter: () => ({ push }) };
});

const RouterLinkStub = { props: ['to'], template: '<a><slot /></a>' };

function mountDetail(id: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(CustomerDetailView, {
    props: { id },
    attachTo: document.body,
    global: {
      plugins: [createPinia(), [VueQueryPlugin, { queryClient }]],
      stubs: { RouterLink: RouterLinkStub },
    },
  });
}

function setRole(role: Role) {
  const session = useSessionStore();
  session.user = { id: 'u-1', email: 'admin@coralyn.dev', role, establishmentId: 'e-1' };
}

describe('CustomerDetailView', () => {
  it('mostra header e anagrafica del cliente', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Mario');
    expect(w.text()).toContain('Rossi');
    // email/telefono sono campi editabili: il valore vive nel DOM dell'input, non nel testo
    expect((w.find('input[name="email"]').element as HTMLInputElement).value).toBe('mario.rossi@email.it');
    expect((w.find('input[name="phone"]').element as HTMLInputElement).value).toBe('+39 333 1111111');
  });

  it('storico: raggruppa per stagione con conteggio, mostra chip settore e stato', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Estate 2026');
    expect(w.text()).toContain('Estate 2027');
    expect(w.text()).toContain('Centro · A12');
    expect(w.text()).toContain('Giornaliera');
    expect(w.text()).toContain('Abbonamento');
    expect(w.text()).toMatch(/3\s*prenotazioni/);
    expect(w.text()).toContain('Confermata');
    expect(w.text()).toContain('Annullata');
  });

  it('abbonamento: numero-grande anzianità, badge pacchetto e badge Rinnovato', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Rinnovato');
    expect(w.text()).toContain('Comfort');
    expect(w.text()).toContain('STAGIONI');
    expect(w.text()).toMatch(/Abbonato da 2 stagioni/);
  });

  it('pagamenti: due StatTile (saldo/incassato) e tabella con metodo tradotto', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Saldo aperto');
    expect(w.text()).toContain('Incassato');
    expect(w.text()).toContain('€ 30.00');
    expect(w.text()).toContain('€ 620.00');
    expect(w.text()).toContain('Carta');
  });

  it('mostra la nota di prelazione aperta nella card abbonamento', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    expect(w.text()).toContain('Prelazione');
    expect(w.text()).toContain('Estate 2028');
    expect(w.text()).toContain('2028-04-30');
  });

  it('modifica il telefono e lo rilegge aggiornato', async () => {
    const w = mountApp(CustomerDetailView, { props: { id: 'c-1' } });
    await settle();
    const tel = w.find('input[name="phone"]');
    await tel.setValue('+39 333 9999999');
    await w.find('form').trigger('submit.prevent');
    await settle();
    // dopo il PATCH, l'invalidazione rilegge il dettaglio e il watch ripopola l'input col valore salvato
    expect((w.find('input[name="phone"]').element as HTMLInputElement).value).toBe('+39 333 9999999');
  });

  describe('azione GDPR elimina/anonimizza (D-024)', () => {
    let activeWrapper: ReturnType<typeof mountDetail> | null = null;
    function mountAndTrack(id: string) {
      activeWrapper = mountDetail(id);
      return activeWrapper;
    }

    afterEach(() => {
      server.resetHandlers();
      push.mockClear();
      clearToasts();
      activeWrapper?.unmount();
      activeWrapper = null;
      document.body.innerHTML = '';
    });

    it('admin + cliente senza prenotazioni: "Elimina cliente" → conferma → DELETE chiamato → naviga a /customers', async () => {
      const w = mountAndTrack('c-2'); // c-2: nessuna prenotazione (seed)
      setRole(Role.Admin);
      await settle();
      const btn = w.find('[data-testid="delete-customer"]');
      expect(btn.exists()).toBe(true);
      expect(btn.text()).toContain('Elimina cliente');
      expect(btn.attributes('disabled')).toBeUndefined();

      await btn.trigger('click');
      await settle();
      const confirmBtn = Array.from(document.body.querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === 'Elimina');
      expect(confirmBtn).toBeTruthy();
      confirmBtn!.click();
      await settle();

      expect(push).toHaveBeenCalledWith('/customers');
    });

    it('staff: nessun bottone di eliminazione', async () => {
      const w = mountAndTrack('c-2');
      setRole(Role.Staff);
      await settle();
      expect(w.find('[data-testid="delete-customer"]').exists()).toBe(false);
    });

    it('admin + storico con prenotazione attiva/futura: bottone disabilitato + hint', async () => {
      const w = mountAndTrack('c-1'); // c-1: ha una prenotazione confirmed con endDate futura (seed)
      setRole(Role.Admin);
      await settle();
      const btn = w.find('[data-testid="delete-customer"]');
      expect(btn.exists()).toBe(true);
      expect(btn.attributes('disabled')).toBeDefined();
      expect(w.find('[data-testid="delete-customer-hint"]').exists()).toBe(true);
    });

    it('409 dal server: pushToast con il messaggio d\'errore, nessuna navigazione', async () => {
      const errorMessage = 'Il cliente ha prenotazioni attive o future: annullale o attendi la scadenza prima di rimuovere i dati.';
      server.use(
        http.delete('*/api/customers/:id', () => HttpResponse.json({ message: errorMessage }, { status: 409 })),
      );
      const w = mountAndTrack('c-2');
      setRole(Role.Admin);
      await settle();
      await w.find('[data-testid="delete-customer"]').trigger('click');
      await settle();
      const confirmBtn = Array.from(document.body.querySelectorAll('button'))
        .find((b) => b.textContent?.trim() === 'Elimina');
      confirmBtn!.click();
      await settle();

      expect(useToasts().items.map((t) => t.message)).toContain(errorMessage);
      expect(push).not.toHaveBeenCalled();
    });
  });
});
