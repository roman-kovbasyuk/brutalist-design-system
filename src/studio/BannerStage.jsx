import { BannersView } from './campaign/modules/banners/BannersView.jsx'
import { projectModuleInput } from './campaign/moduleContracts.js'

export function BannerStage({ workspace, templates, api, onSave, ...props }) {
  return <BannersView {...props} onSave={onSave} input={projectModuleInput('banners', workspace, { templates })} assets={api} heading />
}
