import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import * as Model from "../Model.mjs"

const now = new Date("2026-09-10T12:00:00+01:00")
function invite(extra = {}) {
  return {
    uid: "planning@example.com", title: "Planning", calendar: "work",
    path: "/tmp/work/planning.ics", rsvp: "needs_action",
    start: "2026-09-11T14:00:00+01:00", end: "2026-09-11T15:00:00+01:00",
    organizer: { name: "Alice", email: "alice@example.com" }, ...extra
  }
}
const parse = entries => Model.parseInvitations(JSON.stringify(entries))

test("caldir's snake_case pending status stays out of the meeting highlight", () => {
  for (const rsvp of ["needs_action", "NEEDS-ACTION"]) {
    const events = Model.parseAgenda(JSON.stringify([invite({ rsvp, url: "https://meet.google.com/abc-defg-hij" })]))
    assert.equal(events[0].rsvp, "needs-action")
    assert.equal(events[0].tentative, true)
    assert.equal(Model.nextMeeting(events, new Date("2026-09-11T13:50:00+01:00"), { highlightEvents: "all" }), null)
  }
})

test("pending invitations include organizer, all-day events and dates beyond the agenda", () => {
  const parsed = parse([invite(), invite({ path: "/tmp/work/trip.ics", all_day: true,
    start: "2026-09-30", end: "2026-10-01", organizer: { email: "host@example.com" } })])
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].organizer, "Alice <alice@example.com>")
  assert.equal(parsed[1].organizer, "host@example.com")
  assert.equal(Model.invitationTimeLabel(parsed[0], now, "12h"), "Tomorrow · 2:00pm–3:00pm")
  assert.match(Model.invitationTimeLabel(parsed[1], now, "24h"), /30.*All day/)
})

test("responded and cancelled events never count as pending invitations", () => {
  const entries = ["accepted", "declined", "tentative", null, "invalid"].map(rsvp => invite({ rsvp }))
  entries.push(invite({ status: "cancelled" }), null, invite({ start: "bad date" }))
  assert.deepEqual(parse(entries), [])
})

test("count one RSVP per source file while preserving recurring overrides", () => {
  const parsed = parse([
    invite({ start: "2026-09-18T14:00:00+01:00", recurring: true }),
    invite({ recurring: true }),
    invite({ path: "/tmp/work/override.ics", recurring: true, start: "2026-09-15T14:00:00+01:00" }),
    invite({ calendar: "personal", path: "/tmp/personal/planning.ics" })
  ])
  assert.equal(parsed.length, 3)
  assert.equal(parsed[0].start, "2026-09-11T14:00:00+01:00")
  assert.equal(parsed[2].path, "/tmp/work/override.ics")
})

test("reject unusable invitation output and unsafe or truncated RSVP identifiers", () => {
  for (const path of [null, "relative.ics", "--help", "/tmp/no-extension", "/tmp/a\0.ics", "/" + "a".repeat(4096) + ".ics"])
    assert.throws(() => parse([invite({ path })]), /RSVP file/)
  assert.throws(() => parse([invite({ calendar: "x".repeat(513) })]), /calendar/)
  assert.throws(() => Model.parseInvitations("No pending invites."), SyntaxError)
  assert.throws(() => Model.parseInvitations("{}"), /JSON array/)
  assert.throws(() => parse(Array(Model.MAX_EVENTS + 1).fill(invite())), /exceeds/)
  assert.throws(() => Model.parseInvitations(" ".repeat(Model.MAX_OUTPUT_CHARS + 1)), /exceeds/)
})

test("RSVP commands pass hostile filenames literally, and allow only the three responses", () => {
  const event = parse([invite({ path: "/tmp/work/a ' $(echo injected) `echo injected`.ics" })])[0]
  for (const response of Model.INVITATION_ACTIONS) {
    const argv = Model.rsvpCommand("caldir", event, response)
    const command = Model.boundedCommand([process.execPath, "-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))", ...argv])
    const result = spawnSync(command[0], command.slice(1), { encoding: "utf8" })
    assert.equal(result.status, 0)
    assert.deepEqual(JSON.parse(result.stdout), ["caldir", "rsvp", "--", event.path, response])
  }
  assert.throws(() => Model.rsvpCommand("caldir", event, "delete"), /Invalid/)
  assert.throws(() => Model.rsvpCommand("caldir", null, "accept"), /Invalid/)
})

test("provider failure with a successful caldir exit does not claim the response was sent", () => {
  assert.equal(Model.rsvpPushSucceeded(0, "work\n   Provider failed: offline\n"), false)
  assert.equal(Model.rsvpPushSucceeded(0, "No changes to push\n"), false)
  assert.equal(Model.rsvpPushSucceeded(0, "Pushed: 1 created, 0 updated, 0 deleted\n"), false)
  assert.equal(Model.rsvpPushSucceeded(0, "work\n\nPushed: 0 created, 1 updated, 0 deleted\n"), true)
  assert.equal(Model.rsvpPushSucceeded(1, "Pushed: 0 created, 1 updated, 0 deleted\n"), false)
})
