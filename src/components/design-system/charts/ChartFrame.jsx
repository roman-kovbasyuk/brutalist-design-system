import './charts.css'

export function ChartFrame({ title, summary, legend, children, className = '' }) {
  return <section className={`v2-chart-frame ${className}`.trim()} aria-label={title}>
    <header className="v2-chart-frame__heading">
      <h4>{title}</h4>
      {legend && <div className="v2-chart-frame__legend">{legend}</div>}
    </header>
    <div className="v2-chart-frame__body">{children}</div>
    {summary && <p className="v2-chart-frame__summary">{summary}</p>}
  </section>
}
