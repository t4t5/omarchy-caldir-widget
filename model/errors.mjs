export function isNoCalendarsError(value) {
  const text = String(value === undefined || value === null ? "" : value)
    .replace(/\r\n/g, "\n")
    .trim()
  return /^(?:Error:\s*)?No calendars found\.(?:\n|$)/.test(text)
}

export function isCaldirVersionBeforeJsonSupport(value) {
  const text = String(value === undefined || value === null ? "" : value)
  const match = text.match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?=\s|$)/)
  if (!match) return false

  const version = [Number(match[1]), Number(match[2]), Number(match[3])]
  const minimum = [0, 12, 0]
  for (let i = 0; i < minimum.length; i++) {
    if (version[i] !== minimum[i]) return version[i] < minimum[i]
  }

  // A prerelease of 0.12.0 is still older than the supported release.
  return match[4] !== undefined
}
