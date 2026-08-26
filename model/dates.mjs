export const MINUTE_MS = 60 * 1000

function pad2(value) {
  const number = Number(value)
  return (number < 10 ? "0" : "") + number
}

export function localDateKey(date) {
  return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate())
}

export function addLocalDays(date, count) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + Number(count || 0))
}

// A wall timestamp stores viewer-local calendar fields in UTC slots. It lets
// the long-lived QML process render a freshly detected system timezone without
// consulting its cached idea of "local" again.
export function localWallMs(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (isNaN(date.getTime())) return NaN
  return Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  )
}

export function wallDateKey(value) {
  const date = new Date(value)
  if (isNaN(date.getTime())) return ""
  return date.getUTCFullYear() + "-" + pad2(date.getUTCMonth() + 1) + "-" + pad2(date.getUTCDate())
}

export function wallDay(value) {
  const date = new Date(value)
  if (isNaN(date.getTime())) return NaN
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function addWallDays(value, count) {
  const date = new Date(value)
  if (isNaN(date.getTime())) return NaN
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + Number(count || 0),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  )
}

export function viewerNowWallMs(event, now) {
  const current = now instanceof Date ? now : new Date(now)
  if (isNaN(current.getTime())) return NaN
  if (event && isFinite(event.viewerOffsetMs)) return current.getTime() + event.viewerOffsetMs
  return localWallMs(current)
}

export function queryRange(today, daysAhead) {
  return {
    from: localDateKey(today),
    to: localDateKey(addLocalDays(today, daysAhead))
  }
}
