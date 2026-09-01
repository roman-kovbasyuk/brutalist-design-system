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
          <h1>Дизайн-система</h1>
        </div>
        <p className="page-description">
          Интерфейс остаётся нейтральным. Цвет, изображение и движение принадлежат креативу,
          а не инструменту вокруг него.
        </p>
      </header>

      <section className="system-section">
        <div className="section-label"><span>01</span><h2>Цвет и поверхность</h2></div>
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
        <div className="section-label"><span>02</span><h2>Типографика</h2></div>
        <div className="type-samples">
          <div><span>Display / 72</span><p className="type-display">Одна идея.<br />Двадцать систем.</p></div>
          <div><span>Body / 16</span><p className="type-body">Текст должен пережить ресайз, сохранить иерархию и остаться читаемым в каждом формате.</p></div>
        </div>
      </section>

      <section className="system-section">
        <div className="section-label"><span>03</span><h2>Контракт контента</h2></div>
        <div className="contract-table" role="table" aria-label="Контракт баннера">
          {[
            ['headline', 'до 54 символов', 'обязательное'],
            ['body', 'до 120 символов', 'обязательное'],
            ['offer', 'до 28 символов', 'опциональное'],
            ['cta', 'до 24 символов', 'обязательное'],
            ['visual', 'image / video', 'обязательное'],
          ].map((row) => (
            <div role="row" key={row[0]}>{row.map((cell) => <span role="cell" key={cell}>{cell}</span>)}</div>
          ))}
        </div>
      </section>

      <section className="system-section">
        <div className="section-label"><span>04</span><h2>Форматы</h2></div>
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
        <div className="section-label"><span>05</span><h2>Движение</h2></div>
        <div className="motion-rules">
          <p><strong>Вход</strong><span>Один главный жест за сцену</span></p>
          <p><strong>Ритм</strong><span>Текст следует сообщению, не декору</span></p>
          <p><strong>Переход</strong><span>Композиция перестраивается, а не исчезает</span></p>
        </div>
      </section>
    </section>
  )
}
