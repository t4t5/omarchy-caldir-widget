import assert from "node:assert/strict"
import test from "node:test"
import * as Model from "../Model.mjs"

const now = new Date("2026-10-28T10:00:00Z")
function meeting(minutes, extra = {}) {
  return {
    uid: "meeting-" + minutes,
    title: "Meeting in " + minutes + " minutes",
    start: new Date(now.getTime() + minutes * Model.MINUTE_MS).toISOString(),
    end: new Date(now.getTime() + (minutes + 30) * Model.MINUTE_MS).toISOString(),
    rsvp: "accepted",
    url: "https://meet.google.com/abc-defg-hij",
    ...extra
  }
}
function select(entries, options) {
  return Model.meetingSelections(Model.parseAgenda(JSON.stringify(entries)), now, options)
}

test("the tooltip previews a meeting four hours away while the bar stays quiet", () => {
  const result = select([meeting(240)])
  assert.equal(result.bar, null)
  assert.equal(result.tooltip.title, "Meeting in 240 minutes")
})

test("the tooltip reaches past any bar lookahead", () => {
  const twoDays = 2 * 24 * 60
  assert.equal(select([meeting(twoDays)]).tooltip.title, "Meeting in " + twoDays + " minutes")
  assert.equal(select([meeting(twoDays)], { lookaheadMinutes: 1440 }).bar, null)
})

test("the tooltip matches the bar whenever the bar shows a meeting", () => {
  for (const lookaheadMinutes of [1, 30, 480, 1440]) {
    const result = select([meeting(lookaheadMinutes), meeting(lookaheadMinutes + 60)], { lookaheadMinutes })
    assert.equal(result.bar.title, "Meeting in " + lookaheadMinutes + " minutes")
    assert.equal(result.tooltip.title, result.bar.title)
  }
})

test("the bar still starts at thirty minutes", () => {
  assert.equal(select([meeting(31)]).bar, null)
  assert.equal(select([meeting(30)]).bar.title, "Meeting in 30 minutes")
})

test("both selections preserve declined, pending, tentative and all-day filters", () => {
  const result = select([
    meeting(5, { rsvp: "declined" }),
    meeting(10, { rsvp: "needs_action" }),
    meeting(15, { rsvp: "tentative" }),
    meeting(20, { all_day: true }),
    meeting(25)
  ])
  assert.equal(result.bar.title, "Meeting in 25 minutes")
  assert.equal(result.tooltip.title, "Meeting in 25 minutes")
  assert.equal(select([meeting(240, { url: null })]).tooltip, null)
  assert.equal(select([meeting(240, { url: null })], { highlightEvents: "all" }).tooltip.title, "Meeting in 240 minutes")
})

test("distant meetings count down rather than repeating their start time", () => {
  const status = minutes => Model.relativeStatus(select([meeting(minutes)]).tooltip, now)
  assert.equal(status(18), "starts in 18 min")
  assert.equal(status(60), "starts in 1h")
  assert.equal(status(172), "starts in 2h 52m")
})
