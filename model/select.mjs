import { DAY_MS, localDateKey } from "./dates.mjs"
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
  const config = Object.assign({}, options || {}, { showOnlyWithVideoLink: false })
  const valid = buildUpcoming(events, now, config)
  const groups = []
  const byKey = {}

  for (let i = 0; i < valid.length; i++) {
    const event = valid[i]
    const date = new Date(event.startMs)
    const key = event.dayKey || localDateKey(date)
    if (!byKey[key]) {
      byKey[key] = { key: key, title: daySectionTitle(event.startMs, now), items: [] }
      groups.push(byKey[key])
    }
    byKey[key].items.push(event)
  }
  return groups
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
