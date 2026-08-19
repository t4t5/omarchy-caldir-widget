import { DAY_MS, addLocalDays, localDateKey } from "./dates.mjs"
import { daySectionTitle } from "./format.mjs"

function nowMillis(now) {
  return now instanceof Date ? now.getTime() : Number(now)
}

function compareUpcoming(a, b) {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs
  const aDuration = a.endMs - a.startMs
  const bDuration = b.endMs - b.startMs
  if (aDuration !== bDuration) return bDuration - aDuration
  return String(a.title || "").localeCompare(String(b.title || ""))
}

function localDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function allDayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""))
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return isNaN(date.getTime()) ? null : date
}

// Match rencal's agenda semantics: enumerate every viewer-local day occupied by
// an event. Event ends are exclusive, so an all-day DTEND and a timed event
// ending exactly at midnight do not occupy the end date.
function occupiedLocalDays(event, rangeStart, rangeEnd) {
  let first = event.all_day ? allDayDate(event.start) : localDay(new Date(event.startMs))
  let last = event.all_day ? allDayDate(event.end) : localDay(new Date(event.endMs))
  if (!first || !last || isNaN(first.getTime()) || isNaN(last.getTime())) return []

  if (event.all_day) {
    last = addLocalDays(last, -1)
  } else {
    const end = new Date(event.endMs)
    const endsAtMidnight = end.getHours() === 0
      && end.getMinutes() === 0
      && end.getSeconds() === 0
      && end.getMilliseconds() === 0
    if (endsAtMidnight && event.endMs > event.startMs) last = addLocalDays(last, -1)
  }

  if (last < first) last = first
  if (first < rangeStart) first = rangeStart
  if (last > rangeEnd) last = rangeEnd
  if (last < first) return []

  const days = []
  for (let day = first; day <= last; day = addLocalDays(day, 1)) days.push(day)
  return days
}

export function buildUpcoming(events, now, options) {
  const config = options || {}
  const lookaheadDays = Math.max(1, parseInt(config.lookaheadDays, 10) || 3)
  const showOnlyWithVideoLink = config.showOnlyWithVideoLink !== false
  const maxRows = Math.max(1, parseInt(config.maxRows, 10) || 20)
  const current = nowMillis(now)
  const horizon = current + lookaheadDays * DAY_MS
  const upcoming = []

  for (let i = 0; i < (events || []).length; i++) {
    const event = events[i]
    if (!event || !isFinite(event.startMs) || !isFinite(event.endMs)) continue
    if (event.endMs < current || event.startMs > horizon) continue
    if (config.excludeAllDay === true && event.all_day === true) continue
    if (showOnlyWithVideoLink && !event.meetUrl) continue
    upcoming.push(event)
  }

  upcoming.sort(compareUpcoming)
  return upcoming.length > maxRows ? upcoming.slice(0, maxRows) : upcoming
}

export function nextMeeting(events, now, options) {
  const config = Object.assign({}, options || {}, { maxRows: 1, excludeAllDay: true })
  const meetings = buildUpcoming(events, now, config)
  return meetings.length ? meetings[0] : null
}

export function buildScheduleGroups(events, now, options) {
  const optionsConfig = options || {}
  const lookaheadDays = Math.max(1, parseInt(optionsConfig.lookaheadDays, 10) || 3)
  const config = Object.assign({}, optionsConfig, { showOnlyWithVideoLink: false })
  const valid = buildUpcoming(events, now, config)
  const byKey = {}
  const currentDate = new Date(nowMillis(now))
  const rangeStart = localDay(currentDate)
  const rangeEnd = addLocalDays(rangeStart, lookaheadDays)

  for (let i = 0; i < valid.length; i++) {
    const event = valid[i]
    const days = occupiedLocalDays(event, rangeStart, rangeEnd)
    for (let j = 0; j < days.length; j++) {
      const date = days[j]
      const key = localDateKey(date)
      if (!byKey[key]) {
        byKey[key] = { key: key, title: daySectionTitle(date.getTime(), now), items: [] }
      }
      byKey[key].items.push(event)
    }
  }

  return Object.keys(byKey).sort().map(function(key) { return byKey[key] })
}

export function upcomingToday(events, now) {
  const current = nowMillis(now)
  const currentDate = new Date(current)
  const endOfDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59, 999).getTime()
  const output = []

  for (let i = 0; i < (events || []).length; i++) {
    const event = events[i]
    if (!event || !isFinite(event.startMs) || !isFinite(event.endMs)) continue
    if (event.endMs < current || event.startMs > endOfDay) continue
    output.push(event)
  }
  output.sort(compareUpcoming)
  return output
}
