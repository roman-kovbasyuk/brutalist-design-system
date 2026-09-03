import DefaultTheme from 'vitepress/theme'
import './custom.css'

const STORAGE_PREFIX = 'lingu-docs-checklist:'

function checklistKey(box, index) {
  const item = box.closest('li')
  const label = item?.textContent?.trim().replace(/\s+/g, ' ').slice(0, 160) || `item-${index}`
  return `${window.location.pathname}:${index}:${label}`
}

function setupChecklist() {
  const boxes = document.querySelectorAll('.task-list-item-checkbox')
  if (!boxes.length) return

  boxes.forEach((box, index) => {
    const key = STORAGE_PREFIX + checklistKey(box, index)
    box.checked = window.localStorage.getItem(key) === 'done'
    box.addEventListener('change', () => {
      if (box.checked) window.localStorage.setItem(key, 'done')
      else window.localStorage.removeItem(key)
    })
  })
}

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    if (typeof window === 'undefined') return

    const refresh = () => window.setTimeout(setupChecklist, 0)
    router.onAfterRouteChange = refresh
    window.addEventListener('load', refresh, { once: true })
    refresh()
  },
}
