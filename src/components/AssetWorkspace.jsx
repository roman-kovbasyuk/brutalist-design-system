import { Play } from 'lucide-react'
import { useRef } from 'react'
import { VisualArtwork } from './VisualArtwork.jsx'
import { CostDialog } from './CostDialog.jsx'

const tabs = [
  ['prompts', 'Prompts'],
  ['static', 'Static visuals'],
  ['videos', 'Videos'],
]

function formatCurrency(value) {
  return `$${value.toFixed(2)}`
}

export function AssetWorkspace({
  activeTab,
  promptIdeas,
  staticAssets,
  videoAssets,
  selectedStaticId,
  videoEstimate,
  showCostDialog,
  onTabChange,
  onGenerateStatic,
  onGenerateVideo,
  onSelectStatic,
  onViewSource,
  onRequestVideoBatch,
  onCancelVideoBatch,
  onConfirmVideoBatch,
}) {
  const tabRefs = useRef({})

  function moveTab(event) {
    const index = tabs.findIndex(([id]) => id === activeTab)
    const nextIndex = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0
          : event.key === 'End' ? tabs.length - 1 : null
    if (nextIndex === null) return
    event.preventDefault()
    const nextTabId = tabs[nextIndex][0]
    onTabChange(nextTabId)
    tabRefs.current[nextTabId]?.focus()
  }

  return (
    <section className="asset-workspace" aria-label="AI asset workspace">
      <div className="asset-tabs" role="tablist" aria-label="AI asset types" onKeyDown={moveTab}>
        {tabs.map(([id, label]) => (
          <button
            key={id}
            id={`asset-tab-${id}`}
            type="button"
            role="tab"
            aria-controls={`asset-panel-${id}`}
            aria-selected={activeTab === id}
            tabIndex={activeTab === id ? 0 : -1}
            ref={(node) => { tabRefs.current[id] = node }}
            onClick={() => onTabChange(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'prompts' && (
        <section id="asset-panel-prompts" role="tabpanel" aria-labelledby="asset-tab-prompts" className="asset-panel">
          <div className="asset-panel__intro"><p>Five local prompt directions are ready to turn into static visuals.</p></div>
          <ol className="prompt-list" aria-label="Prompt directions">
            {promptIdeas.map((prompt, index) => {
              const created = staticAssets.some((asset) => asset.sourcePromptId === prompt.id)
              return (
                <li className="prompt-row" data-testid="prompt-card" key={prompt.id}>
                  <div className="prompt-row__identity">
                    <span className="prompt-row__number">{String(index + 1).padStart(2, '0')}</span>
                    <div><h2>{prompt.title}</h2><small>{prompt.shot}</small></div>
                  </div>
                  <div className="prompt-row__content">
                    <p className="prompt-row__direction">
                      <mark aria-label={`Hero: ${prompt.hero}`}>{prompt.hero}</mark>{' '}
                      <mark aria-label={`Action: ${prompt.action}`}>{prompt.action}</mark>, shaped for the campaign message and clear copy space.
                    </p>
                    <details><summary>Full generated prompt</summary><p>{prompt.prompt}</p></details>
                  </div>
                  <div className="prompt-row__action">
                    <p className="prompt-row__cost">{formatCurrency(prompt.estimatedStaticCost)} estimated cost</p>
                    <button type="button" className="button button--secondary" onClick={() => onGenerateStatic(prompt)} disabled={created}>
                      {created ? 'Generate static visual (already generated)' : `Generate static visual for ${prompt.title}`}
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {activeTab === 'static' && (
        <section id="asset-panel-static" role="tabpanel" aria-labelledby="asset-tab-static" className="asset-panel">
          <div className="asset-panel__intro"><p>Static visuals are local deterministic outputs linked to their originating prompt.</p><span>{staticAssets.length} generated</span></div>
          {staticAssets.length === 0 ? <EmptyState title="No static visuals yet" body="Generate a static visual from any prompt direction to build this gallery." /> : (
            <>
              <div className="asset-gallery" aria-label="Static visuals gallery">
                {staticAssets.map((asset) => {
                  const hasVideo = videoAssets.some((video) => video.sourceStaticId === asset.id)
                  return (
                    <article className="asset-card" data-testid="static-asset" data-selected={selectedStaticId === asset.id} key={asset.id}>
                      <button type="button" className="asset-card__artwork" aria-pressed={selectedStaticId === asset.id} onClick={() => onSelectStatic(asset.id)}>
                        <VisualArtwork visual={asset} />
                        <span className="asset-card__selection">{selectedStaticId === asset.id ? 'Selected for banner preview' : 'Select for banner preview'}</span>
                      </button>
                      <div className="asset-card__details"><span>From prompt · {asset.title}</span><strong>{asset.name}</strong><small>Static visual · simulated locally</small></div>
                      <button type="button" className="asset-card__video-action button button--primary" aria-label={hasVideo ? 'Video generated' : `Generate video from this image for ${formatCurrency(videoEstimate.unitCost)}`} onClick={() => onGenerateVideo(asset)} disabled={hasVideo}>
                        {hasVideo ? 'Video generated' : <><span>Generate video from this image</span><span>{formatCurrency(videoEstimate.unitCost)} per video</span></>}
                      </button>
                    </article>
                  )
                })}
              </div>
              <button type="button" className="button button--secondary asset-bulk-action" onClick={onRequestVideoBatch} disabled={videoEstimate.count === 0}>Generate videos for all images</button>
            </>
          )}
        </section>
      )}

      {activeTab === 'videos' && (
        <section id="asset-panel-videos" role="tabpanel" aria-labelledby="asset-tab-videos" className="asset-panel">
          <div className="asset-panel__intro"><p>Motion treatments remain linked to their source image and are simulated locally.</p><span>{videoAssets.length} generated</span></div>
          {videoAssets.length === 0 ? <EmptyState title="No videos yet" body="Generate a video from a static visual, or use the bulk action in Static visuals." /> : (
            <div className="asset-gallery" aria-label="Generated videos gallery">
              {videoAssets.map((asset) => (
                <article className="asset-card asset-card--video" data-testid="video-asset" key={asset.id}>
                  <div className="asset-card__artwork asset-card__artwork--video"><VisualArtwork visual={asset} /><span className="asset-card__play"><Play size={20} fill="currentColor" aria-hidden="true" /> Simulated motion</span></div>
                  <div className="asset-card__details"><button type="button" className="asset-card__source" onClick={() => onViewSource(asset.sourceStaticId)}>View source static visual {asset.title}</button><strong>{asset.name}</strong><small>6 seconds · video · simulated locally</small></div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {showCostDialog && <CostDialog estimate={videoEstimate} onCancel={onCancelVideoBatch} onConfirm={onConfirmVideoBatch} />}
    </section>
  )
}

function EmptyState({ title, body }) {
  return <div className="asset-empty-state"><strong>{title}</strong><p>{body}</p></div>
}
