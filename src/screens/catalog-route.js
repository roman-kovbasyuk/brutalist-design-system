// Old shared links resolve to the same catalog; no alternate renderer is retained.
const componentTargets = {
  buttons: 'buttons', inputs: 'fields', selection: 'dropdowns', navigation: 'tabs-and-view-controls',
  overlays: 'modals-&-tooltips', feedback: 'feedback-states', data: 'table',
  files: 'fields', ai: 'progress-and-activity',
}
const blockTargets = {
  settings: 'settings-form', 'ai-workspace': 'prompt-input', content: 'content-objects',
}

export function migrateCatalogRoute(url) {
  if (url.searchParams.get('mode') !== 'workbench') return null
  const family = url.searchParams.get('family')
  const section = url.searchParams.get('section')
  if (section === 'basics' && family) url.hash = `basics-${family}`
  else if (blockTargets[family]) {
    url.searchParams.set('section', 'ui-blocks')
    url.hash = `ds-${blockTargets[family]}`
  } else if (componentTargets[family]) {
    url.searchParams.set('section', 'components')
    url.hash = `components-${componentTargets[family]}`
  }
  for (const key of ['mode', 'family', 'example', 'view']) url.searchParams.delete(key)
  return `${url.pathname}${url.search}${url.hash}`
}
