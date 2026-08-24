# Caldir widget for Omarchy

Lightning-fast access to your next calendar events in the Omarchy bar.

Supports all major calendar providers (Google Calendar, iCloud, Outlook, CalDAV...) through [caldir](https://caldir.org).

Pairs great with [renCal](https://rencal.org).

![Screenshot](assets/screenshot.png)

## Install

```sh
omarchy plugin add <repo-url> --enable
```

Requires [caldir-cli](https://caldir.org) v0.12.1 or higher.


## Use

- Left-click toggles the schedule panel and refreshes local event data.
- Left-clicking a schedule row runs the event-open script. By default, video
  meetings open through the desktop's registered HTTPS handler; other events
  open in rencal at that event.
- The hero's Join and Open in Calendar buttons use the same script with an
  explicit action.
- Right-click joins the next video meeting; if none exists, it opens the panel.
- Middle-click runs `caldir pull` and refreshes local data when it finishes.
- The sync button and the `s` keyboard shortcut while the panel is open do the
  same. Automatic refreshes only re-read local caldir data and preferences with
  `caldir events`, `caldir calendars`, and `caldir config`.
- When the next-meeting hero is shown, keyboard focus starts on Join Meeting.
  Left/Right or `h`/`l` switches between the hero actions, while Up/Down or `j`/`k` moves
  between the hero and schedule events. Enter activates the focused action.
- Escape closes the popup; Tab switches panels.

Failed commands and malformed responses clear the current schedule and show
the error in the panel. Declined invitations stay in the schedule with a
strikethrough, but never drive the bar. Tentative and
unanswered invitations stay in the schedule, shown dimmed and italic, but never
drive the bar. The schedule includes all events, while the bar and next-meeting
hero only follow events with a supported video URL. Multi-day events appear on
each local calendar day they occupy, starting with today; event end dates are
treated as exclusive. Schedule rows use their calendar color as a slim bar for
timed events or a dot for all-day events. Events that already ended today remain
in the schedule, dimmed with a check mark.

The bar meeting follows MeetingBar's selection rules: a meeting with under a
minute left is never shown, and a meeting in progress hands the bar to the
following one once it starts within ten minutes, so back-to-back calls show
the meeting you need to join next. Google Meet, Zoom, Microsoft Teams, Webex,
Jitsi, Whereby, and Proton Meet links are detected. Links wrapped in Outlook
SafeLinks or Google `google.com/url?q=` redirects are unwrapped before
detection. The provider-owned `X-GOOGLE-CONFERENCE`, `X-OUTLOOK-CONFERENCE`,
and `X-PM-CONFERENCE-URL` properties take priority. Without one of those, the
widget checks the event URL, location, then description.

### Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `daysAhead` | `2` | Number of future schedule days to query |
| `openScript` | `""` | Path to a custom event-open script |

### Customizing event opening

Every row click and hero action invokes an executable as `open-event <action>`.
The action is `auto` for a row, `join` for Join or bar right-click, and
`calendar` for Open in Calendar. The bundled script uses `auto` to choose a
video link when present and rencal otherwise. `join` requires a detected video
URL, while `calendar` always selects the rencal deeplink. Both URL types are
passed directly to `xdg-open`.

If `xdg-open` rejects a rencal deeplink, the handler exits with an error. It
does not guess at a calendar provider or open a web-calendar fallback. Install
rencal, or set `openScript` when a different policy is wanted.

Custom handlers receive the action as their first argument and four event
values in the environment, so event text is never parsed as shell syntax:

| Variable | Value |
| --- | --- |
| `EVENT_UID` | Event UID |
| `EVENT_INSTANCE_ID` | Instance ID; recurring instances use `<uid>__<recurrence-id>` |
| `EVENT_TITLE` | Event title |
| `EVENT_CONFERENCE_URL` | Detected, unwrapped video URL, unchanged by the widget |

To add custom behavior, copy [`bin/open-event`](bin/open-event) to a stable
location, make it executable, edit it, and set `openScript` to the copy's
absolute path. For example, insert this immediately before the copied
handler launches `xdg-open` to start transcription before joining a meeting:

```bash
if [[ "$resolved_action" == "join" ]]; then
  start-transcription --title "${EVENT_TITLE:-Meeting}"
fi
```

The bundled handler also supports `--print` for testing. It prints the
resolved action and URL without opening anything:

```sh
EVENT_UID='event@example.com' bin/open-event --print auto
# calendar rencal://event?uid=event%40example.com
```

### IPC

```sh
omarchy shell org.ren.caldir refresh
omarchy shell org.ren.caldir toggle
omarchy shell org.ren.caldir open
omarchy shell org.ren.caldir close
```

## Optional background pull

The widget refreshes from local files once a minute. Inspect it with:

```sh
systemctl --user status caldir-pull.timer
journalctl --user -u caldir-pull.service
```

## Development

For local development, validate and symlink this checkout into Omarchy's
personal plugin directory:

```sh
just install
```

The recipe safely reuses a symlink that already points to this checkout and
repairs dangling symlinks left by a moved or renamed checkout. It refuses to
replace another file, directory, or live symlink. After source edits, validate
and cold-reload the shell with:

```sh
just reload
```

To disable the plugin and remove only that development symlink:

```sh
just uninstall
```

Before submitting a PR, ensure everything runs with `just test`.
