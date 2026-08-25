import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
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

test("the schedule falls back to the default range when daysAhead is unusable", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", { title: "Today" }),
    event("2026-08-21T11:00:00+01:00", { title: "Two days out" }),
    event("2026-08-24T11:00:00+01:00", { title: "Five days out" })
  ]))
  const expected = ["2026-08-19", "2026-08-21"]

  assert.deepEqual(Model.buildScheduleGroups(parsed, NOW).map(group => group.key), expected)
  assert.deepEqual(Model.buildScheduleGroups(parsed, NOW, {}).map(group => group.key), expected)
  assert.deepEqual(
    Model.buildScheduleGroups(parsed, NOW, { daysAhead: "nonsense" }).map(group => group.key),
    expected)
})

test("a wider lookahead promotes a meeting the default window hides", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:30:00+01:00", {
      title: "Ninety minutes out",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW), null)
  assert.equal(Model.nextMeeting(parsed, NOW, { lookaheadMinutes: 90 }).title, "Ninety minutes out")
})

test("a narrower lookahead hides a meeting the default window shows", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:20:00+01:00", {
      title: "Twenty minutes out",
      description: "https://meet.google.com/aaa-bbbb-ccc"
    })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW).title, "Twenty minutes out")
  assert.equal(Model.nextMeeting(parsed, NOW, { lookaheadMinutes: 10 }), null)
})

test("integer settings fall back to their default and clamp to their bounds", () => {
  assert.equal(Model.normalizeLookaheadMinutes(undefined), Model.LOOKAHEAD_MINUTES.defaultValue)
  assert.equal(Model.normalizeLookaheadMinutes(null), Model.LOOKAHEAD_MINUTES.defaultValue)
  assert.equal(Model.normalizeLookaheadMinutes(""), Model.LOOKAHEAD_MINUTES.defaultValue)
  assert.equal(Model.normalizeLookaheadMinutes("   "), Model.LOOKAHEAD_MINUTES.defaultValue)
  assert.equal(Model.normalizeLookaheadMinutes("not-a-number"), Model.LOOKAHEAD_MINUTES.defaultValue)
  assert.equal(Model.normalizeLookaheadMinutes(0), Model.LOOKAHEAD_MINUTES.min)
  assert.equal(Model.normalizeLookaheadMinutes(-90), Model.LOOKAHEAD_MINUTES.min)
  assert.equal(Model.normalizeLookaheadMinutes(99999), Model.LOOKAHEAD_MINUTES.max)
  assert.equal(Model.normalizeLookaheadMinutes("45"), 45)
  assert.equal(Model.normalizeLookaheadMinutes(45.9), 45)

  // daysAhead reaches the model from the same hand-editable file, so it is
  // normalized on the same terms rather than trusted.
  assert.equal(Model.normalizeDaysAhead(undefined), Model.DAYS_AHEAD.defaultValue)
  assert.equal(Model.normalizeDaysAhead("nonsense"), Model.DAYS_AHEAD.defaultValue)
  assert.equal(Model.normalizeDaysAhead(0), Model.DAYS_AHEAD.min)
  assert.equal(Model.normalizeDaysAhead(9000), Model.DAYS_AHEAD.max)
  assert.equal(Model.normalizeDaysAhead("7"), 7)
})

test("barEvents All puts an event without a video link on the bar", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:10:00+01:00", { title: "No link" }),
    event("2026-08-19T10:20:00+01:00", {
      title: "Video",
      description: "https://meet.google.com/abc-defg-hij"
    })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW, { barEvents: "All" }).title, "No link")
  assert.equal(Model.nextMeeting(parsed, NOW, { barEvents: "Meetings" }).title, "Video")
})

test("barEvents All still honors the declined, all-day, and tentative filters", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:05:00+01:00", { title: "Declined", rsvp: "declined" }),
    event("2026-08-19T10:07:00+01:00", { title: "Tentative", rsvp: "tentative" }),
    event("2026-08-19T10:09:00+01:00", { title: "Needs action", rsvp: "needs-action" }),
    { ...event("2026-08-19T10:11:00+01:00", { title: "All day" }), all_day: true },
    event("2026-08-19T10:13:00+01:00", { title: "Plain" })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW, { barEvents: "All" }).title, "Plain")
})

test("barEvents normalizes to a manifest option and falls back to the default", () => {
  assert.equal(Model.normalizeBarEvents(undefined), Model.BAR_EVENTS_MEETINGS)
  assert.equal(Model.normalizeBarEvents(null), Model.BAR_EVENTS_MEETINGS)
  assert.equal(Model.normalizeBarEvents(""), Model.BAR_EVENTS_MEETINGS)
  assert.equal(Model.normalizeBarEvents("nonsense"), Model.BAR_EVENTS_MEETINGS)
  assert.equal(Model.normalizeBarEvents("Meetings"), Model.BAR_EVENTS_MEETINGS)
  assert.equal(Model.normalizeBarEvents(" meetings "), Model.BAR_EVENTS_MEETINGS)
  assert.equal(Model.normalizeBarEvents("All"), Model.BAR_EVENTS_ALL)
  assert.equal(Model.normalizeBarEvents(" all "), Model.BAR_EVENTS_ALL)
  assert.equal(Model.normalizeBarEvents("ALL"), Model.BAR_EVENTS_ALL)
})

