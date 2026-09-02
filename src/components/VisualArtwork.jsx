export function VisualArtwork({ visual, compact = false }) {
  const colors = visual?.palette ?? ['#e8d8c6', '#6d81a7', '#1d2940']
  return (
    <div
      className={`visual-art visual-art--${visual?.motif ?? 'portrait'} ${compact ? 'visual-art--compact' : ''}`}
      style={{ '--tone-a': colors[0], '--tone-b': colors[1], '--tone-c': colors[2] }}
      aria-hidden="true"
    >
      {visual?.imageSrc ? <img className="visual-uploaded-image" src={visual.imageSrc} alt="" /> : visual?.videoSrc ? <video className="visual-uploaded-image" src={visual.videoSrc} muted playsInline preload="metadata" /> : <><span className="visual-shape visual-shape-a" /><span className="visual-shape visual-shape-b" /><span className="visual-shape visual-shape-c" /><span className="visual-light" /></>}
    </div>
  )
}
