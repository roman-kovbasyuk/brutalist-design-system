export type SegmentedOption = { value: string; label: string; disabled?: boolean }
export type SegmentedControlProps = {
  options: SegmentedOption[]
  value: string
  onValueChange: (value: string) => void
  ariaLabel: string
  className?: string
}

/** A compact native-radio choice for mutually exclusive visual modes. */
export function SegmentedControl({ options, value, onValueChange, ariaLabel, className = '' }: SegmentedControlProps) {
  return <div className={`ds-segmented-control ${className}`.trim()} role="radiogroup" aria-label={ariaLabel}>
    {options.map((option) => <label className="ds-segmented-control__option" key={option.value} data-selected={option.value === value || undefined}>
      <input type="radio" name={ariaLabel} value={option.value} checked={option.value === value} disabled={option.disabled} onChange={() => onValueChange(option.value)} />
      <span>{option.label}</span>
    </label>)}
  </div>
}
