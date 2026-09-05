import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react'

export function Button({ children, primary=false, busy=false, className='', ...props }) {
  return <button type="button" className={`bs-button ${primary ? 'bs-button--primary':''} ${className}`} {...props} disabled={props.disabled || busy} aria-busy={busy || undefined}>{busy && <LoaderCircle size={16} className="bs-spinner" aria-hidden="true"/>}{children}</button>
}
export function ErrorNotice({error, onRetry}) {
  if (!error) return null
  return <div className="bs-error" role="alert"><AlertCircle size={20} aria-hidden="true"/><div><strong>{error.status === 409 ? 'This campaign has changed' : 'Something needs attention'}</strong><p>{error.message ?? String(error)}</p>{error.details && <ul>{(Array.isArray(error.details)?error.details:[]).map((detail,index)=><li key={index}>{detail.path}: {detail.message}</li>)}</ul>}{onRetry && <Button onClick={onRetry}>Reload campaign</Button>}</div></div>
}
export function SectionHeading({ title, children, action }) {
  return <header className="bs-section-heading"><div><h2>{title}</h2>{children && <p>{children}</p>}</div>{action}</header>
}
export function NextButton({children='Continue', ...props}) { return <Button primary {...props}>{children}<ArrowRight size={17} aria-hidden="true"/></Button> }
export function useAssetUrl(api, assetId) {
  const [state,setState]=useState({url:null,error:null})
  useEffect(()=>{
    let active=true, objectUrl
    setState({url:null,error:null})
    if(assetId) api.getAssetBlob(assetId).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setState({url:objectUrl,error:null})}}).catch(error=>{if(active)setState({url:null,error})})
    return ()=>{active=false;if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[api,assetId])
  return state
}
export function AssetImage({api, assetId, alt, ...props}) {
  const {url,error}=useAssetUrl(api,assetId)
  return url ? <img src={url} alt={alt} {...props}/> : <div className="bs-asset-placeholder" role="status">{error ? 'Image unavailable. Reload the campaign.' : assetId ? 'Loading image…' : 'Generate an image to preview it.'}</div>
}
export function saveBlob(blob, filename) {
  const url=URL.createObjectURL(blob), link=document.createElement('a')
  link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000)
}
