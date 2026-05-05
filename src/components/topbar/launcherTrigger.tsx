import { Search } from 'lucide-react'
import { useDarkText } from '../themeContext'

export default function LauncherTrigger() {
  const darkText = useDarkText()
  const color = darkText ? 'black' : 'white'

  return (
    <button
      onClick={() => window.launcher.show()}
      className={`flex items-center gap-1.5 px-2 h-5 rounded-full cursor-pointer transition-colors ${
        darkText ? 'hover:bg-black/10' : 'hover:bg-white/10'
      }`}
      aria-label="Search"
    >
      <Search color={color} size={12} />
      <span className={`text-[11px] ${darkText ? 'text-black/70' : 'text-white/70'}`}>Search</span>
    </button>
  )
}
