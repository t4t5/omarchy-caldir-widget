import { DAY_MS, MINUTE_MS, addLocalDays, localDateKey } from "./dates.mjs"
import { daySectionDate, daySectionTitle } from "./format.mjs"

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

function buildUpcoming(events, now, options) {
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
    if (event.cancelled === true || event.declined === true) continue
    if (event.endMs < current || event.startMs > horizon) continue
    if (config.excludeAllDay === true && event.all_day === true) continue
    if (config.excludeTentative === true && event.tentative === true) continue
    if (showOnlyWithVideoLink && !event.conferenceUrl) continue
    upcoming.push(event)
  }

  upcoming.sort(compareUpcoming)
  return upcoming.length > maxRows ? upcoming.slice(0, maxRows) : upcoming
}

// Ported from MeetingBar's EventSelection: an event with under a minute left
// is never "next" (grace window), tentative invitations stay off the bar, and
// a running meeting hands the bar to the following one once it starts within
// ten minutes. Unlike MeetingBar, the handover only replaces a pick that is
// already in progress, so of two future meetings the earlier one always wins.
const NEXT_GRACE_MS = MINUTE_MS
const NEXT_HANDOVER_MS = 10 * MINUTE_MS

export function nextMeeting(events, now, options) {
  const current = nowMillis(now)
  const candidates = buildUpcoming(events, now, Object.assign({}, options || {}, {
    excludeAllDay: true,
    excludeTentative: true,
    maxRows: 50
  }))

  let result = null
  for (let i = 0; i < candidates.length; i++) {
    const event = candidates[i]
    if (event.endMs <= current + NEXT_GRACE_MS) continue
    if (!result) {
      result = event
    } else if (result.startMs <= current && event.startMs < current + NEXT_HANDOVER_MS) {
      result = event
    } else {
      break
    }
  }
  return result
}

// The schedule keeps events that already ended today so the panel can dim
// them; occupiedLocalDays clips everything to [today, today + lookaheadDays].
export function buildScheduleGroups(events, now, options) {
  const optionsConfig = options || {}
  const lookaheadDays = Math.max(1, parseInt(optionsConfig.lookaheadDays, 10) || 3)
  const maxRows = Math.max(1, parseInt(optionsConfig.maxRows, 10) || 20)
  const byKey = {}
  const currentDate = new Date(nowMillis(now))
  const rangeStart = localDay(currentDate)
  const rangeEnd = addLocalDays(rangeStart, lookaheadDays)

  const sorted = []
  for (let i = 0; i < (events || []).length; i++) {
    const event = events[i]
    if (!event || !isFinite(event.startMs) || !isFinite(event.endMs)) continue
    sorted.push(event)
  }
  sorted.sort(compareUpcoming)
  const valid = sorted.length > maxRows ? sorted.slice(0, maxRows) : sorted

  for (let i = 0; i < valid.length; i++) {
    const event = valid[i]
    const days = occupiedLocalDays(event, rangeStart, rangeEnd)
    for (let j = 0; j < days.length; j++) {
      const date = days[j]
      const key = localDateKey(date)
      if (!byKey[key]) {
        byKey[key] = {
          key: key,
          title: daySectionTitle(date.getTime(), now),
          dateTitle: daySectionDate(date.getTime()),
          items: []
        }
      }
      byKey[key].items.push(event)
    }
  }

  return Object.keys(byKey).sort().map(function(key) { return byKey[key] })
}
