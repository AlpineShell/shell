const MINUTES_PER_DAY = 24 * 60

export function resolveTimeFormat(prefs: Pick<ClockPrefs, 'timeFormat' | 'systemTimeFormat'>): ResolvedTimeFormat {
  return prefs.timeFormat === 'auto' ? prefs.systemTimeFormat : prefs.timeFormat
}

export function formatClock(date: Date, format: ResolvedTimeFormat): string {
  const minutes = String(date.getMinutes()).padStart(2, '0')
  if (format === '12h') {
    const suffix = date.getHours() < 12 ? 'AM' : 'PM'
    const hour = date.getHours() % 12 || 12
    return `${hour}:${minutes} ${suffix}`
  }
  return `${String(date.getHours()).padStart(2, '0')}:${minutes}`
}

export function formatHourLabel(hour: number, format: ResolvedTimeFormat): string {
  if (format === '12h') {
    if (hour === 0 || hour === 24) return '12 AM'
    if (hour === 12) return '12 PM'
    return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
  }
  return `${String(hour % 24).padStart(2, '0')}:00`
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count)
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function dayRange(base: Date, count: number): Date[] {
  const start = startOfDay(base)
  return Array.from({ length: count }, (_, i) => addDays(start, i))
}

export function nowLineMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

function dateNum(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}

function isoDateNum(iso: string): number {
  const datePart = iso.slice(0, 10)
  const [y, m, d] = datePart.split('-').map(Number)
  return y * 10000 + m * 100 + d
}

export interface PositionedEvent {
  event: CalendarEvent
  startMinutes: number
  endMinutes: number
  column: number
  columns: number
}

interface TimedItem {
  event: CalendarEvent
  startMinutes: number
  endMinutes: number
}

export function layoutTimedEvents(events: CalendarEvent[], day: Date): PositionedEvent[] {
  const dayStart = startOfDay(day).getTime()
  const dayEnd = dayStart + MINUTES_PER_DAY * 60000

  const items: TimedItem[] = events
    .filter((event) => !event.allDay)
    .map((event) => ({ event, start: new Date(event.start).getTime(), end: new Date(event.end).getTime() }))
    .filter((item) => item.end > dayStart && item.start < dayEnd)
    .map((item) => ({
      event: item.event,
      startMinutes: Math.max(0, (item.start - dayStart) / 60000),
      endMinutes: Math.min(MINUTES_PER_DAY, (item.end - dayStart) / 60000),
    }))
    .sort((a, b) => a.startMinutes - b.startMinutes || b.endMinutes - a.endMinutes)

  const positioned: PositionedEvent[] = []
  let cluster: TimedItem[] = []
  let clusterEnd = -Infinity

  function flushCluster() {
    if (!cluster.length) return
    const columnEnds: number[] = []
    const assigned = cluster.map((item) => {
      let column = columnEnds.findIndex((end) => end <= item.startMinutes)
      if (column === -1) {
        column = columnEnds.length
        columnEnds.push(item.endMinutes)
      } else {
        columnEnds[column] = item.endMinutes
      }
      return { item, column }
    })
    const columns = columnEnds.length
    for (const { item, column } of assigned) {
      positioned.push({ event: item.event, startMinutes: item.startMinutes, endMinutes: item.endMinutes, column, columns })
    }
    cluster = []
    clusterEnd = -Infinity
  }

  for (const item of items) {
    if (cluster.length && item.startMinutes >= clusterEnd) flushCluster()
    cluster.push(item)
    clusterEnd = Math.max(clusterEnd, item.endMinutes)
  }
  flushCluster()
  return positioned
}

export function allDayEventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const target = dateNum(day)
  return events.filter((event) => {
    if (!event.allDay) return false
    const start = isoDateNum(event.start)
    const end = isoDateNum(event.end)
    return target >= start && target < Math.max(end, start + 1)
  })
}

export function tasksForDay(tasks: CalendarTask[], day: Date, includeOverdue: boolean): CalendarTask[] {
  const target = dateNum(day)
  return tasks.filter((task) => {
    if (!task.due) return false
    const due = isoDateNum(task.due)
    return due === target || (includeOverdue && due < target)
  })
}

export function isTaskOverdue(task: CalendarTask, day: Date): boolean {
  if (!task.due) return false
  return isoDateNum(task.due) < dateNum(day)
}
