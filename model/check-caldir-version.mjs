export const MINIMUM_CALDIR_VERSION = "0.12.1"
export const INVITATIONS_CALDIR_VERSION = "0.13.1"

function parsedVersion(value) {
  const text = String(value === undefined || value === null ? "" : value)
  const match = text.match(/(?:^|\s)v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?=\s|$)/)
  return match ? {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] !== undefined
  } : null
}

export function isAtLeastVersion(value, minimum) {
  const version = parsedVersion(value)
  const required = parsedVersion(minimum)
  if (!version || !required) return false

  for (let i = 0; i < required.parts.length; i++) {
    if (version.parts[i] !== required.parts[i]) return version.parts[i] > required.parts[i]
  }
  return !version.prerelease || required.prerelease
}

export function supportsInvitations(value) {
  return isAtLeastVersion(value, INVITATIONS_CALDIR_VERSION)
}

export function isBeforeMinimumVersion(value) {
  return !!parsedVersion(value) && !isAtLeastVersion(value, MINIMUM_CALDIR_VERSION)
}

export function errorMessage(exitCode, versionOutput) {
  if (exitCode !== 0) {
    return "Could not check the installed caldir version. Run caldir update, then try again."
  }

  const output = String(versionOutput === undefined || versionOutput === null ? "" : versionOutput).slice(0, 4096)
  if (!/(?:^|\s)v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?=\s|$)/.test(output)) {
    return "Could not determine the installed caldir version. Run caldir update, then try again."
  }

  return isBeforeMinimumVersion(output)
    ? "Your caldir version is too old. Run caldir update to install v" + MINIMUM_CALDIR_VERSION + " or newer."
    : ""
}
