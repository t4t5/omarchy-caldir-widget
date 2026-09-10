import QtQuick
import QtQuick.Layouts
import qs.Commons
import qs.Ui
import "Model.mjs" as Model

BorderSurface {
  id: root
  required property var invitation
  required property var actions
  property string selectedAction: ""
  property bool canRespond: true
  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  property string timeFormat: "24h"
  property date now: new Date()

  signal actionHovered(int index)
  signal responseRequested(string response)

  radius: Style.cornerRadius
  color: Style.normalFillFor(foreground, Color.accent)
  borderSpec: Border.controlSpec("normal", foreground, Color.accent)
  implicitHeight: content.implicitHeight + Style.space(24)

  Column {
    id: content
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.verticalCenter: parent.verticalCenter
    anchors.margins: Style.space(12)
    spacing: Style.space(6)

    Text {
      width: parent.width
      text: root.invitation.title
      textFormat: Text.PlainText
      color: root.foreground
      font.family: root.fontFamily
      font.pixelSize: Style.font.title
      font.bold: true
      wrapMode: Text.WordWrap
    }

    Text {
      width: parent.width
      visible: root.invitation.organizer !== ""
      text: "From: " + root.invitation.organizer
      textFormat: Text.PlainText
      color: Qt.darker(root.foreground, 1.35)
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.Wrap
    }

    Text {
      width: parent.width
      text: Model.invitationTimeLabel(root.invitation, root.now, root.timeFormat)
      textFormat: Text.PlainText
      color: Qt.darker(root.foreground, 1.35)
      font.family: root.fontFamily
      font.pixelSize: Style.font.bodySmall
      wrapMode: Text.WordWrap
    }

    Text {
      width: parent.width
      visible: root.invitation.recurring
      text: "Recurring event · may reply to the whole series"
      color: Qt.darker(root.foreground, 1.5)
      font.family: root.fontFamily
      font.pixelSize: Style.font.caption
      wrapMode: Text.WordWrap
    }

    RowLayout {
      width: parent.width
      spacing: Style.space(8)

      Repeater {
        model: root.actions

        Button {
          id: actionButton
          required property string modelData
          required property int index
          Layout.fillWidth: true
          text: modelData === "accept" ? "Accept" : modelData === "decline" ? "Decline" : "Maybe"
          enabled: root.canRespond
          opacity: enabled ? 1 : 0.5
          selected: modelData === "accept"
          bordered: modelData !== "accept"
          foreground: root.foreground
          accent: Color.accent
          fontFamily: root.fontFamily
          fontSize: Style.font.bodySmall
          horizontalPadding: Style.space(10)
          verticalPadding: Style.space(7)
          onHovered: function(hovered) { if (hovered) root.actionHovered(index) }
          onClicked: root.responseRequested(modelData)

          BorderOverlay {
            opacity: root.selectedAction === actionButton.modelData ? 1 : 0
            radius: actionButton.radius
            borderSpec: Border.withWidth(
              Border.controlSpec("focus", root.foreground, Color.accent),
              Math.max(2, Style.focusBorderWidth))
          }
        }
      }
    }
  }
}
