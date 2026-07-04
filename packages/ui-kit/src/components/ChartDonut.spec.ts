import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChartDonut from './ChartDonut.vue';

const stubs = { VChart: { name: 'VChart', props: ['option'], template: '<div class="vchart-stub" />' } };

describe('ChartDonut', () => {
  it('rende la tabella a11y con etichette e valori dei segmenti', () => {
    const w = mount(ChartDonut, {
      props: {
        data: [{ label: 'Abbonato', value: 48, color: '#5E9AA6' }, { label: 'Libero', value: 22, color: '#8FBF9E' }],
        ariaLabel: 'Stato ombrelloni',
      },
      global: { stubs },
    });
    const table = w.find('table');
    expect(table.exists()).toBe(true);
    expect(table.attributes('aria-label')).toBe('Stato ombrelloni');
    expect(table.text()).toContain('Abbonato');
    expect(table.text()).toContain('48');
  });

  it('passa a VChart una option pie con i segmenti', () => {
    const w = mount(ChartDonut, {
      props: { data: [{ label: 'Libero', value: 22, color: '#8FBF9E' }], ariaLabel: 'x' },
      global: { stubs },
    });
    expect(w.findComponent({ name: 'VChart' }).props('option').series[0].type).toBe('pie');
  });
});
