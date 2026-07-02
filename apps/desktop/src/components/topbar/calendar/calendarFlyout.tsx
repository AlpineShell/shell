import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Circle } from 'lucide-react'
import { useDarkText } from '../../themeContext'
import { useClockPrefs } from '../../../hooks/useClockPrefs'
import { useCalendarData } from '../../../hooks/useCalendarData'
import {
  resolveTimeFormat,
  formatClock,
  formatHourLabel,
  startOfDay,
  addDays,
  isSameDay,
  dayRange,
  nowLineMinutes,
  layoutTimedEvents,
  allDayEventsForDay,
  tasksForDay,
  isTaskOverdue,
  type PositionedEvent,
} from './calendarLayout'

const HOUR_HEIGHT = 44
const GRID_HEIGHT = 24 * HOUR_HEIGHT
const GUTTER = 46
const SCROLL_HEIGHT = 416
const HOURS = Array.from({ length: 25 }, (_, i) => i)
const MIN_OFFSET = -7
const MAX_OFFSET = 30

function columnWidth(dayCount: number): number {
  if (dayCount === 1) return 264
  if (dayCount === 2) return 168
  return 132
}

function rangeLabel(days: Date[]): string {
  if (days.length === 1) {
    return days[0].toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
  }
  const first = days[0]
  const last = days[days.length - 1]
  const start = first.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const end = last.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return `${start} – ${end}, ${last.getFullYear()}`
}

export default function CalendarFlyout() {
  const darkText = useDarkText()
  const { prefs } = useClockPrefs()
  const data = useCalendarData()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [offset, setOffset] = useState(0)
  const [now, setNow] = useState(() => new Date())

  const format = resolveTimeFormat(prefs)
  const dayCount = prefs.calendarDays
  const colWidth = columnWidth(dayCount)
  const today = startOfDay(now)
  const days = dayRange(addDays(today, offset), dayCount)
  const canPrev = offset > MIN_OFFSET
  const canNext = offset < MAX_OFFSET

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (nowLineMinutes(new Date()) / 60) * HOUR_HEIGHT - 130)
    }
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    window.shell?.calendar?.refresh?.({ startOffset: offset, dayCount })
  }, [offset, dayCount])

  const text = darkText ? 'text-black' : 'text-white'
  const muted = darkText ? 'text-black/50' : 'text-white/50'
  const lineColor = darkText ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)'
  const borderColor = darkText ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)'
  const hoverBg = darkText ? 'hover:bg-black/10' : 'hover:bg-white/10'

  return (
    <div className={`${text} select-none`} style={{ width: GUTTER + colWidth * dayCount }}>
      <div className="flex items-center justify-between pl-3 pr-2 pt-2.5 pb-1.5">
        <span className={`text-sm font-medium ${text}`}>{rangeLabel(days)}</span>
        <div className={`flex items-center gap-0.5 ${text}`}>
          {offset !== 0 && (
            <button onClick={() => setOffset(0)} className={`px-1.5 h-6 rounded-md text-[11px] cursor-pointer transition-colors ${hoverBg}`}>
              Today
            </button>
          )}
          <button
            onClick={() => setOffset((o) => Math.max(MIN_OFFSET, o - 1))}
            disabled={!canPrev}
            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${canPrev ? `cursor-pointer ${hoverBg}` : 'opacity-30 cursor-default'}`}
            aria-label="Previous"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => setOffset((o) => Math.min(MAX_OFFSET, o + 1))}
            disabled={!canNext}
            className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${canNext ? `cursor-pointer ${hoverBg}` : 'opacity-30 cursor-default'}`}
            aria-label="Next"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex" style={{ borderBottom: `1px solid ${borderColor}` }}>
        <div className="shrink-0" style={{ width: GUTTER }} />
        {days.map((day) => {
          const todayCol = isSameDay(day, today)
          return (
            <div key={day.getTime()} className="flex flex-col items-center py-1.5 gap-0.5" style={{ width: colWidth, borderLeft: `1px solid ${borderColor}` }}>
              <span className={`text-[9px] tracking-wide ${muted}`}>{day.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}</span>
              <span className={todayCol
                ? `w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-semibold ${darkText ? 'bg-black text-white' : 'bg-white text-black'}`
                : 'text-[13px] font-medium'}>
                {day.getDate()}
              </span>
            </div>
          )
        })}
      </div>

      <AllDayStrip days={days} today={today} events={data.events} tasks={data.tasks} showTasks={prefs.showTasks} colWidth={colWidth} muted={muted} borderColor={borderColor} darkText={darkText} />

      <div ref={scrollRef} className={`relative overflow-y-auto overflow-x-hidden cc-scroll ${darkText ? 'cc-scroll-light' : ''}`} style={{ height: SCROLL_HEIGHT }}>
        <div className="flex" style={{ height: GRID_HEIGHT }}>
          <div className="relative shrink-0" style={{ width: GUTTER }}>
            {HOURS.slice(1, 24).map((hour) => (
              <span key={hour} className={`absolute right-1.5 text-[9px] ${muted}`} style={{ top: hour * HOUR_HEIGHT - 5 }}>
                {formatHourLabel(hour, format)}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <DayColumn
              key={day.getTime()}
              day={day}
              isToday={isSameDay(day, today)}
              events={data.events}
              now={now}
              format={format}
              colWidth={colWidth}
              lineColor={lineColor}
              borderColor={borderColor}
            />
          ))}
        </div>
      </div>

      {data.error && (
        <div className={`px-3 py-1.5 text-[10px] ${muted}`} style={{ borderTop: `1px solid ${borderColor}` }}>
          Couldn’t refresh calendar. Showing the last synced data.
        </div>
      )}
    </div>
  )
}

