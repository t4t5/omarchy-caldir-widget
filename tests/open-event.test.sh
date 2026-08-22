#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
handler="$repo_dir/bin/open-event"
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT

mkdir "$temp_dir/bin"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf '\''%s\n'\'' "$1" >> "$XDG_OPEN_LOG"' \
  '[[ -z "${XDG_OPEN_BLOCK_SECONDS:-}" ]] || sleep "$XDG_OPEN_BLOCK_SECONDS"' \
  'exit "${XDG_OPEN_EXIT:-0}"' \
  > "$temp_dir/bin/xdg-open"
chmod +x "$temp_dir/bin/xdg-open"

assert_output() {
  local expected="$1"
  shift
  local actual
  actual=$(env -i PATH="$PATH" "$@")
  if [[ "$actual" != "$expected" ]]; then
    printf 'expected: %s\nactual:   %s\n' "$expected" "$actual" >&2
    return 1
  fi
}

video_url="https://us02web.zoom.us/j/123456789?pwd=secret"
assert_output "join $video_url" EVENT_CONFERENCE_URL="$video_url" "$handler" --print join
assert_output "join $video_url" EVENT_CONFERENCE_URL="$video_url" "$handler" auto --print

assert_output \
  "calendar rencal://event?uid=person%40example.com" \
  EVENT_UID="person@example.com" \
  EVENT_INSTANCE_ID="person@example.com" \
  "$handler" --print auto

uid="event@example.com"
recurrence_id="TZID=Europe/Oslo:20260821T160000"
assert_output \
  "calendar rencal://event?uid=event%40example.com&recurrence-id=TZID%3DEurope%2FOslo%3A20260821T160000" \
  EVENT_UID="$uid" \
  EVENT_INSTANCE_ID="${uid}__${recurrence_id}" \
  "$handler" --print auto

assert_output \
  "calendar rencal://event?uid=part__two%40example.com" \
  EVENT_UID="part__two@example.com" \
  EVENT_INSTANCE_ID="part__two@example.com" \
  "$handler" --print auto

assert_output \
  "calendar rencal://event?uid=event%40example.com" \
  EVENT_UID="event@example.com" \
  EVENT_INSTANCE_ID="event@example.com" \
  EVENT_CONFERENCE_URL="$video_url" \
  "$handler" --print calendar

open_log="$temp_dir/open.log"
PATH="$temp_dir/bin:$PATH" XDG_OPEN_LOG="$open_log" \
  EVENT_CONFERENCE_URL="$video_url" \
  "$handler" join
PATH="$temp_dir/bin:$PATH" XDG_OPEN_LOG="$open_log" \
  EVENT_UID="person@example.com" EVENT_INSTANCE_ID="person@example.com" \
  "$handler" calendar

mapfile -t opened_urls < "$open_log"
[[ "${#opened_urls[@]}" -eq 2 ]] || {
  printf 'expected two xdg-open calls, got %s\n' "${#opened_urls[@]}" >&2
  exit 1
}
[[ "${opened_urls[0]}" == "$video_url" ]] || {
  printf 'unexpected conference URL: %s\n' "${opened_urls[0]}" >&2
  exit 1
}
[[ "${opened_urls[1]}" == "rencal://event?uid=person%40example.com" ]] || {
  printf 'unexpected rencal URL: %s\n' "${opened_urls[1]}" >&2
  exit 1
}

failed_log="$temp_dir/failed.log"
failed_stderr="$temp_dir/failed.stderr"
if PATH="$temp_dir/bin:$PATH" XDG_OPEN_LOG="$failed_log" XDG_OPEN_EXIT=17 \
  EVENT_UID="person@example.com" EVENT_INSTANCE_ID="person@example.com" \
  "$handler" auto 2> "$failed_stderr"; then
  echo "expected a failed rencal open to return non-zero" >&2
  exit 1
fi
[[ "$(wc -l < "$failed_log")" -eq 1 ]] || {
  echo "failed rencal open attempted a fallback URL" >&2
  exit 1
}
grep -qi 'rencal' "$failed_stderr"
grep -q 'openScript' "$failed_stderr"

# xdg-open in generic-DE mode blocks until the launched app exits; the handler
# must detach and return promptly instead of blocking the widget's click
# process (which would silently drop every subsequent click).
blocking_log="$temp_dir/blocking.log"
PATH="$temp_dir/bin:$PATH" XDG_OPEN_LOG="$blocking_log" XDG_OPEN_BLOCK_SECONDS=5 \
  EVENT_UID="person@example.com" EVENT_INSTANCE_ID="person@example.com" \
  timeout 2 "$handler" calendar
[[ "$(wc -l < "$blocking_log")" -eq 1 ]] || {
  echo "blocking xdg-open was not invoked exactly once" >&2
  exit 1
}

printf 'open-event tests passed\n'
