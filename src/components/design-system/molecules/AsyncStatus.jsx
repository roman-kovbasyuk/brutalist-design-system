import { LoaderCircle } from 'lucide-react'
import './async-status.css'

/** Indeterminate work: real stage text from the caller, never simulated progress. */
export function AsyncStatus({ children }) {
  return <p className="v2-async-status" role="status"><LoaderCircle size={20} className="v2-button-spinner" aria-hidden="true" />{children}</p>
}
