import { MAX_ENUM_CHARS, assertOutputWithinLimit, limited } from "./limits.mjs"

export function parseTimeFormat(json) {
  const input = json === undefined || json === null ? "" : String(json)
  assertOutputWithinLimit(input)
  const parsed = JSON.parse(input)
  const timeFormat = parsed && parsed.config
    ? limited(parsed.config.time_format, MAX_ENUM_CHARS)
    : ""
  return timeFormat === "12h"
    ? "12h"
    : "24h"
}
