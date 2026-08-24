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

no_config="$temp_dir/no-open.lua"

assert_output() {
  local expected="$1"
  shift
  local actual
  actual=$(env -i PATH="$PATH" OPEN_EVENT_CONFIG="$no_config" "$@")
  if [[ "$actual" != "$expected" ]]; then
    printf 'expected: %s\nactual:   %s\n' "$expected" "$actual" >&2
    return 1
  fi
}

video_url="https://us02web.zoom.us/j/123456789?pwd=secret"
assert_output "open $video_url" \
  EVENT_CONFERENCE_URL="$video_url" "$handler" --print join

assert_output \
  "open rencal://event?uid=person%40example.com" \
  EVENT_UID="person@example.com" \
  "$handler" --print calendar

uid="event@example.com"
recurrence_id="2026-08-21T16:00:00+02:00"
assert_output \
  "open rencal://event?uid=event%40example.com&recurrence-id=2026-08-21T16%3A00%3A00%2B02%3A00" \
  EVENT_UID="$uid" \
  EVENT_RECURRENCE_ID="$recurrence_id" \
  "$handler" --print calendar

assert_output \
  "open rencal://event?uid=part__two%40example.com" \
  EVENT_UID="part__two@example.com" \
  "$handler" --print calendar

magic_uid="event.+%[1]@example.com"
assert_output \
  "open rencal://event?uid=event.%2B%25%5B1%5D%40example.com&recurrence-id=next%2Fone" \
  EVENT_UID="$magic_uid" \
  EVENT_RECURRENCE_ID="next/one" \
  "$handler" --print calendar

assert_output \
  "open rencal://event?uid=event%40example.com" \
  EVENT_UID="event@example.com" \
  EVENT_CONFERENCE_URL="$video_url" \
  "$handler" --print calendar

open_log="$temp_dir/open.log"
PATH="$temp_dir/bin:$PATH" OPEN_EVENT_CONFIG="$no_config" XDG_OPEN_LOG="$open_log" \
  EVENT_CONFERENCE_URL="$video_url" \
  "$handler" join
PATH="$temp_dir/bin:$PATH" OPEN_EVENT_CONFIG="$no_config" XDG_OPEN_LOG="$open_log" \
  EVENT_UID="person@example.com" \
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
failed_status=0
PATH="$temp_dir/bin:$PATH" OPEN_EVENT_CONFIG="$no_config" \
  XDG_OPEN_LOG="$failed_log" XDG_OPEN_EXIT=17 \
  EVENT_UID="person@example.com" \
  "$handler" calendar 2> "$failed_stderr" || failed_status=$?
if [[ "$failed_status" -ne 17 ]]; then
  printf 'expected a failed rencal open to exit 17, got %s\n' \
    "$failed_status" >&2
  exit 1
fi
[[ "$(wc -l < "$failed_log")" -eq 1 ]] || {
  echo "failed rencal open attempted a fallback URL" >&2
  exit 1
}
grep -qi 'rencal' "$failed_stderr"
grep -q 'open.lua' "$failed_stderr"

# xdg-open in generic-DE mode blocks until the launched app exits; the handler
# must detach and return promptly instead of blocking the widget's click
# process (which would silently drop every subsequent click).
blocking_log="$temp_dir/blocking.log"
PATH="$temp_dir/bin:$PATH" OPEN_EVENT_CONFIG="$no_config" \
  XDG_OPEN_LOG="$blocking_log" XDG_OPEN_BLOCK_SECONDS=5 \
  EVENT_UID="person@example.com" \
  timeout 2 "$handler" calendar
[[ "$(wc -l < "$blocking_log")" -eq 1 ]] || {
  echo "blocking xdg-open was not invoked exactly once" >&2
  exit 1
}

# Hooks can run additional commands and delegate to the bundled policy.
hook_log="$temp_dir/hook.log"
hook_file="$temp_dir/open.lua"
apply_hook="$temp_dir/bin/hook-logger"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf '\''%s|%s\n'\'' "$1" "$2" >> "$HOOK_LOG"' \
  > "$apply_hook"
chmod +x "$apply_hook"
printf '%s\n' \
  'function on_open(event, action)' \
  '  exec { "hook-logger", action, event.title }' \
  '  default_open(event, action)' \
  'end' \
  > "$hook_file"

hook_open_log="$temp_dir/hook-open.log"
PATH="$temp_dir/bin:$PATH" OPEN_EVENT_CONFIG="$hook_file" \
  HOOK_LOG="$hook_log" XDG_OPEN_LOG="$hook_open_log" \
  EVENT_TITLE="Planning's Review" EVENT_CONFERENCE_URL="$video_url" \
  "$handler" join

# Both detached children should finish promptly, but allow for scheduling.
for _ in {1..20}; do
  [[ -s "$hook_log" && -s "$hook_open_log" ]] && break
  sleep 0.05
done
[[ "$(< "$hook_log")" == "join|Planning's Review" ]]
[[ "$(< "$hook_open_log")" == "$video_url" ]]

expected_hook_output="exec 'hook-logger' 'join' 'Planning'\\''s Review'"
expected_hook_output+=$'\nopen https://us02web.zoom.us/j/123456789?pwd=secret'
assert_output \
  "$expected_hook_output" \
  OPEN_EVENT_CONFIG="$hook_file" EVENT_TITLE="Planning's Review" \
  EVENT_CONFERENCE_URL="$video_url" "$handler" --print join

syntax_hook="$temp_dir/syntax-error.lua"
printf '%s\n' 'function on_open(' > "$syntax_hook"
syntax_stderr="$temp_dir/syntax.stderr"
if OPEN_EVENT_CONFIG="$syntax_hook" "$handler" --print calendar 2> "$syntax_stderr"; then
  echo "expected a syntax error in open.lua to return non-zero" >&2
  exit 1
fi
grep -Fq "$syntax_hook" "$syntax_stderr"

throwing_hook="$temp_dir/throwing.lua"
printf '%s\n' \
  'function on_open(event, action)' \
  '  error("hook exploded")' \
  'end' \
  > "$throwing_hook"
throwing_stderr="$temp_dir/throwing.stderr"
if OPEN_EVENT_CONFIG="$throwing_hook" "$handler" --print calendar 2> "$throwing_stderr"; then
  echo "expected an on_open error to return non-zero" >&2
  exit 1
fi
grep -Fq "$throwing_hook" "$throwing_stderr"
grep -Fq 'hook exploded' "$throwing_stderr"

missing_url_stderr="$temp_dir/missing-url.stderr"
missing_url_status=0
OPEN_EVENT_CONFIG="$no_config" "$handler" --print join \
  2> "$missing_url_stderr" || missing_url_status=$?
if [[ "$missing_url_status" -ne 2 ]]; then
  printf 'expected join without a URL to exit 2, got %s\n' \
    "$missing_url_status" >&2
  exit 1
fi
grep -q 'EVENT_CONFERENCE_URL' "$missing_url_stderr"

usage_stderr="$temp_dir/usage.stderr"
usage_status=0
OPEN_EVENT_CONFIG="$no_config" "$handler" auto \
  2> "$usage_stderr" || usage_status=$?
if [[ "$usage_status" -ne 2 ]]; then
  printf 'expected the removed auto action to exit 2, got %s\n' \
    "$usage_status" >&2
  exit 1
fi
grep -Fq 'usage: open-event [--print] <join|calendar>' "$usage_stderr"

printf 'open-event tests passed\n'
