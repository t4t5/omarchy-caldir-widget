export function parseTimeFormat(json) {
  const parsed = JSON.parse(json)
  return parsed && parsed.config && parsed.config.time_format === "12h"
    ? "12h"
    : "24h"
}
