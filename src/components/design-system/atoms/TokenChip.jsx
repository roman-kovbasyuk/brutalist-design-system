import { Copy } from 'lucide-react'
import { TokenCopyTarget } from './TokenCopyTarget.jsx'
import './token-chip.css'

/** Copies the displayed CSS custom-property name, without a var() wrapper. */
export function TokenChip({ token }) {
  return <TokenCopyTarget chip className="v2-token-copy" copyValue={token} label={token}>
    <code>{token}</code><Copy size={16} aria-hidden="true" />
  </TokenCopyTarget>
}
