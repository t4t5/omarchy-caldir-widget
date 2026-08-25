import { MINUTE_MS, addLocalDays, localDateKey } from "./dates.mjs"
import { daySectionDate, daySectionTitle } from "./format.mjs"
import {
  BAR_EVENTS_ALL,
  normalizeBarEvents,
  normalizeDaysAhead,
  normalizeLookaheadMinutes
} from "./settings.mjs"

// The selectors below never sort: events arrive in parseAgenda order (start
// ascending, longest first on ties), which filtering preserves.

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

function buildUpcoming(events, current, requireConferenceUrl) {
  const upcoming = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.declined === true) continue
    if (event.endMs < current) continue
    if (event.all_day === true) continue
    if (event.tentative === true) continue
    if (requireConferenceUrl && !event.conferenceUrl) continue
    upcoming.push(event)
  }

  return upcoming
}

// Ported from MeetingBar's EventSelection: an event with under a minute left
// is never "next" (grace window), future events only appear during the
// lookahead window before they start, tentative invitations stay off the bar,
// and a running event hands the bar to the following one once it starts within
// ten minutes. Unlike MeetingBar, the handover only replaces a pick that is
// already in progress, so of two future events the earlier one always wins.
const NEXT_GRACE_MS = MINUTE_MS
const NEXT_HANDOVER_MS = 10 * MINUTE_MS

export function nextMeeting(events, now, options) {
  const settings = options || {}
  const lookaheadMs = normalizeLookaheadMinutes(settings.lookaheadMinutes) * MINUTE_MS
  const requireConferenceUrl = normalizeBarEvents(settings.barEvents) !== BAR_EVENTS_ALL

  const current = now.getTime()
  const candidates = buildUpcoming(events, current, requireConferenceUrl)

  let result = null
  for (let i = 0; i < candidates.length; i++) {
    const event = candidates[i]
    if (event.startMs > current + lookaheadMs) break
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

// A list rather than a set of flags, so the panel's selected action is an index
// and an unavailable action is absent rather than present-but-invalid.
export function heroActions(event) {
  if (!event) return []
  return event.conferenceUrl ? ["join", "calendar"] : ["calendar"]
}

// The schedule keeps events that already ended today so the panel can dim
// them; occupiedLocalDays clips everything to [today, today + daysAhead].
export function buildScheduleGroups(events, now, options) {
  const settings = options || {}
  const daysAhead = normalizeDaysAhead(settings.daysAhead)
  const byKey = {}
  const rangeStart = localDay(now)
  const rangeEnd = addLocalDays(rangeStart, daysAhead)

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
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
