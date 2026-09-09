export const componentGroups = [
  'Buttons', 'Table', 'Content objects', 'Disclosure', 'Dropdowns', 'Feedback states',
  'Fields', 'Inline confirmation', 'Interaction laboratory',
  'Menu and supporting information', 'Modal confirmation',
  'Progress and activity', 'Sidebar row', 'Status language',
  'Tabs and view controls', 'Value controls', 'Wayfinding', 'Workflow steps',
].sort((a, b) => a.localeCompare(b)).map(name => ({
  name, id: `components-${name.toLowerCase().replaceAll(' ', '-')}`,
  get href() { return `#${this.id}` },
}))
