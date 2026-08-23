import { addLocalDays, localDateKey, MINUTE_MS } from "./dates.mjs"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function dateOf(value) {
  if (value instanceof Date) return value
  return new Date(Number(value))
}

function pad2(value) {
  return (value < 10 ? "0" : "") + value
}

function sameDay(a, b) {
  return localDateKey(a) === localDateKey(b)
}

function fullDayLabel(date) {
  return WEEKDAYS[date.getDay()] + " " + date.getDate() + " " + MONTHS[date.getMonth()]
}

export function hm(value) {
  const date = dateOf(value)
  if (isNaN(date.getTime())) return ""
  return pad2(date.getHours()) + ":" + pad2(date.getMinutes())
}

export function timeRange(start, end) {
  const startLabel = hm(start)
  if (!startLabel) return ""
  const endLabel = hm(end)
  return endLabel ? startLabel + "–" + endLabel : startLabel
}

export function meetingTimeLabel(start, end, now) {
  const startDate = dateOf(start)
  const nowDate = dateOf(now)
  if (isNaN(startDate.getTime()) || isNaN(nowDate.getTime())) return ""
  const labels = []
  if (sameDay(startDate, nowDate)) labels.push("Today")
  else if (sameDay(startDate, addLocalDays(nowDate, 1))) labels.push("Tomorrow")
  else labels.push(fullDayLabel(startDate))
  const range = timeRange(start, end)
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

export function relativeStatus(event, now) {
  if (!event) return ""
  const start = Number(event.startMs)
  const end = Number(event.endMs)
  const current = dateOf(now).getTime()
  if (!isFinite(start) || !isFinite(end) || isNaN(current)) return ""

  if (current < start) {
    const minutes = Math.max(1, Math.round((start - current) / MINUTE_MS))
    return minutes >= 60 ? "starts at " + hm(start) : "starts in " + minutes + " min"
  }
  if (current < end) return timeLeftLabel(end, current)
  return ""
}

function dayLabel(value, now) {
  const date = dateOf(value)
  const current = dateOf(now)
  const key = localDateKey(date)
  if (key === localDateKey(current)) return "Today"
  if (key === localDateKey(addLocalDays(current, 1))) return "Tmrw"
  if (key === localDateKey(addLocalDays(current, -1))) return "Yest"
  const distance = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(current.getFullYear(), current.getMonth(), current.getDate())) / 86400000)
  if (distance > 1 && distance < 7) return WEEKDAYS[date.getDay()]
  return fullDayLabel(date)
}

export function formatLabel(event, now, maxTitleLength) {
  if (!event || !isFinite(Number(event.startMs))) return ""
  let title = String(event.title || "(Untitled)")
  const limit = Math.max(8, parseInt(maxTitleLength, 10) || 28)
  const start = Number(event.startMs)
  const end = isFinite(Number(event.endMs)) ? Number(event.endMs) : start
  const current = dateOf(now).getTime()
  let suffix = ""

  if (current >= start && current < end) {
    suffix = " · " + timeLeftLabel(end, current)
  } else if (start > current && start - current <= 60 * MINUTE_MS) {
    const minutes = Math.max(1, Math.round((start - current) / MINUTE_MS))
    suffix = " · in " + minutes + " min"
  } else {
    suffix = " · " + (sameDay(new Date(start), dateOf(now)) ? hm(start) : dayLabel(start, now) + " " + hm(start))
  }

  const titleLimit = Math.max(3, limit - suffix.length)
  if (title.length > titleLimit) title = title.slice(0, Math.max(1, titleLimit - 1)) + "…"
  return title + suffix
}

export function formatDuration(start, end) {
  const minutes = Math.round((dateOf(end).getTime() - dateOf(start).getTime()) / MINUTE_MS)
  if (!isFinite(minutes) || minutes <= 0) return ""
  if (minutes < 60) return minutes + "m"
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder ? hours + "h " + remainder + "m" : hours + "h"
}

export function daySectionTitle(value, now) {
  const date = dateOf(value)
  const current = dateOf(now)
  const key = localDateKey(date)
  if (key === localDateKey(current)) return "TODAY"
  if (key === localDateKey(addLocalDays(current, 1))) return "TOMORROW"
  return daySectionDate(value)
}

export function daySectionDate(value) {
  return fullDayLabel(dateOf(value)).toUpperCase()
}

export function truncate(value, limit) {
  const string = value === undefined || value === null ? "" : String(value)
  const max = Math.max(1, Number(limit) || 24)
  if (string.length <= max) return string
  return string.substring(0, max - 1).replace(/\s+$/, "") + "…"
}
