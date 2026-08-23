export const MINUTE_MS = 60 * 1000
export const HOUR_MS = 60 * MINUTE_MS
export const DAY_MS = 24 * HOUR_MS

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

export function queryRange(today, daysAhead) {
  const days = Math.max(1, Number(daysAhead) || 1)
  return {
    from: localDateKey(today),
    to: localDateKey(addLocalDays(today, days))
  }
}
