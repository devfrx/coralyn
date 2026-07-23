import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { ref } from 'vue';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import type { CustomerBookingDTO } from '@coralyn/contracts';
import { ApiError } from '@/lib/http';
import { todayIso } from '@/lib/dates';
import AbsenceReleaseModal from './AbsenceReleaseModal.vue';
import { useReleaseAbsence } from './useMySubscriptions';

vi.mock('./useMySubscriptions', () => ({
  useReleaseAbsence: vi.fn(),
}));

const sub: CustomerBookingDTO = {
  id: 'sub-1', umbrellaId: 'u1', timeSlotId: 's1', startDate: '2026-05-01', endDate: '2026-09-30',
  type: 'subscription', status: 'confirmed', totalPrice: 800, paymentStatus: 'paid', amountCollected: 800,
  umbrellaLabel: 'A12',
};
const tick = () => new Promise((r) => setTimeout(r, 0));

// «Oggi» è parte della fixture, come per le e2e api (jest-frozen-calendar.setup.ts).
// PERCHÉ: il modale valida contro oggi REALE (`minDate = max(todayIso(), startDate)`), ma la
// storia di questi test vive sull'abbonamento `sub`, che ha un calendario ASSOLUTO
// (2026-05-01…09-30). I due modelli sono incompatibili nel tempo: dal 2026-10-01 nessuna data
// può essere insieme ≥ oggi e ≤ endDate, quindi anche una data «relativa» (`dateInput.min`)
// marcirebbe — verificato con un probe a clock spostato. Congelando l'istante le date letterali
// tornano leggibili e stabili per sempre. Solo `Date` è finto: i timer restano reali perché
// `tick()` usa setTimeout. Stesso istante delle e2e api (09:00 a Roma), così il repo ha un solo
// «oggi di test»: se un giorno cambia la stagione della fixture, ripassare questo istante.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-07-15T07:00:00Z'));
});
afterAll(() => { vi.useRealTimers(); });

function mutationStub(mutateAsync: (input: unknown) => Promise<unknown> = vi.fn().mockResolvedValue(undefined)) {
  return { mutate: vi.fn(), mutateAsync, isPending: ref(false), variables: ref(undefined) };
}

async function mount(mutateAsync?: (input: unknown) => Promise<unknown>) {
  vi.mocked(useReleaseAbsence).mockReturnValue(mutationStub(mutateAsync) as any);
  const w = mountApp(AbsenceReleaseModal, {
    attachTo: document.body,
    props: { booking: sub, open: false },
  });
  await w.setProps({ open: true });
  await flushPromises();
  await tick();
  return w;
}

describe('AbsenceReleaseModal', () => {
  it('alla conferma chiama la mutation con { date, reason? }, sul bookingId giusto', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    const w = await mount(mutateAsync);
    const dateInput = document.querySelector('input[data-testid="absence-date"]') as HTMLInputElement;
    dateInput.value = '2026-07-22';
    dateInput.dispatchEvent(new Event('input'));
    const reasonInput = document.querySelector('textarea') as HTMLTextAreaElement;
    reasonInput.value = 'Influenza';
    reasonInput.dispatchEvent(new Event('input'));
    await tick();
    (document.querySelector('[data-testid="absence-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ date: '2026-07-22', reason: 'Influenza' });
    // useReleaseAbsence è chiamato con un thunk sul bookingId del booking passato via prop.
    const bookingIdThunk = vi.mocked(useReleaseAbsence).mock.calls[0][0];
    expect(bookingIdThunk()).toBe('sub-1');
    w.unmount();
  });

  it('senza motivo, chiama la mutation con reason undefined', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    const w = await mount(mutateAsync);
    const dateInput = document.querySelector('input[data-testid="absence-date"]') as HTMLInputElement;
    const minDate = dateInput.min || todayIso();
    dateInput.value = minDate;
    dateInput.dispatchEvent(new Event('input'));
    await tick();
    (document.querySelector('[data-testid="absence-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    expect(mutateAsync).toHaveBeenCalledWith({ date: minDate, reason: undefined });
    w.unmount();
  });

  it('la prompt riporta la label dell\'ombrellone dell\'abbonamento', async () => {
    const w = await mount();
    const prompt = document.querySelector('[data-testid="absence-prompt"]')?.textContent ?? '';
    expect(prompt).toContain('non essere presente su A12.');
    expect(prompt).not.toMatch(/su\s*\./);
    w.unmount();
  });

  it('senza label (DTO difensivo), la prompt resta una frase pulita senza "su ." pendente', async () => {
    vi.mocked(useReleaseAbsence).mockReturnValue(mutationStub() as any);
    const w = mountApp(AbsenceReleaseModal, {
      attachTo: document.body,
      props: { booking: { ...sub, umbrellaLabel: '' }, open: false },
    });
    await w.setProps({ open: true });
    await flushPromises();
    await tick();
    const prompt = document.querySelector('[data-testid="absence-prompt"]')?.textContent ?? '';
    expect(prompt).toContain('non essere presente.');
    expect(prompt).not.toMatch(/su\s*\./);
    w.unmount();
  });

  it('data fuori range (fuori dallo span dell\'abbonamento) → errore inline generico, mutation NON chiamata', async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    const w = await mount(mutateAsync);
    const dateInput = document.querySelector('input[data-testid="absence-date"]') as HTMLInputElement;
    // Forza un valore fuori dal range [minDate, maxDate] aggirando i vincoli nativi min/max
    // dell'input (come farebbe un autofill o un browser che li ignora).
    dateInput.value = '2027-01-01'; // dopo endDate (2026-09-30)
    dateInput.dispatchEvent(new Event('input'));
    await tick();
    (document.querySelector('[data-testid="absence-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    const errorEl = document.querySelector('[data-testid="absence-error"]');
    expect(errorEl?.textContent).toBe('Seleziona un giorno valido per questo abbonamento.');
    expect(mutateAsync).not.toHaveBeenCalled();
    w.unmount();
  });

  it('su errore 409, mostra SOLO il messaggio generico inline del modale (niente testo raw del backend)', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new ApiError(409, '/customer/subscriptions/sub-1/absence-releases', 'raw backend conflict detail'));
    const w = await mount(mutateAsync);
    (document.querySelector('[data-testid="absence-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    const errorEl = document.querySelector('[data-testid="absence-error"]');
    expect(errorEl?.textContent).toBe('Assenza già registrata per quel giorno.');
    expect(document.body.textContent).not.toContain('raw backend conflict detail');
    w.unmount();
  });

  it('su errore 422, mostra il messaggio generico inline del modale (niente testo raw del backend)', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new ApiError(422, '/customer/subscriptions/sub-1/absence-releases', 'raw validation detail from server'));
    const w = await mount(mutateAsync);
    (document.querySelector('[data-testid="absence-confirm"]') as HTMLButtonElement).click();
    await flushPromises();
    await tick();
    const errorEl = document.querySelector('[data-testid="absence-error"]');
    expect(errorEl?.textContent).toBe('Non è stato possibile registrare l’assenza per questo giorno.');
    expect(document.body.textContent).not.toContain('raw validation detail from server');
    w.unmount();
  });
});
