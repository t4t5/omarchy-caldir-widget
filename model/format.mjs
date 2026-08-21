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
  else labels.push(WEEKDAYS[startDate.getDay()] + " " + startDate.getDate() + " " + MONTHS[startDate.getMonth()])
  const range = timeRange(start, end)
  if (range) labels.push(range)
  return labels.join(" · ")
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
  if (current < end) {
    const minutes = Math.max(1, Math.round((end - current) / MINUTE_MS))
    if (minutes <= 1) return "1 min left"
    if (minutes < 60) return minutes + " min left"
    const hours = Math.floor(minutes / 60)
    const remainder = minutes % 60
    return (remainder ? hours + "h " + remainder + "m" : hours + "h") + " left"
  }
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
  return WEEKDAYS[date.getDay()] + " " + date.getDate() + " " + MONTHS[date.getMonth()]
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
    const minutes = Math.max(1, Math.round((end - current) / MINUTE_MS))
    if (minutes <= 1) suffix = " · 1 min left"
    else if (minutes < 60) suffix = " · " + minutes + " min left"
    else {
      const hours = Math.floor(minutes / 60)
      const remainder = minutes % 60
      suffix = " · " + (remainder ? hours + "h " + remainder + "m" : hours + "h") + " left"
    }
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
  return WEEKDAYS[date.getDay()].toUpperCase() + " " + date.getDate() + " " + MONTHS[date.getMonth()].toUpperCase()
}

export function formatUpdated(value, now) {
  const date = dateOf(value)
  const current = dateOf(now)
  if (isNaN(date.getTime()) || date.getTime() <= 0 || isNaN(current.getTime())) return ""
  const minutes = Math.max(0, Math.floor((current.getTime() - date.getTime()) / MINUTE_MS))
  if (minutes < 1) return "just now"
  if (minutes < 60) return minutes + "m ago"
  const hours = Math.floor(minutes / 60)
  return hours < 24 ? hours + "h ago" : hm(date)
}

export function truncate(value, limit) {
  const string = value === undefined || value === null ? "" : String(value)
  const max = Math.max(1, Number(limit) || 24)
  if (string.length <= max) return string
  return string.substring(0, max - 1).replace(/\s+$/, "") + "…"
}
