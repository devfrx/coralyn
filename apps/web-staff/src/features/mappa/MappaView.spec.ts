import { describe, it, expect } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { mountApp } from '@/test/utils';
import MappaView from './MappaView.vue';

describe('MappaView', () => {
  it('rende settori e ombrelloni dal mock MSW', async () => {
    const w = mountApp(MappaView);
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    await flushPromises();
    expect(w.text()).toContain('Centro');
    expect(w.text()).toContain('Speciali');
    // un paio di etichette dal seed
    expect(w.text()).toContain('P1');
  });
});
