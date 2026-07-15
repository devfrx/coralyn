import { describe, it, expect } from 'vitest';
import { defineComponent, h } from 'vue';
import { http, HttpResponse } from 'msw';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import { server } from '@/mocks/server';
import { useCustomer, useUpdateCustomer, useSuspendSubscription, useReactivateSubscription, useSetAbsenceConsent, useReleaseAbsence, useCancelAbsenceRelease, useCustomerAccessStatus, useProvisionCustomerAccess, useRevokeCustomerAccess } from './useCustomers';

const Probe = defineComponent({
  setup() {
    const q = useCustomer('c-1');
    return () => h('div', q.data.value ? `${q.data.value.firstName} ${q.data.value.lastName}` : 'loading');
  },
});

const EditProbe = defineComponent({
  setup() {
    const q = useCustomer('c-1');
    const m = useUpdateCustomer('c-1');
    return () => h('div', [
      h('span', q.data.value?.phone ?? '-'),
      h('button', { onClick: () => m.mutate({ phone: '+39 000' }) }, 'save'),
    ]);
  },
});

const SuspendProbe = defineComponent({
  setup() {
    const m = useSuspendSubscription('c-1');
    return () => h('button', {
      onClick: () => m.mutate({ id: 'b1', input: { startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 5 } }),
    }, 'suspend');
  },
});

const ReactivateProbe = defineComponent({
  setup() {
    const m = useReactivateSubscription('c-1');
    return () => h('button', {
      onClick: () => m.mutate({ id: 'b1', input: { returnDate: '2026-08-01', refundAmount: 0 } }),
    }, 'reactivate');
  },
});

const SetAbsenceConsentProbe = defineComponent({
  setup() {
    const m = useSetAbsenceConsent('c-1');
    return () => h('button', {
      onClick: () => m.mutate({ id: 'b1', input: { consent: true } }),
    }, 'set-consent');
  },
});

const ReleaseAbsenceProbe = defineComponent({
  setup() {
    const m = useReleaseAbsence('c-1');
    return () => h('button', {
      onClick: () => m.mutate({ id: 'b1', input: { date: '2026-07-20' } }),
    }, 'release-absence');
  },
});

const CancelAbsenceReleaseProbe = defineComponent({
  setup() {
    const m = useCancelAbsenceRelease('c-1');
    return () => h('button', {
      onClick: () => m.mutate({ id: 'b1', releaseId: 'r1' }),
    }, 'cancel-release');
  },
});

const AccessStatusProbe = defineComponent({
  setup() {
    const q = useCustomerAccessStatus('b1');
    return () => h('div', q.data.value ? q.data.value.state : 'loading');
  },
});

const ProvisionProbe = defineComponent({
  setup() {
    const m = useProvisionCustomerAccess('b1');
    return () => h('button', { onClick: () => m.mutate(undefined) }, 'provision');
  },
});

const RevokeProbe = defineComponent({
  setup() {
    const m = useRevokeCustomerAccess('b1');
    return () => h('button', { onClick: () => m.mutate(undefined) }, 'revoke');
  },
});

describe('useCustomer', () => {
  it('legge il cliente per id dal mock', async () => {
    const w = mountApp(Probe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('Mario Rossi');
  });

  it('modifica il cliente e invalida il dettaglio', async () => {
    const w = mountApp(EditProbe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.text()).toContain('+39 000');
  });
});

describe('useSuspendSubscription', () => {
  it('POSTa /bookings/:id/suspend e invalida la Scheda', async () => {
    let captured: unknown = null;
    server.use(
      http.post('/api/bookings/:id/suspend', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: 'b1' });
      }),
    );
    const w = mountApp(SuspendProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(captured).toMatchObject({ startDate: '2026-07-20', endDate: '2026-07-26', refundAmount: 5 });
  });
});

describe('useReactivateSubscription', () => {
  it('POSTa /bookings/:id/reactivate', async () => {
    let captured: unknown = null;
    server.use(
      http.post('/api/bookings/:id/reactivate', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: 'b1' });
      }),
    );
    const w = mountApp(ReactivateProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(captured).toMatchObject({ returnDate: '2026-08-01', refundAmount: 0 });
  });
});

describe('useSetAbsenceConsent', () => {
  it('PATCHa /bookings/:id/absence-consent e invalida la Scheda', async () => {
    let captured: unknown = null;
    server.use(
      http.patch('/api/bookings/:id/absence-consent', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: 'b1' });
      }),
    );
    const w = mountApp(SetAbsenceConsentProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(captured).toMatchObject({ consent: true });
  });
});

describe('useReleaseAbsence', () => {
  it('POSTa la release e invalida la Scheda', async () => {
    let captured: unknown = null;
    server.use(
      http.post('/api/bookings/:id/absence-releases', async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({ id: 'b1' });
      }),
    );
    const w = mountApp(ReleaseAbsenceProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(captured).toMatchObject({ date: '2026-07-20' });
  });
});

describe('useCancelAbsenceRelease', () => {
  it('POSTa /bookings/:id/absence-releases/:releaseId/cancel', async () => {
    let called = false;
    server.use(
      http.post('/api/bookings/:id/absence-releases/:releaseId/cancel', ({ params }) => {
        called = true;
        expect(params.id).toBe('b1');
        expect(params.releaseId).toBe('r1');
        return HttpResponse.json({ id: 'b1' });
      }),
    );
    const w = mountApp(CancelAbsenceReleaseProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(true);
  });
});

describe('useCustomerAccessStatus', () => {
  it('legge lo stato accesso per bookingId dal mock', async () => {
    server.use(
      http.get('/api/bookings/:id/customer-access', ({ params }) => {
        expect(params.id).toBe('b1');
        return HttpResponse.json({ state: 'active', lastActivatedAt: '2026-07-01T09:00:00.000Z' });
      }),
    );
    const w = mountApp(AccessStatusProbe);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(w.text()).toContain('active');
  });
});

describe('useProvisionCustomerAccess', () => {
  it('POSTa /bookings/:id/customer-access', async () => {
    let called = false;
    server.use(
      http.post('/api/bookings/:id/customer-access', ({ params }) => {
        called = true;
        expect(params.id).toBe('b1');
        return HttpResponse.json({ activationUrl: '/attiva?token=x', pin: '123456', expiresAt: '2026-08-01T00:00:00.000Z' });
      }),
    );
    const w = mountApp(ProvisionProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(true);
  });
});

describe('useRevokeCustomerAccess', () => {
  it('POSTa /bookings/:id/customer-access/revoke', async () => {
    let called = false;
    server.use(
      http.post('/api/bookings/:id/customer-access/revoke', ({ params }) => {
        called = true;
        expect(params.id).toBe('b1');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const w = mountApp(RevokeProbe);
    await w.find('button').trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(called).toBe(true);
  });
});
