import { dashboardMetrics, campaignHistory } from '../data/campaigns.js'

const metricItems = [
  ['Total banners created', dashboardMetrics.totalBannersCreated],
  ['Total images', dashboardMetrics.totalImages],
  ['Total videos', dashboardMetrics.totalVideos],
  ['Total reviews', dashboardMetrics.totalReviews],
  ['GenAI production cost', formatCurrency(dashboardMetrics.genAiProductionCost)],
]

const stepTrend = [...campaignHistory]
  .slice()
  .sort((left, right) => new Date(left.date) - new Date(right.date))
  .reduce(
    (steps, campaign) => {
      const nextValue = steps[steps.length - 1].banners + campaign.bannerCount
      steps.push({
        label: campaign.name,
        banners: nextValue,
      })
      return steps
    },
    [{ label: 'Baseline', banners: 0 }],
  )

export function DashboardScreen({ onOpenCampaign, onCreateCampaign }) {
  const stepMax = Math.max(...stepTrend.map((step) => step.banners), 1)

  return (
    <section className="dashboard-screen">
      <header className="dashboard-header">
        <div>
          <p className="page-context">Production overview</p>
          <h1>Campaign production</h1>
          <p>Track locally simulated creative work across every campaign.</p>
        </div>
        <button className="dashboard-mode button button--primary" type="button" onClick={onCreateCampaign} aria-label="Create a new campaign">
          New campaign
        </button>
      </header>

      <dl className="dashboard-metric-strip" aria-label="Production metrics">
        {metricItems.map(([label, value], index) => (
          <div key={label} className={index === 0 ? 'dashboard-metric dashboard-metric--trend' : 'dashboard-metric'}>
            <dt>{label}</dt>
            <dd>{value}</dd>
            {index === 0 && <MetricTrendChart points={stepTrend} max={stepMax} />}
          </div>
        ))}
      </dl>

      <section className="campaign-history-section" aria-labelledby="campaign-history-title">
        <div className="dashboard-section-header">
          <h2 id="campaign-history-title">Campaigns</h2>
          <span>{campaignHistory.length} campaigns</span>
        </div>
        <div className="campaign-history-scroll">
          <table className="campaign-history-table" aria-label="Campaign history">
            <thead>
            <tr>
                <th scope="col">Date</th><th scope="col">Campaign</th><th scope="col">Banners</th>
                <th scope="col">Total generations</th><th scope="col">Static visuals</th><th scope="col">Videos</th><th scope="col">Production cost</th><th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {campaignHistory.map((campaign) => (
                <tr
                  key={campaign.id}
                  className="campaign-history-row"
                  role="link"
                  tabIndex="0"
                  aria-label={`Open ${campaign.name}`}
                  onClick={() => onOpenCampaign(campaign.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenCampaign(campaign.id)
                    }
                  }}
                >
                  <td>{campaign.date}</td>
                  <th scope="row"><a className="campaign-row-link" href={`/campaign/${campaign.id}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpenCampaign(campaign.id) }}>{campaign.name}</a></th><td>{campaign.bannerCount}</td><td>{campaign.totalGenerations}</td><td>{campaign.staticVisualCount}</td><td>{campaign.videoCount}</td><td>{formatCurrency(campaign.productionCost)}</td>
                  <td><span className="campaign-status" data-status={campaign.status.toLowerCase().replaceAll(' ', '-')}>{campaign.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function MetricTrendChart({ points, max }) {
  const width = 92
  const height = 28
  const padding = 3
  const cellWidth = (width - padding * 2) / (points.length - 1)
  const pointX = (index) => padding + index * cellWidth
  const pointY = (count) => height - padding - (count / max) * (height - padding * 2)
  const path = points.map((point, index) => `${index ? ` H ${pointX(index)} V ${pointY(point.banners).toFixed(1)}` : `M ${pointX(index)} ${pointY(point.banners).toFixed(1)}`}`).join('')

  return (
    <svg className="dashboard-metric__chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="5-step campaign trend">
      <path d={path} fill="none" />
      {points.map((point, index) => <circle key={point.label} cx={pointX(index)} cy={pointY(point.banners)} r="2.2" />)}
    </svg>
  )
}

function formatCurrency(value) {
  return `$${value.toFixed(2)}`
}
