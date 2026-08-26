import { getConferenceUrl } from "./conference.mjs"
import {
  MAX_CALENDARS,
  MAX_COLOR_CHARS,
  MAX_DATE_CHARS,
  MAX_ENUM_CHARS,
  MAX_EVENTS,
  MAX_FREEFORM_CHARS,
  MAX_ID_CHARS,
  MAX_TITLE_CHARS,
  MAX_URL_CHARS,
  assertOutputWithinLimit,
  clamped,
  limited
} from "./limits.mjs"

function text(value) {
  return value === undefined || value === null ? "" : String(value)
}

function lower(value) {
  return text(value).trim().toLowerCase()
}

function validCalendarColor(value) {
  const color = limited(value, MAX_COLOR_CHARS).trim()
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : ""
}

const RSVP_STATUSES = ["accepted", "declined", "tentative", "needs-action"]

function validRsvp(value) {
  const rsvp = lower(limited(value, MAX_ENUM_CHARS))
  return RSVP_STATUSES.indexOf(rsvp) !== -1 ? rsvp : ""
}

export function parseCalendarColors(stdout) {
  const input = text(stdout)
  assertOutputWithinLimit(input)
  const parsed = JSON.parse(input)
  if (!Array.isArray(parsed)) throw new Error("caldir output must be a JSON array")

  const colors = Object.create(null)
  for (let i = 0; i < Math.min(parsed.length, MAX_CALENDARS); i++) {
    const calendar = parsed[i]
    if (!calendar || typeof calendar !== "object") continue

    const slug = clamped(calendar.slug, MAX_ID_CHARS).trim()
    const color = validCalendarColor(calendar.color)
    if (slug !== "" && color !== "") colors[slug] = color
  }
  return colors
}

export function normalizedEvent(raw, calendarColors) {
  if (!raw || typeof raw !== "object") return null

  const start = limited(raw.start, MAX_DATE_CHARS)
  const startMs = Date.parse(start)
  if (isNaN(startMs)) return null

  const rsvp = validRsvp(raw.rsvp)

  const end = limited(raw.end, MAX_DATE_CHARS)
  const parsedEndMs = Date.parse(end)
  const endMs = isNaN(parsedEndMs) ? startMs : Math.max(startMs, parsedEndMs)
  const location = clamped(raw.location, MAX_FREEFORM_CHARS)
  const description = clamped(raw.description, MAX_FREEFORM_CHARS)
  const conferenceUrl = getConferenceUrl({
    url: limited(raw.url, MAX_URL_CHARS),
    location,
    description,
    x_properties: Array.isArray(raw.x_properties) ? raw.x_properties : []
  })

  const calendar = clamped(raw.calendar, MAX_ID_CHARS)
  const calendarColor = calendarColors && typeof calendarColors === "object"
    ? validCalendarColor(calendarColors[calendar])
    : ""

  return {
    uid: clamped(raw.uid, MAX_ID_CHARS),
    recurrence_id: clamped(raw.recurrence_id, MAX_ID_CHARS),
    calendar,
    calendarColor,
    title: clamped(raw.title, MAX_TITLE_CHARS).trim() || "Untitled event",
    all_day: raw.all_day === true,
    start,
    end,
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
export function parseAgenda(stdout, calendarColors) {
  const input = text(stdout)
  assertOutputWithinLimit(input)
  const parsed = JSON.parse(input)
  if (!Array.isArray(parsed)) throw new Error("caldir output must be a JSON array")
  if (parsed.length > MAX_EVENTS) {
    throw new Error("caldir output exceeds " + MAX_EVENTS + " events")
  }

  const events = []
  for (let i = 0; i < parsed.length; i++) {
    const event = normalizedEvent(parsed[i], calendarColors)
    if (event) events.push(event)
  }
  events.sort(compareEvents)
  return events
}
