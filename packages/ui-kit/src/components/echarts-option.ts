// Builder PURI di option ECharts: nessun accesso al DOM → unit-testabili.
// I colori sono INIETTATI dal chiamante (già risolti dai token), così restano deterministici.
export interface ChartDatum { label: string; value: number; display?: string }
export interface DonutDatum { label: string; value: number; color: string }

export function buildBarOption(data: ChartDatum[], opts: { color: string }) {
  return {
    grid: { left: 8, right: 8, top: 12, bottom: 20, containLabel: true },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: data.map((d) => d.label), axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { show: true } },
    series: [
      {
        type: 'bar',
        data: data.map((d) => d.value),
        itemStyle: { color: opts.color, borderRadius: [4, 4, 0, 0] },
        barMaxWidth: 28,
      },
    ],
  };
}

export function buildDonutOption(data: DonutDatum[]) {
  return {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'pie',
        radius: ['58%', '80%'],
        avoidLabelOverlap: false,
        label: { show: false },
        data: data.map((d) => ({ name: d.label, value: d.value, itemStyle: { color: d.color } })),
      },
    ],
  };
}
