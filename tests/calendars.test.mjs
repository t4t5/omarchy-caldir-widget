import assert from "node:assert/strict"
import test from "node:test"

import * as Model from "../Model.mjs"

const RENCAL = `notifications_enabled = true

[theme]
mode = "system"

[groups]
default = [
    "plan",
    "rbeckett-hurree-co", # mine
]
work = ["rbeckett-hurree-co"]
empty = []
`

test("normalizeCalendars reads the setting forms", () => {
  assert.deepEqual(Model.normalizeCalendars(null), { mode: "rencal", group: "default" })
  assert.deepEqual(Model.normalizeCalendars(""), { mode: "rencal", group: "default" })
  assert.deepEqual(Model.normalizeCalendars(" ALL "), { mode: "all" })
  assert.deepEqual(Model.normalizeCalendars("rencal:work"), { mode: "rencal", group: "work" })
  assert.deepEqual(Model.normalizeCalendars("a, b  a"), { mode: "list", slugs: ["a", "b"] })
  assert.deepEqual(Model.normalizeCalendars(["a", " ", "b"]), { mode: "list", slugs: ["a", "b"] })
  assert.deepEqual(Model.normalizeCalendars([]), { mode: "rencal", group: "default" })
})

test("parseRencalGroup reads single and multi-line groups", () => {
  assert.deepEqual(Model.parseRencalGroup(RENCAL, "default"), ["plan", "rbeckett-hurree-co"])
  assert.deepEqual(Model.parseRencalGroup(RENCAL, "work"), ["rbeckett-hurree-co"])
  assert.deepEqual(Model.parseRencalGroup(RENCAL, "empty"), [])
  assert.equal(Model.parseRencalGroup(RENCAL, "missing"), null)
  assert.equal(Model.parseRencalGroup("", "default"), null)
  assert.equal(Model.parseRencalGroup("[theme]\ndefault = [\"x\"]\n", "default"), null)
})

test("resolveCalendarFilter prefers the setting, then renCal, then all", () => {
  assert.deepEqual(Model.resolveCalendarFilter("a,b", RENCAL), ["a", "b"])
  assert.deepEqual(Model.resolveCalendarFilter("", RENCAL), ["plan", "rbeckett-hurree-co"])
  assert.deepEqual(Model.resolveCalendarFilter("rencal:work", RENCAL), ["rbeckett-hurree-co"])
  assert.equal(Model.resolveCalendarFilter("all", RENCAL), null)
  assert.equal(Model.resolveCalendarFilter("", ""), null)
  assert.equal(Model.resolveCalendarFilter("rencal:empty", RENCAL), null)
})

test("filterByCalendars keeps allowed calendars only", () => {
  const events = [{ calendar: "plan" }, { calendar: "aaron-hurree-co" }]
  assert.deepEqual(Model.filterByCalendars(events, ["plan"]), [{ calendar: "plan" }])
  assert.deepEqual(Model.filterByCalendars(events, null), events)
  // QML hands Repeater lists over as array-likes rather than Arrays.
  const qmlList = { length: 2, 0: events[0], 1: events[1] }
  assert.deepEqual(Model.filterByCalendars(qmlList, ["plan"]), [{ calendar: "plan" }])
  assert.deepEqual(Model.filterByCalendars(null, ["plan"]), [])
})

test("listRencalGroups lists [groups] keys in order", () => {
  assert.deepEqual(Model.listRencalGroups(RENCAL), ["default", "work", "empty"])
  assert.deepEqual(Model.listRencalGroups(""), [])
})

test("normalizedEvent reads Google's event type", () => {
  const event = Model.normalizedEvent({
    start: "2026-10-13",
    end: "2026-10-14",
    all_day: true,
    calendar: "plan",
    x_properties: [{ name: "X-GOOGLE-EVENT-TYPE", params: [], value: "workingLocation" }]
  }, {})
  assert.equal(event.eventType, Model.WORKING_LOCATION_EVENT_TYPE)
  assert.equal(Model.normalizedEvent({ start: "2026-10-13T09:00:00Z" }, {}).eventType, "")
})

test("filterEvents hides all-day and working location events on request", () => {
  const timed = { calendar: "plan", all_day: false, eventType: "" }
  const holiday = { calendar: "plan", all_day: true, eventType: "" }
  const home = { calendar: "plan", all_day: true, eventType: "workinglocation" }
  const other = { calendar: "aaron-hurree-co", all_day: false, eventType: "" }
  const events = [timed, holiday, home, other]
  assert.deepEqual(Model.filterEvents(events, {}), events)
  assert.deepEqual(Model.filterEvents(events, { calendars: ["plan"] }), [timed, holiday, home])
  assert.deepEqual(Model.filterEvents(events, { hideWorkingLocation: true }), [timed, holiday, other])
  assert.deepEqual(Model.filterEvents(events, { hideAllDay: true }), [timed, other])
})

test("normalizeHide* settings accept booleans and strings", () => {
  assert.equal(Model.normalizeHideAllDay(true), true)
  assert.equal(Model.normalizeHideAllDay("yes"), true)
  assert.equal(Model.normalizeHideAllDay(null), false)
  assert.equal(Model.normalizeHideWorkingLocation("false"), false)
  assert.equal(Model.normalizeHideWorkingLocation("nonsense"), false)
})

test("parseCalendarList keeps name, slug, and color", () => {
  const list = Model.parseCalendarList(JSON.stringify([
    { slug: "plan", name: "Plan", color: "#AABBCC" },
    { slug: "", name: "skipped" },
    { slug: "todoist" }
  ]))
  assert.deepEqual(list, [
    { slug: "plan", name: "Plan", color: "#aabbcc" },
    { slug: "todoist", name: "todoist", color: "" }
  ])
})
