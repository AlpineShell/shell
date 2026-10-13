import { useState, type ReactNode } from "react"
import { AppWindow, Globe, Star } from "lucide-react"
import { launcherColors } from "./launcherColors"

const BADGE_SIZE = 13
const BADGE_ICON_SIZE = 9

function Badge({ darkText, children }: { darkText: boolean; children: ReactNode }) {
  return (
    <span
      className="absolute flex items-center justify-center rounded-full"
      style={{ right: -3, bottom: -3, width: BADGE_SIZE, height: BADGE_SIZE, backgroundColor: launcherColors(darkText).badgeBackground }}
    >
      {children}
    </span>
  )
}

function Placeholder({ darkText }: { darkText: boolean }) {
  return <div className={`w-7 h-7 rounded ${darkText ? "bg-black/10" : "bg-white/10"}`} />
}

function GlobeTile({ darkText }: { darkText: boolean }) {
  return (
    <div className="w-7 h-7 flex items-center justify-center">
      <Globe size={18} className={launcherColors(darkText).icon} />
    </div>
  )
}

export function GlyphIcon({ icon: Icon, darkText }: { icon: SettingsIcon; darkText: boolean }) {
  return (
    <span className="w-7 h-7 shrink-0 flex items-center justify-center">
      <Icon size={18} className={launcherColors(darkText).icon} />
    </span>
  )
}

export function ImageIcon({ src, darkText }: { src: string | null | undefined; darkText: boolean }) {
  return <div className="w-7 h-7 shrink-0">{src ? <img src={src} alt="" className="w-7 h-7" draggable={false} /> : <Placeholder darkText={darkText} />}</div>
}

export function OpenWindowIcon({ icon, darkText }: { icon?: string; darkText: boolean }) {
  return (
    <div className="relative w-7 h-7 shrink-0">
      {icon ? <img src={icon} alt="" className="w-7 h-7" draggable={false} /> : <Placeholder darkText={darkText} />}
      <Badge darkText={darkText}>
        <AppWindow size={BADGE_ICON_SIZE} strokeWidth={2.5} className={darkText ? "text-black/65" : "text-white/75"} />
      </Badge>
    </div>
  )
}

export function TabIcon({ favicon, windowIcon, darkText }: { favicon: string | null; windowIcon: string | null; darkText: boolean }) {
  const [faviconFailed, setFaviconFailed] = useState(false)
  const showFavicon = !!favicon && !faviconFailed
  return (
    <div className="relative w-7 h-7 shrink-0">
      {showFavicon ? (
        <img src={favicon} alt="" className="w-7 h-7 rounded" draggable={false} onError={() => setFaviconFailed(true)} />
      ) : windowIcon ? (
        <img src={windowIcon} alt="" className="w-7 h-7" draggable={false} />
      ) : (
        <GlobeTile darkText={darkText} />
      )}
      {showFavicon && windowIcon && (
        <Badge darkText={darkText}>
          <img src={windowIcon} alt="" style={{ width: BADGE_ICON_SIZE, height: BADGE_ICON_SIZE }} draggable={false} />
        </Badge>
      )}
    </div>
  )
}

export function BookmarkIcon({ favicon, darkText }: { favicon?: string; darkText: boolean }) {
  const [failed, setFailed] = useState(false)
  return (
    <div className="relative w-7 h-7 shrink-0">
      {favicon && !failed ? (
        <img src={favicon} alt="" className="w-7 h-7 rounded" draggable={false} onError={() => setFailed(true)} />
      ) : (
        <GlobeTile darkText={darkText} />
      )}
      <Badge darkText={darkText}>
        <Star size={BADGE_ICON_SIZE} color="#fbbf24" fill="#fbbf24" strokeWidth={0} />
      </Badge>
    </div>
  )
}

export function PluginBadgedIcon({ src, badge, darkText }: { src: string | null; badge?: string | null; darkText: boolean }) {
  const [badgeFailed, setBadgeFailed] = useState(false)
  if (!badge || badgeFailed) return <ImageIcon src={src} darkText={darkText} />
  return (
    <div className="relative w-7 h-7 shrink-0">
      {src ? <img src={src} alt="" className="w-7 h-7" draggable={false} /> : <Placeholder darkText={darkText} />}
      <Badge darkText={darkText}>
        <img src={badge} alt="" style={{ width: BADGE_ICON_SIZE, height: BADGE_ICON_SIZE }} draggable={false} onError={() => setBadgeFailed(true)} />
      </Badge>
    </div>
  )
}
