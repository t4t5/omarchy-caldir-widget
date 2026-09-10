import QtQml
import "Model.mjs" as Model

QtObject {
  id: root

  property var scheduleGroups: []
  property var nextEvent: null
  property var invitations: []

  property string focusSection: "events"
  // An index into heroActions, not an action id.
  property int selectedHeroAction: 0
  property int selectedEventIndex: -1
  property int selectedInvitationIndex: -1

  readonly property var heroActions: Model.heroActions(nextEvent)
  readonly property var invitationActions: Model.INVITATION_ACTIONS
  readonly property string invitationAction: focusSection === "invitations"
    ? invitationActions[selectedHeroAction] || "" : ""
  readonly property bool canFocusHero: heroActions.length > 0
  readonly property string heroAction: focusSection === "hero"
    && selectedHeroAction < heroActions.length
      ? heroActions[selectedHeroAction]
      : ""

  signal openEventRequested(var event)
  signal openInCalendarRequested(var event)
  signal responseRequested(var event, string response)

  // Keyed to the derived list, not to nextEvent, so the actions are already
  // current when the selection is clamped against them.
  onScheduleGroupsChanged: ensureSelection()
  onHeroActionsChanged: ensureSelection()
  onCanFocusHeroChanged: ensureSelection()
  onInvitationsChanged: ensureSelection()

  function eventCount() {
    var count = 0
    for (var i = 0; i < scheduleGroups.length; i++)
      count += scheduleGroups[i] && scheduleGroups[i].items ? scheduleGroups[i].items.length : 0
    return count
  }

  function eventOffset(groupIndex) {
    var offset = 0
    for (var i = 0; i < groupIndex; i++)
      offset += scheduleGroups[i] && scheduleGroups[i].items ? scheduleGroups[i].items.length : 0
    return offset
  }

  // The only two writers of the selection state; both clamp on the way in.
  function focusHero(index, invitationIndex) {
    if (invitationIndex !== undefined && invitationIndex >= 0 && invitations.length > 0) {
      focusSection = "invitations"
      selectedInvitationIndex = Math.max(0, Math.min(invitationIndex, invitations.length - 1))
      selectedHeroAction = Math.max(0, Math.min(index, invitationActions.length - 1))
      selectedEventIndex = -1
      return
    }
    if (!canFocusHero) return
    focusSection = "hero"
    selectedInvitationIndex = -1
    selectedHeroAction = Math.max(0, Math.min(index, heroActions.length - 1))
    selectedEventIndex = -1
  }

  function focusEvent(index) {
    var count = eventCount()
    focusSection = "events"
    selectedInvitationIndex = -1
    selectedEventIndex = count > 0 ? Math.max(0, Math.min(index, count - 1)) : -1
  }

  function ensureSelection() {
    if (focusSection === "invitations") {
      if (invitations.length > 0) focusHero(selectedHeroAction, selectedInvitationIndex)
      else resetSelection()
    }
    else if (focusSection === "hero" && canFocusHero) focusHero(selectedHeroAction)
    else focusEvent(selectedEventIndex)
  }

  function resetSelection() {
    if (invitations.length > 0) focusHero(0, 0)
    else if (canFocusHero) focusHero(0)
    else focusEvent(0)
  }

  function moveEventSelection(direction) {
    if (direction === 0) return
    var count = eventCount()

    if (focusSection === "invitations") {
      var index = selectedInvitationIndex + direction
      if (index < invitations.length) focusHero(selectedHeroAction, Math.max(0, index))
      else if (canFocusHero) focusHero(0)
      else if (count > 0) focusEvent(0)
      return
    }

    if (focusSection === "hero") {
      if (direction > 0 && count > 0) focusEvent(0)
      else if (direction < 0 && invitations.length > 0) focusHero(0, invitations.length - 1)
      return
    }

    if (count === 0) {
      if (direction < 0) resetSelection()
      return
    }
    if (selectedEventIndex < 0) focusEvent(direction > 0 ? 0 : count - 1)
    // Stepping up off the first row keeps whichever hero action was last used.
    else if (direction < 0 && selectedEventIndex === 0 && canFocusHero) focusHero(selectedHeroAction)
    else if (direction < 0 && selectedEventIndex === 0 && invitations.length > 0) focusHero(0, invitations.length - 1)
    else focusEvent(selectedEventIndex + direction)
  }

  function moveHeroSelection(direction) {
    if (focusSection === "invitations") {
      focusHero(selectedHeroAction + direction, selectedInvitationIndex)
      return
    }
    if (focusSection !== "hero" || direction === 0) return
    focusHero(selectedHeroAction + direction)
  }

  function selectHeroAction(action) {
    var index = heroActions.indexOf(action)
    if (index >= 0) focusHero(index)
  }

  function selectedEvent() {
    var target = selectedEventIndex
    if (target < 0) return null
    for (var i = 0; i < scheduleGroups.length; i++) {
      var items = scheduleGroups[i] && scheduleGroups[i].items ? scheduleGroups[i].items : []
      if (target < items.length) return items[target]
      target -= items.length
    }
    return null
  }

  function activateSelection() {
    if (focusSection === "invitations") {
      var invite = invitations[selectedInvitationIndex]
      if (invite && invitationAction) responseRequested(invite, invitationAction)
      return
    }
    if (focusSection === "hero") {
      if (heroAction === "join") openEventRequested(root.nextEvent)
      else if (heroAction === "calendar") openInCalendarRequested(root.nextEvent)
      return
    }
    var event = selectedEvent()
    if (event) openEventRequested(event)
  }
}
