// Which calendars reach the widget. caldir syncs every calendar the account can
// see (coworkers, rooms), while renCal shows only the calendars in a group, so
// the widget filters on its side: `caldir events --calendar` takes one slug.
//
// The `calendars` setting is either:
//   ""/unset           mirror renCal's "default" group, or show all without one
//   "rencal[:group]"   mirror that renCal group
//   "all"              show every calendar
//   "a, b" or ["a"]    show exactly these calendar slugs

export const CALENDARS = {
  key: "calendars",
  defaultValue: ""
}

const RENCAL_DEFAULT_GROUP = "default"
const MAX_SLUGS = 200

function slugList(values) {
  const slugs = []
  for (let i = 0; i < values.length && slugs.length < MAX_SLUGS; i++) {
    const slug = String(values[i] === undefined || values[i] === null ? "" : values[i]).trim()
    if (slug !== "" && slugs.indexOf(slug) === -1) slugs.push(slug)
  }
  return slugs
}

// Returns { mode: "all" } | { mode: "rencal", group } | { mode: "list", slugs }.
export function normalizeCalendars(value) {
  if (Array.isArray(value)) {
    const slugs = slugList(value)
    return slugs.length > 0 ? { mode: "list", slugs } : { mode: "rencal", group: RENCAL_DEFAULT_GROUP }
  }

  const wanted = String(value === undefined || value === null ? "" : value).trim()
  const lower = wanted.toLowerCase()
  if (lower === "") return { mode: "rencal", group: RENCAL_DEFAULT_GROUP }
  if (lower === "all") return { mode: "all" }
  if (lower === "rencal") return { mode: "rencal", group: RENCAL_DEFAULT_GROUP }
  if (lower.indexOf("rencal:") === 0) {
    const group = wanted.slice("rencal:".length).trim()
    return { mode: "rencal", group: group || RENCAL_DEFAULT_GROUP }
  }

  const slugs = slugList(wanted.split(/[\s,]+/))
  return slugs.length > 0 ? { mode: "list", slugs } : { mode: "all" }
}

function stripComment(line) {
  let quote = ""
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === "\\" && quote === "\"") i++
      else if (ch === quote) quote = ""
    } else if (ch === "\"" || ch === "'") {
      quote = ch
    } else if (ch === "#") {
      return line.slice(0, i)
    }
  }
  return line
}

// Reads one string array from the [groups] table of renCal's config.toml.
// Only the shape renCal writes is supported; anything else yields null.
export function parseRencalGroup(toml, group) {
  const input = String(toml === undefined || toml === null ? "" : toml)
  const wanted = group || RENCAL_DEFAULT_GROUP
  const lines = input.split(/\r?\n/)

  let inGroups = false
  let collecting = false
  let body = ""
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim()
    if (collecting) {
      body += " " + line
      if (line.indexOf("]") !== -1) break
      continue
    }
    if (/^\[.*\]$/.test(line)) {
      inGroups = line === "[groups]"
      continue
    }
    if (!inGroups) continue

    const match = /^("?)([^"=]+)\1\s*=\s*(.*)$/.exec(line)
    if (!match || match[2].trim() !== wanted) continue
    body = match[3]
    if (body.indexOf("[") !== 0) return null
    if (body.indexOf("]") !== -1) break
    collecting = true
  }

  if (body === "" || body.indexOf("]") === -1) return null
  const slugs = []
  const pattern = /"((?:[^"\\]|\\.)*)"|'([^']*)'/g
  let item
  while ((item = pattern.exec(body)) !== null) slugs.push(item[1] !== undefined ? item[1] : item[2])
  return slugList(slugs)
}

// Returns the allowed calendar slugs, or null when every calendar is shown.
// A renCal group that is missing or empty shows everything rather than nothing.
export function resolveCalendarFilter(setting, rencalToml) {
  const choice = normalizeCalendars(setting)
  if (choice.mode === "list") return choice.slugs
  if (choice.mode === "all") return null
  const slugs = parseRencalGroup(rencalToml, choice.group)
  return slugs && slugs.length > 0 ? slugs : null
}

// Group names in [groups], in file order, so the settings view can offer them.
export function listRencalGroups(toml) {
  const lines = String(toml === undefined || toml === null ? "" : toml).split(/\r?\n/)
  const groups = []
  let inGroups = false
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]).trim()
    if (/^\[.*\]$/.test(line)) {
      inGroups = line === "[groups]"
      continue
    }
    if (!inGroups) continue
    const match = /^("?)([^"=]+)\1\s*=\s*\[/.exec(line)
    if (match && groups.length < MAX_SLUGS) groups.push(match[2].trim())
  }
  return groups
}

// Accepts QML lists as well as Arrays; both have a length and indices.
export function filterByCalendars(events, allowed) {
  if (!events || typeof events.length !== "number") return []
  const list = Array.prototype.slice.call(events)
  if (!allowed) return list
  return list.filter(event => event && allowed.indexOf(event.calendar) !== -1)
}

// Google's working location markers ("Home", "Office") are all-day events.
export const WORKING_LOCATION_EVENT_TYPE = "workinglocation"

export function filterEvents(events, options) {
  const settings = options || {}
  return filterByCalendars(events, settings.calendars || null).filter(event =>
    !(settings.hideAllDay && event.all_day === true)
    && !(settings.hideWorkingLocation && event.eventType === WORKING_LOCATION_EVENT_TYPE))
}
