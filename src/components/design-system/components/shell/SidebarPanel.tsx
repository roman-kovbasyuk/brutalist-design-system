import { ChevronDown, MoreHorizontal, Search, UserRound } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { AppButton } from '../actions/AppButton'
import { TextField } from '../forms/TextField'
import { Menu, type MenuItem } from '../overlays'
import './sidebar-panel.css'

export type SidebarBrand = { label: string; href?: string; icon?: ReactNode }
export type SidebarPrimaryAction = { label: string; icon?: ReactNode; onClick?: () => void }
export type SidebarNavigationItem = { id: string; label: string; href: string; icon?: ReactNode; current?: boolean; onClick?: () => void }
export type SidebarProject = { id: string; title: string; href?: string; pinned?: boolean; actions?: MenuItem[] }
export type SidebarSearch = { placeholder?: string; query?: string; onQueryChange?: (query: string) => void }
export type SidebarAccount = { label: string; icon?: ReactNode; actions?: MenuItem[]; onAction?: (id: string) => void }

export type SidebarHeaderProps = {
  brand: SidebarBrand
  searchOpen: boolean
  query: string
  placeholder: string
  onSearchOpen: () => void
  onSearchClose: () => void
  onQueryChange: (query: string) => void
}

export function SidebarHeader({ brand, searchOpen, query, placeholder, onSearchOpen, onSearchClose, onQueryChange }: SidebarHeaderProps) {
  const searchRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef(false)
  useEffect(() => {
    if (searchOpen) searchRef.current?.querySelector('input')?.focus({ preventScroll: true })
    else if (restoreFocus.current) {
      searchRef.current?.querySelector('button')?.focus({ preventScroll: true })
      restoreFocus.current = false
    }
  }, [searchOpen])
  return <header className="ds-sidebar-panel__header" data-search-open={searchOpen || undefined}>
    <a className="ds-sidebar-panel__brand" href={brand.href ?? '#'} hidden={searchOpen}><span>{brand.label}</span></a>
    <div ref={searchRef} className="ds-sidebar-panel__search-mode">
      {searchOpen ? <TextField className="ds-sidebar-panel__search-field" label={<span className="ds-sidebar-panel__search-label">{placeholder}</span>} placeholder={placeholder} type="search" value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onBlur={() => { if (!query.trim()) onSearchClose() }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            restoreFocus.current = true
            onSearchClose()
          }
        }} /> : <AppButton variant="icon" size="small" iconOnly aria-label="Search campaigns" aria-expanded={false} onClick={onSearchOpen}><Search size={18} aria-hidden="true" /></AppButton>}
    </div>
  </header>
}

export type SidebarNavigationProps = { items: readonly SidebarNavigationItem[] }
export function SidebarNavigation({ items }: SidebarNavigationProps) {
  return <nav className="ds-sidebar-panel__navigation" aria-label="Workspace navigation">
    {items.map((item) => <a key={item.id} href={item.href} aria-current={item.current ? 'page' : undefined} onClick={item.onClick}>{item.icon && <span className="ds-sidebar-panel__item-icon" aria-hidden="true">{item.icon}</span>}<span>{item.label}</span></a>)}
  </nav>
}

export type SidebarContextMenuProps = { project: SidebarProject; onSelect?: (id: string) => void }
export function SidebarContextMenu({ project, onSelect }: SidebarContextMenuProps) {
  const [open, setOpen] = useState(false)
  if (!project.actions?.length) return null
  return <Menu open={open} onOpenChange={setOpen} className="ds-menu--sidebar-panel" ariaLabel={`${project.title} actions`} trigger={<AppButton className="ds-sidebar-panel__project-actions" variant="icon" size="small" iconOnly aria-label={`Actions for ${project.title}`}><MoreHorizontal size={18} aria-hidden="true" /></AppButton>} items={project.actions} onSelect={(id) => { onSelect?.(id); setOpen(false) }} />
}

export type SidebarProjectRowProps = { project: SidebarProject; onAction?: (id: string) => void }
export function SidebarProjectRow({ project, onAction }: SidebarProjectRowProps) {
  return <li className="ds-sidebar-panel__project-row" data-pinned={project.pinned || undefined}>
    <div className="ds-sidebar-panel__project-title">{project.href ? <a href={project.href} title={project.title}>{project.title}</a> : <span title={project.title}>{project.title}</span>}</div>
    <SidebarContextMenu project={project} onSelect={onAction} />
  </li>
}

