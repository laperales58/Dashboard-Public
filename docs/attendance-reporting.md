# Attendance Reporting

## Importing Historical Attendance

The Attendance tab has an **Import Historical Attendance** panel at the top for backfilling
attendance from before this app tracked it live -- e.g. a spreadsheet the club kept by hand.
`POST /api/attendance/import` (Postgres-only) expects a "stacked" CSV: one row per check-in, with
columns `[date column -- whatever it happened to be named in the original sheet], Person, Gender,
DOB, Singup, DOW, Age`. Dates are `D-Mon-YY` (e.g. `3-Jan-26`); DOB is `D-FullMonthName-YY` (e.g.
`12-December-03`), since two-digit years there could plausibly mean either century -- the importer
picks whichever doesn't land in the future, and cross-checks the result against the file's own Age
column, leaving the birth date blank (and flagging it in the response) rather than guessing wrong
when the two disagree by more than a few years.

Two behaviors worth knowing:

- **Overlapping uploads replace, they don't duplicate.** For every (person, date) pair in the
  file, any existing `attendance_events` row for that exact pair is deleted before the new one is
  inserted. This means re-uploading the same file is safe (no duplicate check-ins pile up), and it
  also means uploading a later file whose date range overlaps an earlier upload -- or overlaps
  live check-ins already captured through the attendance webhook -- always makes the newly
  uploaded file the authoritative record for those specific dates.
- **Demographics only fill gaps.** Gender, birth date, age, and "Singup" (which becomes the
  roster's First Att. Date -- a much better tenure signal for backfilled members than an
  auto-detected "first seen" date) are written to `roster_people` only where that field is
  currently blank. An admin's own edits, or a richer roster import done separately, are never
  overwritten by this import.

## Attendance Rate Report

The Attendance tab (`/admin.html#attendance`) has an **Attendance Rate Report** section below the
raw check-in table. For a chosen year, it shows monthly attendance rate and average
attendance-per-day, broken down by gender, age group, and membership tenure — plus a line chart
per dimension so the 12 monthly numbers read as a trend, and a "Year Total" rollup row in each
table. This mirrors a spreadsheet the coaches used to keep by hand; it now runs automatically off
the `attendance_events` and `roster_people` tables already being fed by the attendance
webhook/import.

Requires Postgres (`DATABASE_URL`), same as the rest of the reporting.

## Definitions

**Program dates** are the distinct calendar dates in a month on which at least one check-in was
recorded. There's no separate class-schedule table recording which days the gym was actually open,
so this assumes the gym was open exactly on the days someone checked in — a deliberate
simplification, not a data gap. If the gym is ever open with zero check-ins on a given day, that
day won't count as a program date.

**Attendance rate** for a group in a given month is:

```
attendanceRate = (sum of each member's attended-days that month) / (programDates * memberCount)
```

This is equivalent to averaging each individual member's own "days attended ÷ program dates"
rate across everyone in the group, since every member in a given month shares the same
program-dates denominator.

**Average attendance per day** for a group in a given month is:

```
avgAttendancePerDay = (sum of each member's attended-days that month) / programDates
```

In other words, on a typical open day that month, how many people from that group showed up on
average.

**Who counts as a "member" in a given month:** anyone with at least one check-in that month.
There's no master "expected to attend" roster to compare against, so a month's numbers describe
"of the people who came in at all this month, how consistently did they attend" — not "of everyone
ever enrolled, who showed up." People who didn't check in at all in a given month simply don't
appear in that month's buckets.

## The three dimensions

**Gender** — bucketed into Male, Female, Other, or Unknown, canonicalized from the roster's
Gender field the same way the rest of the demographic reporting handles placeholder values (blank,
"TBD", "N/A", etc. all collapse to Unknown; anything that isn't recognizably M/F is bucketed as
Other rather than silently dropped).

**Age group** — Youth (age 24 and under) or Adult (25+), based on the roster's Age field. This
cutoff matches how DFSS Chicago defines "youth" for program reporting purposes, per the club — if
that's ever off, it's the single `YOUTH_MAX_AGE` constant near the top of the "Attendance Rate
Report" section in `server.js`. People with no age on the roster fall into Unknown.

**Tenure** — how long someone's been a member, as of the *end of the month* being reported (so a
member's tenure bucket moves up as the months in a yearly view go by):

- Under 6 months
- 6-12 months
- 1-2 years
- 2+ years
- Unknown (no usable "member since" date — see below)

"Member since" is the earlier of two candidate dates: the roster's manually-entered **First Att.
Date** column, and the person's **earliest attendance check-in on record** (all-time, not limited
to the report year, so long-time members who were already active before check-ins started being
tracked here still get correct tenure). Whichever of the two is earlier wins, since both are
evidence of being a member since at least that date; if only one is present, that one is used; if
neither is present, tenure is Unknown.

## Adjusting the assumptions

- **Age cutoff:** `YOUTH_MAX_AGE` in `server.js`.
- **Tenure bucket edges:** `tenureBucketLabel(...)` in `server.js` (currently 6/12/24 months).
- **"Program dates = days with any check-in":** if the club ever wants to track an actual class
  schedule instead of inferring open days from check-ins, that would need a new table (e.g. a list
  of session dates) and a change to how `programDates` is computed in `getAttendanceRateReport`.
