import QtQml

QtObject {
  id: root

  property var scheduleGroups: []
  property var nextEvent: null

  property string focusSection: "events"
  property int selectedHeroAction: 0
  property int selectedEventIndex: -1

  signal openEventRequested(var event)
  signal openInCalendarRequested(var event)

  onScheduleGroupsChanged: ensureSelection()
  onNextEventChanged: ensureSelection()

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

  function canFocusHero() {
    return !!root.nextEvent
  }

  function ensureSelection() {
    var count = eventCount()
    if (focusSection === "hero") {
      if (!canFocusHero()) {
        focusSection = "events"
        selectedEventIndex = count > 0 ? 0 : -1
      } else {
        selectedEventIndex = -1
      }
      return
    }

    if (count === 0) selectedEventIndex = -1
    else selectedEventIndex = Math.max(0, Math.min(selectedEventIndex, count - 1))
  }

  function resetSelection() {
    if (canFocusHero()) {
      focusSection = "hero"
      selectedHeroAction = 0
      selectedEventIndex = -1
    } else {
      focusSection = "events"
      selectedHeroAction = 0
      selectedEventIndex = eventCount() > 0 ? 0 : -1
    }
  }

  function moveEventSelection(direction) {
    var count = eventCount()
    if (direction === 0) return

    if (focusSection === "hero") {
      if (direction > 0 && count > 0) {
        focusSection = "events"
        selectedEventIndex = 0
      }
      return
    }

    if (count === 0) return
    if (selectedEventIndex < 0)
      selectedEventIndex = direction > 0 ? 0 : count - 1
    else if (direction < 0 && selectedEventIndex === 0 && canFocusHero()) {
      focusSection = "hero"
      selectedEventIndex = -1
    }
    else
      selectedEventIndex = Math.max(0, Math.min(count - 1, selectedEventIndex + direction))
  }

  function selectHeroAction(action) {
    if (!canFocusHero() || (action !== 0 && action !== 1)) return
    focusSection = "hero"
    selectedHeroAction = action
    selectedEventIndex = -1
  }

  function moveHeroSelection(direction) {
    if (focusSection !== "hero" || direction === 0) return
    if (direction < 0) selectedHeroAction = 0
    else if (direction > 0) selectedHeroAction = 1
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
      if (!canFocusHero()) return
      if (selectedHeroAction === 0) openEventRequested(root.nextEvent)
      else if (selectedHeroAction === 1) openInCalendarRequested(root.nextEvent)
      return
    }
    var event = selectedEvent()
    if (event) openEventRequested(event)
  }
}
