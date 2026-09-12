import { Puzzle } from 'lucide-react'

function placeholderClass(darkText: boolean): string {
  return `${darkText ? 'bg-black/5 text-black/70' : 'bg-white/10 text-white/75'} flex items-center gap-1 px-2 h-4.5 max-w-28 rounded-full`
}

function emptyGroupClass(darkText: boolean): string {
  return `${darkText ? 'text-black/60' : 'text-white/60'} flex px-2 h-5 items-center`
}

export default function RidgePluginGroupFace({ widgets, darkText }: RidgePluginGroupFaceProps) {
  if (widgets.length === 0) {
    return (
      <div className={emptyGroupClass(darkText)}>
        <Puzzle size={13} />
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 h-5">
      {widgets.map((widget) => (
        <div key={widget.id} className={placeholderClass(darkText)}>
          <Puzzle size={11} className="shrink-0" />
          <span className="truncate text-[11px] leading-none">{widget.pluginName}</span>
        </div>
      ))}
    </div>
  )
}
