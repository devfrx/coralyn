import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import MySubscriptionsView from './MySubscriptionsView.vue';
import { useMySubscriptions, useReleaseAbsence, useCancelRelease } from './useMySubscriptions';

vi.mock('./useMySubscriptions', () => ({
  useMySubscriptions: vi.fn(),
  useReleaseAbsence: vi.fn(),
  useCancelRelease: vi.fn(),
}));

function mutationStub() {
  return { mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: ref(false), variables: ref(undefined) };
}

function makeSub(overrides: Partial<CustomerBookingDTO> = {}): CustomerBookingDTO {
  return {
    id: 'sub-1',
    umbrellaId: 'u1',
    timeSlotId: 's1',
    startDate: '2026-05-01',
    endDate: '2026-09-30',
    type: 'subscription',
    status: 'confirmed',
    totalPrice: 800,
    paymentStatus: 'paid',
    amountCollected: 800,
    umbrellaLabel: 'A12',
    absenceReleases: [],
    ...overrides,
  };
}

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

describe('MySubscriptionsView', () => {
  beforeEach(() => {
    vi.mocked(useReleaseAbsence).mockImplementation(() => mutationStub() as any);
    vi.mocked(useCancelRelease).mockImplementation(() => mutationStub() as any);
  });

  it('renderizza le righe da useMySubscriptions con umbrellaLabel', async () => {
    vi.mocked(useMySubscriptions).mockReturnValue({ data: ref([makeSub()]), isLoading: ref(false) } as any);
    const w = mountApp(MySubscriptionsView, { attachTo: document.body });
    await settle();
    expect(w.findAll('[data-testid="subscription-row"]')).toHaveLength(1);
    expect(w.html()).toContain('A12');
    w.unmount();
  });

  it('mostra "Segnala assenza" quando il consenso assenze è attivo', async () => {
    vi.mocked(useMySubscriptions).mockReturnValue({
      data: ref([makeSub({ absenceConsentAt: '2026-06-01T10:00:00Z' })]),
      isLoading: ref(false),
    } as any);
    const w = mountApp(MySubscriptionsView, { attachTo: document.body });
    await settle();
    expect(w.find('[data-testid="report-absence-sub-1"]').exists()).toBe(true);
    w.unmount();
  });

  it('nasconde "Segnala assenza" quando il consenso assenze non è attivo', async () => {
    vi.mocked(useMySubscriptions).mockReturnValue({
      data: ref([makeSub({ absenceConsentAt: null })]),
      isLoading: ref(false),
    } as any);
    const w = mountApp(MySubscriptionsView, { attachTo: document.body });
    await settle();
    expect(w.find('[data-testid="report-absence-sub-1"]').exists()).toBe(false);
    w.unmount();
  });

  it('mostra lo storico release con badge "Rivenduta" (non annullabile) e azione "Annulla" per le altre', async () => {
    vi.mocked(useMySubscriptions).mockReturnValue({
      data: ref([
        makeSub({
          absenceConsentAt: '2026-06-01T10:00:00Z',
          absenceReleases: [
            { id: 'r1', date: '2026-07-15', source: 'customer', canceledAt: null, resold: true, createdAt: '2026-07-01T00:00:00Z' },
            { id: 'r2', date: '2026-07-22', source: 'customer', canceledAt: null, resold: false, createdAt: '2026-07-02T00:00:00Z' },
          ],
        }),
      ]),
      isLoading: ref(false),
    } as any);
    const w = mountApp(MySubscriptionsView, { attachTo: document.body });
    await settle();
    expect(w.html()).toContain('Rivenduta');
    expect(w.find('[data-testid="cancel-release-r1"]').exists()).toBe(false);
    expect(w.find('[data-testid="cancel-release-r2"]').exists()).toBe(true);
    w.unmount();
  });

  it('nessun abbonamento → EmptyState', async () => {
    vi.mocked(useMySubscriptions).mockReturnValue({ data: ref([]), isLoading: ref(false) } as any);
    const w = mountApp(MySubscriptionsView, { attachTo: document.body });
    await settle();
    expect(w.find('[data-test="empty-state"]').exists()).toBe(true);
    w.unmount();
  });
});
