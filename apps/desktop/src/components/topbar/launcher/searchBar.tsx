import type { KeyboardEvent, RefObject } from "react"
import { ChevronLeft, Search } from "lucide-react"
import { launcherColors } from "./launcherColors"

interface SearchBarProps {
  darkText: boolean
  inputRef: RefObject<HTMLInputElement | null>
  value: string
  placeholder: string
  title: string | null
  readOnly: boolean
  onBack: (() => void) | null
  onChange: (value: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
}

export function SearchBar({ darkText, inputRef, value, placeholder, title, readOnly, onBack, onChange, onKeyDown }: SearchBarProps) {
  const colors = launcherColors(darkText)
  return (
    <div className={`flex items-center gap-2 px-4 h-12 shrink-0 ${colors.text}`}>
      {onBack ? (
        <button
          type="button"
          aria-label="Back"
          onMouseDown={(event) => { event.preventDefault(); onBack() }}
          className="shrink-0 opacity-60 hover:opacity-100 cursor-pointer"
        >
          <ChevronLeft size={16} />
        </button>
      ) : (
        <Search size={16} className="shrink-0 opacity-60" />
      )}
      {title !== null ? (
        <span className="flex-1 text-[15px] truncate">{title}</span>
      ) : (
        <input
          ref={inputRef}
          type="text"
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus
          className={`flex-1 bg-transparent outline-none text-[15px] ${colors.placeholder}`}
        />
      )}
    </div>
  )
}
