import QtQuick
import Quickshell.Io
import "Model.mjs" as Model

Item {
  id: root
  visible: false

  property string executable: ""
  property var calendarColors: ({})
  property bool syncBlocked: false
  property var invitations: []
  property string loadError: ""
  property string responseError: ""
  property var pendingSend: null
  property var respondingTo: null
  property string phase: ""
  property bool refreshing: false
  readonly property bool responding: phase !== ""
  readonly property bool busy: refreshing || responding
  readonly property bool canRespond: executable !== "" && !busy && !syncBlocked && !pendingSend
  readonly property bool canRetry: !!pendingSend && !busy && !syncBlocked

  signal responseSaved()

  function refresh() {
    if (executable === "" || busy) return
    refreshing = true
    inviteProcess.command = Model.boundedCommand([executable, "invites", "--json"])
    inviteProcess.running = true
  }

  function respond(event, response) {
    if (!canRespond || !event) return
    // Only act on a current invitation, never a stale delegate.
    if (!invitations.some(function(invite) { return invite.path === event.path })) return
    rsvpProcess.command = Model.boundedCommand(Model.rsvpCommand(executable, event, response))
    respondingTo = event
    responseError = ""
    phase = "saving"
    rsvpProcess.running = true
  }

  function retrySend() {
    if (!canRetry) return
    responseError = ""
    phase = "sending"
    pushProcess.command = Model.boundedCommand([executable, "push", "--calendar", pendingSend.calendar])
    pushProcess.running = true
  }

  Process {
    id: inviteProcess
    stdout: StdioCollector { id: inviteStdout; waitForEnd: true }
    stderr: StdioCollector { id: inviteStderr; waitForEnd: true }
    onExited: function(exitCode) {
      root.refreshing = false
      if (exitCode !== 0) {
        var stderr = String(inviteStderr.text || "").trim()
        if (Model.isNoCalendarsError(stderr)) {
          root.invitations = []
          root.loadError = ""
        } else {
          root.loadError = "Could not load invitations. Try caldir update. " + Model.truncate(stderr, 200)
        }
        return
      }
      try {
        root.invitations = Model.parseInvitations(inviteStdout.text || "", root.calendarColors)
        root.loadError = ""
      } catch (error) {
        root.loadError = "Could not load invitations. Try caldir update. " + error
      }
    }
  }

  Process {
    id: rsvpProcess
    stderr: StdioCollector { id: rsvpStderr; waitForEnd: true }
    onExited: function(exitCode) {
      root.phase = ""
      if (exitCode !== 0) {
        root.responseError = "Could not save your response. "
          + Model.truncate(String(rsvpStderr.text || "").trim(), 200)
        root.respondingTo = null
        return
      }
      root.pendingSend = root.respondingTo
      root.respondingTo = null
      root.invitations = root.invitations.filter(function(invite) { return invite.path !== root.pendingSend.path })
      root.retrySend()
      root.responseSaved()
    }
  }

  Process {
    id: pushProcess
    stdout: StdioCollector { id: pushStdout; waitForEnd: true }
    stderr: StdioCollector { id: pushStderr; waitForEnd: true }
    onExited: function(exitCode) {
      root.phase = ""
      // caldir can report provider failures on stdout with exit code zero.
      if (!Model.rsvpPushSucceeded(exitCode, pushStdout.text || "")) {
        root.responseError = "Your response is saved, but sending could not be confirmed. Retry sending. "
          + Model.truncate(Model.plainLine(String(pushStderr.text || pushStdout.text || "").trim()), 200)
        return
      }
      root.pendingSend = null
      root.responseError = ""
      root.refresh()
      root.responseSaved()
    }
  }
}
