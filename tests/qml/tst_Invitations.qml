import QtQuick
import QtTest
import "../.." as Widget

TestCase {
  id: testCase
  name: "Invitations"

  function cleanupTestCase() {
    console.log("Invitation tests: " + qtest_results.passCount + " passed, " + qtest_results.failCount + " failed")
  }

  Widget.NavigationController { id: navigation }
  Widget.InvitationController { id: responses }
  SignalSpy { id: responseSpy; target: navigation; signalName: "responseRequested" }
  SignalSpy { id: savedSpy; target: responses; signalName: "responseSaved" }

  function invite(calendar) {
    return { path: "/tmp/widget-invite.ics", calendar: calendar || "work", title: "Planning" }
  }

  function init() {
    navigation.invitations = [invite(), { path: "/tmp/second.ics" }]
    navigation.nextEvent = { conferenceUrl: "https://meet.google.com/abc-defg-hij" }
    navigation.scheduleGroups = [{ items: [{ title: "Agenda" }] }]
    navigation.resetSelection()
    responses.executable = Qt.resolvedUrl("../fixtures/fake-caldir").toString().replace("file://", "")
    responses.invitations = [invite()]
    responses.pendingSend = null
    responses.syncBlocked = false
    responses.responseError = ""
    responses.loadError = ""
    responseSpy.clear()
    savedSpy.clear()
  }

  function cleanup() {
    tryCompare(responses, "busy", false)
    if (qtest_results.failed) console.warn("Failed invitation test: " + qtest_results.functionName)
  }

  function test_keyboard_moves_through_invitations_meeting_and_agenda() {
    compare(navigation.focusSection, "invitations")
    compare(navigation.invitationAction, "maybe")
    navigation.moveHeroSelection(10)
    compare(navigation.invitationAction, "accept")
    navigation.activateSelection()
    compare(responseSpy.count, 1)
    compare(responseSpy.signalArguments[0][0].path, "/tmp/widget-invite.ics")
    compare(responseSpy.signalArguments[0][1], "accept")
    navigation.moveEventSelection(1)
    compare(navigation.selectedInvitationIndex, 1)
    navigation.moveEventSelection(1)
    compare(navigation.heroAction, "join")
    navigation.moveEventSelection(1)
    compare(navigation.selectedEventIndex, 0)
    navigation.moveEventSelection(-1)
    compare(navigation.focusSection, "hero")
    navigation.moveEventSelection(-1)
    compare(navigation.selectedInvitationIndex, 1)
  }

  function test_selection_clamps_when_cards_disappear() {
    navigation.focusHero(99, 99)
    compare(navigation.selectedInvitationIndex, 1)
    navigation.invitations = [invite()]
    compare(navigation.selectedInvitationIndex, 0)
    navigation.invitations = []
    compare(navigation.heroAction, "join")
    navigation.nextEvent = null
    compare(navigation.focusSection, "events")
    navigation.invitations = [invite()]
    navigation.moveEventSelection(-1)
    compare(navigation.selectedInvitationIndex, 0)
  }

  function test_all_responses_save_and_push() {
    for (var response of ["maybe", "decline", "accept"]) {
      responses.invitations = [invite()]
      savedSpy.clear()
      responses.respond(invite(), response)
      responses.respond(invite(), response) // busy: duplicate click is ignored
      tryCompare(responses, "busy", false)
      compare(savedSpy.count, 2) // local save, then confirmed push
      compare(responses.invitations.length, 0)
      compare(responses.pendingSend, null)
      compare(responses.responseError, "")
    }
  }

  function test_failed_save_keeps_invitation() {
    responses.executable = "/bin/false"
    responses.respond(invite(), "accept")
    tryCompare(responses, "busy", false)
    compare(responses.invitations.length, 1)
    compare(responses.pendingSend, null)
    verify(responses.responseError.indexOf("Could not save") >= 0)
    compare(savedSpy.count, 0)
  }

  function test_provider_failure_exit_zero_offers_retry() {
    responses.invitations = [invite("offline")]
    responses.respond(invite("offline"), "accept")
    tryCompare(responses, "busy", false)
    compare(responses.invitations.length, 0)
    verify(responses.canRetry)
    verify(!responses.canRespond)
    verify(responses.responseError.indexOf("sending could not be confirmed") >= 0)
    responses.pendingSend = invite("work")
    responses.retrySend()
    tryCompare(responses, "busy", false)
    compare(responses.pendingSend, null)
    compare(responses.responseError, "")
  }

  function test_pull_and_stale_cards_cannot_start_rsvp() {
    responses.syncBlocked = true
    responses.respond(invite(), "accept")
    verify(!responses.busy)
    responses.syncBlocked = false
    responses.respond({ path: "/tmp/stale.ics" }, "accept")
    verify(!responses.busy)
  }

  function test_failed_invitation_refresh_retains_last_good_data() {
    responses.executable = "/bin/echo"
    responses.refresh()
    tryCompare(responses, "busy", false)
    compare(responses.invitations.length, 1)
    verify(responses.loadError !== "")
    responses.responseError = "Retain failed-send feedback"
    responses.executable = Qt.resolvedUrl("../fixtures/fake-caldir").toString().replace("file://", "")
    responses.refresh()
    tryCompare(responses, "busy", false)
    compare(responses.invitations.length, 0)
    compare(responses.loadError, "")
    compare(responses.responseError, "Retain failed-send feedback")
  }
}
