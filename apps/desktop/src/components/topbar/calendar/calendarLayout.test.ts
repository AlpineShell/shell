import { describe, it, expect } from 'vitest'
import {
  resolveTimeFormat,
  formatClock,
  formatClockDate,
  formatHourLabel,
  stripHtml,
  layoutTimedEvents,
  allDayEventsForDay,
  tasksForDay,
  dayRange,
  isSameDay,
} from './calendarLayout'

function timedEvent(id: string, start: string, end: string): CalendarEvent {
  return { id, calendarId: 'c', title: id, description: null, location: null, start, end, allDay: false, color: '#fff' }
}

function allDayEvent(id: string, start: string, end: string): CalendarEvent {
  return { id, calendarId: 'c', title: id, description: null, location: null, start, end, allDay: true, color: '#fff' }
}

describe('resolveTimeFormat', () => {
  it('follows the system format when auto', () => {
    expect(resolveTimeFormat({ timeFormat: 'auto', systemTimeFormat: '12h' })).toBe('12h')
    expect(resolveTimeFormat({ timeFormat: 'auto', systemTimeFormat: '24h' })).toBe('24h')
  })
  it('honors an explicit override', () => {
    expect(resolveTimeFormat({ timeFormat: '24h', systemTimeFormat: '12h' })).toBe('24h')
  })
})

describe('formatClock', () => {
  it('formats 24-hour with zero padding', () => {
    expect(formatClock(new Date(2023, 0, 1, 9, 5), '24h')).toBe('09:05')
    expect(formatClock(new Date(2023, 0, 1, 0, 0), '24h')).toBe('00:00')
  })
  it('formats 12-hour with AM/PM and no leading zero', () => {
    expect(formatClock(new Date(2023, 0, 1, 14, 30), '12h')).toBe('2:30 PM')
    expect(formatClock(new Date(2023, 0, 1, 0, 0), '12h')).toBe('12:00 AM')
    expect(formatClock(new Date(2023, 0, 1, 12, 0), '12h')).toBe('12:00 PM')
  })
})

describe('formatClockDate', () => {
  it('writes the abbreviated month and the unpadded day', () => {
    expect(formatClockDate(new Date(2026, 8, 12, 9, 41))).toBe('Sep 12')
    expect(formatClockDate(new Date(2026, 2, 5))).toBe('Mar 5')
  })
  it('turns over to the next month at midnight', () => {
    expect(formatClockDate(new Date(2026, 0, 31, 23, 59))).toBe('Jan 31')
    expect(formatClockDate(new Date(2026, 1, 1, 0, 0))).toBe('Feb 1')
  })
  it('turns over from December to January at the year boundary', () => {
    expect(formatClockDate(new Date(2025, 11, 31, 23, 59))).toBe('Dec 31')
    expect(formatClockDate(new Date(2026, 0, 1, 0, 0))).toBe('Jan 1')
  })
})

describe('formatHourLabel', () => {
  it('formats 12-hour boundaries', () => {
    expect(formatHourLabel(0, '12h')).toBe('12 AM')
    expect(formatHourLabel(12, '12h')).toBe('12 PM')
    expect(formatHourLabel(13, '12h')).toBe('1 PM')
    expect(formatHourLabel(24, '12h')).toBe('12 AM')
  })
  it('formats 24-hour', () => {
    expect(formatHourLabel(8, '24h')).toBe('08:00')
    expect(formatHourLabel(24, '24h')).toBe('00:00')
  })
})

describe('stripHtml', () => {
  it('turns block tags and <br> into single newlines', () => {
    expect(stripHtml('one<br>two<br/>three')).toBe('one\ntwo\nthree')
    expect(stripHtml('<p>one</p><p>two</p>')).toBe('one\ntwo')
  })
  it('drops remaining tags and decodes common entities', () => {
    expect(stripHtml('<a href="https://x.test">Tom &amp; Jerry</a>')).toBe('Tom & Jerry')
    expect(stripHtml('a&nbsp;&nbsp;b')).toBe('a b')
    expect(stripHtml('&amp;lt;')).toBe('&lt;')
  })
  it('collapses whitespace and trims', () => {
    expect(stripHtml('  <div>hello   world</div>\n\n\n')).toBe('hello world')
  })
})

