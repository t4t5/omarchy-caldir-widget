// Limits for untrusted calendar data; string sizes use UTF-16 code units.
export const MAX_OUTPUT_CHARS = 2 * 1024 * 1024
export const MAX_EVENTS = 500
export const MAX_CALENDARS = 200
export const MAX_X_PROPERTIES = 50
export const MAX_ID_CHARS = 512
export const MAX_TITLE_CHARS = 200
export const MAX_DATE_CHARS = 64
export const MAX_URL_CHARS = 2048
export const MAX_FREEFORM_CHARS = 8192
export const MAX_PROPERTY_NAME_CHARS = 128
export const MAX_COLOR_CHARS = 32
export const MAX_ENUM_CHARS = 32

function scalarText(value) {
  if (value === undefined || value === null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return ""
}

export function clamped(value, limit) {
  const string = scalarText(value)
  return string.length > limit ? string.slice(0, limit) : string
}

// Reject overlong structured fields instead of truncating them.
export function limited(value, limit) {
  const string = scalarText(value)
  return string.length > limit ? "" : string
}

export function assertOutputWithinLimit(output) {
  if (output.length > MAX_OUTPUT_CHARS) {
    throw new Error("caldir output exceeds " + MAX_OUTPUT_CHARS + " characters")
  }
}
