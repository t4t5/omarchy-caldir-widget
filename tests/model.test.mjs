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

test("parseAgenda keeps cancelled and declined events but drops invalid events", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00"),
    event("2026-08-19T12:00:00+01:00", { status: "CANCELLED" }),
    event("2026-08-19T13:00:00+01:00", { rsvp: "Declined" }),
    event("not-a-date")
  ]))
  assert.equal(parsed.length, 3)
  assert.equal(parsed[0].cancelled, false)
  assert.equal(parsed[0].declined, false)
  assert.equal(parsed[1].cancelled, true)
  assert.equal(parsed[1].declined, false)
  assert.equal(parsed[2].cancelled, false)
  assert.equal(parsed[2].declined, true)
})

test("parseAgenda rejects malformed and non-array output", () => {
  assert.throws(() => Model.parseAgenda("{"), SyntaxError)
  assert.throws(() => Model.parseAgenda('{"events":[]}'), /JSON array/)
})

test("findVideoUrl scans both location and description", () => {
  const zoomUrl = "https://us02web.zoom.us/j/123456789?pwd=unchanged"
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", { location: "Room · https://meet.google.com/abc-defg-hij" }),
    event("2026-08-19T12:00:00+01:00", { description: "Join HTTPS://MEET.GOOGLE.COM/xyz-abcd-efg." }),
    event("2026-08-19T13:00:00+01:00", { location: zoomUrl })
  ]))
  assert.equal(parsed[0].meetUrl, "https://meet.google.com/abc-defg-hij")
  assert.equal(parsed[0].videoUrl, "https://meet.google.com/abc-defg-hij")
  assert.equal(parsed[1].meetUrl, "HTTPS://MEET.GOOGLE.COM/xyz-abcd-efg")
  assert.equal(parsed[2].videoUrl, zoomUrl)
  assert.equal(parsed[2].meetUrl, zoomUrl)
  assert.equal(Model.findVideoUrl("not a call"), "")
})

test("findVideoUrl detects the supported video providers", () => {
  const cases = [
    ["Google Meet", "https://meet.google.com/abc-defg-hij"],
    ["Zoom meeting", "https://us02web.zoom.us/j/123456789?pwd=secret"],
    ["Zoom webinar", "https://acme.zoom.us/w/987654321?tk=token"],
    ["Microsoft Teams", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_example?context=abc&anon=true"],
    ["Microsoft Teams short link", "https://teams.live.com/meet/9425716001426?p=0SystrMw2goKHi8LK6"],
    ["Cisco Webex", "https://example.webex.com/meet/alice.smith?token=abc"],
    ["Jitsi", "https://meet.jit.si/team-standup#config.prejoinPageEnabled=false"],
    ["Whereby", "https://whereby.com/team-room?roomKey=abc"]
  ]

  for (const [provider, url] of cases) {
    assert.equal(Model.findVideoUrl("Join " + url), url, provider)
  }
})

test("meet links survive Google redirect and Outlook SafeLinks wrappers", () => {
  const redirect = "https://www.google.com/url?q=https%3A%2F%2Fmeet.google.com%2Fabc-defg-hij&sa=D&source=calendar"
  assert.equal(Model.findMeetUrl(redirect), "https://meet.google.com/abc-defg-hij")

  const safeLink = "https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fmeet.google.com%2Fklm-nopq-rst&data=05%7C01"
  assert.equal(Model.findMeetUrl(safeLink), "https://meet.google.com/klm-nopq-rst")

  const nested = "https://www.google.com/url?q=" + encodeURIComponent(redirect)
  assert.equal(Model.findMeetUrl(nested), "https://meet.google.com/abc-defg-hij")
})

test("a Zoom link survives an Outlook SafeLinks wrapper", () => {
  const zoom = "https://us02web.zoom.us/j/123456789?pwd=secret"
  const safeLink = "https://eur01.safelinks.protection.outlook.com/?url=" + encodeURIComponent(zoom) + "&data=05%7C01"
  assert.equal(Model.findVideoUrl(safeLink), zoom)
})

test("a malformed redirect escape never blocks later links", () => {
  const mixed = "https://www.google.com/url?q=%ZZbroken and https://www.google.com/url?q=https%3A%2F%2Fmeet.google.com%2Fabc-defg-hij"
  assert.equal(Model.findMeetUrl(mixed), "https://meet.google.com/abc-defg-hij")
})

test("location outranks description and the longest match wins per source", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", {
      location: "https://meet.google.com/abc",
      description: "https://meet.google.com/abc-defg-hij"
    })
  ]))
  assert.equal(parsed[0].meetUrl, "https://meet.google.com/abc")

  const both = "https://meet.google.com/abc then https://meet.google.com/abc-defg-hij"
  assert.equal(Model.findMeetUrl(both), "https://meet.google.com/abc-defg-hij")
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

