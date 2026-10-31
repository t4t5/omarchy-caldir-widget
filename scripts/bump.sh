#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$repo_dir"

fail() {
  echo "$1" >&2
  exit 1
}

[[ $# -eq 1 ]] || fail "Usage: $0 <version>"
version="${1#v}"
current="$(jq -r .version manifest.json)"

[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "Version must look like 1.2.3, got: $version"
[[ "$version" != "$current" && "$(printf '%s\n' "$current" "$version" | sort -V | tail -1)" == "$version" ]] \
  || fail "Version $version is not newer than $current"
[[ "$(git branch --show-current)" == main ]] || fail "Release from main"
[[ -z "$(git status --porcelain)" ]] || fail "Working tree is not clean"
git fetch --quiet
[[ "$(git rev-parse HEAD)" == "$(git rev-parse '@{upstream}')" ]] || fail "main is not in sync with its upstream"
! git rev-parse --quiet --verify "refs/tags/v$version" >/dev/null || fail "Tag v$version already exists"

just test

# Replace only the top-level "version" key so the files keep their formatting.
sed -i -E "0,/\"version\": \"[^\"]+\"/s//\"version\": \"$version\"/" manifest.json package.json
for file in manifest.json package.json; do
  [[ "$(jq -r .version "$file")" == "$version" ]] || fail "Could not update the version in $file"
done

git commit --quiet -m "Release $version" manifest.json package.json
git tag -a "v$version" -m "Version $version"
echo "Tagged v$version. Push with: git push --follow-tags"
echo "Then publish it on GitHub with: gh release create v$version --generate-notes"
