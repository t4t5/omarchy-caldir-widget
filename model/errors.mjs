export function isNoCalendarsError(value) {
  const text = String(value === undefined || value === null ? "" : value)
    .replace(/\r\n/g, "\n")
    .trim()
  return /^(?:Error:\s*)?No calendars found\.(?:\n|$)/.test(text)
}