function AllDayStrip({
  days,
  today,
  events,
  tasks,
  showTasks,
  colWidth,
  muted,
  borderColor,
  darkText,
}: {
  days: Date[]
  today: Date
  events: CalendarEvent[]
  tasks: CalendarTask[]
  showTasks: boolean
  colWidth: number
  muted: string
  borderColor: string
  darkText: boolean
}) {
  return (
    <div className="flex" style={{ borderBottom: `1px solid ${borderColor}` }}>
      <div className="shrink-0 flex justify-end pr-1.5 pt-1" style={{ width: GUTTER }}>
        <span className={`text-[9px] ${muted}`}>all-day</span>
      </div>
      {days.map((day) => {
        const allDay = allDayEventsForDay(events, day)
        const dayTasks = showTasks ? tasksForDay(tasks, day, isSameDay(day, today)) : []
        return (
          <div key={day.getTime()} className="flex flex-col gap-0.5 px-1 py-1 min-h-[26px]" style={{ width: colWidth, borderLeft: `1px solid ${borderColor}` }}>
            {allDay.map((event) => (
              <div key={event.id} className="rounded-[4px] px-1.5 py-0.5 text-[10px] text-white truncate" style={{ backgroundColor: event.color, textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
                {event.title}
              </div>
            ))}
            {dayTasks.map((task) => (
              <TaskChip key={task.id} task={task} overdue={isTaskOverdue(task, day)} darkText={darkText} />
            ))}
          </div>
        )
      })}
    </div>
  )
}

function TaskChip({ task, overdue, darkText }: { task: CalendarTask; overdue: boolean; darkText: boolean }) {
  const dim = darkText ? 'text-black/55' : 'text-white/55'
  return (
    <div className={`flex items-center gap-1 text-[10px] ${overdue ? 'text-red-400' : dim}`}>
      <Circle size={9} className={`shrink-0 ${overdue ? 'text-red-400' : dim}`} strokeWidth={2} />
      <span className="truncate">{task.title}</span>
    </div>
  )
}

function DayColumn({
  day,
  isToday,
  events,
  now,
  format,
  colWidth,
  lineColor,
  borderColor,
}: {
  day: Date
  isToday: boolean
  events: CalendarEvent[]
  now: Date
  format: ResolvedTimeFormat
  colWidth: number
  lineColor: string
  borderColor: string
}) {
  const positioned = layoutTimedEvents(events, day)
  return (
    <div className="relative shrink-0" style={{ width: colWidth, height: GRID_HEIGHT, borderLeft: `1px solid ${borderColor}` }}>
      {HOURS.map((hour) => (
        <div key={hour} className="absolute left-0 right-0" style={{ top: hour * HOUR_HEIGHT, borderTop: `1px solid ${lineColor}` }} />
      ))}
      {positioned.map((item) => (
        <EventBlock key={item.event.id} item={item} format={format} />
      ))}
      {isToday && <NowLine now={now} />}
    </div>
  )
}

function EventBlock({ item, format }: { item: PositionedEvent; format: ResolvedTimeFormat }) {
  const top = (item.startMinutes / 60) * HOUR_HEIGHT
  const height = Math.max(15, ((item.endMinutes - item.startMinutes) / 60) * HOUR_HEIGHT)
  const width = 100 / item.columns
  const left = width * item.column
  return (
    <div
      className="absolute rounded-[5px] px-1.5 py-[1px] overflow-hidden text-white"
      style={{ top, height, left: `calc(${left}% + 2px)`, width: `calc(${width}% - 4px)`, backgroundColor: item.event.color }}
    >
      <div className="text-[10px] font-medium leading-tight truncate" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
        {item.event.title}
      </div>
      {height >= 30 && (
        <div className="text-[9px] leading-tight truncate opacity-90" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.35)' }}>
          {formatClock(new Date(item.event.start), format)}
        </div>
      )}
    </div>
  )
}

function NowLine({ now }: { now: Date }) {
  const top = (nowLineMinutes(now) / 60) * HOUR_HEIGHT
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="relative border-t border-red-500">
        <div className="absolute -top-[3px] -left-[3px] w-1.5 h-1.5 rounded-full bg-red-500" />
      </div>
    </div>
  )
}
