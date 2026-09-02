import { dashboardMetrics, campaignHistory } from '../data/campaigns.js'

const metricItems = [
  ['Total banners created', dashboardMetrics.totalBannersCreated],
  ['Total reviews', dashboardMetrics.totalReviews],
  ['GenAI production cost', formatCurrency(dashboardMetrics.genAiProductionCost)],
  ['Static-to-video ratio', dashboardMetrics.staticToVideoRatio],
]

export function DashboardScreen({ onOpenCampaign }) {
  return (
    <section className="dashboard-screen">
      <header className="dashboard-header">
        <div>
          <p className="page-context">Production overview</p>
          <h1>Campaign production</h1>
          <p>Track locally simulated creative work across every campaign.</p>
        </div>
        <span className="dashboard-mode">Local demo</span>
      </header>

      <dl className="dashboard-metric-strip" aria-label="Production metrics">
        {metricItems.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>

      <section className="campaign-history-section" aria-labelledby="campaign-history-title">
        <div className="dashboard-section-header">
          <div><p className="page-context">Campaigns</p><h2 id="campaign-history-title">Campaign history</h2></div>
          <span>{campaignHistory.length} campaigns</span>
        </div>
        <div className="campaign-history-scroll">
          <table className="campaign-history-table" aria-label="Campaign history">
            <thead>
              <tr>
                <th scope="col">Date</th><th scope="col">Status</th><th scope="col">Campaign</th><th scope="col">Banners</th>
                <th scope="col">Total generations</th><th scope="col">Static visuals</th><th scope="col">Videos</th><th scope="col">Production cost</th><th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {campaignHistory.map((campaign) => (
                <tr key={campaign.id}>
                  <td>{campaign.date}</td><td><span className="campaign-status" data-status={campaign.status.toLowerCase().replaceAll(' ', '-')}>{campaign.status}</span></td>
                  <th scope="row">{campaign.name}</th><td>{campaign.bannerCount}</td><td>{campaign.totalGenerations}</td><td>{campaign.staticVisualCount}</td><td>{campaign.videoCount}</td><td>{formatCurrency(campaign.productionCost)}</td>
                  <td><button className="table-action" type="button" onClick={() => onOpenCampaign(campaign.id)} aria-label={`Open ${campaign.name}`}>Open <span aria-hidden="true">→</span></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

function formatCurrency(value) {
  return `$${value.toFixed(2)}`
}
