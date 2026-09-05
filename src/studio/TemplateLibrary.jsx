import { useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { AnimatedBanner } from './AnimatedBanner.jsx'
import { Button, SectionHeading } from './primitives.jsx'

export function TemplateLibrary({templates,onChoose,canChoose=true}) {
  const [playing,setPlaying]=useState(true)
  return <section className="bs-library"><SectionHeading title="A starting point for every idea" action={<Button onClick={()=>setPlaying(!playing)}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pause previews':'Play previews'}</Button>}>Three layouts. Your copy, your image, four output formats.</SectionHeading><div className="bs-template-grid">{templates.map(template=><article className="bs-template" key={template.id}><AnimatedBanner templateId={template.id} headline="Make room for what's next." body="A fresh perspective. Made for your everyday." cta="Explore the collection" ratioId="square" playing={playing}/><div><h3>{template.name}</h3><p>{template.manifest.ratios.map(ratio=>`${ratio.width} × ${ratio.height}`).join(' · ')}</p><Button primary disabled={!canChoose} onClick={()=>onChoose(template.id)}>Use template</Button></div></article>)}</div>{templates.length===0&&<p>No templates have been published yet. An administrator can publish the bundled templates.</p>}<p className="bs-note">Sample creative · Animations are previewed in the editor. The approved delivery is a PNG package.</p></section>
}
