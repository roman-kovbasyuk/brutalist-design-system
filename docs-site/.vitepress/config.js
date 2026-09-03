import { withMermaid } from 'vitepress-plugin-mermaid'
import taskLists from 'markdown-it-task-lists'

export default withMermaid({
  base: '/docs/',
  title: 'Lingu Studio Docs',
  description: 'Lingu Studio MVP team documentation',
  cleanUrls: true,
  appearance: false,
  markdown: {
    config: (md) => {
      md.use(taskLists, { enabled: true })
    },
  },
  themeConfig: {
    nav: [],
    sidebar: [
      { text: 'Documentation', items: [{ text: 'Overview', link: '/' }, { text: 'Workflow', link: '/workflow' }, { text: 'Technical architecture', link: '/architecture' }, { text: 'Team process', link: '/team-process' }, { text: 'MVP launch roadmap', link: '/roadmap' }] },
    ],
    outline: { level: [2, 2] },
    socialLinks: [],
  },
  mermaid: { theme: 'base', themeVariables: { fontFamily: 'Inter, system-ui, sans-serif', primaryColor: '#eef1ff', primaryTextColor: '#1b2433', primaryBorderColor: '#3559d6', lineColor: '#8792a5', secondaryColor: '#fff7d8', tertiaryColor: '#f4faf7' } },
})
