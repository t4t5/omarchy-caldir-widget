set quiet

test: check
  npm test
  bash tests/open-event.test.sh
  omarchy plugin validate .

check:
  ./scripts/lint.sh

# Link this checkout as a personal plugin and show it on the right of the bar.
install:
  ./scripts/dev-install.sh

# Validate source edits and cold-reload the linked development plugin.
reload:
  ./scripts/dev-reload.sh

# Disable the widget and remove this checkout's personal-plugin symlink.
uninstall:
  ./scripts/dev-uninstall.sh
