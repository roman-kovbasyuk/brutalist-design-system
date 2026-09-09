export type PaginationProps = { page: number; pageCount: number; onPageChange: (page: number) => void; className?: string }

/** Small-page navigator for bounded result sets. */
export function Pagination({ page, pageCount, onPageChange, className = '' }: PaginationProps) {
  const currentPage = Math.min(Math.max(page, 1), Math.max(pageCount, 1))
  const pages = Array.from({ length: Math.max(pageCount, 0) }, (_, index) => index + 1)
  return <nav className={`ds-pagination ${className}`.trim()} aria-label="Pagination">
    <button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>Previous</button>
    <ol>{pages.map((number) => <li key={number}><button type="button" aria-label={`Page ${number}`} aria-current={number === currentPage ? 'page' : undefined} onClick={() => onPageChange(number)}>{number}</button></li>)}</ol>
    <button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => onPageChange(currentPage + 1)}>Next</button>
  </nav>
}
