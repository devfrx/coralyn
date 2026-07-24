import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import PrivacyView from './PrivacyView.vue';
import { useMyInformativa, usePublicInformativa } from './useInformativa';

vi.mock('./useInformativa', () => ({
  useMyInformativa: vi.fn(),
  usePublicInformativa: vi.fn(),
}));

const TITOLARE = {
  establishmentName: 'Lido Test', legalName: null, registeredAddress: null, vatOrTaxId: null,
  contactEmail: null, pec: null, legalRepresentative: null, dataRightsContact: null,
  dpoNominated: false, dpoContact: null,
};

beforeEach(() => {
  vi.mocked(usePublicInformativa).mockReturnValue({ data: ref(TITOLARE) } as any);
  vi.mocked(useMyInformativa).mockReturnValue({ data: ref(null) } as any);
});

describe('PrivacyView', () => {
  it('mostra le sezioni fisse e [COMPILARE] sui campi mancanti del titolare', async () => {
    const w = mountApp(PrivacyView, { attachTo: document.body });
    await flushPromises();
    expect(w.text()).toContain('I tuoi diritti');
    expect(w.text()).toContain('[COMPILARE]'); // legalName null
    expect(w.get('[data-testid="informativa-version"]').text()).toContain('1.0');
    w.unmount();
  });

  it('gating: da sloggati senza ?e= nessuna delle due query e abilitata', async () => {
    mountApp(PrivacyView, { attachTo: document.body });
    await flushPromises();
    const myEnabled = vi.mocked(useMyInformativa).mock.calls.at(-1)?.[0];
    const publicEnabled = vi.mocked(usePublicInformativa).mock.calls.at(-1)?.[1];
    expect(myEnabled?.()).toBe(false);
    expect(publicEnabled?.()).toBe(false);
  });
});
