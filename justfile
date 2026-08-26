set quiet

# List all available tasks
default:
  @just --list

# Run all tests and checks:
test: check
  npm test
  bash tests/open-event.test.sh
  python3 tests/localized-events.test.py
  omarchy plugin validate .

# Check the code for linting errors:
check:
  ./scripts/lint.sh

# Install the current code in the Omarchy bar:
install:
  ./scripts/dev-install.sh

# Reload the current code in the Omarchy bar:
reload:
  ./scripts/dev-reload.sh

# Uninstall the current code from the Omarchy bar:
uninstall:
  ./scripts/dev-uninstall.sh
