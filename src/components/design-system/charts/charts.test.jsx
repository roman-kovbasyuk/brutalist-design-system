import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { BarChart, LineChart, PieChart, TokenBurnHeatmap } from './chart-primitives.jsx'
import { ChartFrame } from './ChartFrame.jsx'
import { MetricWidget } from './MetricWidget.jsx'
import { BudgetWidget, GaugeWidget } from './MetricWidgets.jsx'

const campaignMix = [
  { label: 'Paid social', value: 42 },
  { label: 'Email', value: 28 },
  { label: 'Display', value: 18 },
]

test('renders filled and donut pie charts with accessible summaries', () => {
  render(<><PieChart data={campaignMix} label="Campaign mix" /><PieChart data={campaignMix} label="Campaign mix donut" variant="donut" /></>)
  expect(screen.getByRole('img', { name: 'Campaign mix' })).toBeInTheDocument()
  expect(screen.getAllByText(/Paid social 42/)).toHaveLength(2)
  expect(screen.getByRole('img', { name: 'Campaign mix donut' })).toBeInTheDocument()
})

test('supports a compact pie variant for dense layouts', () => {
  render(<PieChart data={campaignMix} label="Campaign mix compact" variant="compact" />)
  expect(screen.getByRole('img', { name: 'Campaign mix compact' }).closest('figure')).toHaveClass('v2-chart--compact')
})

test('renders labeled bars, line points, and horizontal token burn cells', () => {
  render(<>
    <BarChart data={[{ label: 'Nordic', value: 12 }, { label: 'Oslo', value: 8 }]} label="Formats by campaign" />
    <LineChart data={[{ label: 'Mon', value: 4 }, { label: 'Tue', value: 9 }]} label="Weekly approvals" />
    <TokenBurnHeatmap data={[{ label: '08:00', value: 0.2 }, { label: '12:00', value: 0.8 }]} label="Token burn" />
  </>)
  expect(screen.getByRole('img', { name: 'Formats by campaign' })).toBeInTheDocument()
  expect(screen.getByText('Nordic')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Weekly approvals' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Token burn' })).toBeInTheDocument()
})

test('renders zero and empty data without invalid chart geometry', () => {
  render(<><PieChart data={[]} label="Empty mix" /><BarChart data={[{ label: 'None', value: 0 }]} label="Empty bars" /></>)
  expect(screen.getByRole('img', { name: 'Empty mix' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Empty bars' })).toBeInTheDocument()
  expect(document.querySelectorAll('[d*="NaN"]').length).toBe(0)
})

test('frames charts and exposes metric trend text', () => {
  render(<ChartFrame title="Chart title" summary="Chart summary" legend={<span>Legend</span>}><span>Chart body</span></ChartFrame>)
  render(<MetricWidget label="Approval rate" value="92%" detail="First review pass" trend={{ direction: 'up', label: '+4%' }} />)
  expect(screen.getByRole('heading', { name: 'Chart title' })).toBeInTheDocument()
  expect(screen.getByText('Chart summary')).toBeInTheDocument()
  expect(screen.getByText('+4%')).toBeInTheDocument()
})

test('pie variants produce different geometry and a full-value pie stays visible', () => {
  const { container } = render(<>
    {['filled', 'donut', 'semicircle', 'rose'].map(variant => <PieChart key={variant} variant={variant} data={campaignMix} label={variant} />)}
    <PieChart data={[{ label: 'Only', value: 100 }]} label="Single category" />
  </>)
  const paths = [...container.querySelectorAll('figure')].slice(0, 4).map(figure => figure.querySelector('path').getAttribute('d'))
  expect(new Set(paths).size).toBe(4)
  expect(screen.getByRole('img', { name: 'Single category' }).querySelector('path').getAttribute('d').match(/ A /g)).toHaveLength(2)
})

test('horizontal, grouped, stacked and area charts encode distinct data layouts', () => {
  const data = [{ label: 'Mon', value: 12, previous: 8 }, { label: 'Tue', value: 8, previous: 6 }]
  render(<>
    <BarChart data={data} variant="horizontal" label="Horizontal" />
    <BarChart data={data} variant="grouped" label="Grouped" />
    <BarChart data={data} variant="stacked" label="Stacked" />
    <LineChart data={data} variant="area" label="Area" />
  </>)
  expect(screen.getByRole('img', { name: 'Grouped' }).querySelectorAll('rect')).toHaveLength(4)
  expect(screen.getByRole('img', { name: 'Stacked' }).querySelectorAll('rect')).toHaveLength(4)
  const bar = screen.getByRole('img', { name: 'Horizontal' }).querySelector('rect')
  expect(Number(bar.getAttribute('width'))).toBeGreaterThan(Number(bar.getAttribute('height')))
  expect(screen.getByRole('img', { name: 'Area' }).querySelector('polygon')).toBeInTheDocument()
})

test('budget and gauge widgets keep out-of-range data within their visual limits', () => {
  render(<><BudgetWidget label="Budget" used={150} budget={100} /><GaugeWidget label="Capacity" value={120} /></>)
  expect(screen.getByRole('meter', { name: 'Budget' })).toHaveAttribute('aria-valuenow', '100')
  expect(screen.getByRole('meter', { name: 'Budget' })).toHaveAttribute('aria-valuetext', '150 of 100 tokens')
  expect(screen.getByText('0 tokens remaining')).toBeInTheDocument()
  expect(screen.getByText('100%')).toBeInTheDocument()
})
