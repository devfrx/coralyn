import { describe, it, expect, afterEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { http, HttpResponse } from 'msw';
import type { SetupStatusDTO } from '@coralyn/contracts';
import { Role } from '@coralyn/contracts';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useSessionStore } from '@/stores/session';
import StepTimeSlots from './StepTimeSlots.vue';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

const STATUS = (overrides: Partial<SetupStatusDTO['timeSlots']> = {}): SetupStatusDTO => ({
  structure: { sectors: 1, rows: 1, activeUmbrellas: 1, complete: true },
  timeSlots: { count: 0, complete: false, ...overrides },
  seasons: { usable: 0, complete: false },
  rates: { count: 0, hasCatchAll: false, complete: false },
  complete: false,
  firstIncompleteStep: 'timeSlots',
});

function mountAsAdmin(status: SetupStatusDTO) {
  const w = mountApp(StepTimeSlots, { props: { status } });
  const session = useSessionStore();
  session.user = { id: 'u-1', email: 'admin@coralyn.dev', role: Role.Admin, establishmentId: 'e-1', establishmentName: 'Lido Maestrale' };
  return w;
}

describe('StepTimeSlots', () => {
  afterEach(() => server.resetHandlers());

  it('elenca le fasce esistenti (name · startTime–endTime)', async () => {
    server.use(
      http.get('/api/time-slots', () => HttpResponse.json([
        { id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
      ])),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    expect(w.text()).toContain('Mattina · 08:00–13:00');
  });

  it('il submit del form POSTa /api/time-slots con name, startTime, endTime', async () => {
    const seen: unknown[] = [];
    server.use(
      http.get('/api/time-slots', () => HttpResponse.json([])),
      http.post('/api/time-slots', async ({ request }) => {
        seen.push(await request.json());
        return HttpResponse.json({ id: 'f-1', name: 'Giornata', startTime: '08:00', endTime: '19:00', sortOrder: 0 });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-slot-name"]').setValue('Giornata');
    await w.find('[data-testid="ob-slot-start"]').setValue('08:00');
    await w.find('[data-testid="ob-slot-end"]').setValue('19:00');
    await w.find('[data-testid="ob-slot-save"]').trigger('submit');
    await settle();
    expect(seen[0]).toEqual({ name: 'Giornata', startTime: '08:00', endTime: '19:00' });
  });

  it('dopo il successo, il form viene resettato ai default', async () => {
    server.use(
      http.get('/api/time-slots', () => HttpResponse.json([])),
      http.post('/api/time-slots', async ({ request }) => {
        await request.json();
        return HttpResponse.json({ id: 'f-1', name: 'Giornata', startTime: '08:00', endTime: '19:00', sortOrder: 0 });
      }),
    );
    const w = mountAsAdmin(STATUS());
    await settle();
    await w.find('[data-testid="ob-slot-name"]').setValue('Giornata');
    await w.find('[data-testid="ob-slot-start"]').setValue('08:00');
    await w.find('[data-testid="ob-slot-end"]').setValue('19:00');
    await w.find('[data-testid="ob-slot-save"]').trigger('submit');
    await settle();
    expect((w.find('[data-testid="ob-slot-name"]').element as HTMLInputElement).value).toBe('');
    expect((w.find('[data-testid="ob-slot-start"]').element as HTMLInputElement).value).toBe('');
    expect((w.find('[data-testid="ob-slot-end"]').element as HTMLInputElement).value).toBe('');
  });

  it('ob-timeslots-next è disabilitato se status.timeSlots.complete è false', async () => {
    server.use(http.get('/api/time-slots', () => HttpResponse.json([])));
    const w = mountAsAdmin(STATUS({ complete: false }));
    await settle();
    expect((w.find('[data-testid="ob-timeslots-next"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it('ob-timeslots-next emette next quando status.timeSlots.complete è true', async () => {
    server.use(http.get('/api/time-slots', () => HttpResponse.json([
      { id: 'f-mat', name: 'Mattina', startTime: '08:00', endTime: '13:00', sortOrder: 1 },
    ])));
    const w = mountAsAdmin(STATUS({ count: 1, complete: true }));
    await settle();
    const next = w.find('[data-testid="ob-timeslots-next"]');
    expect((next.element as HTMLButtonElement).disabled).toBe(false);
    await next.trigger('click');
    expect(w.emitted('next')).toBeTruthy();
  });
});
