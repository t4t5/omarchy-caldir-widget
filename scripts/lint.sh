#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$repo_dir"

# Quickshell aliases the shell root as the `qs` module namespace at runtime;
# qmllint only understands real directories, so expose the alias as a symlink
# on the import path. Kept outside the repo: the plugin validator forbids
# symlinks inside the plugin folder.
import_dir="${XDG_CACHE_HOME:-$HOME/.cache}/omarchy-caldir/qmllint"
mkdir -p "$import_dir"
ln -sfn "$HOME/.local/share/omarchy/shell" "$import_dir/qs"

# unqualified: outer-id access from delegates, legal under the default
#   ComponentBehavior (adopt `pragma ComponentBehavior: Bound` to re-enable).
# signal-handler-parameters: Quickshell's Process.exited declares a
#   QProcess::ExitStatus parameter its qmltypes don't expose.
output="$(/usr/lib/qt6/bin/qmllint -I "$import_dir" \
  --unqualified disable \
  --signal-handler-parameters disable \
  ./*.qml 2>&1)" || true

# qs.Ui types its `bar` and Style's `font` as bare QtObject, and qmllint
# can't follow Model.mjs's `export {...} from` re-exports, so members of
# those are invisible to static analysis; every other missing-property hit
# is real.
remaining="$(grep -E '^(Warning|Error)' <<<"$output" \
  | grep -vF 'not found on type "QObject"' \
  | grep -vF 'not found on type "Model"' || true)"

if [[ -n "$remaining" ]]; then
  echo "$remaining"
  exit 1
fi