export type SidebarProjectsProps = { projects: readonly SidebarProject[]; onAction?: (projectId: string, actionId: string) => void; emptyMessage?: string }
export function SidebarProjects({ projects, onAction, emptyMessage = 'No recent projects.' }: SidebarProjectsProps) {
  const headingId = useId()
  const pinnedProjects = projects.filter((project) => project.pinned)
  const recentProjects = projects.filter((project) => !project.pinned)
  const renderProjects = (items: readonly SidebarProject[]) => <ul>{items.map((project) => <SidebarProjectRow key={project.id} project={project} onAction={(actionId) => onAction?.(project.id, actionId)} />)}</ul>
  return <section className="ds-sidebar-panel__projects" aria-labelledby={headingId}>
    {pinnedProjects.length > 0 && <div className="ds-sidebar-panel__project-group"><h6>Pinned</h6>{renderProjects(pinnedProjects)}</div>}
    <div className="ds-sidebar-panel__project-group"><h6 id={headingId}>Recent projects</h6>{recentProjects.length ? renderProjects(recentProjects) : !pinnedProjects.length && <p className="ds-sidebar-panel__empty">{emptyMessage}</p>}</div>
  </section>
}

export type SidebarAccountMenuProps = { account: SidebarAccount }
export function SidebarAccountMenu({ account }: SidebarAccountMenuProps) {
  const [open, setOpen] = useState(false)
  if (!account.actions?.length) return <span className="ds-sidebar-panel__account-label">{account.icon && <span aria-hidden="true">{account.icon}</span>}{account.label}</span>
  return <Menu open={open} onOpenChange={setOpen} side="top" className="ds-menu--sidebar-panel" ariaLabel={`${account.label} account actions`} trigger={<AppButton variant="quiet" size="default" className="ds-sidebar-panel__account-trigger" aria-label={account.label}><span className="ds-sidebar-panel__account-avatar" aria-hidden="true">{account.icon ?? <UserRound size={18} />}</span><span className="ds-sidebar-panel__account-name" title={account.label}>{account.label}</span><ChevronDown className="ds-sidebar-panel__account-chevron" size={16} aria-hidden="true" /></AppButton>} items={account.actions} onSelect={(id) => { account.onAction?.(id); setOpen(false) }} />
}

export type SidebarPanelProps = {
  brand: SidebarBrand
  primaryAction: SidebarPrimaryAction
  navigation: readonly SidebarNavigationItem[]
  projects: readonly SidebarProject[]
  search?: SidebarSearch
  account?: SidebarAccount
  onProjectAction?: (projectId: string, actionId: string) => void
  className?: string
}

export function SidebarPanel({ brand, primaryAction, navigation, projects, search, account, onProjectAction, className = '' }: SidebarPanelProps) {
  const [searchOpen, setSearchOpen] = useState(false)
  const [internalQuery, setInternalQuery] = useState('')
  const query = search?.query ?? internalQuery
  const filteredProjects = useMemo(() => {
    const term = query.trim().toLowerCase()
    return term ? projects.filter((project) => project.title.toLowerCase().includes(term)) : projects
  }, [projects, query])
  function updateQuery(value: string) { setInternalQuery(value); search?.onQueryChange?.(value) }
  function closeSearch() { updateQuery(''); setSearchOpen(false) }
  return <aside className={`ds-sidebar-panel ${className}`.trim()} aria-label="Sidebar">
    <SidebarHeader brand={brand} searchOpen={searchOpen} query={query} placeholder={search?.placeholder ?? 'Search projects'} onSearchOpen={() => setSearchOpen(true)} onSearchClose={closeSearch} onQueryChange={updateQuery} />
    {!searchOpen && <AppButton className="ds-sidebar-panel__primary" variant="primary" onClick={primaryAction.onClick}>{primaryAction.icon && <span aria-hidden="true">{primaryAction.icon}</span>}{primaryAction.label}</AppButton>}
    <div className="ds-sidebar-panel__body" data-search-open={searchOpen || undefined}>
      {!searchOpen && <SidebarNavigation items={navigation} />}
      <SidebarProjects projects={searchOpen ? filteredProjects : projects} onAction={onProjectAction} emptyMessage={query ? 'No matching projects.' : undefined} />
    </div>
    {account && <footer className="ds-sidebar-panel__footer"><SidebarAccountMenu account={account} /></footer>}
  </aside>
}
