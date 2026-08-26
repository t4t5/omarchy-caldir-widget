import {
  MINUTE_MS,
  addWallDays,
  viewerNowWallMs,
  wallDateKey,
  wallDay
} from "./dates.mjs"
import { wallDaySectionDate, wallDaySectionTitle } from "./format.mjs"

// The selectors below never sort: events arrive in parseAgenda order (start
// ascending, longest first on ties), which filtering preserves.

function allDayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""))
  if (!match) return null
  const date = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return isNaN(date) ? null : date
}

// Match rencal's agenda semantics: enumerate every viewer-local day occupied by
// an event. Event ends are exclusive, so an all-day DTEND and a timed event
// ending exactly at midnight do not occupy the end date.
function occupiedLocalDays(event, rangeStart, rangeEnd) {
  let first = event.all_day ? allDayDate(event.start) : wallDay(event.localStartMs)
  let last = event.all_day ? allDayDate(event.end) : wallDay(event.localEndMs)
  if (first === null || last === null || !isFinite(first) || !isFinite(last)) return []

  if (event.all_day) {
    last = addWallDays(last, -1)
  } else {
    const end = new Date(event.localEndMs)
    const endsAtMidnight = end.getUTCHours() === 0
      && end.getUTCMinutes() === 0
      && end.getUTCSeconds() === 0
      && end.getUTCMilliseconds() === 0
    if (endsAtMidnight && event.endMs > event.startMs) last = addWallDays(last, -1)
  }

  if (last < first) last = first
  if (first < rangeStart) first = rangeStart
  if (last > rangeEnd) last = rangeEnd
  if (last < first) return []

  const days = []
  for (let day = first; day <= last; day = addWallDays(day, 1)) days.push(day)
  return days
}

function buildUpcoming(events, current) {
  const upcoming = []

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    if (event.declined === true) continue
    if (event.endMs < current) continue
    if (event.all_day === true) continue
    if (event.tentative === true) continue
    if (!event.conferenceUrl) continue
    upcoming.push(event)
  }

  return upcoming
}

// Ported from MeetingBar's EventSelection: an event with under a minute left
// is never "next" (grace window), future meetings only appear during the 30
// minutes before they start, tentative invitations and events without a video
// link stay off the bar, and a running meeting hands the bar to the following
// one once it starts within ten minutes. Unlike MeetingBar, the handover only
// replaces a pick that is already in progress, so of two future meetings the
// earlier one always wins.
const NEXT_GRACE_MS = MINUTE_MS
const NEXT_LOOKAHEAD_MS = 30 * MINUTE_MS
const NEXT_HANDOVER_MS = 10 * MINUTE_MS

export function nextMeeting(events, now) {
  const current = now.getTime()
  const candidates = buildUpcoming(events, current)

  let result = null
  for (let i = 0; i < candidates.length; i++) {
    const event = candidates[i]
    if (event.startMs > current + NEXT_LOOKAHEAD_MS) break
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
// them; occupiedLocalDays clips everything to [today, today + daysAhead].
export function buildScheduleGroups(events, now, options) {
  const daysAhead = options.daysAhead
  const byKey = {}
  const rangeStart = wallDay(viewerNowWallMs(events.length > 0 ? events[0] : null, now))
  const rangeEnd = addWallDays(rangeStart, daysAhead)

  for (let i = 0; i < events.length; i++) {
    const event = events[i]
    const days = occupiedLocalDays(event, rangeStart, rangeEnd)
    for (let j = 0; j < days.length; j++) {
      const date = days[j]
      const key = wallDateKey(date)
      if (!byKey[key]) {
        byKey[key] = {
          key: key,
          title: wallDaySectionTitle(date, rangeStart),
          dateTitle: wallDaySectionDate(date),
          items: []
        }
      }
      byKey[key].items.push(event)
    }
  }

  return Object.keys(byKey).sort().map(function(key) { return byKey[key] })
}
