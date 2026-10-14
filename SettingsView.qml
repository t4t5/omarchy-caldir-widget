import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Model.mjs" as Model

// In-panel settings. Values are read from the host widget, which owns the
// normalized settings, and every change is written back through
// hostWidget.saveSetting so shell.json stays the single source of truth.
Column {
  id: root

  property var hostWidget: null
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family

  signal doneRequested()

  readonly property var choice: Model.normalizeCalendars(hostWidget ? hostWidget.calendarsSetting : null)
  readonly property string calendarMode: choice.mode === "list" ? "custom" : choice.mode
  readonly property string rencalGroup: choice.mode === "rencal" ? choice.group : "default"
  readonly property var rencalGroups: hostWidget ? hostWidget.rencalGroups : []
  readonly property var calendars: hostWidget ? hostWidget.calendarList : []
  readonly property var shownSlugs: hostWidget ? hostWidget.calendarFilter : null
  readonly property color mutedForeground: Qt.darker(foreground, 1.35)

  spacing: Style.space(10)

  function save(key, value) {
    if (hostWidget) hostWidget.saveSetting(key, value)
  }

  function calendarShown(slug) {
    return !shownSlugs || shownSlugs.indexOf(slug) !== -1
  }

  function setCalendarMode(mode) {
    if (mode === calendarMode) return
    if (mode === "all") save("calendars", "all")
    else if (mode === "rencal") save("calendars", null)
    else {
      // Start the custom list from what is shown now, so switching is a no-op
      // until a calendar is toggled.
      var slugs = calendars.filter(function(c) { return calendarShown(c.slug) })
        .map(function(c) { return c.slug })
      save("calendars", slugs.length > 0 ? slugs : calendars.map(function(c) { return c.slug }))
    }
  }

  function toggleCalendar(slug) {
    var slugs = calendars.filter(function(c) { return calendarShown(c.slug) })
      .map(function(c) { return c.slug })
    var at = slugs.indexOf(slug)
    if (at === -1) slugs.push(slug)
    else if (slugs.length > 1) slugs.splice(at, 1)
    else return // An empty list would mean "mirror renCal", not "show nothing".
    save("calendars", slugs)
  }

  function rencalSummary() {
    if (!hostWidget || !hostWidget.rencalConfigFound)
      return "renCal's config was not found, so all calendars are shown."
    if (!shownSlugs)
      return "renCal's “" + rencalGroup + "” group is empty or missing, so all calendars are shown."
    return "Showing the " + shownSlugs.length + " calendars in renCal's “" + rencalGroup + "” group."
  }

  // ---- Calendars ---------------------------------------------------------

  PanelSectionHeader {
    text: "CALENDARS"
    foreground: root.foreground
    fontFamily: root.fontFamily
    leftPadding: Style.space(4)
  }

  ButtonGroup {
    width: parent.width
    options: [
      { value: "rencal", label: "Match renCal" },
      { value: "all", label: "All" },
      { value: "custom", label: "Choose" }
    ]
    value: root.calendarMode
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.bodySmall
    focusable: false
    onChanged: function(value) { root.setCalendarMode(value) }
  }

  ButtonGroup {
    visible: root.calendarMode === "rencal" && root.rencalGroups.length > 1
    width: parent.width
    options: root.rencalGroups
    value: root.rencalGroup
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.bodySmall
    focusable: false
    onChanged: function(value) { root.save("calendars", value === "default" ? null : "rencal:" + value) }
  }

  Text {
    visible: root.calendarMode !== "custom"
    width: parent.width
    leftPadding: Style.space(4)
    rightPadding: Style.space(4)
    text: root.calendarMode === "all"
      ? "Showing every calendar caldir syncs, including shared ones."
      : root.rencalSummary()
    color: root.mutedForeground
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  Column {
    visible: root.calendarMode === "custom"
    width: parent.width
    spacing: Style.space(2)

    Repeater {
      model: root.calendars

      CursorSurface {
        id: calendarRow
        required property var modelData
        readonly property bool shown: root.calendarShown(modelData.slug)
        width: parent.width
        hasCursor: calendarMouse.containsMouse
        foreground: root.foreground
        accent: Color.accent
        implicitHeight: Math.max(Style.space(30), calendarName.implicitHeight + Style.space(8))

        RowLayout {
          anchors.fill: parent
          anchors.leftMargin: Style.space(8)
          anchors.rightMargin: Style.space(4)
          spacing: Style.space(8)

          Rectangle {
            Layout.alignment: Qt.AlignVCenter
            Layout.preferredWidth: Style.space(8)
            Layout.preferredHeight: Style.space(8)
            radius: width / 2
            color: calendarRow.modelData.color || Color.accent
            opacity: calendarRow.shown ? 1 : 0.35
          }

          Text {
            id: calendarName
            Layout.fillWidth: true
            Layout.alignment: Qt.AlignVCenter
            text: calendarRow.modelData.name
            textFormat: Text.PlainText
            color: calendarRow.shown ? root.foreground : root.mutedForeground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
            elide: Text.ElideRight
            maximumLineCount: 1
          }

          ToggleSwitch {
            Layout.alignment: Qt.AlignVCenter
            checked: calendarRow.shown
            interactive: false
          }
        }

        MouseArea {
          id: calendarMouse
          anchors.fill: parent
          hoverEnabled: true
          cursorShape: Qt.PointingHandCursor
          onClicked: root.toggleCalendar(calendarRow.modelData.slug)
        }
      }
    }

    Text {
      visible: root.calendars.length === 0
      leftPadding: Style.space(4)
      text: "No calendars found. Sync, then try again."
      color: root.mutedForeground
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
    }
  }

  PanelSeparator {
    foreground: root.foreground
    strength: 0.1
  }

  // ---- Events ------------------------------------------------------------

  PanelSectionHeader {
    text: "EVENTS"
    foreground: root.foreground
    fontFamily: root.fontFamily
    leftPadding: Style.space(4)
  }

  Repeater {
    model: [
      {
        key: "hideAllDay",
        label: "Hide all-day events",
        description: "Holidays, birthdays, and other all-day entries."
      },
      {
        key: "hideWorkingLocation",
        label: "Hide working location",
        description: "Google Calendar's Home / Office markers."
      }
    ]

    CursorSurface {
      id: switchRow
      required property var modelData
      readonly property bool checked: root.hostWidget ? root.hostWidget[modelData.key] === true : false
      width: parent.width
      hasCursor: switchMouse.containsMouse
      foreground: root.foreground
      accent: Color.accent
      implicitHeight: switchText.implicitHeight + Style.space(12)

      RowLayout {
        anchors.fill: parent
        anchors.leftMargin: Style.space(8)
        anchors.rightMargin: Style.space(4)
        spacing: Style.space(8)

        Column {
          id: switchText
          Layout.fillWidth: true
          Layout.alignment: Qt.AlignVCenter
          spacing: Style.space(1)

          Text {
            width: parent.width
            text: switchRow.modelData.label
            color: root.foreground
            font.family: root.fontFamily
            font.pixelSize: Style.font.bodySmall
          }

          Text {
            width: parent.width
            text: switchRow.modelData.description
            color: root.mutedForeground
            font.family: root.fontFamily
            font.pixelSize: Style.font.caption
            wrapMode: Text.WordWrap
          }
        }

        ToggleSwitch {
          Layout.alignment: Qt.AlignVCenter
          checked: switchRow.checked
          interactive: false
        }
      }

      MouseArea {
        id: switchMouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: root.save(switchRow.modelData.key, !switchRow.checked)
      }
    }
  }

  RowLayout {
    width: parent.width
    spacing: Style.space(8)

    Text {
      Layout.fillWidth: true
      leftPadding: Style.space(8)
      text: "Days shown"
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
    }

    NumberField {
      value: root.hostWidget ? root.hostWidget.daysAhead : Model.DAYS_AHEAD.defaultValue
      from: Model.DAYS_AHEAD.min
      to: Model.DAYS_AHEAD.max
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.bodySmall
      onModified: function(value) { root.save("daysAhead", value) }
    }
  }

  PanelSeparator {
    foreground: root.foreground
    strength: 0.1
  }

  // ---- Bar ---------------------------------------------------------------

  PanelSectionHeader {
    text: "BAR"
    foreground: root.foreground
    fontFamily: root.fontFamily
    leftPadding: Style.space(4)
  }

  ButtonGroup {
    width: parent.width
    options: [
      { value: Model.HIGHLIGHT_EVENTS_MEETINGS, label: "Meetings only" },
      { value: Model.HIGHLIGHT_EVENTS_ALL, label: "All events" }
    ]
    value: root.hostWidget ? root.hostWidget.highlightEvents : Model.HIGHLIGHT_EVENTS.defaultValue
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.bodySmall
    focusable: false
    onChanged: function(value) { root.save("highlightEvents", value) }
  }

  RowLayout {
    width: parent.width
    spacing: Style.space(8)

    Text {
      Layout.fillWidth: true
      leftPadding: Style.space(8)
      text: "Show in bar this many minutes before"
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    NumberField {
      value: root.hostWidget ? root.hostWidget.lookaheadMinutes : Model.LOOKAHEAD_MINUTES.defaultValue
      from: Model.LOOKAHEAD_MINUTES.min
      to: Model.LOOKAHEAD_MINUTES.max
      stepSize: 5
      foreground: root.foreground
      fontFamily: root.fontFamily
      fontSize: Style.font.bodySmall
      onModified: function(value) { root.save("lookaheadMinutes", value) }
    }
  }

  Text {
    visible: !!root.hostWidget && root.hostWidget.settingError !== ""
    width: parent.width
    leftPadding: Style.space(4)
    text: root.hostWidget ? root.hostWidget.settingError : ""
    textFormat: Text.PlainText
    color: Color.urgent
    font.family: root.fontFamily
    font.pixelSize: Style.font.caption
    wrapMode: Text.WordWrap
  }

  Button {
    width: parent.width
    text: "Done"
    iconText: "󰄬"
    bordered: true
    foreground: root.foreground
    fontFamily: root.fontFamily
    fontSize: Style.font.bodySmall
    iconSize: Style.font.bodySmall
    verticalPadding: Style.space(7)
    onClicked: root.doneRequested()
  }
}
