# Caldir widget for Omarchy

⚡ Lightning-fast access to your next calendar events in the Omarchy bar. Works great with [renCal](https://rencal.org).

![Screenshot](assets/screenshot.png)

## Features

- Supports all major calendar providers (Google Calendar, iCloud, Outlook, CalDAV...) through [caldir](https://caldir.org).
- Uses vim motions (<kbd>h</kbd>, <kbd>j</kbd>, <kbd>k</kbd>,<kbd>l</kbd>) for navigation.
- Highlights the next meeting when it's close to start.
- One-click action. Meeting events (Google Meet, Zoom, etc) open the video URL in your browser. Non-meeting events open in [renCal](https://rencal.org).
- Syncs automatically (or trigger manually with <kbd>s</kbd>).

## Installation

```sh
omarchy plugin add https://github.com/t4t5/omarchy-caldir-widget --enable
```

This will add the widget to `~/.config/omarchy/shell.json` as:

```json
{
  "id": "org.ren.caldir"
}
```

## Usage

The widget uses [caldir-cli](https://caldir.org) to read your calendar data (requires v0.12.1 or higher).

See the caldir docs for [how to connect a calendar](https://caldir.org/quickstart/).

It is also recommended to have [renCal](https://rencal.org) installed, so that you can view and edit your caldir events through a GUI.

### Shortcuts

Set a key binding in `~/.config/hypr/bidnings.lua` to open the widget more quickly:

```lua
-- Toggle caldir widget
o.bind("SUPER + SHIFT + C", "Caldir widget", "omarchy shell org.ren.caldir toggle")
```

### IPC

```sh
omarchy shell org.ren.caldir toggle
omarchy shell org.ren.caldir open
omarchy shell org.ren.caldir close
omarchy shell org.ren.caldir refresh
```

## Settings

Set your preferences in `~/.config/omarchy/shell.json`:

```json
{
  "id": "org.ren.caldir",
  "daysAhead": 3
}
```

| Setting | Default | Purpose |
| --- | ---: | --- |
| `daysAhead` | `2` | Number of future schedule days to display |
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

## Contributing

For local development, we use a [justfile](https://just.systems/man/en/) for developer commands.

Install the locally cloned repo in your Omarchy bar to test:

```sh
just install
```

When making changes, you can reload it with:

```sh
just reload
```

To remove the plugin:

```sh
just uninstall
```

Before submitting a PR, ensure everything runs with `just test`.
