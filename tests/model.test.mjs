import assert from "node:assert/strict"
import test from "node:test"

import * as Model from "../Model.mjs"

const NOW = new Date("2026-08-19T10:00:00+01:00")

function event(start, extra = {}) {
  const startMs = Date.parse(start)
  return {
    uid: start,
    recurrence_id: null,
    calendar: "personal",
    title: "Event",
    all_day: false,
    start: start,
    end: isNaN(startMs) ? "not-a-date" : new Date(startMs + 30 * Model.MINUTE_MS).toISOString(),
    location: "",
    description: "",
    rsvp: "accepted",
    recurring: false,
    ...extra
  }
}

test("only caldir's missing-calendar response selects the setup state", () => {
  assert.equal(Model.isNoCalendarsError("Error: No calendars found.\n\nConnect your first calendar with:\n  caldir connect <provider>"), true)
  assert.equal(Model.isNoCalendarsError("No calendars found.\r\n\r\nConnect your first calendar with:"), true)
  assert.equal(Model.isNoCalendarsError("No calendars found for this account"), false)
  assert.equal(Model.isNoCalendarsError("permission denied"), false)
})

test("calendar colors are keyed by slug and invalid entries are ignored", () => {
  const colors = Model.parseCalendarColors(JSON.stringify([
    { slug: "personal", color: "#F6BF26" },
    { slug: "work", color: "not-a-color" },
    null
  ]))

  assert.equal(colors.personal, "#f6bf26")
  assert.equal(colors.work, undefined)
  assert.throws(() => Model.parseCalendarColors('{"calendars":[]}'), /JSON array/)
})

test("parseAgenda attaches the matching calendar color", () => {
  const colors = Model.parseCalendarColors(JSON.stringify([
    { slug: "personal", color: "#9fe1e7" }
  ]))
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", {
      recurrence_id: "2026-08-19T11:00:00+01:00"
    }),
    event("2026-08-19T12:00:00+01:00", { calendar: "unknown" })
  ]), colors)

  assert.equal(parsed[0].calendarColor, "#9fe1e7")
  assert.equal(parsed[0].recurrence_id, "2026-08-19T11:00:00+01:00")
  assert.equal(parsed[1].calendarColor, "")
})

test("parseAgenda normalizes and sorts a bare caldir array", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T12:00:00+01:00", { title: "Later" }),
    event("2026-08-19T11:00:00+01:00", { title: "Soon", location: null })
  ]))

  assert.deepEqual(parsed.map(item => item.title), ["Soon", "Later"])
  assert.equal(parsed[0].location, "")
  assert.equal(parsed[0].startMs, Date.parse("2026-08-19T11:00:00+01:00"))
})

test("parseAgenda keeps declined events but drops invalid events", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00"),
    event("2026-08-19T12:00:00+01:00", { rsvp: "Declined" }),
    event("not-a-date")
  ]))
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].declined, false)
  assert.equal(parsed[1].declined, true)
})

test("parseAgenda supplies the canonical title fallback", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", { title: "  " })
  ]))

  assert.equal(parsed[0].title, "Untitled event")
})

test("parseAgenda rejects malformed and non-array output", () => {
  assert.throws(() => Model.parseAgenda("{"), SyntaxError)
  assert.throws(() => Model.parseAgenda('{"events":[]}'), /JSON array/)
})

test("normalized events expose one conference URL", () => {
  const zoomUrl = "https://us02web.zoom.us/j/123456789?pwd=unchanged"
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", {
      location: "Room · https://meet.google.com/abc-defg-hij"
    }),
    event("2026-08-19T12:00:00+01:00", { description: "Join HTTPS://MEET.GOOGLE.COM/xyz-abcd-efg." }),
    event("2026-08-19T13:00:00+01:00", { location: zoomUrl })
  ]))
  assert.equal(parsed[0].conferenceUrl, "https://meet.google.com/abc-defg-hij")
  assert.equal(parsed[1].conferenceUrl, "HTTPS://MEET.GOOGLE.COM/xyz-abcd-efg")
  assert.equal(parsed[2].conferenceUrl, zoomUrl)
  assert.equal(Model.findVideoUrl("not a call"), "")
})

