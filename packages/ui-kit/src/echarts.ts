// Registrazione selettiva ECharts (no bundle intero) + renderer SVG (theming-token + a11y).
import { use } from 'echarts/core';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';

use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, SVGRenderer]);
