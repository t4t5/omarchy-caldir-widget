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

  // The manifest schema types and bounds these settings.
  readonly property int daysAhead: setting("daysAhead", 2)

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
    && now.getTime() >= nextMeeting.startMs
    && now.getTime() < nextMeeting.endMs
  readonly property string label: nextMeeting
    ? "  " + Model.formatLabel(nextMeeting, now)
    : ""
  readonly property bool showingFallbackIcon: label === ""

  function agendaCommand() {
    var range = Model.queryRange(new Date(), daysAhead)
    return [
      caldirExecutable, "events", "--json",
      "--from", range.from,
      "--to", range.to
    ]
  }

  // The binary and its supported version are detected once; refreshes reuse
  // the cached path until an install or update requires another check.
  function refresh() {
    if (caldirCheckProcess.running || agendaProcess.running || caldirVersionCheck.running) return
    if (caldirState === "ready" && caldirExecutable !== "") {
      agendaProcess.command = agendaCommand()
      agendaProcess.running = true
      return
    }
    caldirCheckProcess.command = ["which", "caldir"]
    caldirCheckProcess.running = true
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

    caldirExecutable = executable
    needsCalendarSetup = false
    loadError = ""
    caldirVersionCheck.start(executable)
  }

  function finishCaldirVersionCheck(errorMessage) {
    if (errorMessage !== "") {
      caldirState = "unsupported"
      loadError = errorMessage
      setEvents([])
      return
    }

    caldirState = "ready"
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
          : "Could not load calendar events from caldir."
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
    scheduleGroups = Model.buildScheduleGroups(events, now, { daysAhead: daysAhead })
    nextMeeting = Model.nextMeeting(events, now)
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
  }

  function finishPull(exitCode) {
    if (exitCode !== 0) {
      var detail = Model.truncate(String(pullStderr.text || "").trim(), 320)
      loadError = detail !== ""
        ? "caldir pull failed: " + detail
        : "Could not pull calendars from caldir."
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
      "EVENT_TITLE": eventValue(event.title),
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

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight
  readonly property real openPanelIndicatorWidth: showingFallbackIcon
    ? Math.max(
        fallbackGlyph.tightWidth,
        Style.space(10),
        Math.round(Style.bar.iconSlot * 0.55))
    : button.labelWidth

  onSettingsChanged: Qt.callLater(root.refresh)

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

  CheckCaldirVersion {
    id: caldirVersionCheck
    onFinished: function(errorMessage) { root.finishCaldirVersionCheck(errorMessage) }
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
      item.bar = Qt.binding(function() { return root.bar })
      item.settings = Qt.binding(function() { return root.settings })
      item.anchorItem = button
      item.hostWidget = root
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
    if (caldirState === "unsupported") return loadError + "\nClick for update instructions"
    if (needsCalendarSetup) return "No calendar found\nConnect your first calendar"
    if (loadError !== "") return loadError
    if (!nextMeeting) return "No upcoming meetings"
    var title = nextMeeting.title
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
