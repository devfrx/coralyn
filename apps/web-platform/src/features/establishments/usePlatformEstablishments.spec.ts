import { it, expect, beforeEach } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { mountApp } from '@/test/utils';
import { resetPlatformSeed } from '@/mocks/server';
import { useEstablishmentsList, useCreateEstablishment, useResetAdminPassword } from './usePlatformEstablishments';

const settle = async () => { await flushPromises(); await new Promise((r) => setTimeout(r, 0)); await flushPromises(); };

beforeEach(() => resetPlatformSeed());

it('useEstablishmentsList: carica la lista dal server', async () => {
  let q: any;
  const Probe = defineComponent({ setup() { q = useEstablishmentsList(); return () => h('div'); } });
  const w = mountApp(Probe, { attachTo: document.body });
  await settle();
  expect(q.data.value).toHaveLength(2);
  expect(q.data.value[0].name).toBe('Lido Alpha');
  w.unmount();
});

it('useCreateEstablishment: crea e ritorna la risposta con esito invito email', async () => {
  let mut: any;
  const Probe = defineComponent({ setup() { mut = useCreateEstablishment(); return () => h('div'); } });
  const w = mountApp(Probe, { attachTo: document.body });
  const res = await mut.mutateAsync({ name: 'Lido Nuovo', adminEmail: 'a@nuovo.test' });
  expect(res.expiresAt).toBeTruthy();
  expect(res.adminEmail).toBe('a@nuovo.test');
  expect(res.establishment.name).toBe('Lido Nuovo');
  w.unmount();
});

it('useResetAdminPassword: invia il reset e ritorna adminEmail + expiresAt', async () => {
  let mut: any;
  const Probe = defineComponent({ setup() { mut = useResetAdminPassword(); return () => h('div'); } });
  const w = mountApp(Probe, { attachTo: document.body });
  const res = await mut.mutateAsync('e-1');
  expect(res.adminEmail).toBeTruthy();
  expect(res.expiresAt).toBeTruthy();
  w.unmount();
});
