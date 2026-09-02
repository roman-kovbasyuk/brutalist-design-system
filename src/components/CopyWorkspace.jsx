export function CopyWorkspace({ strategy, promptIdeas, onCopyChange }) {
  return (
    <section className="copy-workbench" aria-label="Copy and shot planning">
      <div className="copy-workbench__message">
        <header className="copy-section-header">
          <div>
            <h2>Campaign message</h2>
            <p>AI interpretation of the brief. Edit the copy before creating assets.</p>
          </div>
          <span className="copy-editable-status">Editable</span>
        </header>

        <dl className="copy-strategy">
          <DescriptionRow label="Audience" value={strategy.audience} />
          <DescriptionRow label="Objective" value={strategy.goal} />
          <DescriptionRow label="Offer" value={strategy.offer} />
        </dl>

        <div className="copy-fields">
          <TextField label="Headline" value={strategy.headline} onChange={(value) => onCopyChange('headline', value)} />
          <TextField label="Body copy" value={strategy.body} onChange={(value) => onCopyChange('body', value)} multiline />
          <TextField label="CTA" value={strategy.cta} onChange={(value) => onCopyChange('cta', value)} />
        </div>
      </div>

      <div className="shot-planner">
        <header className="copy-section-header copy-section-header--shots">
          <div>
            <h2>5 shot prompts</h2>
            <p>Distinct visual moments created from the campaign brief.</p>
          </div>
          <span className="shot-count" aria-label="Five prompts ready">5 ready</span>
        </header>

        <div className="prompt-legend" aria-label="Prompt highlight legend">
          <span><i className="prompt-legend__swatch prompt-legend__swatch--hero" aria-hidden="true" />Hero</span>
          <span><i className="prompt-legend__swatch prompt-legend__swatch--action" aria-hidden="true" />Action</span>
        </div>

        <ol className="shot-list">
          {promptIdeas.map((prompt, index) => (
            <li className="shot-prompt" data-testid="shot-prompt" key={prompt.id}>
              <div className="shot-prompt__heading">
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{prompt.title}</h3>
                <small>{prompt.shot}</small>
              </div>
              <p className="shot-prompt__sentence">
                <mark className="prompt-highlight prompt-highlight--hero" aria-label={`Hero: ${prompt.hero}`}>{prompt.hero}</mark>{' '}
                <mark className="prompt-highlight prompt-highlight--action" aria-label={`Action: ${prompt.action}`}>{prompt.action}</mark>.
              </p>
              <details className="shot-prompt__technical">
                <summary>Technical prompt</summary>
                <p>{prompt.prompt}</p>
              </details>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function DescriptionRow({ label, value }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>
}

function TextField({ label, value, onChange, multiline = false }) {
  const id = `field-${label}`
  return (
    <label className="text-field" htmlFor={id}>
      <span>{label}</span>
      {multiline
        ? <textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} />
        : <input id={id} value={value} onChange={(event) => onChange(event.target.value)} />}
    </label>
  )
}
