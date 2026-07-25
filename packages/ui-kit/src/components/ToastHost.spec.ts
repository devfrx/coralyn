import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ToastHost from './ToastHost.vue';
import { pushToast, clearToasts, useToasts } from '../toasts';

// ToastHost è vissuto in TRE copie byte-identiche (web-staff, web-platform, web-customer) senza
// alcuno spec: il contenitore che rende la coda era l'unico pezzo del sistema toast non coperto.
// Accentrarlo in ui-kit senza coprirlo avrebbe spostato il buco, non chiuso.
beforeEach(() => { clearToasts(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); clearToasts(); });

describe('ToastHost', () => {
  it('rende un Toast per ogni elemento in coda, nell ordine di arrivo', async () => {
    const w = mount(ToastHost);
    pushToast('Primo');
    pushToast('Secondo');
    await w.vm.$nextTick();

    const alerts = w.findAll('[role="alert"]');
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.text())).toEqual([expect.stringContaining('Primo'), expect.stringContaining('Secondo')]);
    w.unmount();
  });

  it('il click su Chiudi toglie QUEL toast dalla coda, non gli altri', async () => {
    const w = mount(ToastHost);
    pushToast('Da chiudere');
    pushToast('Da tenere');
    await w.vm.$nextTick();

    await w.findAll('button[aria-label="Chiudi"]')[0].trigger('click');
    expect(useToasts().items.map((t) => t.message)).toEqual(['Da tenere']);
    w.unmount();
  });

  it('non rende nulla a coda vuota', () => {
    const w = mount(ToastHost);
    expect(w.findAll('[role="alert"]')).toHaveLength(0);
    w.unmount();
  });
});
