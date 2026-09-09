import { ChartFrame } from './ChartFrame.jsx'
import { LineChart } from './chart-primitives.jsx'

export function SparklineWidget({ label, value, detail, data = [] }) {
  return <ChartFrame title={label}>
    <p className="v2-chart-widget__value">{value}</p>
    <p className="v2-chart-widget__detail">{detail}</p>
    <div className="v2-chart-widget__sparkline"><LineChart label={label + ' trend'} data={data} variant="area" /></div>
  </ChartFrame>
}

export function GaugeWidget({ label, value = 0, max = 100, unit = '%' }) {
  const limit = Number.isFinite(max) && max > 0 ? max : 100
  const amount = Number.isFinite(value) ? Math.min(limit, Math.max(0, value)) : 0
  const percentage = amount / limit * 100
  const track = 'M 28 138 A 112 112 0 0 1 252 138'
  return <ChartFrame title={label}>
    <figure className="v2-chart-widget__gauge">
      <svg viewBox="0 0 280 180" role="img" aria-label={label + ' gauge'} focusable="false">
        <desc>{amount} of {limit} · current capacity</desc>
        <path d={track} className="v2-gauge__outline" />
        <path d={track} className="v2-gauge__track" />
        {amount > 0 && <path d={track} className="v2-gauge__fill" pathLength="100" strokeDasharray={percentage + ' 100'} />}
        <text x="140" y="125" textAnchor="middle" className="v2-gauge__value">{amount}{unit}</text>
        <text x="28" y="171" textAnchor="middle" className="v2-gauge__bound">0</text>
        <text x="252" y="171" textAnchor="middle" className="v2-gauge__bound">{limit}</text>
      </svg>
      <figcaption>{Math.round((limit - amount) * 100) / 100}{unit} available</figcaption>
    </figure>
  </ChartFrame>
}

export function BudgetWidget({ label, used = 0, budget = 1, unit = 'tokens' }) {
  const limit = Number.isFinite(budget) && budget > 0 ? budget : 1
  const amount = Number.isFinite(used) ? Math.max(0, used) : 0
  const percent = Math.min(100, amount / limit * 100)
  return <ChartFrame title={label}>
    <p className="v2-chart-widget__value">{amount.toLocaleString('en-US')} <small>/ {limit.toLocaleString('en-US')}</small></p>
    <div className="v2-chart-widget__budget" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(amount, limit)} aria-valuetext={amount + ' of ' + limit + ' ' + unit}>
      {Array.from({ length: 20 }, (_, index) => <span key={index} style={{ '--segment-fill': Math.min(100, Math.max(0, percent * .2 - index) * 100) + '%' }} />)}
    </div>
    <p className="v2-chart-widget__detail">{Math.max(0, limit - amount).toLocaleString('en-US')} {unit} remaining</p>
  </ChartFrame>
}
