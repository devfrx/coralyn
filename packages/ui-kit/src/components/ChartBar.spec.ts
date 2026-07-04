import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ChartBar from './ChartBar.vue';

const stubs = { VChart: { name: 'VChart', props: ['option'], template: '<div class="vchart-stub" />' } };

describe('ChartBar', () => {
  it('rende una tabella dati accessibile con label e valori (fallback a11y)', () => {
    const w = mount(ChartBar, {
      props: {
        data: [{ label: 'Lun', value: 1280, display: '€ 1.280' }, { label: 'Mar', value: 1540, display: '€ 1.540' }],
        color: '#E0795A',
        ariaLabel: 'Incassi ultimi 7 giorni',
      },
      global: { stubs },
    });
    const table = w.find('table');
    expect(table.exists()).toBe(true);
    expect(table.attributes('aria-label')).toBe('Incassi ultimi 7 giorni');
    expect(table.text()).toContain('Lun');
    expect(table.text()).toContain('€ 1.280');
    expect(table.text()).toContain('Mar');
  });

  it('passa a VChart una option con i valori della serie', () => {
    const w = mount(ChartBar, {
      props: { data: [{ label: 'Lun', value: 1280 }], color: '#E0795A', ariaLabel: 'x' },
      global: { stubs },
    });
    const vchart = w.findComponent({ name: 'VChart' });
    expect(vchart.props('option').series[0].data).toEqual([1280]);
  });
});
