import { truncate } from "./format.mjs"

// TEMPORARY: compatibility for caldir releases older than 0.12.0. Keep this
// logic isolated so the version probe can be deleted wholesale when support
// for those installations expires.
export function isBeforeJsonSupport(value) {
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

export function errorMessage(exitCode, versionOutput, agendaError) {
  if (exitCode === 0 && isBeforeJsonSupport(versionOutput)) {
    return "Your caldir version does not support JSON event output. Run caldir update to install v0.12.0 or newer."
  }

  const detail = truncate(agendaError, 320)
  return detail !== ""
    ? "caldir failed: " + detail
    : "Could not run caldir. Install it, then run caldir add and caldir pull."
}
