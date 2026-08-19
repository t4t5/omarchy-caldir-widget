# Caldir Quickshell Widget

An Omarchy Quattro bar widget that shows the next meeting and a live countdown.
Click it for a next-meeting hero and multi-day schedule, or right-click to join
the next Google Meet.

The widget runs `caldir events --json` against local calendar files. It does
not parse ICS, store credentials, or contact a calendar provider. Sync is kept
separate through `caldir pull`.

## Requirements

- Omarchy 4 with the Quickshell-based bar
- `caldir` available on the shell's `PATH`
- At least one calendar configured and pulled with caldir

Check the data source before installing:

```sh
caldir add
caldir pull
caldir events --json --from 2026-08-19 --to 2026-08-22
```

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

The recipe safely reuses only a symlink that already points to this checkout.
It refuses to replace another file, directory, or symlink. After source edits,
validate and cold-reload the shell with:

```sh
just reload
```

To disable the plugin and remove only that development symlink:

```sh
just uninstall
```

## Use

- Left-click toggles the schedule panel and refreshes local event data.
- Right-click joins the next Google Meet; if none exists, it opens the panel.
- Middle-click runs `caldir pull` and refreshes two seconds later.
- The refresh button re-reads local caldir data.
- Escape closes the popup; Tab switches panels.

Failed commands and malformed responses leave the last successful schedule in
place and show the error in the panel. Cancelled events and declined
invitations are hidden. The schedule includes all events, while the bar can be
limited to events containing a Google Meet URL. Multi-day events appear on
each local calendar day they occupy, starting with today; event end dates are
treated as exclusive.

### Settings

| Setting | Default | Purpose |
| --- | ---: | --- |
| `daysAhead` | `3` | Number of future schedule days to query |
| `pollSeconds` | `60` | Local `caldir events` polling interval |
| `calendar` | `""` | Optional caldir calendar slug |
| `showOnlyWithVideoLink` | `true` | Limit the bar/hero meeting to events with Meet URLs |
| `maxTitleLength` | `28` | Maximum approximate bar-label length |
| `browserCommand` | `""` | Command used instead of `xdg-open` |
| `calendarUrlBase` | Google Calendar | Base URL for “Open in Calendar” |

For a specific Google account, set `calendarUrlBase` to a URL such as
`https://calendar.google.com/calendar/u/2`.

### IPC

```sh
omarchy shell caldir-quickshell-widget refresh
omarchy shell caldir-quickshell-widget toggle
omarchy shell caldir-quickshell-widget open
omarchy shell caldir-quickshell-widget close
```

## Optional background pull

The one-minute widget poll reads local files only. To pull provider changes
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