test("the settings declarations stay in step with the manifest schema", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"))
  const schema = manifest.barWidget.schema
  const defaults = manifest.barWidget.defaults

  for (const spec of [Model.DAYS_AHEAD, Model.LOOKAHEAD_MINUTES, Model.BAR_EVENTS]) {
    const entry = schema.find(item => item.key === spec.key)
    assert.ok(entry, `manifest.json is missing a schema entry for ${spec.key}`)
    assert.equal(entry.defaultValue, spec.defaultValue)
    assert.equal(defaults[spec.key], spec.defaultValue)
    if (spec.options) assert.deepEqual(entry.options, spec.options)
    else assert.deepEqual([entry.min, entry.max], [spec.min, spec.max])
  }
})

test("the hero card offers joining only when a video link was detected", () => {
  const [linked, plain] = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:10:00+01:00", {
      title: "Video",
      description: "https://meet.google.com/abc-defg-hij"
    }),
    event("2026-08-19T10:20:00+01:00", { title: "Room booking" })
  ]))

  assert.deepEqual(Model.heroActions(linked), ["join", "calendar"])
  assert.deepEqual(Model.heroActions(plain), ["calendar"])
  assert.deepEqual(Model.heroActions(null), [])
  assert.deepEqual(Model.heroActions(undefined), [])
})

test("an omitted options object keeps the stock MeetingBar selection", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T10:20:00+01:00", { title: "No link" }),
    event("2026-08-19T10:25:00+01:00", {
      title: "Video",
      description: "https://meet.google.com/abc-defg-hij"
    })
  ]))

  assert.equal(Model.nextMeeting(parsed, NOW).title, "Video")
  assert.equal(Model.nextMeeting(parsed, NOW, undefined).title, "Video")
  assert.equal(Model.nextMeeting(parsed, NOW, {}).title, "Video")
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

test("oversized caldir output is rejected before parsing", () => {
  const oversized = "x".repeat(Model.MAX_OUTPUT_CHARS + 1)
  assert.throws(() => Model.parseAgenda(oversized), /exceeds/)
  assert.throws(() => Model.parseCalendarColors(oversized), /exceeds/)
  assert.throws(() => Model.parseTimeFormat(oversized), /exceeds/)
})

test("the agenda rejects excess cardinality before creating event models", () => {
  const base = Date.parse("2026-08-19T11:00:00+01:00")
  const raw = []
  for (let i = Model.MAX_EVENTS; i >= 0; i--) {
    raw.push(event(new Date(base + i * 5 * Model.MINUTE_MS).toISOString(), { title: `Event ${i}` }))
  }

  assert.throws(() => Model.parseAgenda(JSON.stringify(raw)), /exceeds 500 events/)
})

test("calendar colors ignore calendars past the cardinality cap", () => {
  const raw = []
  for (let i = 0; i < Model.MAX_CALENDARS + 10; i++) {
    raw.push({ slug: `cal-${i}`, color: "#aabbcc" })
  }

  const colors = Model.parseCalendarColors(JSON.stringify(raw))
  assert.equal(colors[`cal-${Model.MAX_CALENDARS - 1}`], "#aabbcc")
  assert.equal(colors[`cal-${Model.MAX_CALENDARS}`], undefined)
})

test("event text fields are clamped to their length caps", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", {
      title: "T".repeat(Model.MAX_TITLE_CHARS + 50),
      description: "D".repeat(100000)
    })
  ]))

  assert.equal(parsed[0].title.length, Model.MAX_TITLE_CHARS)
  assert.ok(parsed[0].description.length < 100000)
})

test("field limits apply before trimming, parsing, and matching", () => {
  const overlongDate = "2026-08-19T11:00:00+01:00" + " ".repeat(Model.MAX_DATE_CHARS)
  const overlongPropertyName = "X-GOOGLE-CONFERENCE" + " ".repeat(Model.MAX_PROPERTY_NAME_CHARS)
  const overlongPropertyUrl = "https://meet.google.com/property" + " ".repeat(Model.MAX_URL_CHARS)
  const overlongEventUrl = "https://meet.google.com/url-field" + "a".repeat(Model.MAX_URL_CHARS)
  const parsed = Model.parseAgenda(JSON.stringify([
    event(overlongDate),
    event("2026-08-19T11:00:00+01:00", {
      title: " ".repeat(Model.MAX_TITLE_CHARS) + "Hidden suffix",
      url: "https://meet.google.com/fallback",
      x_properties: [{ name: overlongPropertyName, value: "https://meet.google.com/property" }]
    }),
    event("2026-08-19T12:00:00+01:00", {
      x_properties: [{ name: "X-GOOGLE-CONFERENCE", value: overlongPropertyUrl }]
    }),
    event("2026-08-19T13:00:00+01:00", {
      url: overlongEventUrl
    })
  ]))

  assert.equal(parsed.length, 3)
  assert.equal(parsed[0].title, "Untitled event")
  assert.equal(parsed[0].conferenceUrl, "https://meet.google.com/fallback")
  assert.equal(parsed[1].conferenceUrl, "")
  assert.equal(parsed[2].conferenceUrl, "")

  const colors = Model.parseCalendarColors(JSON.stringify([
    { slug: "work", color: "#aabbcc" + " ".repeat(Model.MAX_COLOR_CHARS) }
  ]))
  assert.equal(colors.work, undefined)
})

