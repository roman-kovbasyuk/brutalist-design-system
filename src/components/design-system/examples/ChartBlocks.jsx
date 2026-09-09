import { BarChart, ChartLegend, LineChart, PieChart, TokenBurnHeatmap } from '../charts/chart-primitives.jsx'
import { ChartFrame } from '../charts/ChartFrame.jsx'
import { MetricWidget } from '../charts/MetricWidget.jsx'
import { BudgetWidget, GaugeWidget, SparklineWidget } from '../charts/MetricWidgets.jsx'

const mix = [{ label: 'Paid social', value: 42 }, { label: 'Email', value: 28 }, { label: 'Display', value: 18 }, { label: 'Organic', value: 12 }]
const campaigns = [{ label: 'Nordic', value: 12, previous: 8 }, { label: 'Oslo', value: 8, previous: 6 }, { label: 'Bergen', value: 6, previous: 4 }, { label: 'London', value: 10, previous: 7 }]
const weekly = [{ label: 'Mon', value: 18 }, { label: 'Tue', value: 26 }, { label: 'Wed', value: 22 }, { label: 'Thu', value: 36 }, { label: 'Fri', value: 32 }, { label: 'Sat', value: 42 }, { label: 'Sun', value: 48 }]
const burn = [{ label: '08', value: .12 }, { label: '10', value: .34 }, { label: '12', value: .76 }, { label: '14', value: .55 }, { label: '16', value: .95 }, { label: '18', value: .45 }, { label: '20', value: .18 }, { label: '22', value: .08 }]

export const chartBlockCatalog = [
  ...[
    ['pie', 'Pie', 'filled', 'Channel share', 'Segment angles show each channel’s share.'],
    ['donut', 'Donut', 'donut', 'Channel share', 'A total at the center of the distribution.'],
    ['semicircle', 'Semicircle', 'semicircle', 'Channel share', 'A half ring for horizontal summaries.'],
    ['rose', 'Polar area', 'rose', 'Channel volume', 'Equal angles; sector area represents volume.'],
  ].map(([id, name, variant, title, summary]) => ({
    id: 'chart-' + id, name, group: 'Pie charts', component: 'PieChart variant="' + variant + '"',
    render: () => <ChartFrame title={title} summary={summary}><PieChart label={name + ' chart'} variant={variant} data={mix} /><ChartLegend data={mix} /></ChartFrame>,
  })),
  ...[
    ['columns', 'Column chart', 'vertical'],
    ['horizontal-bars', 'Horizontal bar chart', 'horizontal'],
    ['grouped-bars', 'Grouped bar chart', 'grouped'],
    ['stacked-bars', 'Stacked bar chart', 'stacked'],
  ].map(([id, name, variant]) => ({
    id: 'chart-' + id, name, group: 'Charts', component: 'BarChart variant="' + variant + '"',
    render: () => <ChartFrame title="Formats by campaign"><BarChart label={name} variant={variant} data={campaigns} />{['grouped', 'stacked'].includes(variant) && <ChartLegend data={[{ label: 'Current' }, { label: 'Previous' }]} />}</ChartFrame>,
  })),
  ...[['line', 'Line chart'], ['area', 'Area chart']].map(([variant, name]) => ({
    id: 'chart-' + variant, name, group: 'Charts', component: 'LineChart variant="' + variant + '"',
    render: () => <ChartFrame title="Assets generated this week"><LineChart label={name} variant={variant} data={weekly} /></ChartFrame>,
  })),
  { id: 'token-burn-hourly', name: 'Hourly token burn', group: 'Token burn', component: 'TokenBurnHeatmap variant="strip"',
    render: () => <ChartFrame title="Token usage by hour" summary="Two-hour intervals · darker cells mean higher usage."><TokenBurnHeatmap label="Hourly token burn" data={burn} /></ChartFrame> },
  { id: 'token-burn-models', name: 'Token burn by model', group: 'Token burn', component: 'TokenBurnHeatmap variant="matrix"',
    render: () => <ChartFrame title="Token usage by model" summary="Compare usage over the same daily timeline."><TokenBurnHeatmap label="Token burn by model" variant="matrix" rows={['Text', 'Image', 'Video'].map((label, index) => ({ label, data: burn.map((item, i) => ({ ...item, value: burn[(i + index * 2) % burn.length].value })) }))} /></ChartFrame> },
  { id: 'metric-kpi', name: 'KPI with trend', group: 'Metric widgets', component: 'MetricWidget',
    render: () => <MetricWidget label="Active campaigns" value="24" detail="6 awaiting review" trend={{ direction: 'up', label: '+4 from last week' }} /> },
  { id: 'metric-sparkline', name: 'Sparkline metric', group: 'Metric widgets', component: 'SparklineWidget',
    render: () => <SparklineWidget label="Assets generated" value="224" detail="+18% compared with last week" data={weekly} /> },
  { id: 'metric-gauge', name: 'Capacity gauge', group: 'Metric widgets', component: 'GaugeWidget',
    render: () => <GaugeWidget label="Generation capacity" value={72} /> },
  { id: 'metric-budget', name: 'Token budget', group: 'Metric widgets', component: 'BudgetWidget',
    render: () => <BudgetWidget label="Monthly token budget" used={680000} budget={1000000} /> },
]
