import QtQuick
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Ui
import "Model.mjs" as Model

// Caldir Quickshell Widget popup: next-meeting hero followed by a compact multi-day
// schedule. The host owns all data and actions so the panel remains presentational.
Panel {
  id: root
  moduleName: "caldir-quickshell-widget"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property bool inMeeting: hostWidget ? hostWidget.inMeeting : false
  readonly property bool fetching: hostWidget ? hostWidget.fetching : false
  readonly property string loadError: hostWidget ? hostWidget.loadError : ""
  property var scheduleGroups: []
  property var next: null
  property date now: hostWidget ? hostWidget.now : new Date()
  property int selectedEventIndex: -1

  readonly property color contentForeground: bar ? bar.barForeground : Color.foreground
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family

  function open() {
    reload()
    root.controller.show()
  }

  function close() {
    root.controller.hide()
  }

  function toggle() {
    if (root.opened) root.close()
    else root.open()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function reload() {
    if (!hostWidget) return
    scheduleGroups = hostWidget.scheduleGroups || []
    next = hostWidget.nextMeeting || null
    setupItem.visible = !hostWidget.configured && !hostWidget.fetching && hostWidget.loadError !== ""
    heroItem.visible = hostWidget.configured && !!next
    emptyItem.visible = hostWidget.configured && scheduleGroups.length === 0
    scheduleItem.visible = hostWidget.configured && scheduleGroups.length > 0
    ensureEventSelection()
  }

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

  function ensureEventSelection() {
    var count = eventCount()
    if (count === 0) selectedEventIndex = -1
    else selectedEventIndex = Math.max(0, Math.min(selectedEventIndex, count - 1))
  }

  function resetEventSelection() {
    selectedEventIndex = eventCount() > 0 ? 0 : -1
    if (scroll) scroll.contentY = 0
  }

  function moveEventSelection(direction) {
    var count = eventCount()
    if (count === 0 || direction === 0) return
    if (selectedEventIndex < 0)
      selectedEventIndex = direction > 0 ? 0 : count - 1
    else
      selectedEventIndex = Math.max(0, Math.min(count - 1, selectedEventIndex + direction))
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

  function activateSelectedEvent() {
    var event = selectedEvent()
    if (event) join(event)
  }

  function scrollEventIntoView(item) {
    Qt.callLater(function() {
      if (!item || !scroll) return
      var margin = Style.space(6)
      var point = item.mapToItem(scroll.contentItem, 0, 0)
      var top = point.y
      var bottom = top + item.height
      var viewTop = scroll.contentY
      var viewBottom = viewTop + scroll.height
      var maxY = Math.max(0, scroll.contentHeight - scroll.height)
      if (top < viewTop + margin) scroll.contentY = Math.max(0, top - margin)
      else if (bottom > viewBottom - margin)
        scroll.contentY = Math.min(maxY, bottom + margin - scroll.height)
    })
  }

  function join(event) {
    if (!hostWidget || !event) return
    hostWidget.openEvent(event)
    root.close()
  }

  function openInCalendar(event) {
    if (!hostWidget || !event) return
    hostWidget.openCalendar(event)
    root.close()
  }

  function refreshNow() {
    if (hostWidget) hostWidget.refresh()
  }

  onHostWidgetChanged: Qt.callLater(root.reload)
  onOpenedChanged: if (opened) {
    root.reload()
    root.resetEventSelection()
  }

  Connections {
    target: root.hostWidget
    function onMeetingDataChanged() { root.reload() }
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(360))
    contentHeight: panel.fittedContentHeight(contentColumn.implicitHeight)

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      onMoveRequested: function(dx, dy) {
        if (dy !== 0) root.moveEventSelection(dy)
      }
      onActivateRequested: root.activateSelectedEvent()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }

      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: scroll.width
        contentHeight: contentColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: contentColumn
          width: scroll.width
          spacing: Style.space(12)

          Item {
            id: headerRow
            width: parent.width
            height: Math.max(headingLabel.height, stampLabel.height, refreshButton.height)
            implicitHeight: height

            Text {
              id: headingLabel
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              text: "EVENTS"
              color: Qt.darker(root.contentForeground, 1.5)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1.2
              font.bold: true
            }

            Text {
              id: stampLabel
              anchors.right: refreshButton.left
              anchors.rightMargin: Style.space(8)
              anchors.verticalCenter: parent.verticalCenter
              text: {
                if (root.fetching) return "Updating…"
                if (root.loadError !== "") return root.hostWidget && root.hostWidget.configured ? "Update failed · Cached" : "Unavailable"
                if (root.hostWidget && root.hostWidget.configured)
                  return Model.formatUpdated(root.hostWidget.lastUpdated, root.now)
                return ""
              }
              color: root.loadError !== "" ? Color.urgent : Qt.darker(root.contentForeground, 1.5)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
            }

            PanelActionButton {
              id: refreshButton
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              iconText: ""
              tooltipText: root.fetching ? "Refreshing calendar…" : "Refresh calendar"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              enabled: !root.fetching
              opacity: root.fetching ? 0.6 : 1.0
              onClicked: root.refreshNow()
            }
          }

          BorderSurface {
            id: errorItem
            visible: root.loadError !== "" && !!(root.hostWidget && root.hostWidget.configured)
            width: parent.width
            height: visible ? errorText.implicitHeight + Style.space(16) : 0
            implicitHeight: height
            radius: Style.cornerRadius
            color: Style.normalFillFor(root.contentForeground, Color.urgent)
            borderSpec: Border.controlSpec("normal", root.contentForeground, Color.urgent)

            Text {
              id: errorText
              anchors.left: parent.left
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              anchors.margins: Style.space(8)
              text: root.loadError
              color: Color.urgent
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              wrapMode: Text.WordWrap
            }
          }

          Item {
            id: setupItem
            visible: false
            width: parent.width
            height: visible ? setupColumn.implicitHeight : 0
            implicitHeight: height

            Column {
              id: setupColumn
              width: parent.width
              spacing: Style.space(8)

              Text {
                width: parent.width
                text: "Set up caldir"
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
                wrapMode: Text.WordWrap
              }

              Text {
                width: parent.width
                text: "Caldir Quickshell Widget reads calendars already configured in caldir. Install caldir, add a calendar, then pull it once:"
                color: Qt.darker(root.contentForeground, 1.35)
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.bodySmall
                wrapMode: Text.WordWrap
              }

              BorderSurface {
                width: parent.width
                radius: Style.cornerRadius
                color: Style.normalFillFor(root.contentForeground, Color.accent)
                borderSpec: Border.controlSpec("normal", root.contentForeground, Color.accent)
                implicitHeight: setupCommands.implicitHeight + Style.space(16)

                Column {
                  id: setupCommands
                  anchors.left: parent.left
                  anchors.right: parent.right
                  anchors.verticalCenter: parent.verticalCenter
                  anchors.margins: Style.space(8)
                  spacing: Style.space(3)

                  Text {
                    width: parent.width
                    text: "caldir add\ncaldir pull\ncaldir events --json"
                    font.family: "monospace"
                    font.pixelSize: Style.font.caption
                    color: root.contentForeground
                    wrapMode: Text.WrapAnywhere
                  }
                }
              }

              Text {
                width: parent.width
                text: root.loadError
                color: Color.urgent
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.caption
                wrapMode: Text.WordWrap
              }
            }
          }

          Item {
            id: heroItem
            visible: false
            width: parent.width
            height: visible ? heroBlock.implicitHeight : 0
            implicitHeight: height

            BorderSurface {
              id: heroBlock
              width: parent.width
              radius: Style.cornerRadius
              color: root.inMeeting
                ? Style.selectedFillFor(root.contentForeground, Color.accent)
                : Style.normalFillFor(root.contentForeground, Color.accent)
              borderSpec: root.inMeeting
                ? Border.controlSpec("selected", root.contentForeground, Color.accent)
                : Border.none()
              implicitHeight: heroColumn.implicitHeight + Style.space(20)

              Column {
                id: heroColumn
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: Style.space(12)
                anchors.rightMargin: Style.space(12)
                spacing: Style.space(5)

                RowLayout {
                  width: parent.width

                  Text {
                    text: root.inMeeting ? "HAPPENING NOW" : "NEXT"
                    color: root.inMeeting ? Color.accent : Qt.darker(root.contentForeground, 1.5)
                    font.family: root.contentFontFamily
                    font.pixelSize: Style.font.caption
                    font.letterSpacing: 1.2
                    font.bold: true
                  }

                  Item { Layout.fillWidth: true }

                  Text {
                    visible: !!root.next
                    text: {
                      var parts = []
                      var duration = root.next ? Model.formatDuration(root.next.startMs, root.next.endMs) : ""
                      if (duration) parts.push(duration)
                      if (root.next) parts.push(root.next.meetUrl ? "  Meet" : "󰃯  Event")
                      return parts.join("  ·  ")
                    }
                    color: root.inMeeting ? Color.accent : Qt.darker(root.contentForeground, 1.4)
                    font.family: root.contentFontFamily
                    font.pixelSize: Style.font.caption
                    font.bold: true
                  }
                }

                Text {
                  width: parent.width
                  text: root.next ? String(root.next.title || "(Untitled)") : ""
                  color: root.contentForeground
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.title
                  font.bold: true
                  wrapMode: Text.WordWrap
                }

                Text {
                  width: parent.width
                  text: root.next
                    ? Model.meetingTimeLabel(root.next.startMs, root.next.endMs, root.now)
                      + (Model.relativeStatus(root.next, root.now) ? " · " + Model.relativeStatus(root.next, root.now) : "")
                    : ""
                  color: Qt.darker(root.contentForeground, 1.35)
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.WordWrap
                }

                Text {
                  visible: !!(root.next && root.next.location && !root.next.meetUrl)
                  width: parent.width
                  text: root.next ? root.next.location : ""
                  color: Qt.darker(root.contentForeground, 1.45)
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.caption
                  wrapMode: Text.WordWrap
                }

                RowLayout {
                  width: parent.width
                  spacing: Style.space(8)

                  Button {
                    visible: !!(root.next && root.next.meetUrl)
                    Layout.fillWidth: true
                    text: "Join Meeting"
                    iconText: ""
                    selected: true
                    accent: Color.accent
                    fontFamily: root.contentFontFamily
                    fontSize: Style.font.bodySmall
                    iconSize: Style.font.bodySmall
                    horizontalPadding: Style.space(12)
                    verticalPadding: Style.space(7)
                    onClicked: root.join(root.next)
                  }

                  Button {
                    visible: !!root.next
                    Layout.fillWidth: true
                    text: "Open in Calendar"
                    iconText: "󰃯"
                    bordered: true
                    foreground: root.contentForeground
                    fontFamily: root.contentFontFamily
                    fontSize: Style.font.bodySmall
                    iconSize: Style.font.bodySmall
                    horizontalPadding: Style.space(12)
                    verticalPadding: Style.space(7)
                    onClicked: root.openInCalendar(root.next)
                  }
                }
              }
            }
          }

          Item {
            id: emptyItem
            visible: false
            width: parent.width
            height: visible ? emptyColumn.implicitHeight + Style.space(16) : 0
            implicitHeight: height

            Column {
              id: emptyColumn
              anchors.centerIn: parent
              spacing: Style.space(4)

              Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "󰃲"
                color: Qt.darker(root.contentForeground, 1.6)
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.display
              }

              Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "No upcoming meetings"
                color: Qt.darker(root.contentForeground, 1.3)
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.body
                font.bold: true
              }

              Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "Your schedule is clear for the next few days."
                color: Qt.darker(root.contentForeground, 1.6)
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.caption
              }
            }
          }

          Item {
            id: scheduleItem
            visible: false
            width: parent.width
            height: visible ? scheduleColumn.implicitHeight : 0
            implicitHeight: height

            Column {
              id: scheduleColumn
              width: parent.width
              spacing: Style.space(10)

              Repeater {
                model: root.scheduleGroups

                Item {
                  id: groupItem
                  required property var modelData
                  required property int index
                  readonly property var group: modelData
                  width: parent.width
                  height: groupColumn.implicitHeight
                  implicitHeight: height

                  Column {
                    id: groupColumn
                    width: parent.width
                    spacing: Style.space(4)

                    PanelSeparator {
                      visible: groupItem.index > 0 || heroItem.visible
                      foreground: root.contentForeground
                      strength: 0.1
                    }

                    PanelSectionHeader {
                      text: groupItem.group.title
                      foreground: root.contentForeground
                      fontFamily: root.contentFontFamily
                      leftPadding: Style.space(4)
                    }

                    Repeater {
                      model: groupItem.group.items

                      CursorSurface {
                        id: eventRow
                        required property var modelData
                        required property int index
                        readonly property var meeting: modelData
                        readonly property int navigationIndex: root.eventOffset(groupItem.index) + index
                        readonly property bool ended: Number(modelData.endMs) <= root.now.getTime()
                        readonly property bool cancelledOrDeclined: modelData.cancelled === true || modelData.declined === true
                        readonly property bool tentative: modelData.tentative === true
                        width: parent.width
                        hasCursor: navigationIndex === root.selectedEventIndex
                        foreground: root.contentForeground
                        accent: Color.accent
                        opacity: ended ? 0.45 : 1.0
                        implicitHeight: Math.max(Style.space(32), eventLayout.implicitHeight + Style.space(8))

                        MouseArea {
                          id: rowMouse
                          anchors.fill: parent
                          hoverEnabled: true
                          cursorShape: Qt.PointingHandCursor
                          onEntered: root.selectedEventIndex = eventRow.navigationIndex
                          onClicked: root.join(eventRow.meeting)
                        }

                        onHasCursorChanged: if (hasCursor) root.scrollEventIntoView(eventRow)

                        RowLayout {
                          id: eventLayout
                          anchors.left: parent.left
                          anchors.right: parent.right
                          anchors.verticalCenter: parent.verticalCenter
                          anchors.leftMargin: Style.space(10)
                          anchors.rightMargin: Style.space(10)
                          spacing: Style.space(8)

                          Text {
                            Layout.alignment: Qt.AlignVCenter
                            Layout.preferredWidth: Style.space(44)
                            text: eventRow.meeting.all_day ? "ALL DAY" : Model.hm(eventRow.meeting.startMs)
                            color: Qt.darker(root.contentForeground, 1.3)
                            font.family: root.contentFontFamily
                            font.pixelSize: eventRow.meeting.all_day ? Style.font.caption : Style.font.bodySmall
                            font.bold: true
                          }

                          Text {
                            Layout.fillWidth: true
                            Layout.alignment: Qt.AlignVCenter
                            text: eventRow.meeting.title || "(Untitled)"
                            color: eventRow.tentative
                              ? Qt.darker(root.contentForeground, 1.35)
                              : root.contentForeground
                            font.family: root.contentFontFamily
                            font.pixelSize: Style.font.body
                            font.italic: eventRow.tentative
                            font.strikeout: eventRow.cancelledOrDeclined
                            elide: Text.ElideRight
                            maximumLineCount: 1
                          }

                          Text {
                            visible: !eventRow.meeting.all_day
                            Layout.alignment: Qt.AlignVCenter
                            Layout.preferredWidth: Style.space(34)
                            horizontalAlignment: Text.AlignRight
                            text: Model.formatDuration(eventRow.meeting.startMs, eventRow.meeting.endMs)
                            color: Qt.darker(root.contentForeground, 1.6)
                            font.family: root.contentFontFamily
                            font.pixelSize: Style.font.caption
                          }

                          Text {
                            Layout.alignment: Qt.AlignVCenter
                            Layout.preferredWidth: Style.space(16)
                            horizontalAlignment: Text.AlignRight
                            text: eventRow.ended ? "󰄬" : eventRow.meeting.meetUrl ? "" : "󰃯"
                            color: eventRow.ended || !eventRow.meeting.meetUrl
                              ? Qt.darker(root.contentForeground, 1.5)
                              : Color.accent
                            font.family: root.contentFontFamily
                            font.pixelSize: Style.font.bodySmall
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
