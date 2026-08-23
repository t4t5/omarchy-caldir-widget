# Omarchy Caldir Widget

An Omarchy Quattro bar widget that shows the next meeting and a live countdown.
Click it for a next-meeting hero and multi-day schedule, or right-click to join
the next video meeting.

The widget runs `caldir events --json` against local calendar files. It does
not parse ICS, store credentials, or contact a calendar provider. Sync is kept
separate through `caldir pull`.

## Requirements

- Omarchy 4 with the Quickshell-based bar
- `caldir` v0.12.1 or newer, available on the shell's `PATH`
- At least one calendar configured and pulled with caldir

Check the data source before installing:

```sh
curl -sSf https://caldir.org/install.sh | sh
caldir connect
caldir sync
caldir events --json --from 2026-08-19 --to 2026-08-22
```

If `caldir` is missing, opening the widget offers to run the official installer
and links to [caldir.org](https://caldir.org) for provider setup. Installation
only starts after clicking **Install caldir**.

## Install

From a hosted Git repository:

```sh
omarchy plugin add <repo-url> --enable
```

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
  same. Automatic refreshes only re-read local caldir data with `caldir events`.
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
treated as exclusive. Events that already ended today remain in the schedule, dimmed with
a check mark.

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
omarchy shell omarchy-caldir refresh
omarchy shell omarchy-caldir toggle
omarchy shell omarchy-caldir open
omarchy shell omarchy-caldir close
```

## Optional background pull

The widget refreshes from local files once a minute. To pull provider changes
every five minutes, install and enable the included systemd user timer:

```sh
install -Dm644 systemd/caldir-pull.service ~/.config/systemd/user/caldir-pull.service
install -Dm644 systemd/caldir-pull.timer ~/.config/systemd/user/caldir-pull.timer
systemctl --user daemon-reload
systemctl --user enable --now caldir-pull.timer
```

Inspect it with:

```sh
systemctl --user status caldir-pull.timer
journalctl --user -u caldir-pull.service
```

The timer is optional; another process may keep caldir's local files fresh.

## Development

The model is native ESM with no runtime dependencies or build step:

```sh
npm test
/usr/lib/qt6/bin/qmllint -I ~/.local/share/omarchy/shell BarWidget.qml
/usr/lib/qt6/bin/qmllint -I ~/.local/share/omarchy/shell Panel.qml
omarchy plugin validate .
```

Run all three with `just test`.
