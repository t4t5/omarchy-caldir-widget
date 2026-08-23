#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
plugin_dir="$HOME/.config/omarchy/plugins"
target="$plugin_dir/omarchy-caldir"

omarchy plugin validate "$repo_dir"
mkdir -p "$plugin_dir"

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
  if omarchy plugin list --json | jq -e 'any(.[]; .id == "omarchy-caldir")' >/dev/null; then
    discovered=1
    break
  fi
  sleep 0.05
done
if (( ! discovered )); then
  echo "omarchy-caldir was not discovered by the running shell" >&2
  exit 1
fi

omarchy plugin enable omarchy-caldir --section right
echo "Omarchy Caldir Widget is live on the right of the bar."
