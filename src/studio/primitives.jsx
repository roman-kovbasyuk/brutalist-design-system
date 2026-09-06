import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { AppButton } from '../components/design-system/atoms/AppButton.jsx'

export function Button({ children, primary=false, busy=false, className='', ...props }) {
  return <AppButton {...props} variant={primary ? 'primary' : 'secondary'} busy={busy} className={`bs-button ${primary ? 'bs-button--primary':''} ${className}`}>{children}</AppButton>
}
export function ErrorNotice({error, onRetry}) {
  if (!error) return null
  return <div className="bs-error" role="alert"><AlertCircle size={20} aria-hidden="true"/><div><strong>{error.status === 409 ? 'This campaign has changed' : 'Something needs attention'}</strong><p>{error.message ?? String(error)}</p>{error.details && <ul>{(Array.isArray(error.details)?error.details:[]).map((detail,index)=><li key={index}>{detail.path}: {detail.message}</li>)}</ul>}{onRetry && <Button onClick={onRetry}>Reload campaign</Button>}</div></div>
}
export function SectionHeading({ title, children, action, as: Heading = 'h2' }) {
  return <header className="bs-section-heading"><div><Heading>{title}</Heading>{children && <p>{children}</p>}</div>{action}</header>
}
export function NextButton({children='Continue', ...props}) { return <Button primary {...props}>{children}<ArrowRight size={17} aria-hidden="true"/></Button> }
export function useAssetUrl(reader, assetId) {
  const [state,setState]=useState({url:null,error:null})
  useEffect(()=>{
    let active=true, objectUrl
    const controller = new AbortController()
    setState({url:null,error:null})
    if(assetId) reader.getAssetBlob(assetId, { signal: controller.signal }).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setState({url:objectUrl,error:null})}}).catch(error=>{if(active)setState({url:null,error})})
    return ()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[reader,assetId])
  return state
}
export function AssetImage({api, assets, assetId, alt, ...props}) {
  const {url,error}=useAssetUrl(assets ?? api,assetId)
  return url ? <img src={url} alt={alt} {...props}/> : <div className="bs-asset-placeholder" role="status">{error ? 'Image unavailable. Reload the campaign.' : assetId ? 'Loading image…' : 'Generate an image to preview it.'}</div>
}
export function saveBlob(blob, filename) {
  const url=URL.createObjectURL(blob), link=document.createElement('a')
  link.href=url; link.download=filename; link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000)
}
