import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export type Column<T> = {
  id: string
  header: string
  cell: (row: T) => ReactNode
  sortable?: boolean
  className?: string
}

export type Sort = { columnId: string; direction: 'asc' | 'desc' }

export type TableProps<T> = {
  label: string
  rows: readonly T[]
  columns: readonly Column<T>[]
  getRowId: (row: T) => string
  sort?: Sort
  onSortChange?: (sort: Sort) => void
  selectedIds?: readonly string[]
  onSelectionChange?: (ids: string[]) => void
  emptyMessage?: ReactNode
  className?: string
}

function SelectAllCheckbox({ checked, indeterminate, disabled, onChange }: {
  checked: boolean
  indeterminate: boolean
  disabled: boolean
  onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate }, [indeterminate])
  return <input ref={ref} type="checkbox" aria-label="Select all rows" checked={checked} disabled={disabled} onChange={onChange} />
}

/** A semantic, caller-controlled table for ordinary bounded result sets. */
export function Table<T>({
  label,
  rows,
  columns,
  getRowId,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  emptyMessage = 'No rows to display.',
  className = '',
}: TableProps<T>) {
  const selectable = selectedIds !== undefined && onSelectionChange !== undefined
  const rowIds = rows.map(getRowId)
  const selectedSet = new Set(selectedIds)
  const selectedVisibleCount = rowIds.filter((id) => selectedSet.has(id)).length
  const allVisibleSelected = rowIds.length > 0 && selectedVisibleCount === rowIds.length
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected

  function requestSort(columnId: string) {
    const direction: Sort['direction'] = sort?.columnId === columnId && sort.direction === 'asc' ? 'desc' : 'asc'
    onSortChange?.({ columnId, direction })
  }

  function changeVisibleSelection() {
    if (!onSelectionChange) return
    const visible = new Set(rowIds)
    if (allVisibleSelected) {
      onSelectionChange((selectedIds ?? []).filter((id) => !visible.has(id)))
      return
    }
    onSelectionChange([...new Set([...(selectedIds ?? []), ...rowIds])])
  }

  function changeRowSelection(id: string) {
    if (!onSelectionChange) return
    onSelectionChange(selectedSet.has(id) ? (selectedIds ?? []).filter((item) => item !== id) : [...(selectedIds ?? []), id])
  }

  return <div className={`ds-table-scroll ${className}`.trim()}>
    <table className="ds-table" aria-label={label}>
      <caption>{label}</caption>
      <thead>
        <tr>
          {selectable && <th scope="col" className="ds-table__selection"><SelectAllCheckbox checked={allVisibleSelected} indeterminate={partiallySelected} disabled={rowIds.length === 0} onChange={changeVisibleSelection} /></th>}
          {columns.map((column) => {
            const isSorted = sort?.columnId === column.id
            const ariaSort = isSorted ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : (column.sortable ? 'none' : undefined)
            return <th key={column.id} scope="col" className={column.className} aria-sort={ariaSort}>
              {column.sortable ? <button type="button" className="ds-table__sort" onClick={() => requestSort(column.id)} aria-label={`Sort by ${column.header}`}>{column.header}</button> : column.header}
            </th>
          })}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <tr><td colSpan={columns.length + (selectable ? 1 : 0)} className="ds-table__empty">{emptyMessage}</td></tr> : rows.map((row) => {
          const id = getRowId(row)
          return <tr key={id} data-row-id={id}>
            {selectable && <td className="ds-table__selection"><input type="checkbox" aria-label={`Select row ${id}`} checked={selectedSet.has(id)} onChange={() => changeRowSelection(id)} /></td>}
            {columns.map((column) => <td key={column.id} className={column.className}>{column.cell(row)}</td>)}
          </tr>
        })}
      </tbody>
    </table>
  </div>
}
