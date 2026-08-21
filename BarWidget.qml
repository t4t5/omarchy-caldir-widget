import QtQuick
import Quickshell
import Quickshell.Io
import qs.Ui
import "Model.mjs" as Model

// Caldir Quickshell Widget — a local caldir-backed event countdown.
// Left click opens the schedule, right click joins the next meeting, and middle
// click pulls remote calendars before refreshing the local view.
BarWidget {
  id: root
  moduleName: "caldir-quickshell-widget"

  readonly property int daysAhead: Math.max(1, Math.min(30, Number(setting("daysAhead", 3)) || 3))
  readonly property int pollSeconds: Math.max(15, Math.min(3600, Number(setting("pollSeconds", 60)) || 60))
  readonly property string calendarSlug: String(setting("calendar", "") || "").trim()
  readonly property int maxTitleLength: Math.max(8, Math.min(80, Number(setting("maxTitleLength", 28)) || 28))
  readonly property bool showOnlyWithVideoLink: {
    var value = setting("showOnlyWithVideoLink", true)
    if (value === undefined || value === null) return true
    if (value === true || value === 1 || value === "1") return true
    if (value === false || value === 0 || value === "0") return false
    return String(value).toLowerCase() !== "false"
  }

  property var rawEvents: []
  property var meetings: []
  property var upcomingToday: []
  property var scheduleGroups: []
  property var nextMeeting: null
  property string loadError: ""
  property bool configured: false
  property bool refreshQueued: false
  property date lastUpdated: new Date(0)
  property date now: new Date()

  readonly property bool fetching: agendaProcess.running
  readonly property bool lastFetchFailed: loadError !== ""
  readonly property bool inMeeting: nextMeeting
    && now.getTime() >= Number(nextMeeting.startMs)
    && now.getTime() < Number(nextMeeting.endMs)
  readonly property string label: nextMeeting
    ? (nextMeeting.meetUrl ? "  " : "󰃯  ") + Model.formatLabel(nextMeeting, now, maxTitleLength)
    : ""

  signal meetingDataChanged()

  function agendaCommand() {
    var range = Model.queryRange(new Date(), daysAhead)
    var command = [
      "caldir", "events", "--json",
      "--from", range.from,
      "--to", range.to
    ]
    if (calendarSlug !== "") command.push("--calendar", calendarSlug)
    return command
  }

  function refresh() {
    if (agendaProcess.running) {
      refreshQueued = true
      return
    }
    agendaProcess.command = agendaCommand()
    agendaProcess.running = true
  }

  function finishRefresh(exitCode) {
    if (exitCode !== 0) {
      var detail = Model.truncate(String(agendaStderr.text || "").trim(), 320)
      loadError = detail !== ""
        ? "caldir failed: " + detail
        : "Could not run caldir. Install it, then run caldir add and caldir pull."
    } else {
      try {
        rawEvents = Model.parseAgenda(agendaStdout.text || "")
        configured = true
        lastUpdated = new Date()
        loadError = ""
        recalc()
      } catch (error) {
        loadError = "caldir returned invalid JSON: " + error
      }
    }
    meetingDataChanged()

    if (refreshQueued) {
      refreshQueued = false
      Qt.callLater(root.refresh)
    }
  }

  function recalc() {
    meetings = Model.buildUpcoming(rawEvents, now, {
      lookaheadDays: daysAhead,
      showOnlyWithVideoLink: showOnlyWithVideoLink,
      maxRows: 8,
      excludeAllDay: true
    })
    upcomingToday = Model.upcomingToday(rawEvents, now)
    scheduleGroups = Model.buildScheduleGroups(rawEvents, now, {
      lookaheadDays: daysAhead,
      maxRows: 20
    })
    nextMeeting = Model.nextMeeting(rawEvents, now, {
      lookaheadDays: daysAhead,
      showOnlyWithVideoLink: showOnlyWithVideoLink
    })
    meetingDataChanged()
  }

  function manualPull() {
    if (bar && typeof bar.run === "function") bar.run("caldir pull")
    pullRefreshTimer.restart()
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
      "EVENT_CONFERENCE_URL": eventValue(event.meetUrl)
    }
  }

  function runHandler(event, action) {
    if (!event) return
    openProcess.command = [handlerPath(), action]
    openProcess.environment = handlerEnvironment(event)
    openProcess.running = true
  }

  function joinMeeting(event) {
    if (event && event.meetUrl) runHandler(event, "join")
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

  onBarChanged: injectPanel()
  onSettingsChanged: {
    injectPanel()
    recalc()
    Qt.callLater(root.refresh)
  }
  onNowChanged: recalc()
  onMeetingDataChanged: if (panelLoader.item) panelLoader.item.reload()

  SystemClock {
    id: clock
    precision: SystemClock.Minutes
    onDateChanged: root.now = date
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
    id: openProcess
    running: false
    clearEnvironment: false
  }

  Timer {
    interval: root.pollSeconds * 1000
    running: true
    repeat: true
    onTriggered: root.refresh()
  }

  Timer {
    id: pullRefreshTimer
    interval: 2000
    repeat: false
    onTriggered: root.refresh()
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
    target: "caldir-quickshell-widget"

    function refresh(): void { root.refresh() }
    function toggle(): void { root.togglePanel() }
    function open(): void { root.open() }
    function close(): void { root.close() }
  }

  WidgetButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: root.label !== "" ? root.label : "󰃲"
    labelVisible: true
    hasVisualContent: true
    dimmed: root.label === ""
    active: root.inMeeting
    useActiveColor: false
    horizontalMargin: 8.75
    verticalPadding: 8.75
    tooltipText: root.tooltipLine

    onPressed: function(mouseButton) {
      if (mouseButton === Qt.RightButton) {
        if (root.nextMeeting && root.nextMeeting.meetUrl) root.joinMeeting(root.nextMeeting)
        else root.togglePanel()
      } else if (mouseButton === Qt.MiddleButton) {
        root.manualPull()
      } else if (mouseButton === Qt.LeftButton) {
        root.togglePanel()
      }
    }
  }

  readonly property string tooltipLine: {
    if (!configured && loadError !== "") return loadError + "\nClick for setup help"
    if (!nextMeeting) return "No upcoming meetings" + (loadError !== "" ? "\n" + loadError : "")
    var title = nextMeeting.title || "(Untitled)"
    var range = Model.timeRange(nextMeeting.startMs, nextMeeting.endMs)
    var status = Model.relativeStatus(nextMeeting, now)
    var line = title + " · " + range + (status ? " (" + status + ")" : "")
    if (loadError !== "") line += "\n" + loadError
    return line
  }

  Component.onCompleted: {
    now = new Date()
    Qt.callLater(root.refresh)
  }
}