test("provider conference properties outrank URL and free-form fields", () => {
  const googleUrl = "https://meet.google.com/structured-link"
  const raw = event("2026-08-19T11:00:00+01:00", {
    url: "https://meet.google.com/url-field",
    location: "https://meet.google.com/location-field",
    description: "https://meet.google.com/description-field",
    x_properties: [
      { name: "X-OUTLOOK-CONFERENCE", value: "https://teams.live.com/meet/9425716001426?p=outlook" },
      { name: "x-google-conference", value: `  ${googleUrl}  ` }
    ]
  })

  assert.equal(Model.getConferenceUrl(raw), googleUrl)
  assert.equal(Model.normalizedEvent(raw).conferenceUrl, googleUrl)
})

test("an unprovisioned conference request does not fall back to URL", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", {
      url: "https://meet.google.com/stale-url",
      x_properties: [
        { name: "X-GOOGLE-CONFERENCE", value: " \t " }
      ]
    })
  ]))

  assert.equal(parsed[0].conferenceUrl, "")
})

test("URL outranks free-form fields when no conference property exists", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", {
      url: "https://meet.google.com/url-field",
      location: "https://meet.google.com/location-field",
      description: "https://meet.google.com/description-field",
      x_properties: [{ name: "X-UNRELATED", value: "https://meet.google.com/unrelated" }]
    })
  ]))

  assert.equal(parsed[0].conferenceUrl, "https://meet.google.com/url-field")
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
    ["Whereby", "https://whereby.com/team-room?roomKey=abc"],
    ["Proton Meet", "https://meet.proton.me/team-room#key"]
  ]

  for (const [provider, url] of cases) {
    assert.equal(Model.findVideoUrl("Join " + url), url, provider)
  }
})

test("conferenceName identifies supported providers and falls back generically", () => {
  const cases = [
    ["Google Meet", "https://meet.google.com/abc-defg-hij"],
    ["Zoom", "https://us02web.zoom.us/j/123456789?pwd=secret"],
    ["Microsoft Teams", "https://teams.microsoft.com/l/meetup-join/19%3ameeting_example?context=abc"],
    ["Webex", "https://example.webex.com/meet/alice.smith"],
    ["Jitsi", "https://meet.jit.si/team-standup"],
    ["Whereby", "https://whereby.com/team-room"],
    ["Proton Meet", "https://meet.proton.me/team-room#key"]
  ]

  for (const [name, url] of cases) {
    assert.equal(Model.conferenceName(url), name)
  }
  assert.equal(Model.conferenceName("https://calls.example.com/team-room"), "Meeting")
  assert.equal(Model.conferenceName(""), "Meeting")
})

test("meet links survive Google redirect and Outlook SafeLinks wrappers", () => {
  const redirect = "https://www.google.com/url?q=https%3A%2F%2Fmeet.google.com%2Fabc-defg-hij&sa=D&source=calendar"
  assert.equal(Model.findVideoUrl(redirect), "https://meet.google.com/abc-defg-hij")

  const safeLink = "https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fmeet.google.com%2Fklm-nopq-rst&data=05%7C01"
  assert.equal(Model.findVideoUrl(safeLink), "https://meet.google.com/klm-nopq-rst")

  const nested = "https://www.google.com/url?q=" + encodeURIComponent(redirect)
  assert.equal(Model.findVideoUrl(nested), "https://meet.google.com/abc-defg-hij")
})

test("a Zoom link survives an Outlook SafeLinks wrapper", () => {
  const zoom = "https://us02web.zoom.us/j/123456789?pwd=secret"
  const safeLink = "https://eur01.safelinks.protection.outlook.com/?url=" + encodeURIComponent(zoom) + "&data=05%7C01"
  assert.equal(Model.findVideoUrl(safeLink), zoom)
})

test("a malformed redirect escape never blocks later links", () => {
  const mixed = "https://www.google.com/url?q=%ZZbroken and https://www.google.com/url?q=https%3A%2F%2Fmeet.google.com%2Fabc-defg-hij"
  assert.equal(Model.findVideoUrl(mixed), "https://meet.google.com/abc-defg-hij")
})

test("location outranks description and the longest match wins per source", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", {
      location: "https://meet.google.com/abc",
      description: "https://meet.google.com/abc-defg-hij"
    })
  ]))
  assert.equal(parsed[0].conferenceUrl, "https://meet.google.com/abc")

  const both = "https://meet.google.com/abc then https://meet.google.com/abc-defg-hij"
  assert.equal(Model.findVideoUrl(both), "https://meet.google.com/abc-defg-hij")
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
  assert.equal(Model.nextMeeting(parsed, NOW).title, "Ongoing")
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
  assert.equal(Model.nextMeeting(parsed, NOW).title, "Next")
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
  assert.equal(Model.nextMeeting(parsed, NOW).title, "First")
})

