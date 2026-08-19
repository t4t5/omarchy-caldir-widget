import assert from "node:assert/strict"
import test from "node:test"

import * as Model from "../Model.mjs"

const NOW = new Date("2026-08-19T10:00:00+01:00")

function event(start, extra = {}) {
  const startMs = Date.parse(start)
  return {
    instance_id: start,
    uid: start,
    calendar: "personal",
    title: "Event",
    all_day: false,
    start: start,
    end: isNaN(startMs) ? "not-a-date" : new Date(startMs + 30 * Model.MINUTE_MS).toISOString(),
    location: "",
    description: "",
    status: "confirmed",
    rsvp: "accepted",
    recurring: false,
    ...extra
  }
}

test("parseAgenda normalizes and sorts a bare caldir array", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T12:00:00+01:00", { title: "Later" }),
    event("2026-08-19T11:00:00+01:00", { title: "Soon", location: null })
  ]))

  assert.deepEqual(parsed.map(item => item.title), ["Soon", "Later"])
  assert.equal(parsed[0].location, "")
  assert.equal(parsed[0].dayKey, "2026-08-19")
  assert.equal(parsed[0].startMs, Date.parse("2026-08-19T11:00:00+01:00"))
})

test("parseAgenda drops cancelled, declined, and invalid events", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00"),
    event("2026-08-19T12:00:00+01:00", { status: "CANCELLED" }),
    event("2026-08-19T13:00:00+01:00", { rsvp: "Declined" }),
    event("not-a-date")
  ]))
  assert.equal(parsed.length, 1)
})

test("parseAgenda rejects malformed and non-array output", () => {
  assert.throws(() => Model.parseAgenda("{"), SyntaxError)
  assert.throws(() => Model.parseAgenda('{"events":[]}'), /JSON array/)
})

test("findMeetUrl scans both location and description", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", { location: "Room · https://meet.google.com/abc-defg-hij" }),
    event("2026-08-19T12:00:00+01:00", { description: "Join HTTPS://MEET.GOOGLE.COM/xyz-abcd-efg." })
  ]))
  assert.equal(parsed[0].meetUrl, "https://meet.google.com/abc-defg-hij")
  assert.equal(parsed[1].meetUrl, "HTTPS://MEET.GOOGLE.COM/xyz-abcd-efg")
  assert.equal(Model.findMeetUrl("not a call"), "")
})

test("nextMeeting chooses an ongoing call before future calls", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T09:30:00+01:00", {
      title: "Ongoing",
      end: "2026-08-19T10:30:00+01:00",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    }),
    event("2026-08-19T10:15:00+01:00", {
      title: "Soon",
      description: "https://meet.google.com/ddd-eeee-fff"
    })
  ]))
  assert.equal(Model.nextMeeting(parsed, NOW, { lookaheadDays: 3 }).title, "Ongoing")
})

test("the video-link filter only affects the bar meeting list", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:10:00+01:00", { title: "No link" }),
    event("2026-08-19T10:20:00+01:00", {
      title: "Video",
      description: "https://meet.google.com/abc-defg-hij"
    })
  ]))
  assert.equal(Model.nextMeeting(parsed, NOW, { showOnlyWithVideoLink: true }).title, "Video")
  assert.equal(Model.nextMeeting(parsed, NOW, { showOnlyWithVideoLink: false }).title, "No link")
  assert.equal(Model.buildScheduleGroups(parsed, NOW, { lookaheadDays: 3 })[0].items.length, 2)
})

test("schedule grouping uses today, tomorrow, and dated headings", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", { title: "Today" }),
    event("2026-08-20T11:00:00+01:00", { title: "Tomorrow" }),
    event("2026-08-21T11:00:00+01:00", { title: "Later" })
  ]))
  const groups = Model.buildScheduleGroups(parsed, NOW, { lookaheadDays: 3, maxRows: 20 })
  assert.deepEqual(groups.map(group => group.title), ["TODAY", "TOMORROW", "FRI 21 AUG"])
  assert.deepEqual(groups.map(group => group.key), ["2026-08-19", "2026-08-20", "2026-08-21"])
})

