set quiet

test:
  npm test
  bash tests/open-event.test.sh
  /usr/lib/qt6/bin/qmllint -I ~/.local/share/omarchy/shell BarWidget.qml
  /usr/lib/qt6/bin/qmllint NavigationController.qml
  /usr/lib/qt6/bin/qmllint -I ~/.local/share/omarchy/shell Panel.qml
  omarchy plugin validate .

# Link this checkout as a personal plugin and show it on the right of the bar.
install:
  ./scripts/dev-install.sh

# Validate source edits and cold-reload the linked development plugin.
reload:
  ./scripts/dev-reload.sh

# Disable the widget and remove this checkout's personal-plugin symlink.
uninstall:
  ./scripts/dev-uninstall.sh
