import { Check, Copy, Download, Pause, Pencil, Play, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
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
  onUpdatePrompt,
  onDeletePrompt,
  onDownloadPrompt,
  onGenerateStatic,
  onGenerateVideo,
  onSelectStatic,
  onViewSource,
  onRequestVideoBatch,
  onCancelVideoBatch,
  onConfirmVideoBatch,
}) {
  const tabRefs = useRef({})
  const [copiedPromptId, setCopiedPromptId] = useState(null)
  const [playingVideoId, setPlayingVideoId] = useState(null)
  const [editingPromptId, setEditingPromptId] = useState(null)
  const [deletingPromptId, setDeletingPromptId] = useState(null)
  const [promptDraft, setPromptDraft] = useState({ title: '', prompt: '' })

  async function copyPrompt(asset) {
    await navigator.clipboard.writeText(asset.prompt)
    setCopiedPromptId(asset.id)
  }

  function beginPromptEdit(prompt) {
    setEditingPromptId(prompt.id)
    setDeletingPromptId(null)
    setPromptDraft({ title: prompt.title, prompt: prompt.prompt })
  }

  function savePrompt(event, promptId) {
    event.preventDefault()
    const title = promptDraft.title.trim()
    const prompt = promptDraft.prompt.trim()
    if (!title || !prompt) return
    onUpdatePrompt(promptId, { title, prompt })
    setEditingPromptId(null)
  }

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
              const editing = editingPromptId === prompt.id
              const confirmingDelete = deletingPromptId === prompt.id
              return (
                <li className={`prompt-row ${editing ? 'prompt-row--editing' : ''}`} data-testid="prompt-card" key={prompt.id}>
                  <div className="prompt-row__identity">
                    <span className="prompt-row__number">{String(index + 1).padStart(2, '0')}</span>
                    <div><h2>{editing ? 'Edit prompt' : prompt.title}</h2><small>{editing ? 'Update the name and full generation text' : prompt.shot}</small></div>
                  </div>
                  {editing ? (
                    <form className="prompt-row__editor" onSubmit={(event) => savePrompt(event, prompt.id)}>
                      <label><span>Prompt name</span><input value={promptDraft.title} onChange={(event) => setPromptDraft((current) => ({ ...current, title: event.target.value }))} required /></label>
                      <label><span>Prompt text</span><textarea value={promptDraft.prompt} onChange={(event) => setPromptDraft((current) => ({ ...current, prompt: event.target.value }))} required /></label>
                      <div className="prompt-row__editor-actions">
                        <button type="button" className="button button--secondary" onClick={() => setEditingPromptId(null)}><X size={14} aria-hidden="true" />Cancel</button>
                        <button type="submit" className="button button--primary"><Check size={14} aria-hidden="true" />Save prompt</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div className="prompt-row__content">
                        <p className="prompt-row__direction">
                          <mark aria-label={`Hero: ${prompt.hero}`}>{prompt.hero}</mark>{' '}
                          <mark aria-label={`Action: ${prompt.action}`}>{prompt.action}</mark>, shaped for the campaign message and clear copy space.
                        </p>
                        <details><summary>Full generated prompt</summary><p>{prompt.prompt}</p></details>
                      </div>
                      <div className="prompt-row__action">
                        <div className="prompt-row__management" aria-label={`Actions for ${prompt.title}`}>
                          <button type="button" aria-label={`Download prompt ${prompt.title}`} title="Download" onClick={() => onDownloadPrompt(prompt)}><Download size={15} aria-hidden="true" /></button>
                          <button type="button" aria-label={`Edit prompt ${prompt.title}`} title="Edit" onClick={() => beginPromptEdit(prompt)}><Pencil size={15} aria-hidden="true" /></button>
                          <button type="button" className="prompt-row__delete" aria-label={`Delete prompt ${prompt.title}`} title="Delete" onClick={() => setDeletingPromptId(prompt.id)}><Trash2 size={15} aria-hidden="true" /></button>
                        </div>
                        <p className="prompt-row__cost">{formatCurrency(prompt.estimatedStaticCost)} estimated cost</p>
                        {confirmingDelete ? (
                          <div className="prompt-row__delete-confirm" role="group" aria-label={`Confirm deletion of ${prompt.title}`}>
                            <span>Delete this prompt?</span>
                            <button type="button" onClick={() => setDeletingPromptId(null)}>Cancel</button>
                            <button type="button" aria-label={`Confirm delete ${prompt.title}`} onClick={() => { onDeletePrompt(prompt.id); setDeletingPromptId(null) }}>Delete</button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="button button--secondary"
                            aria-label={created ? `Generate static visual for ${prompt.title} (already generated)` : `Generate static visual for ${prompt.title}`}
                            onClick={() => onGenerateStatic(prompt)}
                            disabled={created}
                          >
                            {created ? 'Generated' : 'Generate visual'}
                          </button>
                        )}
                      </div>
                    </>
                  )}
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
              <ul className="static-asset-list" aria-label="Static visuals">
                {staticAssets.map((asset) => {
                  const hasVideo = videoAssets.some((video) => video.sourceStaticId === asset.id)
                  const promptCopied = copiedPromptId === asset.id
                  return (
                    <li className="static-asset-row" data-testid="static-asset" data-selected={selectedStaticId === asset.id} key={asset.id}>
                      <div className="static-asset-row__media">
                        <button type="button" className="asset-card__artwork" aria-pressed={selectedStaticId === asset.id} onClick={() => onSelectStatic(asset.id)}>
                          <VisualArtwork visual={asset} />
                          <span className="asset-card__selection">{selectedStaticId === asset.id ? 'Selected' : 'Select'}</span>
                        </button>
                        <button type="button" className="static-asset-row__video-action button button--primary" aria-label={hasVideo ? 'Video generated' : `Generate video from this image for ${formatCurrency(videoEstimate.unitCost)}`} onClick={() => onGenerateVideo(asset)} disabled={hasVideo}>
                          {hasVideo ? <><Check size={14} aria-hidden="true" /> Video generated</> : <><Play size={14} fill="currentColor" aria-hidden="true" /><span>Generate video</span><span>{formatCurrency(videoEstimate.unitCost)} per video</span></>}
                        </button>
                      </div>
                      <div className="static-asset-row__details">
                        <div><strong>{asset.title}</strong><span>{asset.name}</span></div>
                        <button
                          type="button"
                          className="copy-prompt-action"
                          aria-label={promptCopied ? `Prompt copied for ${asset.title}` : `Copy prompt for ${asset.title}`}
                          onClick={() => copyPrompt(asset)}
                        >
                          {promptCopied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                          {promptCopied ? 'Prompt copied' : 'Copy prompt'}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
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
                <article className="asset-card asset-card--video" data-testid="video-asset" data-playing={playingVideoId === asset.id} key={asset.id}>
                  <div className="asset-card__artwork asset-card__artwork--video">
                    <VisualArtwork visual={asset} />
                    <button
                      type="button"
                      className="asset-card__play"
                      aria-label={`${playingVideoId === asset.id ? 'Pause' : 'Play'} video preview ${asset.title}`}
                      onClick={() => setPlayingVideoId((current) => current === asset.id ? null : asset.id)}
                    >
                      {playingVideoId === asset.id ? <Pause size={19} fill="currentColor" aria-hidden="true" /> : <Play size={20} fill="currentColor" aria-hidden="true" />}
                    </button>
                  </div>
                  <div className="asset-card__details"><button type="button" className="asset-card__source" aria-label={`View source image ${asset.title}`} onClick={() => onViewSource(asset.sourceStaticId)}>Source image</button><strong>{asset.name}</strong></div>
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
