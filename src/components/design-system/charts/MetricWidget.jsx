import './charts.css'

export function MetricWidget({ label, value, detail, trend }) {
  return <dl className="v2-metric-widget">
    <dt>{label}</dt>
    <dd className="v2-metric-widget__value">{value}</dd>
    <dd className="v2-metric-widget__meta">{detail}</dd>
    {trend && <dd className={`v2-metric-widget__trend v2-metric-widget__trend--${trend.direction}`}>{trend.label}</dd>}
  </dl>
}
