import { useState } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { AnimatedBanner } from './AnimatedBanner.jsx'
import { Button, SectionHeading, useAssetUrl } from './primitives.jsx'

export function CopyStage({
  workspace,
  api,
  pending,
  readOnly,
  onGenerate,
  onSelect,
  onNext,
  view: controlledView,
  onViewChange,
}) {
  const [localView, setLocalView] = useState('Table')
  const view = controlledView ?? localView
  const setView = onViewChange ?? setLocalView
  const sets = workspace.copies.filter((set) => !set.stale)
  const currentSet = sets.find(
    (set) => set.id === workspace.campaign.selectedCopyId,
  )
  const direction = workspace.directions?.find(
    (item) => item.id === workspace.campaign.selectedDirectionId,
  )
  const { url: imageUrl } = useAssetUrl(api, direction?.previewAssetId)
  const options = sets.flatMap((set) =>
    set.candidates.map((copy, index) => ({
      ...copy,
      setId: set.id,
      number: index + 1,
      selected:
        set.id === currentSet?.id && currentSet.selectedCandidateId === copy.id,
    })),
  )
  const selectButton = (copy) => (
    <Button
      aria-label={`Select option ${copy.number}`}
      aria-pressed={copy.selected}
      onClick={() => onSelect(copy.id)}
      primary={copy.selected}
      disabled={readOnly || Boolean(pending) || copy.selected}
    >
      {copy.selected ? (
        <>
          <Check size={15} aria-hidden="true" />
          Selected
        </>
      ) : (
        'Use this copy'
      )}
    </Button>
  )
  return (
    <section>
      <SectionHeading
        title="Copy"
        action={
          !readOnly && (
            <Button
              onClick={() => onGenerate()}
              busy={pending === 'Generate copy'}
              disabled={Boolean(pending)}
            >
              <Sparkles size={16} aria-hidden="true" />
              Generate another set
            </Button>
          )
        }
      >
        Five ways to tell your story. Compare the headline, short text, CTA and
        optional tag.
      </SectionHeading>
      {options.length === 0 ? (
        <div className="bs-empty">
          <h3>Your copy starts here</h3>
          <p>Generate five options from your brief.</p>
          <Button
            primary
            onClick={() => onGenerate()}
            disabled={readOnly || Boolean(pending)}
          >
            Generate copy
          </Button>
        </div>
      ) : (
        <>
          <div className="bs-copy-toolbar">
            <span>{options.length} options</span>
            <div className="bs-view-switch" role="group" aria-label="Copy view">
              {['Table', 'Cards', 'Banners'].map((label) => (
                <button
                  type="button"
                  key={label}
                  aria-pressed={view === label}
                  onClick={() => setView(label)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {view === 'Table' ? (
            <div
              className="bs-copy-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Scrollable copy comparison"
            >
              <table className="bs-copy-table" aria-label="Banner copy options">
                <thead>
                  <tr>
                    {[
                      'Option',
                      'Headline',
                      'Short text',
                      'CTA',
                      'Tag',
                      'Selection',
                    ].map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {options.map((copy) => (
                    <tr
                      key={`${copy.setId}-${copy.id}`}
                      data-selected={copy.selected}
                    >
                      <th scope="row">{copy.number}</th>
                      <td>
                        <strong>{copy.headline}</strong>
                      </td>
                      <td>{copy.body}</td>
                      <td>{copy.cta}</td>
                      <td>
                        {copy.offer ? (
                          <span className="bs-copy-tag">{copy.offer}</span>
                        ) : (
                          <span className="bs-note">—</span>
                        )}
                      </td>
                      <td>{selectButton(copy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              {view === 'Banners' && (
                <p className="bs-note">
                  Layout previews ·{' '}
                  {imageUrl
                    ? 'Using your selected campaign image.'
                    : 'Example image. Choose your campaign image in AI assets.'}
                </p>
              )}
              <div
                className={`bs-copy-options ${view === 'Banners' ? 'bs-copy-banners' : ''}`}
              >
                {options.map((copy) => (
                  <article
                    className="bs-copy-option"
                    data-selected={copy.selected}
                    key={`${copy.setId}-${copy.id}`}
                  >
                    <header>
                      <span>Option {copy.number}</span>
                      {copy.selected && (
                        <span className="bs-tag">
                          <Check size={13} aria-hidden="true" />
                          Selected
                        </span>
                      )}
                    </header>
                    {view === 'Banners' ? (
                      <AnimatedBanner
                        templateId="editorial-split"
                        headline={copy.headline}
                        body={copy.body}
                        cta={copy.cta}
                        tag={copy.offer}
                        imageUrl={imageUrl || undefined}
                        playing={false}
                      />
                    ) : (
                      <>
                        <h3>{copy.headline}</h3>
                        <p>{copy.body}</p>
                        {copy.offer && (
                          <span className="bs-copy-tag">{copy.offer}</span>
                        )}
                        <div className="bs-copy-cta">
                          <span>CTA</span>
                          <strong>{copy.cta}</strong>
                        </div>
                      </>
                    )}
                    {selectButton(copy)}
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {currentSet && (
        <footer className="bs-actionbar">
          <p className="bs-note">
            Copy selected. Next, choose how the campaign should look.
          </p>
          <Button primary onClick={onNext}>
            Continue to AI assets
          </Button>
        </footer>
      )}
    </section>
  )
}
