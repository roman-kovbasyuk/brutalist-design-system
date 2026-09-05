import { Check, ImagePlus, Sparkles } from 'lucide-react'
import { AssetImage, Button, SectionHeading } from './primitives.jsx'

export function VisualStage({ workspace, api, pending, readOnly, onGenerate, onImage, onSelect, onNext }) {
  const directions = workspace.directions.filter(item => !item.stale)
  return <section>
    <SectionHeading title="AI assets" action={!readOnly && <Button onClick={onGenerate} disabled={Boolean(pending)}><Sparkles size={16} aria-hidden="true" />New directions</Button>}>
      Choose the idea, generate its image, then select it for your banners.
    </SectionHeading>
    {directions.length === 0 ? <div className="bs-empty">
      <ImagePlus size={32} aria-hidden="true" /><h3>Give the copy a visual world</h3>
      <p>Generate visual directions based on your chosen message.</p>
      <Button primary onClick={onGenerate} disabled={readOnly || Boolean(pending)}>Generate directions</Button>
    </div> : <div className="bs-direction-list">{directions.map((direction, index) => {
      const selected = workspace.campaign.selectedDirectionId === direction.id
      return <article className="bs-direction-row" key={direction.id} data-selected={selected} aria-label={direction.title}>
        <div className="bs-direction-media" role="group" aria-label={`${direction.title} image`}>
          {direction.previewAssetId ? <AssetImage api={api} assetId={direction.previewAssetId} alt={direction.title} /> : <div className="bs-direction-placeholder">
            <Button primary disabled={readOnly || Boolean(pending)} onClick={() => onImage(direction.id)} busy={pending === `Generate image ${index + 1}`}>
              <Sparkles size={20} aria-hidden="true" />Generate image
            </Button>
          </div>}
          {selected && <span className="bs-tag"><Check size={14} aria-hidden="true" />Selected</span>}
        </div>
        <div className="bs-direction-description">
          <h3>{direction.title}</h3><p>{direction.prompt}</p>
          {direction.previewAssetId && <Button primary={selected} disabled={readOnly || Boolean(pending) || selected} onClick={() => onSelect(direction.id)}>{selected ? 'Selected' : 'Use this image'}</Button>}
        </div>
      </article>
    })}</div>}
    {workspace.campaign.selectedDirectionId && <footer className="bs-actionbar"><span className="bs-note">Your selected image will fill the template’s image slot.</span><Button primary onClick={onNext}>Continue to banners</Button></footer>}
  </section>
}
