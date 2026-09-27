# Roster Demographics Import

The Roster Import form on the admin dashboard (`/admin.html`) accepts a ZenPlanner CSV or tab-separated export. It already matched people by name; it now also reads demographic columns when they are present, so you can use the same importer for either a plain roster export or a full demographics export.

## CSV vs. TSV (.txt)

ZenPlanner can export the same roster/demographics data as tab-separated text (downloaded as a `.txt` file). **TSV is the more robust option** — since fields are separated by tabs instead of commas, a comma inside an address can't be mistaken for a column break, so there's no chance of the column-shift problem described below. The importer auto-detects the format: it checks the first line of the uploaded file, and if it contains a tab character it parses the whole file as tab-delimited; otherwise it parses as comma-delimited CSV. No need to pick a format in the UI — just upload whichever ZenPlanner gives you.

## Expected Columns

The importer looks for a name column (`Name`, `Full Name`, `fullName`, `name`, `Member`, or `Member Name`) plus any of these optional demographic columns:

```text
Birth Date
Age
Address
First Att. Date
Race/Ethnicity
Zipcode
School
Gender
```

This matches the ZenPlanner "Roster Demos" export format, for example:

```csv
"Name","Birth Date","Age","Address","First Att. Date","Race/Ethnicity","Zipcode","School","Gender"
```

