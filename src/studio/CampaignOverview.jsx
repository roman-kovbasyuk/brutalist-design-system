export function CampaignOverview({ workspace }) {
  const brief = workspace.campaign.brief ?? {}
  const analysis = workspace.jobs?.find(job => job.step === 'brief_analysis' && job.status === 'succeeded' && job.result?.analysis)?.result.analysis
  const facts = [
    ['Audience', brief.audience],
    ['Objective', brief.objective],
    ['Duration', null],
    ['Formats', workspace.composition?.formats?.join(', ')],
    ['Offer', brief.offer],
  ]
  const summary = analysis?.summary || brief.notes
  return <section className="bs-campaign-overview" aria-label="Campaign overview">
    <dl className="bs-campaign-facts">
      {facts.map(([label, value]) => <div key={label} data-fact={label.toLowerCase()}><dt>{label}</dt><dd data-empty={!value?.trim()}>{value?.trim() || 'Not specified'}</dd></div>)}
    </dl>
    {summary && <div className="bs-campaign-summary"><h2>{analysis?.summary ? 'Campaign summary' : 'Campaign brief'}</h2><p>{summary}</p></div>}
  </section>
}
