# Dashboard Tables, Charts, and PDF Export

The admin dashboard's Report, Roster, Logs, and Attendance tables all share the same
column sort/filter component, and the Report tab has a one-click, letterhead-branded
PDF export with charts.

## Column Filtering and Sorting

Every data table on the dashboard (`table-filters.js`) gets, per column:

- **Sort** — click the column label to cycle ascending → descending → unsorted.
- **Filter** — a dropdown below the label with "All" plus every distinct value
  currently in that column. Picking a value narrows the table to matching rows;
  picking "All" clears it.

Filters and sorting apply only to what's currently loaded into the table (the same
rows the report/roster/logs/attendance API calls returned) — they don't add new
server queries. Numeric columns (hours, counts, ages) sort and filter by their real
numeric value, not by their formatted display text.

This applies to all 13 dashboard tables: the 8 Report breakdown tables (By Coach, By
Activity, By Participant, By Focus, By Gender, By Race/Ethnicity, By School, By
Competency), the Period Trend and Recent Interactions/Logs tables, plus the Roster
and Attendance tables.

## Hours, not minutes

Activity durations are stored in minutes everywhere in the database (unchanged), but
every place the report displays a duration — table cells, the summary metric box,
chart data, CSV exports, and the PDF — shows hours instead (`formatHours`/
`minutesToHours` in `admin.js`, one decimal place on screen and in the PDF, two
decimals in CSV exports for a bit more precision). "Activity Rows" is now labeled
"Interactions" throughout for the same reason: it's a report-language change, not a
data model change — the underlying field names (`total_minutes`, `activity_count`,
etc.) are unchanged.

## By Competency

The club's four program pillars — Beyond the Ropes, Fighting Side by Side, Feel
Good Fight Strong, Fighting for My Future — are auto-detected from each coach's
narrative response (keyword matching, see `categoryMap`/`detectCategories` in
`app.js`) and stored per log in `coach_logs.assistant_draft.possibleCategories`
(Postgres jsonb) every time a log is submitted. This has been happening all along;
it just wasn't surfaced anywhere. The report now has a By Competency breakdown
table, chart, filter dropdown, CSV section, and PDF table, all reading from that
column (`server.js`: `unknownBucketSql`-style query using
`jsonb_array_elements_text` over `assistant_draft->'possibleCategories'`, joined to
`coach_log_activities` for hours/counts).

Because competencies are detected per *log* (the whole day's narrative for a
coach+date), not per activity or per participant, a log tagged with two
competencies contributes its full hours/activity count to each one — the table
answers "how much happened in sessions that touched this competency," not "exactly
how many hours went to this competency specifically."

## Charts

Seven Chart.js charts (Hours Trend, By Coach, By Activity, By Gender, By
Race/Ethnicity, By School, By Competency) are built from the report data, but
they aren't shown on the dashboard itself — they render into off-screen canvases
and only appear in the downloadable PDF report described below, so the dashboard
stays focused on the tables. Charts update whenever the report filters are changed
and reloaded.

## PDF Report Export

The "Download PDF Report" button (next to "Download report CSV" in the Report
Summary section) generates a letterhead-branded PDF entirely in the browser — no
extra server request — using the currently loaded report data and rendered charts.
The PDF includes:

- The CYBC header banner and a faint watermark on every page
  (`assets/cybc-header.png`, `assets/cybc-watermark.png`)
- Title, selected date range, and a generated timestamp
- Summary metric boxes (logs, interactions, total hours, participants)
- The seven charts described above
- Data tables for By Coach, By Activity, By Gender, By Race/Ethnicity, By School,
  By Competency, and the top 20 participants by hours, with automatic pagination
  and repeated headers on new pages
- Page numbers in the footer

If the report hasn't been loaded yet, or the PDF/Chart libraries fail to load (no
internet access reaching the CDN), the button shows a status message instead of
producing a broken file. If the header/watermark images fail to load for any
reason, the PDF is still generated without them rather than failing outright.

### Regenerating the letterhead assets

`assets/cybc-header.png` and `assets/cybc-watermark.png` were extracted from the
club's letterhead PDF (`pdfimages`, then recombining the watermark's separate
color and alpha-mask layers with Pillow). If the letterhead is redesigned, replace
these two files with same-named PNGs — no code changes are needed as long as the
header keeps a wide banner-like aspect ratio and the watermark is roughly square.