describe('layoutTimedEvents', () => {
  const day = new Date(2023, 9, 9)

  it('positions a single event by minutes into the day', () => {
    const [positioned] = layoutTimedEvents([timedEvent('a', '2023-10-09T09:30:00', '2023-10-09T10:30:00')], day)
    expect(positioned.startMinutes).toBe(9 * 60 + 30)
    expect(positioned.endMinutes).toBe(10 * 60 + 30)
    expect(positioned.columns).toBe(1)
    expect(positioned.column).toBe(0)
  })

  it('splits overlapping events into columns', () => {
    const result = layoutTimedEvents(
      [
        timedEvent('a', '2023-10-09T09:00:00', '2023-10-09T10:30:00'),
        timedEvent('b', '2023-10-09T09:30:00', '2023-10-09T11:00:00'),
      ],
      day
    )
    expect(result.every((r) => r.columns === 2)).toBe(true)
    expect(new Set(result.map((r) => r.column))).toEqual(new Set([0, 1]))
  })

  it('reuses a column for non-overlapping events', () => {
    const result = layoutTimedEvents(
      [
        timedEvent('a', '2023-10-09T09:00:00', '2023-10-09T10:00:00'),
        timedEvent('b', '2023-10-09T10:00:00', '2023-10-09T11:00:00'),
      ],
      day
    )
    expect(result.every((r) => r.columns === 1)).toBe(true)
  })

  it('clamps events that span into the day from before', () => {
    const [positioned] = layoutTimedEvents([timedEvent('a', '2023-10-08T23:00:00', '2023-10-09T01:00:00')], day)
    expect(positioned.startMinutes).toBe(0)
    expect(positioned.endMinutes).toBe(60)
  })

  it('excludes all-day events', () => {
    expect(layoutTimedEvents([allDayEvent('a', '2023-10-09', '2023-10-10')], day)).toHaveLength(0)
  })
})

describe('allDayEventsForDay', () => {
  it('includes a multi-day all-day event on interior days (end exclusive)', () => {
    const event = allDayEvent('trip', '2023-10-08', '2023-10-11')
    expect(allDayEventsForDay([event], new Date(2023, 9, 8))).toHaveLength(1)
    expect(allDayEventsForDay([event], new Date(2023, 9, 10))).toHaveLength(1)
    expect(allDayEventsForDay([event], new Date(2023, 9, 11))).toHaveLength(0)
  })
})

describe('tasksForDay', () => {
  const task = (id: string, due: string | null): CalendarTask => ({ id, title: id, due, completed: false, listTitle: null })

  it('buckets a task on its due date', () => {
    expect(tasksForDay([task('t', '2023-10-09T00:00:00.000Z')], new Date(2023, 9, 9), false)).toHaveLength(1)
    expect(tasksForDay([task('t', '2023-10-09T00:00:00.000Z')], new Date(2023, 9, 10), false)).toHaveLength(0)
  })

  it('includes overdue tasks only when requested', () => {
    const overdue = task('t', '2023-10-05T00:00:00.000Z')
    expect(tasksForDay([overdue], new Date(2023, 9, 9), false)).toHaveLength(0)
    expect(tasksForDay([overdue], new Date(2023, 9, 9), true)).toHaveLength(1)
  })

  it('ignores tasks without a due date', () => {
    expect(tasksForDay([task('t', null)], new Date(2023, 9, 9), true)).toHaveLength(0)
  })
})

describe('dayRange', () => {
  it('produces consecutive days from the base', () => {
    const days = dayRange(new Date(2023, 9, 9, 15), 3)
    expect(days).toHaveLength(3)
    expect(isSameDay(days[0], new Date(2023, 9, 9))).toBe(true)
    expect(isSameDay(days[2], new Date(2023, 9, 11))).toBe(true)
  })
})
