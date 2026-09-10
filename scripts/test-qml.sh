#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
test_dir="$(mktemp -d /tmp/caldir-qml.XXXXXX)"
trap 'rm -rf -- "$test_dir"' EXIT

# Quickshell embeds its QML plugins, so run QtTest in its engine. Isolate the
# config and runtime; all RSVP calls go to the bundled fake executable.
cp "$repo_dir/Model.mjs" "$repo_dir/NavigationController.qml" "$repo_dir/InvitationController.qml" "$test_dir/"
cp -r "$repo_dir/model" "$test_dir/"
mkdir -p "$test_dir/tests" "$test_dir/runtime"
chmod 700 "$test_dir/runtime"
cp -r "$repo_dir/tests/fixtures" "$test_dir/tests/"
sed -e 's|import "../.." as Widget|import "." as Widget|' \
    -e 's|../fixtures/fake-caldir|tests/fixtures/fake-caldir|g' \
    "$repo_dir/tests/qml/tst_Invitations.qml" > "$test_dir/shell.qml"

env -u WAYLAND_DISPLAY QT_QPA_PLATFORM=offscreen QT_QPA_PLATFORMTHEME= \
  QT_QUICK_CONTROLS_STYLE=Basic XDG_RUNTIME_DIR="$test_dir/runtime" \
  timeout 30 qs -p "$test_dir" --no-color > "$test_dir/output" 2>&1 || {
    cat "$test_dir/output"
    exit 1
  }

# QtTest does not set Quickshell's exit status; require its explicit result.
if ! rg 'Invitation tests: [1-9][0-9]* passed, 0 failed' "$test_dir/output"; then
  cat "$test_dir/output"
  exit 1
fi
