#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
plugin_dir="$HOME/.config/omarchy/plugins"
plugin_id="t4t5.caldir"
legacy_target="$plugin_dir/omarchy-caldir"
target="$plugin_dir/$plugin_id"

omarchy plugin validate "$repo_dir"
mkdir -p "$plugin_dir"

if [[ -L "$legacy_target" && -e "$legacy_target" ]]; then
  legacy_linked_dir="$(readlink -f -- "$legacy_target")"
  if [[ "$legacy_linked_dir" == "$repo_dir" ]]; then
    unlink -- "$legacy_target"
    echo "Removed legacy development symlink $legacy_target"
  fi
fi

if [[ -L "$target" ]]; then
  if [[ ! -e "$target" ]]; then
    stale_link="$(readlink -- "$target")"
    unlink -- "$target"
    ln -s "$repo_dir" "$target"
    echo "Replaced dangling symlink $target -> $stale_link"
    echo "Linked $target -> $repo_dir"
  else
    linked_dir="$(readlink -f -- "$target")"
    if [[ "$linked_dir" != "$repo_dir" ]]; then
      echo "Refusing to replace $target; it points to $linked_dir" >&2
      exit 1
    fi
  fi
elif [[ -e "$target" ]]; then
  echo "Refusing to replace existing plugin directory: $target" >&2
  exit 1
else
  ln -s "$repo_dir" "$target"
  echo "Linked $target -> $repo_dir"
fi

omarchy-shell shell rescanPlugins >/dev/null
discovered=0
for _ in {1..40}; do
  if omarchy plugin list --json | jq -e --arg id "$plugin_id" 'any(.[]; .id == $id)' >/dev/null; then
    discovered=1
    break
  fi
  sleep 0.05
done
if (( ! discovered )); then
  echo "$plugin_id was not discovered by the running shell" >&2
  exit 1
fi

omarchy plugin enable "$plugin_id" --section right
echo "Omarchy Caldir Widget is live on the right of the bar."
