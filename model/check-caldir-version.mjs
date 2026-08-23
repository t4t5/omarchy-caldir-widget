export const MINIMUM_CALDIR_VERSION = "0.12.1"

export function isBeforeMinimumVersion(value) {
  const text = String(value === undefined || value === null ? "" : value)
  const match = text.match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?=\s|$)/)
  if (!match) return false

  const version = [Number(match[1]), Number(match[2]), Number(match[3])]
  const minimum = [0, 12, 1]
  for (let i = 0; i < minimum.length; i++) {
    if (version[i] !== minimum[i]) return version[i] < minimum[i]
  }

  // A prerelease of the minimum version is still older than that release.
  return match[4] !== undefined
}

export function errorMessage(exitCode, versionOutput) {
  if (exitCode !== 0) {
    return "Could not check the installed caldir version. Run caldir update, then try again."
  }

  const output = String(versionOutput === undefined || versionOutput === null ? "" : versionOutput)
  if (!/(?:^|\s)v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?=\s|$)/.test(output)) {
    return "Could not determine the installed caldir version. Run caldir update, then try again."
  }

  return isBeforeMinimumVersion(output)
    ? "Your caldir version is too old. Run caldir update to install v" + MINIMUM_CALDIR_VERSION + " or newer."
    : ""
}
