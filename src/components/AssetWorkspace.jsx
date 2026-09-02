import { Check, Copy, Download, ImagePlus, Pause, Pencil, Play, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { VisualArtwork } from './VisualArtwork.jsx'
import { CostDialog } from './CostDialog.jsx'

const tabs = [
  ['prompts', 'Prompts'],
  ['static', 'Visuals'],
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
  onDownloadAsset,
  onRenameStatic,
  onDeleteStatic,
  onRenameVideo,
  onDeleteVideo,
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
        {tabs.map(([id, label]) => {
          const count = id === 'prompts' ? promptIdeas.length : id === 'static' ? staticAssets.length : videoAssets.length
          return (
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
            {label} <span className="asset-tab-count">{count}</span>
          </button>
          )
        })}
      </div>

      {activeTab === 'prompts' && (
        <section id="asset-panel-prompts" role="tabpanel" aria-labelledby="asset-tab-prompts" className="asset-panel">
          <ol className="prompt-list" aria-label="Prompt directions">
            {promptIdeas.map((prompt) => {
              const created = staticAssets.some((asset) => asset.sourcePromptId === prompt.id)
              const editing = editingPromptId === prompt.id
              const confirmingDelete = deletingPromptId === prompt.id
              return (
                <li className={`prompt-row ${editing ? 'prompt-row--editing' : ''} ${confirmingDelete ? 'prompt-row--confirming' : ''}`} data-testid="prompt-card" key={prompt.id}>
                  {created && <div className="prompt-row__generated-left" aria-label="Static visual generated"><Check size={13} aria-hidden="true" /><span>Generated</span></div>}
                  <div className="prompt-row__identity">
                    <div><h2>{editing ? 'Edit prompt' : (prompt.copyVariant?.headline ?? prompt.title)}</h2><small>{editing ? 'Update the name and full generation text' : `${prompt.copyVariant?.body ?? prompt.shot} · ${prompt.copyVariant?.cta ?? ''}`}</small></div>
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
                      <div
                        className="prompt-row__content prompt-row__content--editable"
                        role="button"
                        tabIndex={0}
                        aria-label={`Edit prompt ${prompt.title}`}
                        onClick={() => beginPromptEdit(prompt)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            beginPromptEdit(prompt)
                          }
                        }}
                      >
                        <p className="prompt-row__direction">
                          <mark className="prompt-highlight prompt-highlight--hero" aria-label={`Object or person: ${prompt.hero}`}>{prompt.hero}</mark>{' '}
                          <mark className="prompt-highlight prompt-highlight--scene" aria-label={`Location or scene: ${prompt.scene}`}>{prompt.scene.toLowerCase()}</mark>{' '}
                          <mark className="prompt-highlight prompt-highlight--action" aria-label={`Action: ${prompt.action}`}>{prompt.action}</mark>,{' '}
                          <mark className="prompt-highlight prompt-highlight--topic" aria-label="Connection to campaign topic">shaped for the campaign message</mark> and clear copy space.
                        </p>
                        <p className="prompt-row__full-prompt">{prompt.prompt}</p>
                      </div>
                      <div className="prompt-row__action">
                        <div className="prompt-row__management" aria-label={`Actions for ${prompt.title}`}>
                          <button type="button" aria-label={`Download prompt ${prompt.title}`} title="Download" onClick={() => onDownloadPrompt(prompt)}><Download size={15} aria-hidden="true" /></button>
                          <button type="button" aria-label={`Edit prompt ${prompt.title}`} title="Edit" onClick={() => beginPromptEdit(prompt)}><Pencil size={15} aria-hidden="true" /></button>
                          <button type="button" className="prompt-row__delete" aria-label={`Delete prompt ${prompt.title}`} title="Delete" onClick={() => setDeletingPromptId(prompt.id)}><Trash2 size={15} aria-hidden="true" /></button>
                        </div>
                        {confirmingDelete ? (
                          <div className="prompt-row__delete-confirm" role="group" aria-label={`Confirm deletion of ${prompt.title}`}>
                            <span>Delete this prompt?</span>
                            <button type="button" onClick={() => setDeletingPromptId(null)}>Cancel</button>
                            <button type="button" aria-label={`Confirm delete ${prompt.title}`} onClick={() => { onDeletePrompt(prompt.id); setDeletingPromptId(null) }}>Delete</button>
                          </div>
                        ) : (
                          <div className={`prompt-row__visual-placeholder ${created ? 'prompt-row__visual-placeholder--generated' : ''}`} aria-label={created ? 'Static visual generated' : 'Upload video or photo to generate video'}>
                            {created ? <><Check size={14} aria-hidden="true" />Generated</> : <><span>Upload video/photo<small>to generate video</small></span><em>or</em><button type="button" className="button button--secondary" aria-label={`Generate static visual for ${prompt.title}`} onClick={() => onGenerateStatic(prompt)}><ImagePlus size={14} aria-hidden="true" />Generate visual</button></>}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ol>
          {staticAssets.length > 0 && (
            <section className="generated-visuals" aria-label="Generated visuals">
              <h3>Generated visuals</h3>
              <div className="generated-visuals__list">
                {staticAssets.map((asset) => <button type="button" className="generated-visual-card" data-selected={selectedStaticId === asset.id} key={asset.id} onClick={() => onSelectStatic(asset.id)}><VisualArtwork visual={asset} compact /><span>{asset.title}</span></button>)}
              </div>
            </section>
          )}
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
                        <div className="static-asset-row__controls">
                          <button
                            type="button"
                            className="copy-prompt-action"
                            aria-label={promptCopied ? `Prompt copied for ${asset.title}` : `Copy prompt for ${asset.title}`}
                            onClick={() => copyPrompt(asset)}
                          >
                            {promptCopied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
                            {promptCopied ? 'Prompt copied' : 'Copy prompt'}
                          </button>
                          <AssetManagement
                            asset={asset}
                            kind="image"
                            hasDerivedVideo={hasVideo}
                            onDownload={onDownloadAsset}
                            onRename={onRenameStatic}
                            onDelete={onDeleteStatic}
                          />
                        </div>
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
                  <div className="asset-card__details">
                    <button type="button" className="asset-card__source" aria-label={`View source image ${asset.title}`} onClick={() => onViewSource(asset.sourceStaticId)}>Source image</button>
                    <div className="asset-card__identity"><strong>{asset.name}</strong><AssetManagement asset={asset} kind="video" onDownload={onDownloadAsset} onRename={onRenameVideo} onDelete={onDeleteVideo} /></div>
                  </div>
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

function AssetManagement({ asset, kind, hasDerivedVideo = false, onDownload, onRename, onDelete }) {
  const [mode, setMode] = useState('idle')
  const [draftName, setDraftName] = useState(asset.name)
  const label = kind === 'image' ? 'Image' : 'Video'

  function beginRename() {
    setDraftName(asset.name)
    setMode('rename')
  }

  function saveName(event) {
    event.preventDefault()
    const name = draftName.trim()
    if (!name) return
    onRename(asset.id, name)
    setMode('idle')
  }

  if (mode === 'rename') {
    return (
      <form className="asset-management__rename" onSubmit={saveName}>
        <label><span>{label} name</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} required /></label>
        <button type="button" aria-label={`Cancel renaming ${kind} ${asset.title}`} title="Cancel" onClick={() => setMode('idle')}><X size={14} aria-hidden="true" /></button>
        <button type="submit" aria-label={`Save ${kind} name`} title="Save"><Check size={14} aria-hidden="true" /></button>
      </form>
    )
  }

  if (mode === 'delete') {
    const message = kind === 'image' && hasDerivedVideo ? 'Delete this image and its video?' : `Delete this ${kind}?`
    return (
      <div className="asset-management__confirm" role="group" aria-label={`Confirm deletion of ${asset.title}`}>
        <span>{message}</span>
        <button type="button" onClick={() => setMode('idle')}>Cancel</button>
        <button type="button" aria-label={`Confirm delete ${kind} ${asset.title}`} onClick={() => onDelete(asset.id)}>Delete</button>
      </div>
    )
  }

  return (
    <div className="asset-management" aria-label={`Actions for ${asset.title}`}>
      <button type="button" aria-label={`Download ${kind} ${asset.title}`} title="Download" onClick={() => onDownload(asset)}><Download size={15} aria-hidden="true" /></button>
      <button type="button" aria-label={`Rename ${kind} ${asset.title}`} title="Rename" onClick={beginRename}><Pencil size={15} aria-hidden="true" /></button>
      <button type="button" className="asset-management__delete" aria-label={`Delete ${kind} ${asset.title}`} title="Delete" onClick={() => setMode('delete')}><Trash2 size={15} aria-hidden="true" /></button>
    </div>
  )
}

function EmptyState({ title, body }) {
  return <div className="asset-empty-state"><strong>{title}</strong><p>{body}</p></div>
}
