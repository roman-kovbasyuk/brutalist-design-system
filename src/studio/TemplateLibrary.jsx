import { useState } from 'react'
import { Pause, Play } from 'lucide-react'
import { AnimatedBanner } from './AnimatedBanner.jsx'
import { PillTabs, PillTabPanel } from '../components/design-system/molecules/PillTabs.jsx'
import { Button, SectionHeading } from './primitives.jsx'

export function TemplateLibrary({templates,onChoose,canChoose=true}) {
  const [playing,setPlaying]=useState(true)
  const [category,setCategory]=useState('Banners')
  const categories=['Banners','Presentations','Websites','Apps']
  const visibleTemplates=category==='Banners' ? templates : []
  return <section className="bs-library"><SectionHeading as="h1" title="A starting point for every idea" action={<Button onClick={()=>setPlaying(!playing)}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pause previews':'Play previews'}</Button>}>Three layouts. Your copy, your image, four output formats.</SectionHeading><PillTabs tabs={categories} value={category} onChange={setCategory} ariaLabel="Template categories" idPrefix="template-category" />{categories.map(tab => <PillTabPanel key={tab} tab={tab} value={category} idPrefix="template-category">{category === tab && <>{visibleTemplates.length>0 ? <div className="bs-template-grid">{visibleTemplates.map(template=><article className="bs-template" key={template.id}><AnimatedBanner templateId={template.id} headline="Make room for what's next." body="A fresh perspective. Made for your everyday." cta="Explore the collection" ratioId="square" playing={playing}/><div><h3>{template.name}</h3><p>{template.manifest.ratios.map(ratio=>`${ratio.width} × ${ratio.height}`).join(' · ')}</p><Button primary disabled={!canChoose} onClick={()=>onChoose(template.id)}>Use template</Button></div></article>)}</div> : <div className="bs-library-empty" role="status"><h3>{category} templates are coming next</h3><p>We’re starting with banner templates. More formats will appear here as they are added.</p></div>}{category==='Banners' && templates.length===0&&<p>No templates have been published yet. An administrator can publish the bundled templates.</p>}</>}</PillTabPanel>)}<p className="bs-note">Sample creative · Animations are previewed in the editor. The approved delivery is a PNG package.</p></section>
}
