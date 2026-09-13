import assert from 'node:assert/strict'
import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Tabs, TabPanel, SidebarPanel, Form, FormActions } from 'brutalist-design-system'
import { readFileSync } from 'node:fs'

// Exercise the installed tarball's runtime, not source aliases or type declarations alone.
const html = renderToStaticMarkup(createElement(Fragment, null,
  createElement(SidebarPanel, { brand: { label: 'Studio' }, primaryAction: { label: 'Create campaign' }, navigation: [], projects: [] }),
  createElement(Form, { 'aria-label': 'Settings' }, createElement(FormActions, null, 'Save')),
  createElement(Tabs, { idPrefix: 'consumer', ariaLabel: 'Details', value: 'usage', onValueChange() {}, items: [
    { value: 'usage', label: 'How to use' },
    { value: 'locked', label: 'Unavailable', disabled: true },
  ] }),
  createElement(TabPanel, { idPrefix: 'consumer', value: 'usage', activeValue: 'usage' }, 'Instructions'),
))
assert.match(html, /id="consumer-usage-tab"/)
assert.match(html, /<aside class="ds-sidebar-panel"/)
assert.match(html, /<form[^>]*class="ds-form"/)
assert.match(html, /<footer class="ds-form-actions"/)
const css = readFileSync(new URL('./node_modules/brutalist-design-system/styles.css', import.meta.url), 'utf8')
assert.match(css, /\.ds-sidebar-panel\s*\{/)
assert.match(css, /\.ds-form-actions\s*\{/)
assert.match(html, /aria-controls="consumer-usage-panel"/)
assert.match(html, /id="consumer-usage-panel"/)
assert.match(html, /aria-labelledby="consumer-usage-tab"/)
assert.doesNotMatch(html, /consumer-how-to-use/)
assert.match(html, /<button[^>]*id="consumer-locked-tab"[^>]*disabled=""/)
console.log('Installed package tab relationships and disabled state verified.')