test("schedule repeats multi-day all-day events from today through their exclusive end", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-17", {
      title: "Trip",
      all_day: true,
      end: "2026-08-22"
    })
  ]))
  const groups = Model.buildScheduleGroups(parsed, NOW, { lookaheadDays: 3, maxRows: 20 })

  assert.deepEqual(groups.map(group => group.key), ["2026-08-19", "2026-08-20", "2026-08-21"])
  assert.deepEqual(groups.map(group => group.title), ["TODAY", "TOMORROW", "FRI 21 AUG"])
  assert.deepEqual(groups.map(group => group.items[0].title), ["Trip", "Trip", "Trip"])
})

test("schedule repeats timed events on each occupied day and excludes a midnight end", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T22:00:00+01:00", {
      title: "Hackathon",
      end: "2026-08-22T00:00:00+01:00"
    })
  ]))
  const groups = Model.buildScheduleGroups(parsed, NOW, { lookaheadDays: 3, maxRows: 20 })

  assert.deepEqual(groups.map(group => group.key), ["2026-08-19", "2026-08-20", "2026-08-21"])
  assert.deepEqual(groups.map(group => group.items[0].title), ["Hackathon", "Hackathon", "Hackathon"])
})

test("bar labels cover one minute, hours left, and cross-day events", () => {
  const oneMinute = Model.normalizedEvent(event("2026-08-19T10:01:00+01:00", { title: "Standup" }))
  assert.equal(Model.formatLabel(oneMinute, NOW, 40), "Standup · in 1 min")

  const longMeeting = Model.normalizedEvent(event("2026-08-19T09:00:00+01:00", {
    title: "Workshop",
    end: "2026-08-19T13:00:00+01:00"
  }))
  assert.equal(Model.formatLabel(longMeeting, NOW, 40), "Workshop · 3h left")

  const tomorrow = Model.normalizedEvent(event("2026-08-20T09:00:00+01:00", { title: "Planning" }))
  assert.equal(Model.formatLabel(tomorrow, NOW, 40), "Planning · Tmrw 09:00")
})

test("relative status and time formatting use precomputed timestamps", () => {
  const future = Model.normalizedEvent(event("2026-08-19T10:30:00+01:00"))
  assert.equal(Model.relativeStatus(future, NOW), "starts in 30 min")
  assert.equal(Model.meetingTimeLabel(future.startMs, future.endMs, NOW), "Today · 10:30–11:00")
  assert.equal(Model.formatDuration(future.startMs, future.endMs), "30m")

  const active = Model.normalizedEvent(event("2026-08-19T09:00:00+01:00", { end: "2026-08-19T13:00:00+01:00" }))
  assert.equal(Model.relativeStatus(active, NOW), "3h left")
})

test("upcomingToday includes ongoing events and excludes tomorrow", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T09:00:00+01:00", { end: "2026-08-19T10:30:00+01:00" }),
    event("2026-08-20T09:00:00+01:00")
  ]))
  assert.equal(Model.upcomingToday(parsed, NOW).length, 1)
})

test("queryRange uses local calendar-day arithmetic", () => {
  assert.deepEqual(Model.queryRange(NOW, 3), { from: "2026-08-19", to: "2026-08-22" })
  assert.equal(Model.localDateKey(Model.addLocalDays(new Date(2026, 7, 31), 1)), "2026-09-01")
})

test("calendar and update labels are stable", () => {
  assert.equal(Model.eventCalendarUrl(null, "https://calendar.google.com/calendar/u/2/"), "https://calendar.google.com/calendar/u/2/r")
  assert.equal(Model.formatUpdated(new Date(NOW.getTime() - 5 * Model.MINUTE_MS), NOW), "5m ago")
  assert.equal(Model.truncate("A very long event", 8), "A very…")
})
