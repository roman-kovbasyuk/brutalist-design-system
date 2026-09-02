const colors = [
  ['Ink', '#111111'],
  ['Paper', '#F4F4F1'],
  ['Surface', '#FFFFFF'],
  ['Rule', '#D9D9D2'],
  ['Success', '#1D6B43'],
]

const formats = [
  ['Square', '1080×1080', '1 / 1'],
  ['Portrait', '1080×1350', '4 / 5'],
  ['Story', '1080×1920', '9 / 16'],
  ['Landscape', '1200×628', '1200 / 628'],
]

export function DesignSystemScreen() {
  return (
    <section className="reference-screen system-screen">
      <header className="page-header page-header--split">
        <div>
          <p className="page-context">Reference 01</p>
          <h1>Design system</h1>
        </div>
        <p className="page-description">
          The interface stays neutral. Color, imagery, and motion belong to the creative,
          not the tool around it.
        </p>
      </header>

      <section className="system-section">
        <div className="section-label"><span>01</span><h2>Color and surfaces</h2></div>
        <div className="color-strip">
          {colors.map(([name, value]) => (
            <div className="color-token" key={name}>
              <span style={{ background: value }} />
              <strong>{name}</strong>
              <small>{value}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="system-section type-section">
        <div className="section-label"><span>02</span><h2>Typography</h2></div>
        <div className="type-samples">
          <div><span>Display / 72</span><p className="type-display">One idea.<br />Twenty systems.</p></div>
          <div><span>Body / 16</span><p className="type-body">Copy must survive every resize, preserve its hierarchy, and remain readable in each format.</p></div>
        </div>
      </section>

      <section className="system-section">
        <div className="section-label"><span>03</span><h2>Content contract</h2></div>
        <div className="contract-table" role="table" aria-label="Banner content contract">
          {[
            ['headline', 'up to 54 characters', 'required'],
            ['body', 'up to 120 characters', 'required'],
            ['offer', 'up to 28 characters', 'optional'],
            ['cta', 'up to 24 characters', 'required'],
            ['visual', 'image / video', 'required'],
          ].map((row) => (
            <div role="row" key={row[0]}>{row.map((cell) => <span role="cell" key={cell}>{cell}</span>)}</div>
          ))}
        </div>
      </section>

      <section className="system-section">
        <div className="section-label"><span>04</span><h2>Formats</h2></div>
        <div className="format-system-grid">
          {formats.map(([label, size, ratio]) => (
            <div className="format-system-item" key={size}>
              <span className="format-shape" style={{ aspectRatio: ratio }} />
              <strong>{label}</strong><small>{size}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="system-section">
        <div className="section-label"><span>05</span><h2>Motion</h2></div>
        <div className="motion-rules">
          <p><strong>Entrance</strong><span>One primary gesture per scene</span></p>
          <p><strong>Rhythm</strong><span>Motion follows the message, not decoration</span></p>
          <p><strong>Transition</strong><span>The composition reflows instead of disappearing</span></p>
        </div>
      </section>
    </section>
  )
}
