import './charts.css'

export const chartPalette = ['var(--v2-accent)', 'var(--v2-success)', 'var(--v2-ink)', 'var(--v2-text-secondary)']
const positive = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0
const summaryFor = data => data.length ? data.map(item => `${item.label} ${item.value}`).join(', ') : 'No data available.'

// Two half-arcs also render a complete circle when a series contains one value.
function arc(cx, cy, r, start, end, reverse = false) {
  return [(start + end) / 2, end].map(a => ` A ${r} ${r} 0 0 ${reverse ? 0 : 1} ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`).join('')
}
function sector(cx, cy, r, inner, start, end) {
  const outer = `M ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)}${arc(cx, cy, r, start, end)}`
  return inner ? `${outer} L ${cx + inner * Math.cos(end)} ${cy + inner * Math.sin(end)}${arc(cx, cy, inner, end, start, true)} Z` : `${outer} L ${cx} ${cy} Z`
}
function ChartSvg({ label, summary, children, className = '' }) {
  return <figure className={`v2-chart ${className}`.trim()}>
    <svg className="v2-chart__svg" viewBox="0 0 400 220" role="img" aria-label={label} focusable="false">{children}</svg>
    <figcaption className="v2-chart__summary">{summary}</figcaption>
  </figure>
}
export function ChartLegend({ data = [] }) {
  return <ul className="v2-chart-legend" aria-label="Chart legend">{data.map((item, i) =>
    <li key={item.label}><i aria-hidden="true" style={{ background: item.color || chartPalette[i % chartPalette.length] }} />{item.label}<strong>{item.value}</strong></li>
  )}</ul>
}
export function PieChart({ data = [], variant = 'filled', label = 'Pie chart' }) {
  const total = data.reduce((sum, item) => sum + positive(item.value), 0)
  const half = variant === 'semicircle', rose = variant === 'rose'
  const cx = 200, cy = half ? 175 : 110, r = variant === 'compact' ? 60 : 94
  const inner = variant === 'donut' || half ? 60 : 0
  let cursor = half ? -Math.PI : -Math.PI / 2
  const maximum = Math.max(1, ...data.map(item => positive(item.value)))
  return <ChartSvg label={label} summary={`${label}: ${summaryFor(data)}`} className={`v2-chart--pie v2-chart--${variant}`}>
    {total === 0 ? <circle cx={cx} cy={cy} r={r} className="v2-chart__empty" /> : data.map((item, i) => {
      const value = positive(item.value), start = cursor
      const end = cursor + (rose ? 1 / data.length : value / total) * Math.PI * (half ? 1 : 2)
      cursor = end
      if (!value) return null
      return <path key={item.label} d={sector(cx, cy, rose ? r * Math.sqrt(value / maximum) : r, inner, start, end)} fill={item.color || chartPalette[i % chartPalette.length]} className="v2-chart__slice"><title>{`${item.label}: ${item.value}`}</title></path>
    })}
    {inner > 0 && <text x={cx} y={half ? cy - 12 : cy + 7} textAnchor="middle" className="v2-chart__total">{total}</text>}
  </ChartSvg>
}
function Axes({ max }) {
  return <>{[0, .5, 1].map(fraction => <g key={fraction}><line x1="32" y1={180 - fraction * 145} x2="390" y2={180 - fraction * 145} className="v2-chart__baseline" /><text x="24" y={184 - fraction * 145} textAnchor="end" className="v2-chart__label">{Math.round(max * fraction)}</text></g>)}</>
}
export function BarChart({ data = [], variant = 'vertical', label = 'Bar chart' }) {
  const paired = variant === 'grouped' || variant === 'stacked'
  const max = Math.max(1, ...data.map(item => variant === 'stacked' ? positive(item.value) + positive(item.previous) : Math.max(positive(item.value), paired ? positive(item.previous) : 0)))
  const summary = paired ? data.map(item => `${item.label}: current ${positive(item.value)}, previous ${positive(item.previous)}`).join(', ') : summaryFor(data)
  const slot = 344 / Math.max(1, data.length)
  return <ChartSvg label={label} summary={`${label}: ${summary || 'No data available.'}`} className={`v2-chart--bar v2-chart--${variant}`}>
    {variant === 'horizontal' ? data.map((item, i) => {
      const row = 170 / Math.max(1, data.length), y = 18 + i * row
      return <g key={item.label}>
        <text x="0" y={y + row / 2} className="v2-chart__label">{item.label}</text>
        <rect x="100" y={y} width={positive(item.value) / max * 254} height={row * .65} className="v2-chart__bar"><title>{`${item.label}: ${item.value}`}</title></rect>
        <text x={108 + positive(item.value) / max * 254} y={y + row / 2} className="v2-chart__value">{item.value}</text>
      </g>
    }) : <><Axes max={max} />{data.map((item, i) => {
      const x = 40 + i * slot, width = slot * .66, h = positive(item.value) / max * 145, previous = positive(item.previous) / max * 145
      return <g key={item.label}>
        <rect x={x} y={180 - h} width={variant === 'grouped' ? width / 2 : width} height={h} className="v2-chart__bar"><title>{`${item.label}: ${item.value}`}</title></rect>
        {paired && <rect x={variant === 'grouped' ? x + width / 2 : x} y={variant === 'stacked' ? 180 - h - previous : 180 - previous} width={variant === 'grouped' ? width / 2 : width} height={previous} fill={chartPalette[1]}><title>{`${item.label} previous: ${positive(item.previous)}`}</title></rect>}
        <text x={x + width / 2} y="205" textAnchor="middle" className="v2-chart__label">{item.label}</text>
      </g>
    })}</>}
  </ChartSvg>
}
export function LineChart({ data = [], variant = 'line', label = 'Line chart' }) {
  const max = Math.max(1, ...data.map(item => positive(item.value)))
  const points = data.map((item, i) => ({ ...item, x: data.length <= 1 ? 200 : 32 + i * (348 / (data.length - 1)), y: 180 - positive(item.value) / max * 145 }))
  const coordinates = points.map(p => `${p.x},${p.y}`).join(' ')
  return <ChartSvg label={label} summary={`${label}: ${summaryFor(data)}`} className={`v2-chart--${variant}`}>
    <Axes max={max} />
    {variant === 'area' && points.length > 0 && <polygon points={`${points[0].x},180 ${coordinates} ${points.at(-1).x},180`} className="v2-chart__area" />}
    <polyline points={coordinates} className="v2-chart__line" />
    {points.map(p => <g key={p.label}><circle cx={p.x} cy={p.y} r="4" className="v2-chart__point"><title>{`${p.label}: ${p.value}`}</title></circle><text x={p.x} y="205" textAnchor="middle" className="v2-chart__label">{p.label}</text></g>)}
  </ChartSvg>
}
export function TokenBurnHeatmap({ data = [], label = 'Token burn', variant = 'strip', rows = [] }) {
  const matrix = variant === 'matrix', series = matrix ? rows : [{ label: '', data }]
  const columns = Math.max(1, ...series.map(row => row.data.length)), left = matrix ? 70 : 10, slot = (380 - left) / columns
  const summary = matrix ? rows.map(row => `${row.label}: ${summaryFor(row.data)}`).join('; ') : summaryFor(data)
  return <ChartSvg label={label} summary={`${label}: ${summary}`} className="v2-chart--heatmap">
    {series.map((row, ri) => <g key={row.label}>
      {matrix && <text x="0" y={48 + ri * 34} className="v2-chart__label">{row.label}</text>}
      {row.data.map((item, i) => <rect key={item.label} x={left + i * slot} y={matrix ? 28 + ri * 34 : 68} width={Math.max(1, slot - 3)} height={matrix ? 26 : 60} rx="2" className="v2-chart__heat-cell" style={{ fillOpacity: .12 + Math.min(1, positive(item.value)) * .88 }}><title>{`${row.label} ${item.label}: ${item.value}`}</title></rect>)}
    </g>)}
    {(series[0]?.data || []).map((item, i) => <text key={item.label} x={left + i * slot + slot / 2} y={matrix ? 45 + rows.length * 34 : 151} textAnchor="middle" className="v2-chart__label">{item.label}</text>)}
    <text x={left} y="207" className="v2-chart__label">Low usage</text>
    {[.2, .4, .6, .8, 1].map((opacity, i) => <rect key={opacity} x={left + 84 + i * 16} y="195" width="12" height="12" className="v2-chart__heat-cell" style={{ fillOpacity: opacity }} />)}
    <text x={left + 172} y="207" className="v2-chart__label">High usage</text>
  </ChartSvg>
}
