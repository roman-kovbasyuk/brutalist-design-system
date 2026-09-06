import { lazy } from 'react'

export const moduleRegistry = Object.freeze({
  brief: lazy(() => import('./modules/brief/BriefModule.jsx')),
  copy: lazy(() => import('./modules/copy/CopyModule.jsx')),
  visuals: lazy(() => import('./modules/visuals/VisualsModule.jsx')),
  banners: lazy(() => import('./modules/banners/BannersModule.jsx')),
  review: lazy(() => import('./modules/review/ReviewModule.jsx')),
  distribute: lazy(() => import('./modules/distribute/DistributeModule.jsx')),
})
