import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.mjs" as Model

// Omarchy Caldir Widget — a local caldir-backed event countdown.
// Left click opens the schedule, right click joins the next meeting, and middle
// click pulls remote calendars before refreshing the local view.
BarWidget {
  id: root
  moduleName: "omarchy-caldir"

  readonly property int daysAhead: Math.max(1, Math.min(30, Number(setting("daysAhead", 3)) || 3))
  readonly property string calendarSlug: String(setting("calendar", "") || "").trim()
  readonly property int maxTitleLength: Math.max(8, Math.min(80, Number(setting("maxTitleLength", 28)) || 28))
  readonly property bool showOnlyWithVideoLink: {
    var value = setting("showOnlyWithVideoLink", true)
    if (value === undefined || value === null) return true
    if (value === true || value === 1 || value === "1") return true
    if (value === false || value === 0 || value === "0") return false
    return String(value).toLowerCase() !== "false"
  }

  property var scheduleGroups: []
  property var nextMeeting: null
  property string loadError: ""
  property bool needsCalendarSetup: false
  property string caldirState: "checking"
  property string caldirExecutable: ""
  property date now: new Date()

  readonly property bool syncing: pullProcess.running
  readonly property bool installingCaldir: installProcess.running
  readonly property bool inMeeting: nextMeeting
    && now.getTime() >= Number(nextMeeting.startMs)
    && now.getTime() < Number(nextMeeting.endMs)
  readonly property string label: nextMeeting
    ? (nextMeeting.conferenceUrl ? "  " : "󰃯  ") + Model.formatLabel(nextMeeting, now, maxTitleLength)
    : ""
  readonly property bool showingFallbackIcon: label === ""

  signal meetingDataChanged()

  function agendaCommand() {
    var range = Model.queryRange(new Date(), daysAhead)
    var command = [
      caldirExecutable, "events", "--json",
      "--from", range.from,
      "--to", range.to
    ]
    if (calendarSlug !== "") command.push("--calendar", calendarSlug)
    return command
  }

  function refresh() {
    if (caldirCheckProcess.running || agendaProcess.running) return
    caldirCheckProcess.command = ["which", "caldir"]
    caldirCheckProcess.running = true
    meetingDataChanged()
  }

  function finishCaldirCheck(exitCode) {
    var executable = String(caldirCheckStdout.text || "").trim()
    if (exitCode !== 0 || executable === "") {
      var wasMissing = caldirState === "missing"
      caldirState = "missing"
      caldirExecutable = ""
      needsCalendarSetup = false
      if (!wasMissing || loadError === "") loadError = "caldir is not installed."
      setEvents([])
      return
    }

    caldirState = "ready"
    caldirExecutable = executable
    needsCalendarSetup = false
    loadError = ""
    agendaProcess.command = agendaCommand()
    agendaProcess.running = true
  }

  function installCaldir() {
    if (installProcess.running) return
    caldirState = "installing"
    loadError = ""
    installProcess.command = [
      "bash", "-lc",
      "set -o pipefail; curl -sSf https://caldir.org/install.sh | sh"
    ]
    installProcess.running = true
    meetingDataChanged()
  }

  function finishInstall(exitCode) {
    if (exitCode !== 0) {
      var stderr = String(installStderr.text || "").trim()
      var stdout = String(installStdout.text || "").trim()
      var detail = Model.truncate(stderr !== "" ? stderr : stdout, 320)
      caldirState = "missing"
      loadError = detail !== ""
        ? "Installation failed: " + detail
        : "Installation failed. Visit caldir.org for manual setup instructions."
      meetingDataChanged()
      return
    }
    caldirState = "checking"
    Qt.callLater(root.refresh)
  }

  function finishRefresh(exitCode) {
    var events = []
    if (exitCode !== 0) {
      var stderr = String(agendaStderr.text || "").trim()
      needsCalendarSetup = Model.isNoCalendarsError(stderr)
      if (needsCalendarSetup) {
        loadError = ""
      } else {
        var detail = Model.truncate(stderr, 320)
        loadError = detail !== ""
          ? "caldir failed: " + detail
          : "Could not run caldir. Install it, then run caldir add and caldir pull."
      }
    } else {
      try {
        events = Model.parseAgenda(agendaStdout.text || "")
        needsCalendarSetup = false
        loadError = ""
      } catch (error) {
        needsCalendarSetup = false
        loadError = "caldir returned invalid JSON: " + error
      }
    }
    setEvents(events)
  }

  function setEvents(events) {
    scheduleGroups = Model.buildScheduleGroups(events, now, {
      lookaheadDays: daysAhead,
      maxRows: 20
    })
    nextMeeting = Model.nextMeeting(events, now, {
      lookaheadDays: daysAhead,
      showOnlyWithVideoLink: showOnlyWithVideoLink
    })
    meetingDataChanged()
  }

  function pull() {
    if (pullProcess.running) return
    if (caldirState !== "ready" || caldirExecutable === "") {
      refresh()
      return
    }
    loadError = ""
    pullProcess.command = [caldirExecutable, "pull"]
    pullProcess.running = true
    meetingDataChanged()
  }

  function finishPull(exitCode) {
    if (exitCode !== 0) {
      var detail = Model.truncate(String(pullStderr.text || "").trim(), 320)
      loadError = detail !== ""
        ? "caldir pull failed: " + detail
        : "Could not pull calendars from caldir."
      meetingDataChanged()
      return
    }
    refresh()
  }

  function eventValue(value) {
    return value === undefined || value === null ? "" : String(value)
  }

  function handlerPath() {
    var custom = String(setting("openScript", "") || "").trim()
    return custom !== ""
      ? custom
      : Qt.resolvedUrl("bin/open-event").toString().replace("file://", "")
  }

  function handlerEnvironment(event) {
    return {
      "EVENT_UID": eventValue(event.uid),
      "EVENT_INSTANCE_ID": eventValue(event.instance_id),
      "EVENT_CALENDAR": eventValue(event.calendar),
      "EVENT_TITLE": eventValue(event.title),
      "EVENT_START": eventValue(event.start),
      "EVENT_END": eventValue(event.end),
      "EVENT_ALL_DAY": event && event.all_day === true ? "1" : "0",
      "EVENT_RECURRING": event && event.recurring === true ? "1" : "0",
      "EVENT_LOCATION": eventValue(event.location),
      "EVENT_DESCRIPTION": eventValue(event.description),
      "EVENT_STATUS": eventValue(event.status).toLowerCase(),
      "EVENT_RSVP": eventValue(event.rsvp).toLowerCase(),
      "EVENT_CONFERENCE_URL": eventValue(event.conferenceUrl)
    }
  }

  function runHandler(event, action) {
    if (!event) return
    openProcess.command = [handlerPath(), action]
    openProcess.environment = handlerEnvironment(event)
    openProcess.running = true
  }

  function joinMeeting(event) {
    if (event && event.conferenceUrl) runHandler(event, "join")
  }

  function openCalendar(event) {
    runHandler(event, "calendar")
  }

  function openEvent(event) {
    runHandler(event, "auto")
  }

  // Shape used by shell panel routing and the popout coordinator.
  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item ? panelLoader.item.popoutSwitchClosing === true : false

  function open() {
    refresh()
    if (panelLoader.item) panelLoader.item.open()
  }

  function close() {
    if (panelLoader.item) panelLoader.item.close()
  }

  function togglePanel() {
    if (opened) close()
    else open()
  }

  function closeForPopoutSwitch() {
    if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
  }

  function injectPanel() {
    var target = panelLoader.item
    if (!target) return
    if ("bar" in target) target.bar = root.bar
    if ("settings" in target) target.settings = root.settings
    if ("anchorItem" in target) target.anchorItem = button
    if ("hostWidget" in target) target.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight
  readonly property real openPanelIndicatorWidth: showingFallbackIcon
    ? Math.max(
        fallbackGlyph.tightWidth,
        Style.space(10),
        Math.round(Style.bar.iconSlot * 0.55))
    : button.labelWidth

  onBarChanged: injectPanel()
  onSettingsChanged: {
    injectPanel()
    Qt.callLater(root.refresh)
  }
  onMeetingDataChanged: if (panelLoader.item) panelLoader.item.reload()

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: {
      root.now = date
      root.refresh()
    }
  }

  Process {
    id: caldirCheckProcess
    running: false
    stdout: StdioCollector {
      id: caldirCheckStdout
      waitForEnd: true
    }
    onExited: function(exitCode) { root.finishCaldirCheck(exitCode) }
  }

  Process {
    id: agendaProcess
    running: false
    stdout: StdioCollector {
      id: agendaStdout
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: agendaStderr
      waitForEnd: true
    }
    onExited: function(exitCode) { root.finishRefresh(exitCode) }
  }

  Process {
    id: installProcess
    running: false
    stdout: StdioCollector {
      id: installStdout
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: installStderr
      waitForEnd: true
    }
    onExited: function(exitCode) { root.finishInstall(exitCode) }
  }

  Process {
    id: pullProcess
    running: false
    stdout: StdioCollector {
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: pullStderr
      waitForEnd: true
    }
    onExited: function(exitCode) { root.finishPull(exitCode) }
  }

  Process {
    id: openProcess
    running: false
    clearEnvironment: false
  }

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  IpcHandler {
    target: "omarchy-caldir"

    function refresh(): void { root.refresh() }
    function toggle(): void { root.togglePanel() }
    function open(): void { root.open() }
    function close(): void { root.close() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.label
    labelVisible: !root.showingFallbackIcon
    hasVisualContent: true
    dimmed: root.label === ""
    active: root.inMeeting
    useActiveColor: false
    fixedWidth: root.showingFallbackIcon && !vertical ? Style.bar.iconSlot : -1
    fixedHeight: root.showingFallbackIcon && vertical ? Style.bar.iconSlot : -1
    horizontalMargin: 8.75
    verticalPadding: 8.75
    tooltipText: root.tooltipLine

    OpticalGlyph {
      id: fallbackGlyph
      anchors.centerIn: parent
      width: Style.bar.iconCanvas
      height: Style.bar.iconCanvas
      visible: root.showingFallbackIcon
      text: "󰃲"
      fontFamily: button.fontFamily
      fontSize: Style.bar.iconFont
      color: button.foreground
    }

    onPressed: function(mouseButton) {
      if (mouseButton === Qt.RightButton) {
        if (root.nextMeeting && root.nextMeeting.conferenceUrl) root.joinMeeting(root.nextMeeting)
        else root.togglePanel()
      } else if (mouseButton === Qt.MiddleButton) {
        root.pull()
      } else if (mouseButton === Qt.LeftButton) {
        root.togglePanel()
      }
    }
  }

  readonly property string tooltipLine: {
    if (caldirState === "checking") return "Checking for caldir…"
    if (caldirState === "installing") return "Installing caldir…"
    if (caldirState === "missing") return loadError + "\nClick to install"
    if (needsCalendarSetup) return "No calendar found\nConnect your first calendar"
    if (loadError !== "") return loadError
    if (!nextMeeting) return "No upcoming meetings"
    var title = nextMeeting.title || "(Untitled)"
    var range = Model.timeRange(nextMeeting.startMs, nextMeeting.endMs)
    var status = Model.relativeStatus(nextMeeting, now)
    var line = title + " · " + range + (status ? " (" + status + ")" : "")
    return line
  }

  Component.onCompleted: {
    now = new Date()
    Qt.callLater(root.refresh)
  }
}