Dates are parsed from `M/D/YYYY` (ZenPlanner's usual export format) or any format `Date` can parse, and stored as `YYYY-MM-DD`.

### Commas in the Address column (CSV only)

ZenPlanner's CSV export sometimes leaves a comma inside the Address field without quoting it (e.g. `123 Main St, Apt 4B`). A plain CSV parser splits that into an extra column, which shifts every field after Address one (or more) columns over — this is what caused gender/school/ethnicity values to show up in the wrong place.

For CSV files, the importer detects when a data row has more raw columns than the header row and folds the extra column(s) back into Address (matched by the "Address" header, so it still works if columns are reordered, and does nothing if there's no Address column at all — e.g. a plain name-only roster CSV). This covers the common case of one comma-separated address. If a different column *also* has an unquoted comma in the same row, the repair can't tell them apart and misalignment can still happen — the Roster view's flagged rows are the way to catch that. Uploading the TSV (.txt) export instead avoids this class of problem entirely.

## What Happens

1. Each row is matched to an existing roster person by normalized name.
2. If a person already exists, demographic fields are merged onto their record based on which *columns* were present in the uploaded file — not on whether a given cell happened to be blank. A column that's missing from the file entirely (e.g. a plain name-only roster export) is left untouched, so re-importing a lighter export never erases demographics captured from an earlier, richer one. But a column that *is* in the file, and is blank for that person, now correctly clears any old value — this is what lets you fix someone's record after their info in ZenPlanner goes blank, instead of the stale value showing up forever.
3. If a person does not exist yet, a new roster entry is created with `rosterStatus: "manual-import"` and whatever demographic fields were provided.
4. When `DATABASE_URL` is set, the same column-presence rule is applied to the `roster_people` table in Postgres (`birth_date`, `age`, `address`, `first_att_date`, `race_ethnicity`, `zipcode`, `school`, `gender`) — only columns that appeared in the uploaded file are updated in Postgres, and it's the same all-or-nothing decision per column for every person in that file. Local file storage (`data/roster.json`) receives the same fields, and Postgres is treated as the source of truth on the next load.

## Reporting by Demographics

Once `DATABASE_URL` is configured, the dashboard report (`/api/reports/dashboard`) joins each activity row to the matching roster person by name and:

- Adds filter parameters `gender`, `ethnicity`, and `school`, usable alongside the existing `coach`/`youth`/`activity`/`focus`/date filters.
- Adds three breakdown tables: **By Gender**, **By Race/Ethnicity**, and **By School**, each with activity row counts, total minutes, and participant counts. Rows where the roster has no value for that field are grouped under "Unknown".
- Adds `genders`, `ethnicities`, and `schools` to the report's `options` payload, listing every distinct value currently in the roster (used to populate the filter dropdowns).

Demographic breakdowns and filters require Postgres (`DATABASE_URL`); local-file-only mode does not join roster demographics into the report.

### Consolidating "Unknown" and "N/A" values

ZenPlanner exports use several different literal placeholders for missing data instead of leaving a cell blank — e.g. gender comes through as the literal text `nospec`. Left alone, this would produce a separate row in the By Gender/By Ethnicity/By School breakdowns for every placeholder spelling in addition to the "Unknown" bucket already used for blank cells.

To catch spelling/punctuation variants of the same placeholder (`N/A`, `n/a`, `N / A.`, `n.a.` — all the same underlying value), the report query first reduces each value to a canonical form (lowercased, with every non-letter/number character stripped) before checking it against two known-placeholder lists:

- **Unknown** — we don't have this piece of information at all: blank, `unspecified`, `nospec`, `TBD`, `no data`, and similar. List lives in `UNKNOWN_DEMOGRAPHIC_TOKENS` near the top of `server.js`.
- **N/A** — the field doesn't apply to this person, which is a real answer rather than missing data. For the School column in particular, `N/A`/`No School`/`Not in School` almost always means the person isn't currently enrolled anywhere, not that the school is unknown. List lives in `NOT_APPLICABLE_DEMOGRAPHIC_TOKENS`.

These two are kept as separate buckets everywhere — grouping, filtering, and the filter-dropdown option lists — rather than being merged together, since collapsing "N/A" into "Unknown" would misrepresent a real answer as missing data. `no school`, `No School.`, `NO-SCHOOL`, and `no  school` all reduce to `noschool` and land in the N/A bucket, for example. If a new placeholder spelling shows up as its own row in a breakdown table, add its canonical form (lowercase letters/numbers only, no spaces or punctuation) to whichever of the two token lists it belongs to.

This only affects report breakdowns/filters — the Roster view still shows each person's raw stored value as imported.

**Important implementation note:** these breakdown queries must `GROUP BY` the full bucketing expression, not a bare alias like `group by school`. `roster_people` has real columns literally named `gender`/`school` (and `race_ethnicity`, aliased to `ethnicity`), and per the SQL standard — which PostgreSQL follows here — when a `GROUP BY` name could refer to either an input column or an output alias, it's resolved as the *input column*, not the alias. That silently grouped by the raw, un-bucketed value while the `SELECT` list still displayed the correctly-bucketed label per row, which is exactly why some spelling variants weren't merging even though the on-screen text all said "Unknown." Always write `group by (the same unknownBucketSql(...) expression used in the SELECT list)` for these columns instead.

### School Groups (manual aliasing)

Unknown/N/A bucketing only catches placeholder values — it doesn't help when a school is spelled two different ways ("Little Village Academy" vs. "Little Village Elementary" as two names for people who think of it as the same place), or when one raw value is actually a subset of another in real life (Chicago's Little Village Lawndale High School contains several small schools — Infinity, World Language, Social Justice, and others — so a kid might report "Infinity High School" even though administratively it's the same building/institution as "Little Village Lawndale High School"). No text-matching rule can know that; it takes someone familiar with the local schools.

The Roster tab has a **School Groups** sub-tab (alongside the **People** sub-tab, which holds the original roster import/table) for exactly this. It's a visual board: every distinct school value currently in the roster (excluding blanks/placeholders, which are already handled) appears as a draggable chip inside a box, one box per canonical group. A school with no override starts out alone in its own box, labeled with its own name.

- **Merge two schools:** drag a chip from one box and drop it onto another box — e.g. drag "Infinity High School" onto the "Little Village Lawndale High School" box. Every report/breakdown/filter/CSV/PDF involving School will then fold the dragged school in under that box's name.
- **Rename a whole group:** click the box's name (it's an editable field) and type a new canonical name; every member of that box is repointed to the new name.
- **Split a school back out:** click the "×" on a chip to send that school back to reporting under its own name, removing it from the group.
- **Start an empty group ahead of time:** the "Add empty group" button creates a placeholder box (not yet backed by any alias) that you can drag schools into.

Under the hood this is still the same manually-curated, growing list (`school_aliases` table, `GET/POST /api/school-aliases`, `DELETE /api/school-aliases/:id`) — there's no automatic fuzzy matching, so each raw spelling that should be grouped needs its own entry pointing at the same canonical name. It requires Postgres (`DATABASE_URL`), same as the rest of demographic reporting.

## Roster View

The admin dashboard also has a **Roster** section showing every stored field per person, with a name search and CSV export. It flags rows that look mismatched: a gender value that isn't a recognizable gender term, a race/ethnicity or school value that looks like a date, or a zipcode that isn't zipcode-shaped. This is meant for spotting import problems (like the comma-in-address issue above), not for validating demographic categories themselves — free-text race/ethnicity and school values are expected to vary and won't be flagged just for being unusual. Age is not flagged; the roster includes adults as well as youth participants.
