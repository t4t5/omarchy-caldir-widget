## Features

### Meeting highlight

Google Meet, Zoom, Microsoft Teams, Webex, Jitsi, Whereby, and Proton Meet links are detected.

The bar meeting follows [MeetingBar](https://meetingbar.app/)'s selection rules:
- a meeting with under a minute left is never shown
- a meeting in progress hands the bar to the following one once it starts within ten minutes, so back-to-back calls show the meeting you need to join next.
- Links wrapped in Outlook SafeLinks or Google `google.com/url?q=` redirects are unwrapped before detection. The provider-owned `X-GOOGLE-CONFERENCE`, `X-OUTLOOK-CONFERENCE`, and `X-PM-CONFERENCE-URL` properties take priority. Without one of those, the widget checks the event URL, location, then description.
