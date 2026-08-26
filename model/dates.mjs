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

export function queryRange(today, daysAhead) {
  return {
    from: localDateKey(today),
    to: localDateKey(addLocalDays(today, daysAhead))
  }
}
