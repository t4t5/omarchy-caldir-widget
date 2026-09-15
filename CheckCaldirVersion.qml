import QtQml
import Quickshell.Io
import "model/check-caldir-version.mjs" as VersionCheck
import "model/command.mjs" as Command

// Verify the CLI requirement before attempting to load calendar data.
QtObject {
  id: root

  readonly property bool running: process.running
  property bool invitationsSupported: false
  signal finished(string errorMessage)

  function start(executable) {
    invitationsSupported = false
    process.command = Command.boundedCommand([executable, "--version"])
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
      root.invitationsSupported = exitCode === 0 && VersionCheck.supportsInvitations(output)
      root.finished(VersionCheck.errorMessage(exitCode, output))
    }
  }
}
