import { useDarkText } from '../themeContext'
import { useShellState } from '../../hooks/useShellState'
import LauncherFace from './faces/launcherFace'

export default function LauncherTrigger() {
  const darkText = useDarkText()
  const visible = useShellState<boolean>(false, window.topbar.searchIcon, window.topbar.onSearchIconChanged)

  if (!visible) return null

  return (
    <button onMouseEnter={() => window.launcher.show()} className="flex items-center rounded-full" aria-label="Search">
      <LauncherFace darkText={darkText} />
    </button>
  )
}
