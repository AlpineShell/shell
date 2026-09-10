import { type ReactNode } from 'react'
import { ArrowUpRight, ChevronRight, SearchX } from 'lucide-react'
import { useSettingsValue } from '../../hooks/useSettingsValue'
import EmptyState from '../ui/emptyState'
import PageTitle from '../ui/pageTitle'
import Toggle from '../ui/toggle'

const IGNORE_CHANGE = () => {}

export default function SettingsSearchResults({
  query,
  matches,
  total,
  selected,
  listId,
  rowId,
  onPoint,
  onActivate,
}: SettingsSearchResultsProps) {
  const hidden = total - matches.length

  return (
    <div
      className="flex w-full flex-col gap-stack"
      onMouseDown={(event) => event.preventDefault()}
    >
      <PageTitle title="Search" subtitle={resultSummary(total, query)} />

      {matches.length === 0 ? (
        <EmptyState
          icon={<SearchX size={20} />}
          title={`Nothing matches “${query.trim()}”`}
          detail="Try a word from the setting's name, or what it does."
        />
      ) : (
        <div id={listId} role="listbox" aria-label="Settings search results" className="flex flex-col gap-0.5">
          {matches.map((match, index) => (
            <ResultRow
              key={match.target.id}
              id={rowId(index)}
              target={match.target}
              active={index === selected}
              onPoint={() => onPoint(index)}
              onActivate={() => onActivate(match.target)}
            />
          ))}
        </div>
      )}

      {hidden > 0 && (
        <p className="text-center text-xs text-ink-quiet">
          {hidden} weaker {hidden === 1 ? 'match is' : 'matches are'} hidden. Keep typing to narrow it down.
        </p>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {resultSummary(total, query)}
      </p>
    </div>
  )
}

function resultSummary(count: number, query: string): string {
  return `${count} ${count === 1 ? 'result' : 'results'} for “${query.trim()}”`
}

interface ResultRowProps {
  id: string
  target: SettingsSearchTarget
  active: boolean
  onPoint: () => void
  onActivate: () => void
}

function ResultRow(props: ResultRowProps) {
  const action = props.target.action
  if (action.kind === 'toggle') return <ToggleResultRow {...props} entry={action.entry} />
  return (
    <ResultShell
      {...props}
      trailing={action.kind === 'launcher' ? <ArrowUpRight size={14} /> : <ChevronRight size={14} />}
    />
  )
}

function ToggleResultRow({ entry, ...shell }: ResultRowProps & { entry: SettingsValueEntry }) {
  const { value } = useSettingsValue(entry)
  const checked = value === true
  return (
    <ResultShell
      {...shell}
      state={checked ? 'on' : 'off'}
      trailing={
        <span aria-hidden className="pointer-events-none">
          <Toggle checked={checked} onChange={IGNORE_CHANGE} label={shell.target.label} disabled />
        </span>
      }
    />
  )
}

function ResultShell({
  id,
  target,
  active,
  state,
  trailing,
  onPoint,
  onActivate,
}: ResultRowProps & { state?: string; trailing: ReactNode }) {
  const Icon = target.icon
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      aria-label={state ? `${target.label}, ${target.context}, ${state}` : `${target.label}, ${target.context}`}
      data-active={active}
      onMouseMove={onPoint}
      onClick={onActivate}
      className={`flex cursor-pointer items-center gap-3 rounded-field px-3 py-2.5 transition-colors ${
        active ? 'bg-surface-3' : 'hover:bg-fill-ghost'
      }`}
    >
      <Icon size={16} className="shrink-0 text-ink-quiet" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink-primary">{target.label}</div>
        <div className="truncate text-xs text-ink-quiet">{target.description}</div>
      </div>
      <span className="max-w-32 shrink-0 truncate text-eyebrow uppercase text-ink-faint">{target.context}</span>
      <span className="flex w-9 shrink-0 items-center justify-end text-ink-faint">{trailing}</span>
    </div>
  )
}
