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

The widget uses [caldir-cli](https://caldir.org) to read your calendar data (requires v0.12.1 or higher).

## Usage

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

### Preferences

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

### Custom script

When clicking an event item, the default behaviour is the following:
- events with a detected meeting link open that link in your browser
- all other events open in renCal through a `rencal://` deeplink

For the "Next meeting" card:
- the **Join Meeting** button (or a right-click on the bar) opens the meeting link in your browser.
- the **Open in Calendar** button opens the event in renCal.

To customize this behavior, create `~/.config/omarchy/caldir/open.lua` and define `on_open`:

#### Examples

```lua
-- Start a transcript whenever you join a meeting
-- (keeps the stock behavior so the meeting link still opens in the browser)
function on_open(event, action)
  if action == "join" then
    exec { "start-transcription", "--title", event.title }
  end
  default_open(event, action)
end
```

```lua
-- View the event in your preferred app instead of renCal
function on_open(event, action)
  if action == "calendar" then
    exec { "my-calendar-app", "--event", event.uid }
    return -- Skip default_open here because it would open the event in renCal.
  end

  default_open(event, action) -- Keep the stock behavior for meeting links.
end
```

### Options

`event` is a table with the following fields (can also be `nil`):

| Field | Value |
| --- | --- |
| `uid` | Event UID |
| `instance_id` | Instance ID; recurring instances use `<uid>__<recurrence-id>` |
| `title` | Event title |
| `conference_url` | Detected video meeting URL |

`action` is either:
- `"join"` (to open the detected meeting link)
- `"calendar"` (to open the event in a calendar)

You can use these global helper functions in your script:

| Function | Behavior |
| --- | --- |
| `default_open(event, action)` | Runs the bundled `join` or `calendar` policy |
| `open_url(url)` | Opens a URL through `xdg-open` |
| `open_rencal(event)` | Opens the event in renCal |
| `exec(command)` | Runs a command in the background |

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
