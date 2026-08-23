import QtQml
import Quickshell.Io
import "model/check-caldir-version.mjs" as VersionCheck

// TEMPORARY: compatibility for caldir releases older than 0.12.0. Delete this
// component, its model module and tests, and the BarWidget hook once those
// installations are no longer plausible.
QtObject {
  id: root

  readonly property bool running: process.running
  property string agendaError: ""

  signal finished(string errorMessage)

  function start(executable, errorMessage) {
    agendaError = String(errorMessage || "")
    process.command = [executable, "--version"]
    process.running = true
  }

  property Process process: Process {
    running: false
    stdout: StdioCollector {
      id: versionStdout
      waitForEnd: true
    }
    stderr: StdioCollector {
      id: versionStderr
      waitForEnd: true
    }
    onExited: function(exitCode) {
      var output = String(versionStdout.text || "") + "\n" + String(versionStderr.text || "")
      root.finished(VersionCheck.errorMessage(exitCode, output, root.agendaError))
      root.agendaError = ""
    }
  }
}
