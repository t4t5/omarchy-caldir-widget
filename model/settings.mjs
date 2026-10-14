// shell.json is hand-editable, so the manifest's types and bounds constrain
// the settings UI but not the file. Everything is re-checked here.

export const HIGHLIGHT_EVENTS_MEETINGS = "meetings"
export const HIGHLIGHT_EVENTS_ALL = "all"

export const DAYS_AHEAD = {
  key: "daysAhead",
  defaultValue: 2,
  min: 1,
  max: 30
}

export const LOOKAHEAD_MINUTES = {
  key: "lookaheadMinutes",
  defaultValue: 30,
  min: 1,
  max: 1440
}

export const HIGHLIGHT_EVENTS = {
  key: "highlightEvents",
  defaultValue: HIGHLIGHT_EVENTS_MEETINGS,
  options: [HIGHLIGHT_EVENTS_MEETINGS, HIGHLIGHT_EVENTS_ALL]
}

// Unusable values fall back to the default; out-of-range ones clamp, on the
// grounds that the user asked for more than we offer rather than for nothing.
function normalizeInteger(value, spec) {
  if (value === undefined || value === null) return spec.defaultValue
  if (typeof value === "string" && value.trim() === "") return spec.defaultValue

  const number = Math.floor(Number(value))
  if (!isFinite(number)) return spec.defaultValue
  if (number < spec.min) return spec.min
  if (number > spec.max) return spec.max
  return number
}

function normalizeEnum(value, spec) {
  const wanted = String(value === undefined || value === null ? "" : value)
    .trim()
    .toLowerCase()

  for (let i = 0; i < spec.options.length; i++) {
    if (spec.options[i].toLowerCase() === wanted) return spec.options[i]
  }
  return spec.defaultValue
}

export function normalizeDaysAhead(value) {
  return normalizeInteger(value, DAYS_AHEAD)
}

export function normalizeLookaheadMinutes(value) {
  return normalizeInteger(value, LOOKAHEAD_MINUTES)
}

export function normalizeHighlightEvents(value) {
  return normalizeEnum(value, HIGHLIGHT_EVENTS)
}

export const HIDE_ALL_DAY = {
  key: "hideAllDay",
  defaultValue: false
}

export const HIDE_WORKING_LOCATION = {
  key: "hideWorkingLocation",
  defaultValue: false
}

// Accepts the JSON booleans the settings view writes and the strings a hand
// edit might leave behind.
function normalizeBoolean(value, spec) {
  if (typeof value === "boolean") return value
  const wanted = String(value === undefined || value === null ? "" : value).trim().toLowerCase()
  if (wanted === "true" || wanted === "1" || wanted === "yes") return true
  if (wanted === "false" || wanted === "0" || wanted === "no") return false
  return spec.defaultValue
}

export function normalizeHideAllDay(value) {
  return normalizeBoolean(value, HIDE_ALL_DAY)
}

export function normalizeHideWorkingLocation(value) {
  return normalizeBoolean(value, HIDE_WORKING_LOCATION)
}
