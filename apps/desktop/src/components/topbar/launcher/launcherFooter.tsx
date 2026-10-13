import { launcherColors } from "./launcherColors"

const SHORTCUT_LABELS: Record<NonNullable<LauncherAction["shortcut"]> | "actions", string> = {
  enter: "↵",
  "ctrl-enter": "Ctrl ↵",
  actions: "Ctrl K",
}

export function KeyChip({ shortcut, darkText }: { shortcut: keyof typeof SHORTCUT_LABELS; darkText: boolean }) {
  return (
    <kbd className={`shrink-0 rounded px-1.5 py-px font-sans text-[10px] leading-4 ${launcherColors(darkText).chip}`}>
      {SHORTCUT_LABELS[shortcut]}
    </kbd>
  )
}

interface LauncherFooterProps {
  primary: LauncherAction | null
  hasMoreActions: boolean
  actionsOpen: boolean
  darkText: boolean
}

export function LauncherFooter({ primary, hasMoreActions, actionsOpen, darkText }: LauncherFooterProps) {
  const colors = launcherColors(darkText)
  if (!primary) return null
  return (
    <>
      <div className={`h-px w-full ${colors.divider}`} />
      <div className={`flex items-center justify-end gap-3 px-4 h-9 text-[11px] ${colors.dim}`}>
        {!actionsOpen && (
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="truncate">{primary.label}</span>
            <KeyChip shortcut="enter" darkText={darkText} />
          </span>
        )}
        {hasMoreActions && (
          <span className="flex items-center gap-1.5 shrink-0">
            <span>Actions</span>
            <KeyChip shortcut="actions" darkText={darkText} />
          </span>
        )}
      </div>
    </>
  )
}
