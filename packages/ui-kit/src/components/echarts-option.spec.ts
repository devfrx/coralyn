import { describe, it, expect } from 'vitest';
import { buildBarOption, buildDonutOption } from './echarts-option';

describe('buildBarOption', () => {
  it('mappa i dati in una serie bar con i valori e usa il colore passato', () => {
    const opt = buildBarOption(
      [{ label: 'Lun', value: 1280 }, { label: 'Mar', value: 1540 }],
      { color: '#E0795A' },
    );
    expect(opt.xAxis.data).toEqual(['Lun', 'Mar']);
    expect(opt.series[0].type).toBe('bar');
    expect(opt.series[0].data).toEqual([1280, 1540]);
    expect(opt.series[0].itemStyle.color).toBe('#E0795A');
  });
});

describe('buildDonutOption', () => {
  it('mappa i segmenti in una serie pie ad anello, con nome/valore/colore per segmento', () => {
    const opt = buildDonutOption([
      { label: 'Abbonato', value: 48, color: '#5E9AA6' },
      { label: 'Libero', value: 22, color: '#8FBF9E' },
    ]);
    expect(opt.series[0].type).toBe('pie');
    expect(opt.series[0].radius).toEqual(['58%', '80%']);
    expect(opt.series[0].data).toEqual([
      { name: 'Abbonato', value: 48, itemStyle: { color: '#5E9AA6' } },
      { name: 'Libero', value: 22, itemStyle: { color: '#8FBF9E' } },
    ]);
  });
});
