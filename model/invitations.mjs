import { normalizedEvent } from "./events.mjs"
import { meetingTimeLabel, daySectionDate } from "./format.mjs"
import { MAX_EVENTS, MAX_ID_CHARS, MAX_TITLE_CHARS, assertOutputWithinLimit, clamped, limited } from "./limits.mjs"

export const INVITATION_ACTIONS = ["maybe", "decline", "accept"]

export function rsvpPushSucceeded(exitCode, stdout) {
  return exitCode === 0 && /(?:^|\n)Pushed: \d+ created, [1-9]\d* updated, \d+ deleted(?:\r?\n|$)/.test(stdout)
}

function invitePath(value) {
  const path = limited(value, 4096)
  return path.startsWith("/") && path.endsWith(".ics") && !path.includes("\0") ? path : ""
}

// caldir expands recurring invites. One source file means one RSVP, so show
// its earliest occurrence once; overrides with their own files remain separate.
export function parseInvitations(stdout, calendarColors) {
  assertOutputWithinLimit(stdout)
  const parsed = JSON.parse(stdout)
  if (!Array.isArray(parsed)) throw new Error("caldir output must be a JSON array")
  if (parsed.length > MAX_EVENTS) throw new Error("caldir output exceeds " + MAX_EVENTS + " events")
  const invites = []
  for (const raw of parsed) {
    const event = normalizedEvent(raw, calendarColors)
    if (!event || event.rsvp !== "needs-action" || raw.status === "cancelled") continue
    const path = invitePath(raw.path)
    const calendar = limited(raw.calendar, MAX_ID_CHARS)
    if (!path || !calendar) throw new Error("Invitation is missing its RSVP file or calendar. Update caldir and retry.")
    const organizer = raw.organizer || {}
    const email = clamped(organizer.email, MAX_TITLE_CHARS)
    const name = clamped(organizer.name, MAX_TITLE_CHARS)
    event.path = path
    event.calendar = calendar
    event.organizer = name && email ? name + " <" + email + ">" : name || email
    invites.push(event)
  }
  invites.sort((a, b) => a.startMs - b.startMs)
  const seen = new Set()
  return invites.filter(event => {
    if (seen.has(event.path)) return false
    seen.add(event.path)
    return true
  })
}

export function invitationTimeLabel(event, now, timeFormat) {
  if (!event) return ""
  if (!event.all_day) return meetingTimeLabel(event.startMs, event.endMs, now, timeFormat)
  // Date-only values are calendar dates, not UTC instants.
  const date = new Date(event.start + "T12:00:00")
  return daySectionDate(date.getTime()) + " · All day"
}

export function rsvpCommand(executable, event, response) {
  if (!event || !invitePath(event.path) || INVITATION_ACTIONS.indexOf(response) < 0)
    throw new Error("Invalid invitation response")
  return [executable, "rsvp", "--", event.path, response]
}
