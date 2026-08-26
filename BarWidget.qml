import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.mjs" as Model

// Omarchy Caldir Widget — a local caldir-backed event countdown.
// Remote calendars are pulled every five minutes. Left click opens the schedule,
// right click joins the next meeting, and middle click pulls immediately.
BarWidget {
  id: root
  moduleName: "org.ren.caldir"

  // The manifest schema types and bounds these settings.
  readonly property int daysAhead: setting("daysAhead", 2)

  property var scheduleGroups: []
  property var nextMeeting: null
  property var calendarColors: ({})
  property string loadError: ""
  property bool needsCalendarSetup: false
  property string caldirState: "checking"
  property string caldirExecutable: ""
  property string timeFormat: "24h"
  property date now: new Date()

  readonly property bool syncing: pullProcess.running
  readonly property bool inMeeting: nextMeeting
    && now.getTime() >= nextMeeting.startMs
    && now.getTime() < nextMeeting.endMs
  readonly property string label: nextMeeting
    ? "  " + Model.formatLabel(nextMeeting, now, timeFormat)
    : ""
  readonly property bool showingFallbackIcon: label === ""

  function agendaCommand() {
    return Model.boundedCommand([
      localizedEventsPath(), caldirExecutable, String(daysAhead)
    ])
  }

  function startDataRefresh() {
    configProcess.command = Model.boundedCommand([caldirExecutable, "config", "--json"])
    configProcess.running = true
  }

  function finishConfigRefresh(exitCode) {
    if (exitCode === 0) {
      try {
        timeFormat = Model.parseTimeFormat(configStdout.text || "")
      } catch (error) {
        // Time format is presentational; retain the last known preference.
      }
    }
    calendarProcess.command = Model.boundedCommand([caldirExecutable, "calendars", "--json"])
    calendarProcess.running = true
  }

  // The binary and its supported version are detected once; refreshes reuse
  // the cached path until an install or update requires another check.
  function refresh() {
    if (caldirCheckProcess.running || configProcess.running || calendarProcess.running
        || agendaProcess.running || caldirVersionCheck.running) return
    if (caldirState === "ready" && caldirExecutable !== "") {
      startDataRefresh()
      return
    }
    caldirCheckProcess.command = Model.boundedCommand(["which", "caldir"])
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
    startDataRefresh()
  }

  function finishCalendarRefresh(exitCode) {
    calendarColors = ({})
    if (exitCode === 0) {
      try {
        calendarColors = Model.parseCalendarColors(calendarStdout.text || "")
      } catch (error) {
        // Calendar colors are decorative; agenda loading should still proceed.
      }
    }
    agendaProcess.command = agendaCommand()
    agendaProcess.running = true
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
        events = Model.parseAgenda(agendaStdout.text || "", calendarColors)
        needsCalendarSetup = false
        loadError = ""
      } catch (error) {
        needsCalendarSetup = false
        loadError = "caldir returned unusable output: " + error
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
    pullProcess.command = Model.boundedCommand([caldirExecutable, "pull"])
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
    return Qt.resolvedUrl("bin/open-event").toString().replace("file://", "")
  }

  function localizedEventsPath() {
    return Qt.resolvedUrl("bin/localized-events").toString().replace("file://", "")
  }

  function handlerEnvironment(event) {
    return {
      "EVENT_UID": eventValue(event.uid),
      "EVENT_RECURRENCE_ID": eventValue(event.recurrence_id),
      "EVENT_TITLE": eventValue(event.title),
      "EVENT_CONFERENCE_URL": eventValue(event.conferenceUrl)
    }
  }

  function runHandler(event, action) {
    if (!event) return
    openProcess.command = Model.boundedCommand([handlerPath(), action])
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
    runHandler(event, event.conferenceUrl ? "join" : "calendar")
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
    : plainLabel.implicitWidth

  onSettingsChanged: Qt.callLater(root.refresh)

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: {
      root.now = date
      root.refresh()
    }
  }

  Timer {
    interval: 5 * 60 * 1000
    repeat: true
    running: root.caldirState === "ready"
    onTriggered: root.pull()
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
    id: configProcess
    running: false
    stdout: StdioCollector {
      id: configStdout
      waitForEnd: true
    }
    onExited: function(exitCode) { root.finishConfigRefresh(exitCode) }
  }

  Process {
    id: calendarProcess
    running: false
    stdout: StdioCollector {
      id: calendarStdout
      waitForEnd: true
    }
    onExited: function(exitCode) { root.finishCalendarRefresh(exitCode) }
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
    id: pullProcess
    running: false
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
    stderr: StdioCollector { id: openStderr }
    onExited: function(exitCode) {
      if (exitCode === 0) return
      var detail = Model.truncate(Model.plainLine(String(openStderr.text || "").trim()), 200)
      Quickshell.execDetached([
        "notify-send", "-u", "low", "Caldir widget",
        detail !== "" ? detail : "Could not open the event."
      ])
    }
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
    target: "org.ren.caldir"

    function refresh(): void { root.refresh() }
    function toggle(): void { root.togglePanel() }
    function open(): void { root.open() }
    function close(): void { root.close() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // Render event text as PlainText instead of the host's AutoText label.
    text: root.label
    labelVisible: false
    hasVisualContent: true
    dimmed: root.label === ""
    active: root.inMeeting
    useActiveColor: false
    fixedWidth: root.showingFallbackIcon && !vertical ? Style.bar.iconSlot : -1
    fixedHeight: root.showingFallbackIcon && vertical ? Style.bar.iconSlot : -1
    horizontalMargin: 8.75
    verticalPadding: 8.75
    tooltipText: root.tooltipLine

    Text {
      id: plainLabel
      visible: !root.showingFallbackIcon
      anchors.centerIn: parent
      text: root.label
      textFormat: Text.PlainText
      color: button.foreground
      font.family: button.fontFamily
      font.pixelSize: button.fontSize
      renderType: Text.NativeRendering
      horizontalAlignment: Text.AlignHCenter
      verticalAlignment: Text.AlignVCenter

      Behavior on color {
        enabled: !button.bar || button.bar.foregroundAnimationEnabled
        ColorAnimation { duration: 160 }
      }
    }

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

  // Sanitize external text passed to the host's AutoText tooltip.
  readonly property string tooltipLine: {
    if (caldirState === "checking") return "Checking for caldir…"
    if (caldirState === "missing") return Model.plainLine(loadError) + "\nClick for install instructions"
    if (caldirState === "unsupported") return Model.plainLine(loadError) + "\nClick for update instructions"
    if (needsCalendarSetup) return "No calendar found\nConnect your first calendar"
    if (loadError !== "") return Model.plainLine(loadError)
    if (!nextMeeting) return "No upcoming meetings"
    var title = Model.plainLine(nextMeeting.title)
    var range = Model.eventTimeRange(nextMeeting, timeFormat)
    var status = Model.relativeStatus(nextMeeting, now, timeFormat)
    var line = title + " · " + range + (status ? " (" + status + ")" : "")
    return line
  }

  Component.onCompleted: {
    now = new Date()
    Qt.callLater(root.refresh)
  }
}
