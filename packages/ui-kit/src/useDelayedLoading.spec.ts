import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { useDelayedLoading } from './useDelayedLoading';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDelayedLoading', () => {
  it('resta false se il loading finisce sotto la soglia di delay', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(100);
    loading.value = false;
    await nextTick();
    vi.advanceTimersByTime(1000);
    expect(visible.value).toBe(false);
  });

  it('diventa true dopo il delay se il loading persiste', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    vi.advanceTimersByTime(149);
    expect(visible.value).toBe(false);
    vi.advanceTimersByTime(1);
    expect(visible.value).toBe(true);
  });

  it('una volta visibile resta true per almeno minVisible', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    vi.advanceTimersByTime(200); // visibile da 50ms
    loading.value = false;
    await nextTick();
    expect(visible.value).toBe(true); // non spegne subito
    vi.advanceTimersByTime(249);
    expect(visible.value).toBe(true);
    vi.advanceTimersByTime(1); // 300ms dalla comparsa
    expect(visible.value).toBe(false);
  });

  it('se il loading finisce dopo minVisible, spegne subito', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    vi.advanceTimersByTime(600); // visibile da 450ms
    loading.value = false;
    await nextTick();
    expect(visible.value).toBe(false);
  });

  it('accetta un getter e opzioni custom', async () => {
    const state = ref(true);
    const visible = useDelayedLoading(() => state.value, { delay: 50, minVisible: 100 });
    vi.advanceTimersByTime(50);
    expect(visible.value).toBe(true);
  });

  it('un nuovo loading durante la coda di spegnimento annulla lo spegnimento', async () => {
    const loading = ref(true);
    const visible = useDelayedLoading(loading);
    vi.advanceTimersByTime(200);
    loading.value = false;
    await nextTick();
    loading.value = true; // riparte prima che scada minVisible
    await nextTick();
    vi.advanceTimersByTime(10_000);
    expect(visible.value).toBe(true);
  });
});
