# Attendance Ingestion

The backend exposes a webhook endpoint for attendance systems:

```text
POST /api/attendance/webhook
```

Requests must include the webhook secret:

```text
X-Webhook-Secret: YOUR_WEBHOOK_SECRET
```

It accepts either one record:

```json
{
  "fullName": "Jordan Sample",
  "receivedAt": "2026-06-17T18:30:00-05:00",
  "source": "zen-planner"
}
```

Or a batch:

```json
{
  "source": "zen-planner",
  "records": [
    { "fullName": "Jordan Sample", "receivedAt": "2026-06-17T18:30:00-05:00" },
    { "fullName": "Alex Example", "receivedAt": "2026-06-17T18:31:00-05:00" }
  ]
}
```

Accepted name fields are `fullName`, `studentName`, `participantName`, `memberName`, or `displayName` (plus ZenPlanner's own `firstName`/`middleName`/`lastName`, which take priority when present). `name` is deliberately **not** accepted for the person -- ZenPlanner's payload uses that field for the *class* name (e.g. "Summer General Boxing"), and an earlier version of this endpoint that fell back to it stored class names as attendees whenever an event had no real name field set.

Accepted date fields are `receivedAt`, `timestamp`, `date`, or `createdAt`.

## What Happens

1. The attendance record is appended to `data/attendance.jsonl`.
2. The roster in `data/roster.json` is updated automatically.
3. New names are added with `rosterStatus: "auto-added"`.
4. Existing names get updated `lastSeenAt` and `attendanceCount`.

For local testing, the endpoint is:

```text
http://127.0.0.1:8765/api/attendance/webhook
```
