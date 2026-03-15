import { useAltTab } from '../hooks/useAltTab'

function WindowEntry({ window, selected }: { window: AltTabWindow; selected: boolean }) {
  return (
    <div
      className={`rounded-xl ring-1 overflow-hidden shrink-0 bg-[#122134] w-50 ${
        selected ? 'ring-white' : 'ring-gray-500/50'
      }`}
    >
      <div className="flex items-center gap-2 px-1.5 py-1.5">
        {window.icon && (
          <img src={window.icon} alt="" className="w-4 h-4 shrink-0" draggable={false} />
        )}
        <span className="text-white text-xs truncate">{window.processName}</span>
      </div>
      <div className="w-full h-31 flex items-center pb-1 justify-center bg-[#122134]">
        {window.thumbnail ? (
          <img
            src={window.thumbnail}
            alt=""
            className="max-w-full rounded-md max-h-full object-contain"
            draggable={false}
          />
        ) : window.icon ? (
          <img src={window.icon} alt="" className="w-12 h-12 opacity-60" draggable={false} />
        ) : null}
      </div>
    </div>
  )
}

export default function AltTabSwitcher() {
  const { windows, selectedIndex, visible } = useAltTab()

  if (!visible || windows.length === 0) {
    return null
  }

  return (
    <div className="w-screen h-screen flex items-start mt-10 justify-center">
      <div
        className="flex gap-2 p-3 rounded-2xl shadow-2xs"
      >
        {windows.map((w, i) => (
          <WindowEntry key={w.hwnd} window={w} selected={i === selectedIndex} />
        ))}
      </div>
    </div>
  )
}
