// Stable public API shared by QML and the dependency-free Node test suite.
export {
  MINUTE_MS,
  localDateKey,
  addLocalDays,
  queryRange
} from "./model/dates.mjs"

export {
  findVideoUrl,
  getConferenceUrl,
  conferenceName
} from "./model/conference.mjs"

export {
  normalizedEvent,
  parseCalendarColors,
  parseAgenda
} from "./model/events.mjs"

export {
  parseTimeFormat
} from "./model/config.mjs"

export {
  nextMeeting,
  buildScheduleGroups,
  heroActions
} from "./model/select.mjs"

export {
  HIGHLIGHT_EVENTS_ALL,
  HIGHLIGHT_EVENTS_MEETINGS,
  HIGHLIGHT_EVENTS,
  DAYS_AHEAD,
  LOOKAHEAD_MINUTES,
  normalizeHighlightEvents,
  normalizeDaysAhead,
  normalizeLookaheadMinutes
} from "./model/settings.mjs"

export {
  formatLabel,
  relativeStatus,
  meetingTimeLabel,
  formatDuration,
  hm,
  timeRange,
  truncate,
  plainLine
} from "./model/format.mjs"

export {
  MAX_STDOUT_BYTES,
  MAX_STDERR_BYTES,
  boundedCommand
} from "./model/command.mjs"

export {
  MAX_OUTPUT_CHARS,
  MAX_EVENTS,
  MAX_CALENDARS,
  MAX_X_PROPERTIES,
  MAX_TITLE_CHARS,
  MAX_DATE_CHARS,
  MAX_URL_CHARS,
  MAX_FREEFORM_CHARS,
  MAX_PROPERTY_NAME_CHARS,
  MAX_COLOR_CHARS,
  MAX_ENUM_CHARS
} from "./model/limits.mjs"

export {
  isNoCalendarsError
} from "./model/errors.mjs"
