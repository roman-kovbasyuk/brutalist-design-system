import { SelectMenu } from '../molecules/SelectMenu.jsx'
import { useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Eye,
  EyeOff,
  Minus,
  Plus,
  Search,
  Star,
} from 'lucide-react'
import { SpecimenCard } from './SpecimenCard.jsx'

const markets = ['Bergen', 'Copenhagen', 'Oslo', 'Stockholm', 'Zurich']
const campaignStatuses = ['Draft', 'In review', 'Ready', 'Published']
const channels = ['Paid social', 'Email', 'Display', 'Organic social']

function Field({ label, htmlFor, help, children, className = '' }) {
  return (
    <div className={`v2-field ${className}`.trim()}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {help && <p className="v2-field__help">{help}</p>}
    </div>
  )
}

export function AdvancedControlSpecimens() {
  const [isTokenVisible, setIsTokenVisible] = useState(false)
  const [marketQuery, setMarketQuery] = useState('')
  const [isMarketOpen, setIsMarketOpen] = useState(false)
  const [activeMarketIndex, setActiveMarketIndex] = useState(-1)
  const [campaignStatus, setCampaignStatus] = useState('Draft')
  const [selectedChannels, setSelectedChannels] = useState(['Paid social'])
  const [isChannelOpen, setIsChannelOpen] = useState(false)
  const [campaignColor, setCampaignColor] = useState('#79d9ff')
  const [campaignColorText, setCampaignColorText] = useState('#79D9FF')
  const [variationCount, setVariationCount] = useState(3)
  const [rating, setRating] = useState(3)
  const [intensity, setIntensity] = useState(60)
  const [rangeStart, setRangeStart] = useState(25)
  const [rangeEnd, setRangeEnd] = useState(55)
  const channelTriggerRef = useRef(null)

  const filteredMarkets = markets.filter((market) =>
    market.toLowerCase().includes(marketQuery.trim().toLowerCase()),
  )
  const activeMarket = filteredMarkets[activeMarketIndex]

  function chooseMarket(market) {
    setMarketQuery(market)
    setIsMarketOpen(false)
    setActiveMarketIndex(-1)
  }

  function handleMarketKeyDown(event) {
    if (event.key === 'Escape') {
      setIsMarketOpen(false)
      setActiveMarketIndex(-1)
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setIsMarketOpen(true)
      if (!filteredMarkets.length) return
      const direction = event.key === 'ArrowDown' ? 1 : -1
      setActiveMarketIndex((current) => {
        if (current < 0) return direction > 0 ? 0 : filteredMarkets.length - 1
        return (current + direction + filteredMarkets.length) % filteredMarkets.length
      })
      return
    }

    if (event.key === 'Enter' && isMarketOpen && activeMarket) {
      event.preventDefault()
      chooseMarket(activeMarket)
    }
  }

  function toggleChannel(channel) {
    setSelectedChannels((current) =>
      current.includes(channel)
        ? current.filter((item) => item !== channel)
        : [...current, channel],
    )
  }

  return (
    <>
      <SpecimenCard
        title="Input anatomy"
        description="Purpose-built inputs keep labels persistent and actions inside the control boundary."
      >
        <div className="v2-control-catalog-grid">
          <Field label="Search campaigns" htmlFor="v2-campaign-search">
            <div className="v2-input-shell">
              <Search aria-hidden="true" size={18} />
              <input
                id="v2-campaign-search"
                type="search"
                placeholder="Search by name or owner"
              />
              <kbd>⌘ K</kbd>
            </div>
          </Field>

          <Field
            label="API token"
            htmlFor="v2-api-token"
            help="Visibility controls never change the saved value."
          >
            <div className="v2-input-shell">
              <input
                id="v2-api-token"
                type={isTokenVisible ? 'text' : 'password'}
                defaultValue="studio-demo-token"
              />
              <button
                className="v2-inline-action v2-interactive-control"
                type="button"
                aria-label={isTokenVisible ? 'Hide API token' : 'Show API token'}
                onClick={() => setIsTokenVisible((current) => !current)}
              >
                {isTokenVisible ? <EyeOff aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
              </button>
            </div>
          </Field>

          <Field label="Daily budget" htmlFor="v2-daily-budget">
            <div className="v2-input-shell">
              <span aria-hidden="true">$</span>
              <input id="v2-daily-budget" type="number" min="0" defaultValue="240" />
              <span className="v2-input-suffix">USD</span>
            </div>
          </Field>

          <Field label="Publish time" htmlFor="v2-publish-time">
            <input id="v2-publish-time" type="time" defaultValue="09:30" />
          </Field>

          <Field label="Campaign color" htmlFor="v2-campaign-color">
            <div className="v2-color-input">
              <input
                id="v2-campaign-color"
                type="color"
                value={campaignColor}
                onChange={(event) => {
                  setCampaignColor(event.target.value)
                  setCampaignColorText(event.target.value.toUpperCase())
                }}
              />
              <input
                className="v2-color-input__hex"
                aria-label="Campaign color hex"
                inputMode="text"
                pattern="#[0-9a-fA-F]{6}"
                value={campaignColorText}
                onChange={(event) => {
                  const next = event.target.value.trim()
                  setCampaignColorText(next.toUpperCase())
                  if (/^#[0-9a-fA-F]{6}$/.test(next)) setCampaignColor(next.toLowerCase())
                }}
              />
            </div>
          </Field>

          <Field label="Read-only identifier" htmlFor="v2-campaign-id">
            <input id="v2-campaign-id" value="cmp_oslo_2409" readOnly />
          </Field>
        </div>
      </SpecimenCard>

      <SpecimenCard
        title="Pickers and selection"
        description="Native date inputs and keyboard-operable popovers cover simple and filtered choices."
      >
        <div className="v2-control-catalog-grid">
          <div className="v2-date-range">
            <Field label="Campaign start" htmlFor="v2-campaign-start">
              <input id="v2-campaign-start" type="date" defaultValue="2026-09-14" />
            </Field>
            <span aria-hidden="true">→</span>
            <Field label="Campaign end" htmlFor="v2-campaign-end">
              <input
                id="v2-campaign-end"
                type="date"
                min="2026-09-14"
                defaultValue="2026-09-21"
              />
            </Field>
          </div>

          <Field
            label="Find a market"
            htmlFor="v2-market"
            help="Type to filter; use arrows and Enter to select."
          >
            <div className="v2-combobox">
              <div className="v2-input-shell">
                <Search aria-hidden="true" size={18} />
                <input
                  id="v2-market"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls="v2-market-suggestions"
                  aria-expanded={isMarketOpen}
                  aria-activedescendant={activeMarket ? `v2-market-${activeMarketIndex}` : undefined}
                  autoComplete="off"
                  value={marketQuery}
                  placeholder="Start typing a city"
                  onChange={(event) => {
                    setMarketQuery(event.target.value)
                    setIsMarketOpen(true)
                    setActiveMarketIndex(-1)
                  }}
                  onFocus={() => {
                    if (marketQuery) setIsMarketOpen(true)
                  }}
                  onKeyDown={handleMarketKeyDown}
                />
              </div>
              {isMarketOpen && (
                <div
                  className="v2-floating-listbox"
                  id="v2-market-suggestions"
                  role="listbox"
                  aria-label="Market suggestions"
                >
                  {filteredMarkets.length ? (
                    filteredMarkets.map((market, index) => (
                      <button
                        className="v2-listbox-option v2-interactive-control"
                        id={`v2-market-${index}`}
                        key={market}
                        type="button"
                        role="option"
                        aria-selected={index === activeMarketIndex}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => chooseMarket(market)}
                      >
                        {market}
                        {marketQuery === market && <Check aria-hidden="true" size={18} />}
                      </button>
                    ))
                  ) : (
                    <p className="v2-listbox-empty">No markets match “{marketQuery}”.</p>
                  )}
                </div>
              )}
            </div>
          </Field>

          <Field label="Campaign status" htmlFor="v2-campaign-status-trigger">
            <SelectMenu label="Campaign status options" triggerLabel="Open campaign status options"
              triggerId="v2-campaign-status-trigger" value={campaignStatus} options={campaignStatuses} onChange={setCampaignStatus} />
          </Field>

          <div className="v2-field">
            <span className="v2-control-label">Channels</span>
            <div className="v2-menu-select">
              <button
                className="v2-select-trigger v2-interactive-control"
                ref={channelTriggerRef}
                type="button"
                aria-haspopup="listbox"
                aria-expanded={isChannelOpen}
                aria-controls="v2-channel-options"
                aria-label="Open channel options"
                onClick={() => setIsChannelOpen((current) => !current)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setIsChannelOpen(false)
                    channelTriggerRef.current?.focus()
                  }
                }}
              >
                <span>{selectedChannels.length} selected</span>
                <ChevronDown aria-hidden="true" size={18} />
              </button>
              {isChannelOpen && (
                <div
                  className="v2-floating-listbox"
                  id="v2-channel-options"
                  role="listbox"
                  aria-label="Channel options"
                  aria-multiselectable="true"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setIsChannelOpen(false)
                      channelTriggerRef.current?.focus()
                    }
                  }}
                >
                  {channels.map((channel) => (
                    <button
                      className="v2-listbox-option v2-interactive-control"
                      key={channel}
                      type="button"
                      role="option"
                      aria-selected={selectedChannels.includes(channel)}
                      onClick={() => toggleChannel(channel)}
                    >
                      {channel}
                      {selectedChannels.includes(channel) && <Check aria-hidden="true" size={18} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="v2-selection-chips" aria-label="Selected channels">
              {selectedChannels.map((channel) => (
                <button
                  className="v2-selection-chip v2-interactive-control"
                  key={channel}
                  type="button"
                  aria-label={`Remove ${channel}`}
                  onClick={() => toggleChannel(channel)}
                >
                  {channel}
                  <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SpecimenCard>

      <SpecimenCard
        title="Value controls"
        description="Fine and coarse controls expose their value before, during, and after adjustment."
      >
        <div className="v2-value-control-grid">
          <div className="v2-control-block">
            <div className="v2-control-block__heading">
              <label htmlFor="v2-variation-count">Variation count</label>
              <small>1–12</small>
            </div>
            <div className="v2-stepper">
              <button
                className="v2-interactive-control"
                type="button"
                aria-label="Decrease variation count"
                disabled={variationCount <= 1}
                onClick={() => setVariationCount((current) => Math.max(1, current - 1))}
              >
                <Minus aria-hidden="true" size={18} />
              </button>
              <input
                id="v2-variation-count"
                type="number"
                min="1"
                max="12"
                aria-label="Variation count"
                value={variationCount}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setVariationCount(Math.min(12, Math.max(1, next || 1)))
                }}
              />
              <button
                className="v2-interactive-control"
                type="button"
                aria-label="Increase variation count"
                disabled={variationCount >= 12}
                onClick={() => setVariationCount((current) => Math.min(12, current + 1))}
              >
                <Plus aria-hidden="true" size={18} />
              </button>
            </div>
          </div>

          <fieldset className="v2-control-block v2-rating">
            <legend>Creative quality</legend>
            <div role="radiogroup" aria-label="Creative quality rating">
              {[1, 2, 3, 4, 5].map((value) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="v2-rating"
                    value={value}
                    aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
                    checked={rating === value}
                    onChange={() => setRating(value)}
                  />
                  <Star aria-hidden="true" size={24} fill={value <= rating ? 'currentColor' : 'none'} />
                </label>
              ))}
            </div>
            <output>{rating} of 5</output>
          </fieldset>

          <div className="v2-control-block v2-slider-control">
            <div className="v2-control-block__heading">
              <label htmlFor="v2-intensity">Campaign intensity</label>
              <output htmlFor="v2-intensity">{intensity}%</output>
            </div>
            <input
              id="v2-intensity"
              type="range"
              min="0"
              max="100"
              value={intensity}
              style={{ '--v2-range-progress': `${rangePercent(intensity, 0, 100)}%` }}
              onChange={(event) => setIntensity(Number(event.target.value))}
            />
            <div className="v2-slider-scale"><span>Quiet</span><span>Bold</span></div>
          </div>

          <fieldset className="v2-control-block v2-range-control">
            <legend>Audience age range</legend>
            <label htmlFor="v2-age-min">
              <span>Minimum</span>
              <output htmlFor="v2-age-min">{rangeStart}</output>
            </label>
            <input
              id="v2-age-min"
              aria-label="Minimum audience age"
              type="range"
              min="18"
              max="64"
              value={rangeStart}
              style={{ '--v2-range-progress': `${rangePercent(rangeStart, 18, 64)}%` }}
              onChange={(event) => setRangeStart(Math.min(Number(event.target.value), rangeEnd - 1))}
            />
            <label htmlFor="v2-age-max">
              <span>Maximum</span>
              <output htmlFor="v2-age-max">{rangeEnd}</output>
            </label>
            <input
              id="v2-age-max"
              aria-label="Maximum audience age"
              type="range"
              min="19"
              max="65"
              value={rangeEnd}
              style={{ '--v2-range-progress': `${rangePercent(rangeEnd, 19, 65)}%` }}
              onChange={(event) => setRangeEnd(Math.max(Number(event.target.value), rangeStart + 1))}
            />
          </fieldset>
        </div>
      </SpecimenCard>

      <SpecimenCard
        title="Progress and activity"
        description="Use determinate progress for known work and indeterminate motion only when duration is unknown."
      >
        <div className="v2-progress-catalog">
          <div className="v2-progress-example">
            <div className="v2-progress-example__heading">
              <strong>Generating assets</strong>
              <span>68%</span>
            </div>
            <div
              className="v2-progress-bar"
              role="progressbar"
              aria-label="Asset generation"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="68"
            >
              <span style={{ width: '68%' }} />
            </div>
          </div>

          <div className="v2-progress-example">
            <div className="v2-progress-example__heading">
              <strong>Preparing export</strong>
              <span>Working…</span>
            </div>
            <div
              className="v2-progress-bar v2-progress-bar--indeterminate"
              role="progressbar"
              aria-label="Preparing export"
            >
              <span />
            </div>
          </div>

          <div className="v2-progress-example">
            <div className="v2-progress-example__heading">
              <strong>Campaign setup</strong>
              <span>Step 3 of 5</span>
            </div>
            <ol className="v2-stepped-progress" aria-label="Campaign setup progress">
              {[1, 2, 3, 4, 5].map((step) => (
                <li
                  className={step < 3 ? 'is-complete' : step === 3 ? 'is-current' : ''}
                  key={step}
                  aria-current={step === 3 ? 'step' : undefined}
                >
                  <span>{step < 3 ? <Check aria-hidden="true" size={14} /> : step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="v2-progress-example v2-progress-example--compact">
            <div
              className="v2-progress-ring"
              role="progressbar"
              aria-label="Review readiness"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="82"
              style={{ '--v2-progress-value': '82%' }}
            >
              <span>82</span>
            </div>
            <p><strong>Review readiness</strong><small>4 checks remain</small></p>
          </div>
        </div>
      </SpecimenCard>
    </>
  )
}

function rangePercent(value, min, max) {
  return ((value - min) / (max - min)) * 100
}
