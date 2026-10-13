import { launcherColors } from "./launcherColors"
import { KeyChip } from "./launcherFooter"

interface ActionsMenuProps {
  actions: LauncherAction[]
  selectedIndex: number
  darkText: boolean
  onHover: (index: number) => void
  onRun: (action: LauncherAction) => void
}

export function ActionsMenu({ actions, selectedIndex, darkText, onHover, onRun }: ActionsMenuProps) {
  const colors = launcherColors(darkText)
  return (
    <div role="menu" className="flex flex-col p-1.5 gap-0.5">
      {actions.map((action, index) => {
        const Icon = action.icon
        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            onMouseMove={() => onHover(index)}
            onClick={() => onRun(action)}
            className={`w-full flex items-center gap-3 px-2.5 h-10 rounded-md text-left text-[13px] cursor-pointer transition-colors ${colors.text} ${index === selectedIndex ? colors.selected : colors.hover}`}
          >
            <Icon size={16} className={`shrink-0 ${colors.icon}`} />
            <span className="flex-1 truncate">{action.label}</span>
            {action.shortcut ? <KeyChip shortcut={action.shortcut} darkText={darkText} /> : null}
          </button>
        )
      })}
    </div>
  )
}