test("an ongoing call hands the bar over ten minutes before the next one", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T09:30:00+01:00", {
      title: "Ongoing",
      end: "2026-08-19T10:30:00+01:00",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    }),
    event("2026-08-19T10:08:00+01:00", {
      title: "Next",
      description: "https://meet.google.com/ddd-eeee-fff"
    })
  ]))
  assert.equal(Model.nextMeeting(parsed, NOW, { lookaheadDays: 3 }).title, "Next")
})

test("the handover never skips ahead between two future calls", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:02:00+01:00", {
      title: "First",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    }),
    event("2026-08-19T10:08:00+01:00", {
      title: "Second",
      description: "https://meet.google.com/ddd-eeee-fff"
    })
  ]))
  assert.equal(Model.nextMeeting(parsed, NOW, { lookaheadDays: 3 }).title, "First")
})

test("an event ending inside the one-minute grace window is never next", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T09:00:00+01:00", {
      title: "Almost over",
      end: "2026-08-19T10:00:30+01:00",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    }),
    event("2026-08-19T14:00:00+01:00", {
      title: "Afternoon",
      description: "https://meet.google.com/ddd-eeee-fff"
    })
  ]))
  assert.equal(Model.nextMeeting(parsed, NOW, { lookaheadDays: 3 }).title, "Afternoon")
})

test("tentative invitations stay off the bar but keep their schedule slot", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:30:00+01:00", {
      title: "Maybe",
      rsvp: "Tentative",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    }),
    event("2026-08-19T11:00:00+01:00", {
      title: "Sure",
      rsvp: "needs-action",
      description: "https://meet.google.com/ddd-eeee-fff"
    }),
    event("2026-08-19T12:00:00+01:00", {
      title: "Confirmed",
      description: "https://meet.google.com/ggg-hhhh-iii"
    })
  ]))
  assert.equal(parsed[0].tentative, true)
  assert.equal(parsed[1].tentative, true)
  assert.equal(parsed[2].tentative, false)
  assert.equal(Model.nextMeeting(parsed, NOW, { lookaheadDays: 3 }).title, "Confirmed")

  const groups = Model.buildScheduleGroups(parsed, NOW, { lookaheadDays: 3, maxRows: 20 })
  assert.deepEqual(groups[0].items.map(item => item.title), ["Maybe", "Sure", "Confirmed"])
})

test("cancelled and declined events stay off the bar but keep their schedule slots", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:30:00+01:00", {
      title: "Cancelled",
      status: "cancelled",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    }),
    event("2026-08-19T11:00:00+01:00", {
      title: "Declined",
      rsvp: "declined",
      description: "https://meet.google.com/ddd-eeee-fff"
    }),
    event("2026-08-19T12:00:00+01:00", {
      title: "Confirmed",
      description: "https://meet.google.com/ggg-hhhh-iii"
    })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW, { lookaheadDays: 3 }).title, "Confirmed")
  assert.deepEqual(
    Model.buildUpcoming(parsed, NOW, { lookaheadDays: 3 }).map(item => item.title),
    ["Confirmed"]
  )

  const groups = Model.buildScheduleGroups(parsed, NOW, { lookaheadDays: 3, maxRows: 20 })
  assert.deepEqual(groups[0].items.map(item => item.title), ["Cancelled", "Declined", "Confirmed"])
})

test("the schedule keeps events that already ended today", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-18T11:00:00+01:00", { title: "Yesterday" }),
    event("2026-08-19T08:00:00+01:00", { title: "Done", end: "2026-08-19T08:30:00+01:00" }),
    event("2026-08-19T11:00:00+01:00", { title: "Later" })
  ]))
  const groups = Model.buildScheduleGroups(parsed, NOW, { lookaheadDays: 3, maxRows: 20 })
  assert.deepEqual(groups.map(group => group.key), ["2026-08-19"])
  assert.deepEqual(groups[0].items.map(item => item.title), ["Done", "Later"])
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
  assert.equal(Model.formatUpdated(new Date(NOW.getTime() - 5 * Model.MINUTE_MS), NOW), "5m ago")
  assert.equal(Model.truncate("A very long event", 8), "A very…")
})
