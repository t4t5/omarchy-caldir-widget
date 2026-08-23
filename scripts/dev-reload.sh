#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"

omarchy plugin validate "$repo_dir"
omarchy restart shell
echo "Reloaded Omarchy Caldir Widget with a fresh QML cache."
