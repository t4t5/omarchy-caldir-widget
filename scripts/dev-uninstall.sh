#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
plugin_id="org.ren.caldir"
target="$HOME/.config/omarchy/plugins/$plugin_id"

if [[ ! -e "$target" && ! -L "$target" ]]; then
  echo "Omarchy Caldir Widget is not installed."
  exit 0
fi
if [[ ! -L "$target" ]]; then
  echo "Refusing to remove non-symlink plugin: $target" >&2
  exit 1
fi

linked_dir="$(readlink -f -- "$target")"
if [[ "$linked_dir" != "$repo_dir" ]]; then
  echo "Refusing to remove $target; it points to $linked_dir" >&2
  exit 1
fi

if omarchy plugin list --json | jq -e --arg id "$plugin_id" 'any(.[]; .id == $id)' >/dev/null; then
  omarchy plugin disable "$plugin_id"
fi
unlink -- "$target"
omarchy-shell shell rescanPlugins >/dev/null
echo "Uninstalled Omarchy Caldir Widget. The project checkout was left untouched."
