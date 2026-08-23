import { getConferenceUrl } from "./conference.mjs"

function text(value) {
  return value === undefined || value === null ? "" : String(value)
}

function lower(value) {
  return text(value).trim().toLowerCase()
}

export function normalizedEvent(raw) {
  if (!raw || typeof raw !== "object") return null

  const startMs = Date.parse(raw.start)
  if (isNaN(startMs)) return null

  const status = lower(raw.status)
  const rsvp = lower(raw.rsvp)

  const parsedEndMs = Date.parse(raw.end)
  const endMs = isNaN(parsedEndMs) ? startMs : Math.max(startMs, parsedEndMs)
  const event = {}
  for (const key in raw) event[key] = raw[key]

  event.instance_id = text(raw.instance_id)
  event.uid = text(raw.uid)
  event.calendar = text(raw.calendar)
  event.title = text(raw.title).trim() || "Untitled event"
  event.all_day = raw.all_day === true
  event.start = text(raw.start)
  event.end = text(raw.end)
  event.tzid = text(raw.tzid)
  event.location = text(raw.location)
  event.description = text(raw.description)
  event.url = text(raw.url)
  event.x_properties = Array.isArray(raw.x_properties) ? raw.x_properties : []
  event.status = status
  event.rsvp = rsvp
  event.cancelled = status === "cancelled"
  event.declined = rsvp === "declined"
  event.tentative = rsvp === "tentative" || rsvp === "needs-action"
  event.recurring = raw.recurring === true
  event.startMs = startMs
  event.endMs = endMs
  event.conferenceUrl = getConferenceUrl(event)
  return event
}

// Invalid JSON is exceptional so the QML caller can retain last-good data.
export function parseAgenda(stdout) {
  const parsed = JSON.parse(text(stdout))
  if (!Array.isArray(parsed)) throw new Error("caldir output must be a JSON array")

  const events = []
  for (let i = 0; i < parsed.length; i++) {
    const event = normalizedEvent(parsed[i])
    if (event) events.push(event)
  }
  events.sort(function(a, b) {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs
    if (a.endMs !== b.endMs) return b.endMs - a.endMs
    return a.title.localeCompare(b.title)
  })
  return events
}
