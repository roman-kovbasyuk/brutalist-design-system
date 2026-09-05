import { useEffect, useState } from 'react'
import { CheckCircle2, Download, ExternalLink, FileCheck2 } from 'lucide-react'
import { AssetImage, Button, SectionHeading, saveBlob } from './primitives.jsx'
import { statusLabel } from './workflow.js'

export function ReviewStage({stage,workspace,api,actor,pending,onVersion,onReview,onDeliver,onReopen}){
  const version=workspace.versions.find(item=>item.versionNumber===workspace.campaign.currentVersionNumber)
  const [history,setHistory]=useState(null)
  const [historyError,setHistoryError]=useState('')
  const [comment,setComment]=useState('')
  const [figmaUrl,setFigmaUrl]=useState('')
  const [checks,setChecks]=useState({copyAccuracy:false,layoutQuality:false,exportReadiness:false})
  const [downloadError,setDownloadError]=useState('')
  const [downloading,setDownloading]=useState(false)
  const editor=actor.role==='marketer'||actor.role==='admin'
  const canDesign=actor.role==='designer'
  useEffect(()=>{
    let active=true
    setHistory(null);setHistoryError('')
    if(version)api.getReview(version.id).then(value=>{if(active)setHistory(value)}).catch(()=>{if(active)setHistoryError('Review history could not be loaded. Reload the campaign.')})
    return()=>{active=false}
  },[api,version?.id,workspace.campaign.revision])
  async function download(assetId,name){setDownloading(true);setDownloadError('');try{saveBlob(await api.getAssetBlob(assetId),name)}catch(error){setDownloadError(error.message)}finally{setDownloading(false)}}
  const title=['','','','','Create a review file','Design review','Approve this campaign','Your campaign assets'][stage]
  const descriptions={4:'Freeze the current copy, image and layout into a version the team can review.',5:'The designer checks the exact version in Figma and marks it ready.',6:'Review the designer’s checks before approving the exact creative.',7:'Download the approved, versioned banner package.'}
  const reviewAssets=version?.snapshot.assets.filter(asset=>asset.kind==='review_png')??[]
  const readyEvent=history?.events.find(event=>event.eventType==='ready')
  return <section><SectionHeading title={title}>{descriptions[stage]}</SectionHeading>
    {stage===4&&<div className="bs-review-intro"><FileCheck2 size={36} aria-hidden="true"/><div><h3>One version. One clear handoff.</h3><p>The review file records the exact text, image, template and formats. Changes after this point require a new review round.</p><dl className="bs-facts"><div><dt>Formats</dt><dd>{workspace.composition?.ratioIds.join(', ')}</dd></div><div><dt>Next version</dt><dd>{workspace.campaign.currentVersionNumber+1}</dd></div></dl><Button primary onClick={onVersion} disabled={!editor||Boolean(pending)||workspace.campaign.status!=='composed'||Boolean(workspace.campaign.openVersionId)||!workspace.composition?.validation.valid||workspace.composition?.stale} busy={pending==='Create review version'}>Create version and send to review</Button></div></div>}
    {stage>=5&&version&&<><div className="bs-review-summary"><div><span className="bs-tag">Version {version.versionNumber}</span><h3>{workspace.campaign.title}</h3><p>{statusLabel(workspace.campaign.status)}</p></div><span className="bs-metadata">Created {new Date(version.createdAt).toLocaleDateString('en',{month:'short',day:'numeric'})}</span></div><div className="bs-review-previews">{reviewAssets.map((asset,index)=><figure key={asset.id}><AssetImage api={api} assetId={asset.id} alt={`Review version ${version.versionNumber}, format ${index+1}`}/><figcaption><span>Format {index+1}</span><Button onClick={()=>download(asset.id,`review-v${version.versionNumber}-${index+1}.png`)} disabled={downloading}><Download size={15} aria-hidden="true"/>PNG</Button></figcaption></figure>)}</div>
      {stage===5&&workspace.campaign.status==='in_review'&&(canDesign?<form className="bs-review-form" onSubmit={event=>{event.preventDefault();onReview('mark-ready',{figmaUrl,checklistAnswers:checks})}}><h3>Designer checklist</h3><label className="bs-field"><span>Figma review link</span><input type="url" required placeholder="https://www.figma.com/design/…" value={figmaUrl} onChange={event=>setFigmaUrl(event.target.value)}/></label>{Object.entries({copyAccuracy:'Copy is accurate and readable',layoutQuality:'Layout, image and spacing are correct',exportReadiness:'All selected formats are ready to export'}).map(([key,label])=><label className="bs-check" key={key}><input type="checkbox" checked={checks[key]} onChange={event=>setChecks({...checks,[key]:event.target.checked})}/>{label}</label>)}<Button type="submit" primary disabled={Boolean(pending)||!Object.values(checks).every(Boolean)||!figmaUrl.trim()}>Mark ready for approval</Button><div className="bs-review-reject"><label className="bs-field"><span>Request a change</span><textarea maxLength={2000} value={comment} onChange={event=>setComment(event.target.value)} placeholder="Describe what needs changing."/></label><Button disabled={Boolean(pending)||!comment.trim()} onClick={()=>onReview('request-changes',{comment})}>Request changes</Button></div></form>:<div className="bs-info"><FileCheck2 size={23} aria-hidden="true"/><p>Waiting for the designer to check this version. Their review and Figma link will appear here.</p></div>)}
      {readyEvent&&<div className="bs-info"><CheckCircle2 size={22} aria-hidden="true"/><div><strong>Designer checks completed</strong><p>Copy accuracy · Layout quality · Export readiness</p><a href={readyEvent.payload.figmaUrl} target="_blank" rel="noreferrer">Open Figma review <ExternalLink size={14} aria-hidden="true"/></a></div></div>}
      {stage===6&&workspace.campaign.status==='ready'&&(editor&&readyEvent?.actorId!==actor.id?<div className="bs-approval"><Button primary disabled={Boolean(pending)||!readyEvent} onClick={()=>onReview('approve',{})}>Approve version {version.versionNumber}</Button><label className="bs-field"><span>Or request another round</span><textarea value={comment} maxLength={2000} onChange={event=>setComment(event.target.value)} placeholder="Explain the changes needed."/></label><Button disabled={Boolean(pending)||!comment.trim()} onClick={()=>onReview('reject',{comment})}>Return for changes</Button></div>:<p className="bs-note">The marketer must approve this version. The person who marked it ready cannot approve it.</p>)}
      {workspace.campaign.status==='changes_requested'&&<div className="bs-info"><div><strong>Changes requested</strong><p>Read the feedback below, then reopen the campaign to update its copy, image or layout.</p>{editor&&<Button primary disabled={Boolean(pending)} onClick={onReopen}>Reopen to edit</Button>}</div></div>}
      {stage===7&&<div className="bs-delivery"><CheckCircle2 size={32} aria-hidden="true"/><div><h3>{workspace.delivery?'Ready to download':'Approved and ready to export'}</h3><p>The package contains the approved PNG banners and a manifest identifying the exact files.</p>{workspace.delivery?<Button primary disabled={downloading} busy={downloading} onClick={()=>download(workspace.delivery.asset.id,`banner-studio-v${version.versionNumber}.zip`)}><Download size={17} aria-hidden="true"/>Download package</Button>:editor?<Button primary disabled={Boolean(pending)} busy={pending==='Build delivery'} onClick={onDeliver}>Build delivery package</Button>:<p className="bs-note">The marketer can build and download the delivery.</p>}</div></div>}
      {historyError&&<p role="alert" className="bs-error">{historyError}</p>}
      {history&&<details className="bs-history"><summary>Version activity <span>{history.events.length} events</span></summary><ol>{history.events.map(event=><li key={event.id}><strong>{event.eventType.replaceAll('_',' ')}</strong><span>{event.actorRole} · {new Date(event.createdAt).toLocaleString()}</span>{event.payload.comment&&<p>{event.payload.comment}</p>}</li>)}</ol></details>}
    </>}
    {stage>=5&&!version&&<p className="bs-note">Create a review version first.</p>}{downloadError&&<p role="alert" className="bs-error">{downloadError}</p>}
  </section>
}