test("an event ending inside the one-minute grace window is never next", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T09:00:00+01:00", {
      title: "Almost over",
      end: "2026-08-19T10:00:30+01:00",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    }),
    event("2026-08-19T10:25:00+01:00", {
      title: "Upcoming",
      description: "https://meet.google.com/ddd-eeee-fff"
    })
  ]))
  assert.equal(Model.nextMeeting(parsed, NOW).title, "Upcoming")
})

test("nextMeeting ignores meetings more than 30 minutes away", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-22T15:00:00+01:00", {
      title: "Final day",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW), null)
})

test("nextMeeting includes a meeting starting exactly 30 minutes away", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:30:00+01:00", {
      title: "On the boundary",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW).title, "On the boundary")
})

test("tentative invitations stay off the bar but keep their schedule slot", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:10:00+01:00", {
      title: "Maybe",
      rsvp: "Tentative",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    }),
    event("2026-08-19T10:20:00+01:00", {
      title: "Sure",
      rsvp: "needs-action",
      description: "https://meet.google.com/ddd-eeee-fff"
    }),
    event("2026-08-19T10:25:00+01:00", {
      title: "Confirmed",
      description: "https://meet.google.com/ggg-hhhh-iii"
    })
  ]))
  assert.equal(parsed[0].tentative, true)
  assert.equal(parsed[1].tentative, true)
  assert.equal(parsed[2].tentative, false)
  assert.equal(Model.nextMeeting(parsed, NOW).title, "Confirmed")

  const groups = Model.buildScheduleGroups(parsed, NOW, { daysAhead: 3 })
  assert.deepEqual(groups[0].items.map(item => item.title), ["Maybe", "Sure", "Confirmed"])
})

test("declined events stay off the bar but keep their schedule slots", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:10:00+01:00", {
      title: "Declined",
      rsvp: "declined",
      description: "https://meet.google.com/ddd-eeee-fff"
    }),
    event("2026-08-19T10:20:00+01:00", {
      title: "Confirmed",
      description: "https://meet.google.com/ggg-hhhh-iii"
    })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW).title, "Confirmed")

  const groups = Model.buildScheduleGroups(parsed, NOW, { daysAhead: 3 })
  assert.deepEqual(groups[0].items.map(item => item.title), ["Declined", "Confirmed"])
})

test("the schedule keeps events that already ended today", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-18T11:00:00+01:00", { title: "Yesterday" }),
    event("2026-08-19T08:00:00+01:00", { title: "Done", end: "2026-08-19T08:30:00+01:00" }),
    event("2026-08-19T11:00:00+01:00", { title: "Later" })
  ]))
  const groups = Model.buildScheduleGroups(parsed, NOW, { daysAhead: 3 })
  assert.deepEqual(groups.map(group => group.key), ["2026-08-19"])
  assert.deepEqual(groups[0].items.map(item => item.title), ["Done", "Later"])
})

test("only video meetings drive the bar; the schedule keeps everything", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:10:00+01:00", { title: "No link" }),
    event("2026-08-19T10:20:00+01:00", {
      title: "Video",
      description: "https://meet.google.com/abc-defg-hij"
    })
  ]))
  assert.equal(Model.nextMeeting(parsed, NOW).title, "Video")
  assert.equal(Model.buildScheduleGroups(parsed, NOW, { daysAhead: 3 })[0].items.length, 2)
})

test("a busy day never truncates later schedule days", () => {
  const raw = []
  for (let i = 0; i < 30; i++) {
    const minute = String(i).padStart(2, "0")
    raw.push(event(`2026-08-19T11:${minute}:00+01:00`, { title: `Today ${i}` }))
  }
  raw.push(event("2026-08-20T11:00:00+01:00", { title: "Tomorrow" }))

  const groups = Model.buildScheduleGroups(Model.parseAgenda(JSON.stringify(raw)), NOW, { daysAhead: 3 })
  assert.deepEqual(groups.map(group => group.key), ["2026-08-19", "2026-08-20"])
  assert.equal(groups[0].items.length, 30)
  assert.deepEqual(groups[1].items.map(item => item.title), ["Tomorrow"])
})

