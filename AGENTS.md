## Features

### Meeting highlight

Google Meet, Zoom, Microsoft Teams, Webex, Jitsi, Whereby, and Proton Meet links are detected.

The bar meeting follows [MeetingBar](https://meetingbar.app/)'s selection rules by default:

- a meeting with under a minute left is never shown
- an event appears once it is within `lookaheadMinutes` of starting (default 30)
- declined, all-day, and tentative events never reach the bar
- an event needs a detected video link, unless `highlightEvents` is `"all"`
- a meeting in progress hands the bar to the following one once it starts within ten minutes, so back-to-back calls show the meeting you need to join next.
- Links wrapped in Outlook SafeLinks or Google `google.com/url?q=` redirects are unwrapped before detection. The provider-owned `X-GOOGLE-CONFERENCE`, `X-OUTLOOK-CONFERENCE`, and `X-PM-CONFERENCE-URL` properties take priority. Without one of those, the widget checks the event URL, location, then description.

Settings are declared once in `model/settings.mjs` — defaults, bounds, and enum
options — and normalized there on the way in, because `shell.json` is
hand-editable and the manifest's schema is only a hint. `BarWidget.qml`
normalizes at the boundary so the rest of the code sees valid values, and a
test checks the declarations against `manifest.json` so the two cannot drift.

`NavigationController.qml` holds the panel's keyboard selection. The hero
card's actions come from `Model.heroActions(event)` as an ordered list, and
`selectedHeroAction` is an index into it, so an action the event does not offer
simply is not in the list. `focusHero` and `focusEvent` are the only writers of
the selection state and both clamp on the way in; `Panel.qml` binds to
`heroAction`/`heroActions` rather than re-deriving availability from the event.

### Invitations

`InvitationController.qml` loads `caldir invites --json` independently of the
agenda range. `model/invitations.mjs` normalizes pending invitations and counts
one response per source path (expanded recurring instances share an RSVP).
Both `needs_action` from caldir JSON and `needs-action` normalize to the latter.

Responses run `caldir rsvp -- <path> <response>`, then push that calendar. The
controller keeps explicit busy state because `Process.running` updates can be
deferred. A successful exit alone does not confirm a push: caldir can print
provider errors on stdout and exit zero. Unconfirmed sends retain a retry
action, and ordinary refreshes do not clear response errors.

Invitation keyboard selection also goes through `focusHero`, with an optional
invitation index. Its actions come from `Model.INVITATION_ACTIONS` in display
order. `scripts/test-qml.sh` runs navigation and response tests in Quickshell
with a fake caldir executable; it never responds to real invitations.
