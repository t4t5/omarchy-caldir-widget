import QtQuick
import QtQuick.Layouts
import Quickshell
import qs.Commons
import qs.Ui
import "Model.mjs" as Model

// Omarchy Caldir Widget popup: next-meeting hero followed by a compact multi-day
// schedule. The host owns all data and actions so the panel remains presentational.
Panel {
  id: root
  moduleName: "omarchy-caldir"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property bool inMeeting: hostWidget ? hostWidget.inMeeting : false
  readonly property bool syncing: hostWidget ? hostWidget.syncing : false
  readonly property string caldirState: hostWidget ? hostWidget.caldirState : "checking"
  readonly property bool installingCaldir: hostWidget ? hostWidget.installingCaldir : false
  readonly property string loadError: hostWidget ? hostWidget.loadError : ""
  readonly property bool needsCalendarSetup: hostWidget ? hostWidget.needsCalendarSetup : false
  readonly property var connectionCommands: [
    "caldir connect google",
    "caldir connect icloud",
    "caldir connect caldav",
    "caldir connect webcal"
  ]
  readonly property var scheduleGroups: hostWidget && hostWidget.scheduleGroups ? hostWidget.scheduleGroups : []
  readonly property var next: hostWidget ? hostWidget.nextMeeting : null
  property date now: hostWidget ? hostWidget.now : new Date()

  readonly property color contentForeground: bar ? bar.barForeground : Color.foreground
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family

  NavigationController {
    id: navigation
    scheduleGroups: root.scheduleGroups
    nextEvent: root.next
    inMeeting: root.inMeeting
    onJoinRequested: function(event) { root.join(event) }
    onOpenInCalendarRequested: function(event) { root.openInCalendar(event) }
  }

  function open() {
    root.controller.show()
  }

  function close() {
    root.controller.hide()
  }

  function switchPanel(direction) {
    if (root.bar && typeof root.bar.switchPanelFrom === "function")
      return root.bar.switchPanelFrom(root.barIdentity, direction)
    return false
  }

  function scrollItemIntoView(item) {
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

  function syncNow() {
    if (hostWidget) hostWidget.pull()
  }

  function installCaldir() {
    if (hostWidget) hostWidget.installCaldir()
  }

  function openCaldirDocs() {
    Quickshell.execDetached(["xdg-open", "https://caldir.org"])
  }

  onOpenedChanged: if (opened) {
    navigation.resetSelection()
    if (scroll) scroll.contentY = 0
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
        if (dx !== 0) navigation.moveHeroSelection(dx)
        if (dy !== 0) navigation.moveEventSelection(dy)
      }
      onActivateRequested: navigation.activateSelection()
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      onTextKey: function(text) {
        if (text === "s" || text === "S") root.syncNow()
      }

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
            visible: heroItem.visible || scheduleItem.visible
            width: parent.width
            height: visible ? Math.max(headingLabel.height, stampLabel.height, syncButton.height) : 0
            implicitHeight: height

            Text {
              id: headingLabel
              anchors.left: parent.left
              anchors.verticalCenter: parent.verticalCenter
              text: "CALENDAR"
              color: Qt.darker(root.contentForeground, 1.5)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
              font.letterSpacing: 1.2
              font.bold: true
            }

            Text {
              id: stampLabel
              anchors.right: syncButton.visible ? syncButton.left : parent.right
              anchors.rightMargin: syncButton.visible ? Style.space(8) : 0
              anchors.verticalCenter: parent.verticalCenter
              text: {
                if (root.installingCaldir) return "Installing…"
                if (root.caldirState === "checking") return "Checking…"
                if (root.caldirState === "missing") return "Not installed"
                if (root.syncing) return "Syncing…"
                if (root.loadError !== "") return "Update failed"
                return ""
              }
              color: root.loadError !== "" ? Color.urgent : Qt.darker(root.contentForeground, 1.5)
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.caption
            }

            PanelActionButton {
              id: syncButton
              anchors.right: parent.right
              anchors.verticalCenter: parent.verticalCenter
              iconText: ""
              tooltipText: root.syncing ? "Syncing calendar…" : "Sync now"
              foreground: root.contentForeground
              fontFamily: root.contentFontFamily
              visible: root.caldirState === "ready"
              enabled: !root.syncing
              opacity: root.syncing ? 0.6 : 1.0
              onClicked: root.syncNow()

              Text {
                id: syncIcon
                anchors.centerIn: parent
                text: root.syncing ? "" : ""
                color: syncButton.foreground
                font.family: syncButton.fontFamily
                font.pixelSize: syncButton.fontSize

                RotationAnimation on rotation {
                  from: 0
                  to: 360
                  duration: 900
                  loops: Animation.Infinite
                  running: root.syncing
                }

                onRotationChanged: if (!root.syncing && rotation !== 0) rotation = 0
              }
            }
          }

          BorderSurface {
            id: errorItem
            visible: root.loadError !== "" && root.caldirState === "ready"
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
            visible: !!root.hostWidget && root.caldirState !== "ready"
            width: parent.width
            height: visible ? setupColumn.implicitHeight : 0
            implicitHeight: height

            Column {
              id: setupColumn
              width: parent.width
              spacing: Style.space(8)

              Text {
                width: parent.width
                text: "Install caldir"
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.subtitle
                font.bold: true
                wrapMode: Text.WordWrap
              }

              Text {
                width: parent.width
                text: "This widget needs the caldir CLI. Install it here, then follow the setup guide at caldir.org to connect your calendar."
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
                    text: "curl -sSf https://caldir.org/install.sh | sh"
                    font.family: "monospace"
                    font.pixelSize: Style.font.caption
                    color: root.contentForeground
                    wrapMode: Text.WrapAnywhere
                  }
                }
              }

              RowLayout {
                visible: root.caldirState !== "checking"
                width: parent.width
                spacing: Style.space(8)

                Button {
                  Layout.fillWidth: true
                  text: root.installingCaldir ? "Installing…" : "Install caldir"
                  iconText: root.installingCaldir ? "" : ""
                  iconSpinning: root.installingCaldir
                  selected: true
                  enabled: !root.installingCaldir
                  foreground: root.contentForeground
                  accent: Color.accent
                  fontFamily: root.contentFontFamily
                  fontSize: Style.font.bodySmall
                  iconSize: Style.font.bodySmall
                  horizontalPadding: Style.space(12)
                  verticalPadding: Style.space(7)
                  onClicked: root.installCaldir()
                }

                Button {
                  Layout.fillWidth: true
                  text: "View docs"
                  iconText: ""
                  bordered: true
                  foreground: root.contentForeground
                  accent: Color.accent
                  fontFamily: root.contentFontFamily
                  fontSize: Style.font.bodySmall
                  iconSize: Style.font.bodySmall
                  horizontalPadding: Style.space(12)
                  verticalPadding: Style.space(7)
                  onClicked: root.openCaldirDocs()
                }
              }
            }
          }

          Item {
            id: calendarSetupItem
            visible: root.caldirState === "ready" && root.needsCalendarSetup
            width: parent.width
            height: visible ? calendarSetupSurface.implicitHeight : 0
            implicitHeight: height

            BorderSurface {
              id: calendarSetupSurface
              width: parent.width
              radius: Style.cornerRadius
              color: Style.normalFillFor(root.contentForeground, Color.accent)
              borderSpec: Border.controlSpec("normal", root.contentForeground, Color.accent)
              implicitHeight: calendarSetupColumn.implicitHeight + Style.space(24)

              Column {
                id: calendarSetupColumn
                anchors.left: parent.left
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                anchors.leftMargin: Style.space(12)
                anchors.rightMargin: Style.space(12)
                spacing: Style.space(8)

                Text {
                  anchors.horizontalCenter: parent.horizontalCenter
                  text: "󰃲"
                  color: Color.accent
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.display
                }

                Text {
                  width: parent.width
                  horizontalAlignment: Text.AlignHCenter
                  text: "No calendar found"
                  color: root.contentForeground
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.subtitle
                  font.bold: true
                  wrapMode: Text.WordWrap
                }

                Text {
                  width: parent.width
                  horizontalAlignment: Text.AlignHCenter
                  text: "Connect your first calendar by copying one of these commands into your terminal."
                  color: Qt.darker(root.contentForeground, 1.35)
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.bodySmall
                  wrapMode: Text.WordWrap
                }

                Item {
                  width: parent.width
                  height: Style.space(2)
                }

                Repeater {
                  model: root.connectionCommands

                  TextField {
                    required property string modelData
                    width: parent.width
                    text: modelData
                    readOnly: true
                    selectByMouse: true
                    foreground: root.contentForeground
                    accent: Color.accent
                    font.family: "monospace"
                    font.pixelSize: Style.font.caption
                    horizontalPadding: Style.space(10)
                    verticalPadding: Style.space(6)
                    onActiveFocusChanged: if (activeFocus) selectAll()
                  }
                }
              }
            }
          }

          Item {
            id: heroItem
            visible: root.caldirState === "ready" && !!root.next
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
                      if (root.next) parts.push(root.next.conferenceUrl ? "  Meet" : "󰃯  Event")
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
                  visible: !!(root.next && root.next.location && !root.next.conferenceUrl)
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
                    id: joinButton
                    readonly property bool keyboardFocused: navigation.focusSection === "hero"
                      && navigation.selectedHeroAction === 0
                    visible: !!(root.next && root.next.conferenceUrl)
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
                    onHovered: function(isHovered) {
                      if (isHovered) navigation.selectHeroAction(0)
                    }
                    onKeyboardFocusedChanged: if (keyboardFocused) root.scrollItemIntoView(heroBlock)
                    onClicked: root.join(root.next)

                    BorderOverlay {
                      opacity: joinButton.keyboardFocused ? 1 : 0
                      radius: joinButton.radius
                      borderSpec: Border.withWidth(
                        Border.controlSpec("focus", root.contentForeground, Color.accent),
                        Math.max(2, Style.focusBorderWidth))
                    }
                  }

                  Button {
                    id: calendarButton
                    readonly property bool keyboardFocused: navigation.focusSection === "hero"
                      && navigation.selectedHeroAction === 1
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
                    onHovered: function(isHovered) {
                      if (isHovered) navigation.selectHeroAction(1)
                    }
                    onKeyboardFocusedChanged: if (keyboardFocused) root.scrollItemIntoView(heroBlock)
                    onClicked: root.openInCalendar(root.next)

                    BorderOverlay {
                      opacity: calendarButton.keyboardFocused ? 1 : 0
                      radius: calendarButton.radius
                      borderSpec: Border.withWidth(
                        Border.controlSpec("focus", root.contentForeground, Color.accent),
                        Math.max(2, Style.focusBorderWidth))
                    }
                  }
                }
              }
            }
          }

          Item {
            id: emptyItem
            visible: root.caldirState === "ready"
              && !root.needsCalendarSetup
              && root.loadError === ""
              && root.scheduleGroups.length === 0
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
            visible: root.caldirState === "ready" && root.scheduleGroups.length > 0
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

                    RowLayout {
                      spacing: Style.space(6)

                      PanelSectionHeader {
                        text: groupItem.group.title
                        foreground: root.contentForeground
                        fontFamily: root.contentFontFamily
                        leftPadding: Style.space(4)
                      }

                      PanelSectionHeader {
                        visible: groupItem.group.dateTitle !== groupItem.group.title
                        text: groupItem.group.dateTitle || ""
                        foreground: root.contentForeground
                        fontFamily: root.contentFontFamily
                        opacity: 0.55
                      }
                    }

                    Repeater {
                      model: groupItem.group.items

                      CursorSurface {
                        id: eventRow
                        required property var modelData
                        required property int index
                        readonly property var meeting: modelData
                        readonly property int navigationIndex: navigation.eventOffset(groupItem.index) + index
                        readonly property bool ended: Number(modelData.endMs) <= root.now.getTime()
                        readonly property bool cancelledOrDeclined: modelData.cancelled === true || modelData.declined === true
                        readonly property bool tentative: modelData.tentative === true
                        width: parent.width
                        hasCursor: navigationIndex === navigation.selectedEventIndex
                        foreground: root.contentForeground
                        accent: Color.accent
                        opacity: ended ? 0.45 : 1.0
                        implicitHeight: Math.max(Style.space(32), eventLayout.implicitHeight + Style.space(8))

                        MouseArea {
                          id: rowMouse
                          anchors.fill: parent
                          hoverEnabled: true
                          cursorShape: Qt.PointingHandCursor
                          onEntered: {
                            navigation.focusSection = "events"
                            navigation.selectedEventIndex = eventRow.navigationIndex
                          }
                          onClicked: root.join(eventRow.meeting)
                        }

                        onHasCursorChanged: if (eventRow.hasCursor) root.scrollItemIntoView(eventRow)

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
                            visible: !!eventRow.meeting.conferenceUrl
                            Layout.alignment: Qt.AlignVCenter
                            Layout.preferredWidth: Style.space(16)
                            horizontalAlignment: Text.AlignRight
                            text: ""
                            color: Color.accent
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
