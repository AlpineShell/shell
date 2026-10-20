export default function KeyCaps({ keys }: { keys: string[] }) {
  return (
    <span className="flex items-center gap-1" aria-label={keys.join(' + ')}>
      {keys.map((key) => (
        <kbd
          key={key}
          aria-hidden
          className="inline-grid h-[22px] min-w-[22px] place-items-center rounded-[5px] bg-fill-ghost px-1.5 font-mono text-[11px] text-ink-secondary shadow-[inset_0_-1px_0_var(--alpine-line-strong)] ring-1 ring-line-hairline"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}
