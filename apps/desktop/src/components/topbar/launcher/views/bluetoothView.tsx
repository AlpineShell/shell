import { useEffect, useRef, useState } from "react"
import { Bluetooth, BluetoothConnected, Loader2 } from "lucide-react"
import { useBluetooth } from "../../../../hooks/useBluetooth"
import { useBluetoothRescan } from "../../../../hooks/useBluetoothRescan"
import { canToggleRadio, deviceActionLabel, deviceStatusLabel, displayedRadioOn, isRadioOff, nextDeviceAction, radioEmptyStateTitle } from "../../../../lib/bluetoothPresentation"
import { moveSelection, resolveSelection } from "../../../../lib/listSelection"
import { launcherColors } from "../launcherColors"
import { MENU_LIST_CLASS, MenuDivider, SubToggle } from "./launcherMenu"

const RADIO_ROW = "radio"

export function BluetoothView({ darkText, onBack }: { darkText: boolean; onBack: () => void }) {
  const colors = launcherColors(darkText)
  const errorText = darkText ? "text-red-700" : "text-red-300"
  const { state, toggleDevice, setRadio } = useBluetooth()
  useBluetoothRescan()
  const [selection, setSelection] = useState<ListSelection>({ id: RADIO_ROW, index: 0 })
  const listRef = useRef<HTMLDivElement>(null)

  const radioOn = displayedRadioOn(state)
  const radioOff = isRadioOff(state)
  const notice = radioEmptyStateTitle(state)
  const rowIds = [RADIO_ROW, ...(notice ? [] : state.devices.map((device) => device.id))]
  const current = resolveSelection(rowIds, selection.id, selection.index)

  useEffect(() => {
    const element = listRef.current?.querySelector(`[data-idx="${current.index}"]`) as HTMLElement | null
    element?.scrollIntoView({ block: "nearest" })
  }, [current.index])

  function toggleRadio() {
    if (!canToggleRadio(state)) return
    setSelection({ id: RADIO_ROW, index: 0 })
    setRadio(!radioOn)
  }

  function activate(rowId: string) {
    if (rowId === RADIO_ROW) { toggleRadio(); return }
    const device = state.devices.find((candidate) => candidate.id === rowId)
    if (device && nextDeviceAction(device)) toggleDevice(device)
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" || event.key === "Backspace" || event.key === "ArrowLeft") { event.preventDefault(); onBack() }
      else if (event.key === "ArrowDown") { event.preventDefault(); setSelection(moveSelection(rowIds, current, 1)) }
      else if (event.key === "ArrowUp") { event.preventDefault(); setSelection(moveSelection(rowIds, current, -1)) }
      else if (event.key === "Enter") { event.preventDefault(); activate(current.id) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  return (
    <div ref={listRef} className={`${MENU_LIST_CLASS} ${darkText ? "cc-scroll-light" : ""}`}>
      <button
        type="button"
        role="switch"
        aria-checked={radioOn}
        aria-label="Bluetooth"
        aria-disabled={!canToggleRadio(state)}
        data-idx={0}
        onMouseMove={() => setSelection({ id: RADIO_ROW, index: 0 })}
        onClick={toggleRadio}
        className={`flex shrink-0 snap-start items-center gap-3 px-2.5 h-12 rounded-md text-left cursor-pointer transition-colors ${current.id === RADIO_ROW ? colors.selected : ""}`}
      >
        <Bluetooth size={18} className={`w-7 shrink-0 ${colors.dim}`} />
        <span className={`flex-1 text-[13px] ${colors.text}`}>Bluetooth</span>
        <span className="transition-opacity" style={{ opacity: state.radio.pending ? 0.55 : 1 }}>
          <SubToggle on={radioOn} darkText={darkText} />
        </span>
      </button>

      {!radioOff && <MenuDivider darkText={darkText} />}

      {radioOff ? null : notice ? (
        <div className={`flex shrink-0 items-center gap-2 justify-center py-4 text-[13px] ${colors.dim}`}><Bluetooth size={15} /><span>{notice}</span></div>
      ) : (
        state.devices.map((device, offset) => {
          const index = offset + 1
          const busy = device.pending !== null
          const actionable = nextDeviceAction(device) !== null
          return (
            <button
              type="button"
              key={device.id}
              data-idx={index}
              aria-label={deviceActionLabel(device)}
              aria-disabled={!actionable}
              onMouseMove={() => setSelection({ id: device.id, index })}
              onClick={() => activate(device.id)}
              className={`w-full flex shrink-0 snap-start items-center gap-3 px-2.5 h-12 rounded-md text-left transition-colors ${actionable ? "cursor-pointer" : "cursor-default"} ${current.id === device.id ? colors.selected : ""}`}
            >
              <span className="w-7 shrink-0 flex justify-center">
                {busy ? <Loader2 size={15} className={`animate-spin ${colors.dim}`} /> : device.connected ? <BluetoothConnected color={colors.iconStroke} size={15} /> : <Bluetooth color={colors.iconStrokeDim} size={15} />}
              </span>
              <div className="flex flex-col min-w-0 flex-1">
                <span className={`text-[13px] truncate ${colors.text}`}>{device.name}</span>
                <span className={`text-[11px] ${device.error ? errorText : colors.dim}`}>{deviceStatusLabel(device)}</span>
              </div>
            </button>
          )
        })
      )}
    </div>
  )
}
