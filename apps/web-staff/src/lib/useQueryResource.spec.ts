import { describe, it, expect, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { mountApp } from '@/test/utils';
import { queryResource, mutationResource } from './useQueryResource';

const tick = () => new Promise((r) => setTimeout(r, 0));

function mountHook<T>(setupFn: () => T) {
  let api!: T;
  const Host = defineComponent({
    setup() {
      api = setupFn();
      return () => h('div');
    },
  });
  const w = mountApp(Host);
  return { w, api: () => api };
}

describe('queryResource', () => {
  it('esegue queryFn e ritorna .data reattivo', async () => {
    const queryFn = vi.fn().mockResolvedValue(['a', 'b']);
    const { api } = mountHook(() => queryResource({ queryKey: () => ['test-key'], queryFn }));
    await flushPromises();
    await tick();
    await flushPromises();
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(api().data.value).toEqual(['a', 'b']);
  });

  it('la queryKey è reattiva: cambia quando cambia la dipendenza', async () => {
    const dep = ref('x');
    const queryFn = vi.fn().mockResolvedValue('ok');
    mountHook(() => queryResource({ queryKey: () => ['test-key', dep.value], queryFn }));
    await flushPromises();
    dep.value = 'y';
    await flushPromises();
    await tick();
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});

describe('mutationResource', () => {
  it('esegue mutationFn e invoca invalidates() (lazy) dopo il successo', async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const invalidates = vi.fn().mockReturnValue([['test-key']]);
    const { api } = mountHook(() => mutationResource({ mutationFn, invalidates }));
    await api().mutateAsync('input');
    await flushPromises();
    expect(mutationFn).toHaveBeenCalledWith('input', expect.anything());
    expect(invalidates).toHaveBeenCalled();
  });
});
