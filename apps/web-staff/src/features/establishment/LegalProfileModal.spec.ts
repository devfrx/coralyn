import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import LegalProfileModal from './LegalProfileModal.vue';

// Il Modal ui-kit teleporta il contenuto in document.body (DialogPortal, mirror EditCustomerModal.spec.ts):
// `wrapper.get()` non lo raggiunge (cerca dentro wrapper.element), quindi si legge/scrive via
// document.querySelector direttamente, come le altre spec di modal del progetto.
describe('LegalProfileModal', () => {
  it('carica il profilo e salva le modifiche via PUT', async () => {
    let putBody: any = null;
    server.use(
      http.get('/api/establishment/legal-profile', () =>
        HttpResponse.json({
          legalName: 'Acme Srl', registeredAddress: null, vatOrTaxId: null, contactEmail: null,
          pec: null, legalRepresentative: null, dataRightsContact: null, dpoNominated: false,
          dpoContact: null, updatedAt: null,
        }),
      ),
      http.put('/api/establishment/legal-profile', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({ ...(putBody as object), updatedAt: '2026-07-24T10:00:00.000Z' });
      }),
    );
    const w = mountApp(LegalProfileModal, { attachTo: document.body, props: { open: true } });
    await flushPromises();
    const legalNameInput = document.querySelector('[data-test="legal-legalName"]') as HTMLInputElement;
    expect(legalNameInput.value).toBe('Acme Srl');
    legalNameInput.value = 'Lido Acme Srl';
    legalNameInput.dispatchEvent(new Event('input', { bubbles: true }));
    (document.querySelector('[data-test="form-legal-profile"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(putBody.legalName).toBe('Lido Acme Srl');
    w.unmount();
  });

  /**
   * ⚠️ Il gemello dal lato della SCRITTURA, stesso ceppo del difetto chiuso in
   * `StaffPermissionsModal.spec.ts`. Qui la posta è più alta: il profilo del titolare alimenta
   * l'informativa art. 13 mostrata ai bagnanti (ADR-0055), e senza i dati letti il PUT
   * invierebbe nove `null` — cancellandolo, con conferma di successo.
   * Riprodotto prima di correggere: `BODY = {"legalName":null, …}` per tutti e nove i campi.
   */
  it('con la lettura in errore, Salva è disabilitato e NON azzera il profilo del titolare', async () => {
    let putBody: unknown = null;
    server.use(
      http.get('/api/establishment/legal-profile', () => new HttpResponse(null, { status: 500 })),
      http.put('/api/establishment/legal-profile', async ({ request }) => {
        putBody = await request.json();
        return HttpResponse.json({});
      }),
    );
    const w = mountApp(LegalProfileModal, { attachTo: document.body, props: { open: true } });
    await flushPromises();
    const salva = document.querySelector('[data-testid="legal-save"]') as HTMLButtonElement;
    expect(salva.disabled).toBe(true);
    // ⚠️ …e anche forzando il submit del form, che il bottone disabilitato non intercetta:
    // è la guardia in `submit()` a doverlo fermare.
    (document.querySelector('[data-test="form-legal-profile"]') as HTMLFormElement)
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flushPromises();
    expect(putBody).toBeNull();
    w.unmount();
  });
});
