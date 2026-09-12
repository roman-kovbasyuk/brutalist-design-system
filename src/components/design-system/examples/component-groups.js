export const componentGroups = [
  'Buttons', 'Table', 'Dropdowns', 'Feedback states',
  'Fields', 'Radiobuttons', 'Checklist', 'Toggles', 'Inline confirmation', 'Interaction laboratory',
  'Modals & tooltips',
  'Progress and activity',
  'Panel', 'Tags', 'Tabs and view controls', 'Text with inline editing', 'Value controls', 'Wayfinding', 'Workflow steps',
].sort((a, b) => a.localeCompare(b)).map(name => ({
  name, id: `components-${name.toLowerCase().replaceAll(' ', '-')}`,
  get href() { return `#${this.id}` },
}))