test("conference URLs only pass with a web scheme and sane length", () => {
  const withProperty = value => event("2026-08-19T11:00:00+01:00", {
    x_properties: [{ name: "X-GOOGLE-CONFERENCE", value }]
  })

  const good = Model.parseAgenda(JSON.stringify([withProperty("https://meet.google.com/abc-defg-hij")]))
  assert.equal(good[0].conferenceUrl, "https://meet.google.com/abc-defg-hij")

  const bad = Model.parseAgenda(JSON.stringify([
    withProperty("javascript:alert(1)"),
    withProperty("file:///etc/passwd"),
    withProperty("https://meet.jit.si/" + "a".repeat(Model.MAX_URL_CHARS))
  ]))
  for (const parsed of bad) assert.equal(parsed.conferenceUrl, "")

  const overlongMatch = "https://meet.jit.si/" + "a".repeat(Model.MAX_URL_CHARS)
  assert.equal(Model.getConferenceUrl({ location: overlongMatch }), "")
})

test("x-property scanning stops at the cardinality cap", () => {
  const fillers = Array.from({ length: Model.MAX_X_PROPERTIES }, (_, i) => ({
    name: `X-FILLER-${i}`,
    value: "ignored"
  }))
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", {
      url: "https://meet.google.com/url-field",
      x_properties: [
        ...fillers,
        { name: "X-GOOGLE-CONFERENCE", value: "https://meet.google.com/hidden" }
      ]
    })
  ]))

  assert.equal(parsed[0].conferenceUrl, "https://meet.google.com/url-field")
})

test("plainLine neutralizes rich-text triggers and collapses lines", () => {
  assert.equal(Model.plainLine("<b>Hi</b>\nline2"), "‹b>Hi‹/b> line2")
  assert.equal(Model.plainLine("this &lt;i&gt; stays plain"), "this ‹i&gt; stays plain")
  assert.equal(Model.plainLine("tabs\tand\r\nnulls "), "tabs and nulls ")
  assert.equal(Model.plainLine(null), "")
})

test("bar labels never carry markup-capable titles", () => {
  const spoofed = Model.normalizedEvent(event("2026-08-19T10:01:00+01:00", {
    title: "<img src=x>"
  }))
  assert.equal(Model.formatLabel(spoofed, NOW), "‹img src=x> · in 1 min")
})

test("rsvp only stores known statuses", () => {
  const parsed = Model.parseAgenda(JSON.stringify([
    event("2026-08-19T11:00:00+01:00", { rsvp: "DECLINED" }),
    event("2026-08-19T12:00:00+01:00", { rsvp: "j".repeat(100000) }),
    event("2026-08-19T13:00:00+01:00", { rsvp: null })
  ]))

  assert.equal(parsed[0].rsvp, "declined")
  assert.equal(parsed[0].declined, true)
  assert.equal(parsed[1].rsvp, "")
  assert.equal(parsed[1].declined, false)
  assert.equal(parsed[2].rsvp, "")
})

function runBounded(argv) {
  const command = Model.boundedCommand(argv)
  return spawnSync(command[0], command.slice(1), {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024
  })
}

test("bounded commands pass small output and exit codes through", () => {
  const ok = runBounded(["sh", "-c", "printf out; printf err >&2"])
  assert.equal(ok.status, 0)
  assert.equal(ok.stdout, "out")
  assert.equal(ok.stderr, "err")

  const failed = runBounded(["sh", "-c", "printf partial; printf oops >&2; exit 3"])
  assert.equal(failed.status, 3)
  assert.equal(failed.stdout, "partial")
  assert.equal(failed.stderr, "oops")
})

test("bounded commands cap stdout and kill the producer", () => {
  const result = runBounded(["yes", "overflow"])
  assert.equal(result.stdout.length, Model.MAX_STDOUT_BYTES)
  assert.notEqual(result.status, 0)
})

test("bounded commands cap stderr and kill the producer", () => {
  const result = runBounded(["sh", "-c", "yes err >&2"])
  assert.equal(result.stderr.length, Model.MAX_STDERR_BYTES)
  assert.equal(result.stdout, "")
  assert.notEqual(result.status, 0)
})

test("capped stderr still selects the setup state", () => {
  const message = "Error: No calendars found.\n\nConnect your first calendar with:\n  caldir connect <provider>"
  const result = runBounded(["sh", "-c", 'printf %s "$1" >&2; exit 1', "sh", message])
  assert.equal(result.status, 1)
  assert.equal(Model.isNoCalendarsError(result.stderr), true)
})
