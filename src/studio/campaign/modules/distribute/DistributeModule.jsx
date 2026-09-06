import { DistributeView } from './DistributeView.jsx'

export default function DistributeModule({ port }) {
  return <DistributeView {...port} expectedInputKey={port.inputKey} />
}
