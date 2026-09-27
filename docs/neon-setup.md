# Neon Postgres Setup

1. Create a Neon project.
2. In Neon, copy the pooled connection string for the database.
3. In Render, add:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require
DATABASE_SSL=true
```

4. Redeploy Render.
5. Open this endpoint while logged in:

```text
https://YOUR_RENDER_SITE.onrender.com/api/database/status
```

Expected result:

```json
{
  "databaseConfigured": true,
  "databaseSsl": true,
  "ok": true,
  "logCount": 0,
  "activityCount": 0
}
```

The app creates these tables automatically on startup:

- `coach_logs`
- `coach_log_activities`
- `attendance_events`
- `roster_people`

The SQL in `docs/neon-schema.sql` is only a reference/manual backup.

## Zen Planner Attendance Webhook

Set Zen Planner attendance webhooks to send directly to:

```text
https://YOUR_RENDER_SITE.onrender.com/api/attendance/webhook
```

Include the same `WEBHOOK_SECRET` currently configured in Render. The app accepts it as either:

```text
X-Webhook-Secret: YOUR_SECRET
```

or:

```text
https://YOUR_RENDER_SITE.onrender.com/api/attendance/webhook?secret=YOUR_SECRET
```

After an attendance webhook succeeds, Neon stores:

- the raw attendance event in `attendance_events`
- the roster person/update in `roster_people`

The app's name autocomplete now reads roster data from Neon when `DATABASE_URL` is set.

Check:

```text
https://YOUR_RENDER_SITE.onrender.com/api/database/status
https://YOUR_RENDER_SITE.onrender.com/api/roster
https://YOUR_RENDER_SITE.onrender.com/api/attendance
```

When `DATABASE_URL` is set, Postgres is the primary store.
