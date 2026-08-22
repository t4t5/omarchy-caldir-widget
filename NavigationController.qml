import QtQml

QtObject {
  id: root

  property var scheduleGroups: []
  property var nextEvent: null
  property bool inMeeting: false

  property string focusSection: "events"
  property int selectedHeroAction: 0
  property int selectedEventIndex: -1

  signal joinRequested(var event)
  signal openInCalendarRequested(var event)

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

  function heroActionAvailable(action) {
    if (!root.inMeeting || !root.nextEvent) return false
    return action === 0 ? !!root.nextEvent.conferenceUrl : action === 1
  }

  function canFocusHero() {
    return heroActionAvailable(0) || heroActionAvailable(1)
  }

  function ensureSelection() {
    var count = eventCount()
    if (focusSection === "hero") {
      if (!canFocusHero()) {
        focusSection = "events"
        selectedEventIndex = count > 0 ? 0 : -1
      } else {
        selectedEventIndex = -1
        if (!heroActionAvailable(selectedHeroAction))
          selectedHeroAction = heroActionAvailable(0) ? 0 : 1
      }
      return
    }

    if (count === 0) selectedEventIndex = -1
    else selectedEventIndex = Math.max(0, Math.min(selectedEventIndex, count - 1))
  }

  function resetSelection() {
    if (canFocusHero()) {
      focusSection = "hero"
      selectedHeroAction = heroActionAvailable(0) ? 0 : 1
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
      selectedHeroAction = heroActionAvailable(selectedHeroAction)
        ? selectedHeroAction
        : (heroActionAvailable(0) ? 0 : 1)
      selectedEventIndex = -1
    }
    else
      selectedEventIndex = Math.max(0, Math.min(count - 1, selectedEventIndex + direction))
  }

  function selectHeroAction(action) {
    if (!heroActionAvailable(action)) return
    focusSection = "hero"
    selectedHeroAction = action
    selectedEventIndex = -1
  }

  function moveHeroSelection(direction) {
    if (focusSection !== "hero" || direction === 0) return
    if (direction < 0 && heroActionAvailable(0)) selectedHeroAction = 0
    else if (direction > 0 && heroActionAvailable(1)) selectedHeroAction = 1
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
      if (selectedHeroAction === 0 && heroActionAvailable(0)) joinRequested(root.nextEvent)
      else if (selectedHeroAction === 1 && heroActionAvailable(1)) openInCalendarRequested(root.nextEvent)
      return
    }
    var event = selectedEvent()
    if (event) joinRequested(event)
  }
}
