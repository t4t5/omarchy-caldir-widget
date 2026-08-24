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
  buildScheduleGroups
} from "./model/select.mjs"

export {
  formatLabel,
  relativeStatus,
  meetingTimeLabel,
  formatDuration,
  hm,
  timeRange,
  truncate
} from "./model/format.mjs"

export {
  isNoCalendarsError
} from "./model/errors.mjs"
