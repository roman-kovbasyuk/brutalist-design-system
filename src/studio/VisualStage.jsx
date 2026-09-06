import { VisualsView } from './campaign/modules/visuals/VisualsView.jsx'

export function VisualStage({ workspace, api, ...props }) {
  return <VisualsView {...props} input={{ directions: workspace.directions, selectedDirectionId: workspace.campaign.selectedDirectionId }} assets={api} heading />
}
