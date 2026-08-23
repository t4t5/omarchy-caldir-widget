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

  const rsvp = lower(raw.rsvp)

  const parsedEndMs = Date.parse(raw.end)
  const endMs = isNaN(parsedEndMs) ? startMs : Math.max(startMs, parsedEndMs)
  const location = text(raw.location)
  const description = text(raw.description)
  const conferenceUrl = getConferenceUrl({
    url: text(raw.url),
    location,
    description,
    x_properties: Array.isArray(raw.x_properties) ? raw.x_properties : []
  })

  return {
    instance_id: text(raw.instance_id),
    uid: text(raw.uid),
    calendar: text(raw.calendar),
    title: text(raw.title).trim() || "Untitled event",
    all_day: raw.all_day === true,
    start: text(raw.start),
    end: text(raw.end),
    location,
    description,
    rsvp,
    declined: rsvp === "declined",
    tentative: rsvp === "tentative" || rsvp === "needs-action",
    recurring: raw.recurring === true,
    startMs,
    endMs,
    conferenceUrl
  }
}

// Start ascending, longest first on ties, then title. This is the only sort in
// the model; the selectors in select.mjs assume their input keeps this order.
function compareEvents(a, b) {
  if (a.startMs !== b.startMs) return a.startMs - b.startMs
  if (a.endMs !== b.endMs) return b.endMs - a.endMs
  return a.title.localeCompare(b.title)
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
  events.sort(compareEvents)
  return events
}
