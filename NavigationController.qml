import QtQml
import "Model.mjs" as Model

QtObject {
  id: root

  property var scheduleGroups: []
  property var nextEvent: null

  property string focusSection: "events"
  // An index into heroActions, not an action id.
  property int selectedHeroAction: 0
  property int selectedEventIndex: -1

  readonly property var heroActions: Model.heroActions(nextEvent)
  readonly property bool canFocusHero: heroActions.length > 0
  readonly property string heroAction: focusSection === "hero"
    && selectedHeroAction < heroActions.length
      ? heroActions[selectedHeroAction]
      : ""

  signal openEventRequested(var event)
  signal openInCalendarRequested(var event)

  // Keyed to the derived list, not to nextEvent, so the actions are already
  // current when the selection is clamped against them.
  onScheduleGroupsChanged: ensureSelection()
  onHeroActionsChanged: ensureSelection()

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
  function focusHero(index) {
    if (!canFocusHero) return
    focusSection = "hero"
    selectedHeroAction = Math.max(0, Math.min(index, heroActions.length - 1))
    selectedEventIndex = -1
  }

  function focusEvent(index) {
    var count = eventCount()
    focusSection = "events"
    selectedEventIndex = count > 0 ? Math.max(0, Math.min(index, count - 1)) : -1
  }

  function ensureSelection() {
    if (focusSection === "hero" && canFocusHero) focusHero(selectedHeroAction)
    else focusEvent(selectedEventIndex)
  }

  function resetSelection() {
    if (canFocusHero) focusHero(0)
    else focusEvent(0)
  }

  function moveEventSelection(direction) {
    if (direction === 0) return
    var count = eventCount()

    if (focusSection === "hero") {
      if (direction > 0 && count > 0) focusEvent(0)
      return
    }

    if (count === 0) return
    if (selectedEventIndex < 0) focusEvent(direction > 0 ? 0 : count - 1)
    // Stepping up off the first row keeps whichever hero action was last used.
    else if (direction < 0 && selectedEventIndex === 0 && canFocusHero) focusHero(selectedHeroAction)
    else focusEvent(selectedEventIndex + direction)
  }

  function moveHeroSelection(direction) {
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
    if (focusSection === "hero") {
      if (heroAction === "join") openEventRequested(root.nextEvent)
      else if (heroAction === "calendar") openInCalendarRequested(root.nextEvent)
      return
    }
    var event = selectedEvent()
    if (event) openEventRequested(event)
  }
}