test("schedule grouping uses today, tomorrow, and dated headings", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", { title: "Today" }),
    event("2026-08-20T11:00:00+01:00", { title: "Tomorrow" }),
    event("2026-08-21T11:00:00+01:00", { title: "Later" })
  ]))
  const groups = Model.buildScheduleGroups(parsed, NOW, { daysAhead: 3 })
  assert.deepEqual(groups.map(group => group.title), ["TODAY", "TOMORROW", "FRI 21 AUG"])
  assert.deepEqual(groups.map(group => group.dateTitle), ["WED 19 AUG", "THU 20 AUG", "FRI 21 AUG"])
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
  const groups = Model.buildScheduleGroups(parsed, NOW, { daysAhead: 3 })

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
  const groups = Model.buildScheduleGroups(parsed, NOW, { daysAhead: 3 })

  assert.deepEqual(groups.map(group => group.key), ["2026-08-19", "2026-08-20", "2026-08-21"])
  assert.deepEqual(groups.map(group => group.items[0].title), ["Hackathon", "Hackathon", "Hackathon"])
})

test("bar labels cover one minute, hours left, and cross-day events", () => {
  const oneMinute = Model.normalizedEvent(event("2026-08-19T10:01:00+01:00", { title: "Standup" }))
  assert.equal(Model.formatLabel(oneMinute, NOW), "Standup · in 1 min")

  const longMeeting = Model.normalizedEvent(event("2026-08-19T09:00:00+01:00", {
    title: "Workshop",
    end: "2026-08-19T13:00:00+01:00"
  }))
  assert.equal(Model.formatLabel(longMeeting, NOW), "Workshop · 3h left")

  const tomorrow = Model.normalizedEvent(event("2026-08-20T09:00:00+01:00", { title: "Planning" }))
  assert.equal(Model.formatLabel(tomorrow, NOW), "Planning · Tmrw 09:00")

  const longTitle = Model.normalizedEvent(event("2026-08-19T10:01:00+01:00", {
    title: "A very long meeting title"
  }))
  assert.equal(Model.formatLabel(longTitle, NOW), "A very long meet… · in 1 min")
})

test("relative status and time formatting use precomputed timestamps", () => {
  const future = Model.normalizedEvent(event("2026-08-19T10:30:00+01:00"))
  assert.equal(Model.relativeStatus(future, NOW), "starts in 30 min")
  assert.equal(Model.meetingTimeLabel(future.startMs, future.endMs, NOW), "Today · 10:30–11:00")
  assert.equal(Model.formatDuration(future.startMs, future.endMs), "30m")

  const active = Model.normalizedEvent(event("2026-08-19T09:00:00+01:00", { end: "2026-08-19T13:00:00+01:00" }))
  assert.equal(Model.relativeStatus(active, NOW), "3h left")
})

test("time formatting honors caldir's 12-hour preference", () => {
  const morning = new Date("2026-08-19T09:05:00+01:00")
  const noon = new Date("2026-08-19T12:00:00+01:00")
  const midnight = new Date("2026-08-20T00:00:00+01:00")
  const future = Model.normalizedEvent(event("2026-08-19T12:00:00+01:00"))
  const tomorrow = Model.normalizedEvent(event("2026-08-20T09:00:00+01:00", { title: "Planning" }))

  assert.equal(Model.hm(morning, "12h"), "9:05am")
  assert.equal(Model.hm(noon, "12h"), "12:00pm")
  assert.equal(Model.hm(midnight, "12h"), "12:00am")
  assert.equal(Model.timeRange(morning, noon, "12h"), "9:05am–12:00pm")
  assert.equal(Model.meetingTimeLabel(future.startMs, future.endMs, NOW, "12h"), "Today · 12:00pm–12:30pm")
  assert.equal(Model.relativeStatus(future, NOW, "12h"), "starts at 12:00pm")
  assert.equal(Model.formatLabel(tomorrow, NOW, "12h"), "Planning · Tmrw 9:00am")
})

test("caldir config parsing reads time_format with a 24-hour fallback", () => {
  assert.equal(Model.parseTimeFormat(JSON.stringify({ config: { time_format: "12h" } })), "12h")
  assert.equal(Model.parseTimeFormat(JSON.stringify({ config: { time_format: "24h" } })), "24h")
  assert.equal(Model.parseTimeFormat(JSON.stringify({ config: {} })), "24h")
  assert.throws(() => Model.parseTimeFormat("not json"), SyntaxError)
})

test("queryRange uses local calendar-day arithmetic", () => {
  assert.deepEqual(Model.queryRange(NOW, 3), { from: "2026-08-19", to: "2026-08-22" })
  assert.equal(Model.localDateKey(Model.addLocalDays(new Date(2026, 7, 31), 1)), "2026-09-01")
})

test("truncation is stable", () => {
  assert.equal(Model.truncate("A very long event", 8), "A very…")
})
