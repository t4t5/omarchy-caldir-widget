function text(value) {
  return value === undefined || value === null ? "" : String(value)
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

function unwrapWrappedLinks(value) {
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
const VIDEO_PROVIDERS = [
  { name: "Google Meet", pattern: /https?:\/\/meet\.google\.com\/[_a-z0-9-]+/gi },
  { name: "Zoom", pattern: /https:\/\/(?:[a-z0-9-.]+)?zoom(?:-x)?\.(?:us|com|com\.cn|de)\/(?:my|[a-z]{1,2}|webinar)\/[-a-z0-9()@:%_+.~#?&=/]*/gi },
  { name: "Microsoft Teams", pattern: /https?:\/\/(?:(?:gov\.)?teams\.microsoft\.(?:com|us)|teams\.live\.com)\/(?:l\/meetup-join\/[a-z0-9_%/=+.?-]+(?:&[^\s"'<>]+)?|meet\/\d+\?p=[a-z0-9_-]+(?:&[^\s"'<>]+)?)/gi },
  { name: "Webex", pattern: /https?:\/\/(?:[a-z0-9-]+\.)?webex\.com(?:(?:\/[-a-z0-9]+\/j\.php\?MTID=[a-z0-9]+(?:&[^\s"'<>]*)?)|(?:\/(?:meet|join)\/[-a-z0-9._@]+(?:\?[^\s"'<>]*)?))/gi },
  { name: "Jitsi", pattern: /https?:\/\/meet\.jit\.si\/[^\s"'<>]*/gi },
  { name: "Whereby", pattern: /https?:\/\/whereby\.com\/[^\s"'<>]*/gi },
  { name: "Proton Meet", pattern: /https?:\/\/meet\.proton\.me\/[^\s"'<>]*/gi }
]

// Provider-owned conference properties are authoritative. Their order mirrors
// rencal's caldir route so an event containing conflicting provider metadata is
// interpreted consistently in both applications. A present-but-empty property
// represents a conference request that has not been provisioned yet.
const CONFERENCE_PROPERTY_NAMES = [
  "X-GOOGLE-CONFERENCE",
  "X-OUTLOOK-CONFERENCE",
  "X-PM-CONFERENCE-URL"
]

function conferenceProperty(xProperties) {
  const properties = Array.isArray(xProperties) ? xProperties : []
  for (let nameIndex = 0; nameIndex < CONFERENCE_PROPERTY_NAMES.length; nameIndex++) {
    const expectedName = CONFERENCE_PROPERTY_NAMES[nameIndex]
    for (let propertyIndex = 0; propertyIndex < properties.length; propertyIndex++) {
      const property = properties[propertyIndex]
      if (!property || typeof property !== "object") continue
      if (text(property.name).trim().toUpperCase() !== expectedName) continue
      return { present: true, url: text(property.value).trim() }
    }
  }
  return { present: false, url: "" }
}

// Longest match wins so a link carrying a password or token always beats a
// truncated copy of itself.
export function findVideoUrl(value) {
  const haystack = unwrapWrappedLinks(value)
  if (haystack.indexOf("://") === -1) return ""
  let best = ""
  for (let i = 0; i < VIDEO_PROVIDERS.length; i++) {
    const pattern = VIDEO_PROVIDERS[i].pattern
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(haystack)) !== null) {
      if (match[0].length > best.length) best = match[0]
    }
  }
  return best
}

export function conferenceName(value) {
  const haystack = unwrapWrappedLinks(value)
  for (let i = 0; i < VIDEO_PROVIDERS.length; i++) {
    const provider = VIDEO_PROVIDERS[i]
    provider.pattern.lastIndex = 0
    if (provider.pattern.test(haystack)) return provider.name
  }
  return "Meeting"
}

export function getConferenceUrl(event) {
  const source = event && typeof event === "object" ? event : {}
  const declaredConference = conferenceProperty(source.x_properties)
  return declaredConference.present
    ? declaredConference.url
    : findVideoUrl(source.url) || findVideoUrl(source.location) || findVideoUrl(source.description)
}
