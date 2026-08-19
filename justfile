set quiet

test:
  npm test
  /usr/lib/qt6/bin/qmllint -I ~/.local/share/omarchy/shell BarWidget.qml
  /usr/lib/qt6/bin/qmllint -I ~/.local/share/omarchy/shell Panel.qml
  omarchy plugin validate .

# Link this checkout as a personal plugin and show it on the right of the bar.
install:
    #!/usr/bin/env bash
    set -euo pipefail

    repo_dir="$(pwd -P)"
    plugin_dir="$HOME/.config/omarchy/plugins"
    target="$plugin_dir/caldir-quickshell-widget"

    omarchy plugin validate "$repo_dir"
    mkdir -p "$plugin_dir"

    if [[ -L "$target" ]]; then
      linked_dir="$(readlink -f -- "$target")"
      if [[ "$linked_dir" != "$repo_dir" ]]; then
        echo "Refusing to replace $target; it points to $linked_dir" >&2
        exit 1
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
      if omarchy plugin list --json | jq -e 'any(.[]; .id == "caldir-quickshell-widget")' >/dev/null; then
        discovered=1
        break
      fi
      sleep 0.05
    done
    if (( ! discovered )); then
      echo "caldir-quickshell-widget was not discovered by the running shell" >&2
      exit 1
    fi

    omarchy plugin enable caldir-quickshell-widget --section right
    echo "Caldir Quickshell Widget is live on the right of the bar."

# Validate source edits and cold-reload the linked development plugin.
reload:
    #!/usr/bin/env bash
    set -euo pipefail

    omarchy plugin validate "$(pwd -P)"
    omarchy restart shell
    echo "Reloaded Caldir Quickshell Widget with a fresh QML cache."

# Disable the widget and remove this checkout's personal-plugin symlink.
uninstall:
    #!/usr/bin/env bash
    set -euo pipefail

    repo_dir="$(pwd -P)"
    target="$HOME/.config/omarchy/plugins/caldir-quickshell-widget"

    if [[ ! -e "$target" && ! -L "$target" ]]; then
      echo "Caldir Quickshell Widget is not installed."
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

    if omarchy plugin list --json | jq -e 'any(.[]; .id == "caldir-quickshell-widget")' >/dev/null; then
      omarchy plugin disable caldir-quickshell-widget
    fi
    unlink -- "$target"
    omarchy-shell shell rescanPlugins >/dev/null
    echo "Uninstalled Caldir Quickshell Widget. The project checkout was left untouched."
