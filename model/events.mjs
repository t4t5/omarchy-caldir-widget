import { localDateKey } from "./dates.mjs"

function text(value) {
  return value === undefined || value === null ? "" : String(value)
}

function lower(value) {
  return text(value).trim().toLowerCase()
}

// Calendar bodies wrap meeting links in Outlook SafeLinks and Google
// `google.<tld>/url?q=…` redirects whose percent-encoded target hides query
// parameters (`?pwd%3DX`) from detection. Both unwrap loops are bounded and
// must make forward progress each pass so one malformed link can never wedge
// a refresh. Ported from MeetingBar's MeetingLinkDetector.
const MAX_UNWRAP_PASSES = 32
const SAFE_LINK_RE = /https:\/\/[^\s/"'<>]+\.safelinks\.protection\.outlook\.com\/[^\s"'<>]*?[?&]url=([^\s&"'<>]*)(?:&[^\s"'<>]*)?/
const GOOGLE_REDIRECT_RE = /https:\/\/(?:www\.)?google\.[a-z]{2,}(?:\.[a-z]{2,})?\/url\?q=([^\s&"'<>]+)(?:&(?:amp;)?[A-Za-z][A-Za-z0-9_]*=[^\s&"'<>]*)*/g

function decodedPercent(value) {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    return null
  }
}

function unwrapSafeLinks(input) {
  let current = input
  for (let pass = 0; pass < MAX_UNWRAP_PASSES; pass++) {
    const match = SAFE_LINK_RE.exec(current)
    if (!match) break
    const decoded = decodedPercent(match[1])
    if (decoded === null) break
    const updated = current.split(match[0]).join(decoded)
    if (updated === current) break
    current = updated
  }
  return current
}

// One pass splices every decodable redirect with its target, so the caller's
// pass cap bounds nesting depth rather than link count. An undecodable escape
// skips that match; aborting would strand every link after it.
function rewriteGoogleRedirects(input) {
  GOOGLE_REDIRECT_RE.lastIndex = 0
  let result = ""
  let copiedUpTo = 0
  let didRewrite = false
  let match
  while ((match = GOOGLE_REDIRECT_RE.exec(input)) !== null) {
    const decoded = decodedPercent(match[1])
    if (decoded === null) continue
    result += input.slice(copiedUpTo, match.index) + decoded
    copiedUpTo = match.index + match[0].length
    didRewrite = true
  }
  if (!didRewrite) return null
  result += input.slice(copiedUpTo)
  return result === input ? null : result
}

export function unwrapWrappedLinks(value) {
  let current = unwrapSafeLinks(text(value))
  for (let pass = 0; pass < MAX_UNWRAP_PASSES; pass++) {
    const rewritten = rewriteGoogleRedirects(current)
    if (rewritten === null) break
    current = rewritten
  }
  return current
}

// Initial provider catalogue ported from MeetingBar's MeetingLinkDetector.
// Keep these as separate expressions: it makes adding providers less risky
// than growing one large expression whose alternatives can shadow each other.
const VIDEO_LINK_PATTERNS = [
  /https?:\/\/meet\.google\.com\/[_a-z0-9-]+/gi,
  /https:\/\/(?:[a-z0-9-.]+)?zoom(?:-x)?\.(?:us|com|com\.cn|de)\/(?:my|[a-z]{1,2}|webinar)\/[-a-z0-9()@:%_+.~#?&=/]*/gi,
  /https?:\/\/(?:(?:gov\.)?teams\.microsoft\.(?:com|us)|teams\.live\.com)\/(?:l\/meetup-join\/[a-z0-9_%/=+.?-]+(?:&[^\s"'<>]+)?|meet\/\d+\?p=[a-z0-9_-]+(?:&[^\s"'<>]+)?)/gi,
  /https?:\/\/(?:[a-z0-9-]+\.)?webex\.com(?:(?:\/[-a-z0-9]+\/j\.php\?MTID=[a-z0-9]+(?:&[^\s"'<>]*)?)|(?:\/(?:meet|join)\/[-a-z0-9._@]+(?:\?[^\s"'<>]*)?))/gi,
  /https?:\/\/meet\.jit\.si\/[^\s"'<>]*/gi,
  /https?:\/\/whereby\.com\/[^\s"'<>]*/gi
]

// Longest match wins so a link carrying a password or token always beats a
// truncated copy of itself.
export function findVideoUrl(value) {
  const haystack = unwrapWrappedLinks(value)
  if (haystack.indexOf("://") === -1) return ""
  let best = ""
  for (let i = 0; i < VIDEO_LINK_PATTERNS.length; i++) {
    const pattern = VIDEO_LINK_PATTERNS[i]
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(haystack)) !== null) {
      if (match[0].length > best.length) best = match[0]
    }
  }
  return best
}

// Compatibility alias for custom imports and the existing event field name.
export const findMeetUrl = findVideoUrl

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
  event.status = status
  event.rsvp = rsvp
  event.cancelled = status === "cancelled"
  event.declined = rsvp === "declined"
  event.tentative = rsvp === "tentative" || rsvp === "needs-action"
  event.recurring = raw.recurring === true
  event.startMs = startMs
  event.endMs = endMs
  event.dayKey = localDateKey(new Date(startMs))
  event.videoUrl = findVideoUrl(event.location) || findVideoUrl(event.description)
  event.meetUrl = event.videoUrl
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
