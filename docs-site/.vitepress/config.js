import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid({
  base: '/docs/',
  title: 'Lingu Studio Docs',
  description: 'Техническая документация Lingu Studio MVP',
  cleanUrls: true,
  appearance: false,
  themeConfig: {
    nav: [],
    sidebar: [
      { text: 'Документация', items: [{ text: 'Обзор', link: '/' }, { text: 'Workflow', link: '/workflow' }, { text: 'Technical architecture', link: '/architecture' }, { text: 'Team process', link: '/team-process' }] },
    ],
    outline: { level: [2, 3] },
    socialLinks: [],
  },
  mermaid: { theme: 'base', themeVariables: { fontFamily: 'Inter, system-ui, sans-serif', primaryColor: '#eef1ff', primaryTextColor: '#1b2433', primaryBorderColor: '#3559d6', lineColor: '#8792a5', secondaryColor: '#fff7d8', tertiaryColor: '#f4faf7' } },
})
