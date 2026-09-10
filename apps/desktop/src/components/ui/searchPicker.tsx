import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { scoreField } from '../../lib/launcherSearch'
import SearchField from './searchField'

const DETAIL_PENALTY = 6

function rankOptions(query: string, options: SearchPickerOption[]): SearchPickerOption[] {
  const trimmed = query.trim()
  if (trimmed.length === 0) return options
  const scored: { option: SearchPickerOption; score: number }[] = []
  for (const option of options) {
    const detail = option.detail ? scoreField(trimmed, option.detail, DETAIL_PENALTY) : -1
    const score = Math.max(scoreField(trimmed, option.label), detail)
    if (score >= 0) scored.push({ option, score })
  }
  return scored.sort((a, b) => b.score - a.score).map((entry) => entry.option)
}

export default function SearchPicker({
  options,
  onSelect,
  onDismiss,
  label,
  placeholder,
  emptyMessage = 'Nothing matches that.',
}: SearchPickerProps) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const rowBase = useId()
  const rowId = (index: number) => `${rowBase}-${index}`

  const matches = useMemo(() => rankOptions(query, options), [query, options])
  const selected = matches.length === 0 ? -1 : Math.min(activeIndex, matches.length - 1)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected, matches])

  function choose(option: SearchPickerOption) {
    if (option.disabled) return
    onSelect(option.value)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onDismiss()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((selected + step + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const match = matches[selected]
      if (match) choose(match)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <SearchField
        ref={inputRef}
        value={query}
        onChange={(next) => {
          setQuery(next)
          setActiveIndex(0)
        }}
        onKeyDown={onKeyDown}
        label={label}
        placeholder={placeholder}
        controls={listId}
        activeDescendant={selected >= 0 ? rowId(selected) : undefined}
      />
      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={label}
        className="max-h-64 overflow-auto rounded-field border border-line-hairline bg-surface-1"
      >
        {matches.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-ink-quiet">{emptyMessage}</p>
        ) : (
          matches.map((option, index) => (
            <button
              key={option.value}
              id={rowId(index)}
              type="button"
              role="option"
              aria-selected={index === selected}
              disabled={option.disabled}
              data-active={index === selected}
              onPointerMove={() => setActiveIndex(index)}
              onClick={() => choose(option)}
              className={`flex w-full min-w-0 cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                index === selected ? 'bg-fill-ghost' : ''
              }`}
            >
              <span className="truncate text-dense text-ink-primary">{option.label}</span>
              {option.detail && <span className="shrink-0 text-xs text-ink-quiet">{option.detail}</span>}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
