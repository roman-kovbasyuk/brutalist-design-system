import assert from 'node:assert/strict'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Tabs, TabPanel } from 'brutalist-design-system'

// Exercise the installed tarball's runtime, not source aliases or type declarations alone.
const html = renderToStaticMarkup(createElement(Fragment, null,
  createElement(Tabs, { idPrefix: 'consumer', ariaLabel: 'Details', value: 'usage', onValueChange() {}, items: [
    { value: 'usage', label: 'How to use' },
    { value: 'locked', label: 'Unavailable', disabled: true },
  ] }),
  createElement(TabPanel, { idPrefix: 'consumer', value: 'usage', activeValue: 'usage' }, 'Instructions'),
))
assert.match(html, /id="consumer-usage-tab"/)
assert.match(html, /aria-controls="consumer-usage-panel"/)
assert.match(html, /id="consumer-usage-panel"/)
assert.match(html, /aria-labelledby="consumer-usage-tab"/)
assert.doesNotMatch(html, /consumer-how-to-use/)
assert.match(html, /<button[^>]*id="consumer-locked-tab"[^>]*disabled=""/)
console.log('Installed package tab relationships and disabled state verified.')
