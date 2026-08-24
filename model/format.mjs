import { addLocalDays, localDateKey, MINUTE_MS } from "./dates.mjs"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const MAX_BAR_LABEL_LENGTH = 28

function pad2(value) {
  return (value < 10 ? "0" : "") + value
}

function sameDay(a, b) {
  return localDateKey(a) === localDateKey(b)
}

function fullDayLabel(date) {
  return WEEKDAYS[date.getDay()] + " " + date.getDate() + " " + MONTHS[date.getMonth()]
}

export function hm(value, timeFormat = "24h") {
  const date = new Date(value)
  if (isNaN(date.getTime())) return ""
  if (timeFormat === "12h") {
    const hours = date.getHours()
    const hour = hours % 12 || 12
    return hour + ":" + pad2(date.getMinutes()) + (hours < 12 ? "am" : "pm")
  }
  return pad2(date.getHours()) + ":" + pad2(date.getMinutes())
}

export function timeRange(start, end, timeFormat = "24h") {
  const startLabel = hm(start, timeFormat)
  if (!startLabel) return ""
  const endLabel = hm(end, timeFormat)
  return endLabel ? startLabel + "–" + endLabel : startLabel
}

export function meetingTimeLabel(start, end, now, timeFormat = "24h") {
  const startDate = new Date(start)
  const nowDate = now
  if (isNaN(startDate.getTime()) || isNaN(nowDate.getTime())) return ""
  const labels = []
  if (sameDay(startDate, nowDate)) labels.push("Today")
  else if (sameDay(startDate, addLocalDays(nowDate, 1))) labels.push("Tomorrow")
  else labels.push(fullDayLabel(startDate))
  const range = timeRange(start, end, timeFormat)
  if (range) labels.push(range)
  return labels.join(" · ")
}

function timeLeftLabel(end, current) {
  const minutes = Math.max(1, Math.round((end - current) / MINUTE_MS))
  if (minutes < 60) return minutes + " min left"
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return (remainder ? hours + "h " + remainder + "m" : hours + "h") + " left"
}

export function relativeStatus(event, now, timeFormat = "24h") {
  if (!event) return ""
  const start = event.startMs
  const end = event.endMs
  const current = now.getTime()
  if (!isFinite(start) || !isFinite(end) || isNaN(current)) return ""

  if (current < start) {
    const minutes = Math.max(1, Math.round((start - current) / MINUTE_MS))
    return minutes >= 60 ? "starts at " + hm(start, timeFormat) : "starts in " + minutes + " min"
  }
  if (current < end) return timeLeftLabel(end, current)
  return ""
}

function dayLabel(value, now) {
  const date = new Date(value)
  const current = now
  const key = localDateKey(date)
  if (key === localDateKey(current)) return "Today"
  if (key === localDateKey(addLocalDays(current, 1))) return "Tmrw"
  const distance = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(current.getFullYear(), current.getMonth(), current.getDate())) / 86400000)
  if (distance > 1 && distance < 7) return WEEKDAYS[date.getDay()]
  return fullDayLabel(date)
}

export function formatLabel(event, now, timeFormat = "24h") {
  let title = event.title
  const start = event.startMs
  const end = event.endMs
  const current = now.getTime()
  let suffix = ""

  if (current >= start && current < end) {
    suffix = " · " + timeLeftLabel(end, current)
  } else if (start > current && start - current <= 60 * MINUTE_MS) {
    const minutes = Math.max(1, Math.round((start - current) / MINUTE_MS))
    suffix = " · in " + minutes + " min"
  } else {
    suffix = " · " + (sameDay(new Date(start), now)
      ? hm(start, timeFormat)
      : dayLabel(start, now) + " " + hm(start, timeFormat))
  }

  const titleLimit = Math.max(3, MAX_BAR_LABEL_LENGTH - suffix.length)
  if (title.length > titleLimit) title = title.slice(0, Math.max(1, titleLimit - 1)) + "…"
  return title + suffix
}

export function formatDuration(start, end) {
  const minutes = Math.round((end - start) / MINUTE_MS)
  if (!isFinite(minutes) || minutes <= 0) return ""
  if (minutes < 60) return minutes + "m"
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? hours + "h " + remainder + "m" : hours + "h"
}

export function daySectionTitle(value, now) {
  const date = new Date(value)
  const current = now
  const key = localDateKey(date)
  if (key === localDateKey(current)) return "TODAY"
  if (key === localDateKey(addLocalDays(current, 1))) return "TOMORROW"
  return daySectionDate(value)
}

export function daySectionDate(value) {
  return fullDayLabel(new Date(value)).toUpperCase()
}

export function truncate(value, limit) {
  const string = value === undefined || value === null ? "" : String(value)
  const max = Math.max(1, Number(limit) || 24)
  if (string.length <= max) return string
  return string.substring(0, max - 1).replace(/\s+$/, "") + "…"
}
