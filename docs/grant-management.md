# Grant Management (Grants tab)

The Grants tab (`/admin.html#grants`) is a lightweight grant tracker: applications, a rollup
dashboard, a quarterly forecast, and a simple revenue-vs-expenses budget view. It was modeled on
a reference tool the club had used, scaled down to what's actually needed here and stored
directly in this app's own database (no external monday.com-style sync).

Requires Postgres (`DATABASE_URL`), same as School Groups and the Attendance Rate Report -- there
is no local-file fallback for grants.

## Data model

Each grant is a single row: name, org/funder, status, confidence, year, quarter, amount, and a
few dates (app opens/closes, submitted). This is a deliberate simplification -- a grant that pays
out across multiple years (e.g. a 2-year award with half the money landing in each year) is
modeled as one row with one amount in one year/quarter, not a multi-year schedule. If that level
of detail is ever needed, enter the grant as two separate rows (one per year) instead.

**Statuses:** Not Started, Submitted, Awarded, Rejected -- this drives which section of the
Applications list a grant shows up in.

**Confidence** is the single field that determines how much of a grant's amount counts toward
the weighted forecast, independent of status (so a "Not Started" grant you're optimistic about
can still show up in the forecast):

| Confidence | Weight |
| --- | --- |
| Confirmed | 100% |
| Optimistic | 75% |
| Hopeful | 50% |
| Reach | 25% |
| Unlikely | 0% |

Rejected grants are excluded from the weighted forecast, the Forecasting tab, and the Budget
tab's revenue entirely, regardless of what confidence they're set to.

## Dashboard

- **Weighted Forecast** -- sum of `amount x confidence weight` for every non-Rejected grant in
  the selected year.
- **Total Awarded** / **Pipeline** -- raw (unweighted) sum of Awarded / Submitted grants for the
  selected year.
- **Win Rate** -- Awarded / (Awarded + Rejected), i.e. of the grants that have been decided one
  way or the other, how many were won.
- **Revenue Goal** -- an editable annual dollar goal (saved per year). Progress is tracked
  against the *Confirmed* amount specifically (not the weighted forecast), with the weighted
  total shown alongside for context.
- **Confidence Breakdown** -- count and raw dollar amount per confidence level, for the selected
  year.

## Forecasting

Grants are grouped by confidence level, each with a Q1-Q4 breakdown (a grant's full amount lands
in whichever single quarter it's assigned to) and a group total. "Confirmed Total" and
"Anticipated Total" (Optimistic + Hopeful + Reach, excluding Unlikely) are shown separately, plus
a gap-to-goal figure.

## Budget

**Revenue** reuses the Forecasting data, flattened into one table with confidence-level filter
chips (All / Confirmed / Optimistic / Hopeful / Reach). **Expenses** is a simple manual list
(category, description, amount) with no payroll/personnel calculator -- add whatever expense
lines are useful, or use the receipt uploader below to add them from a photo. **Net** = Revenue -
Expenses for the selected year.

## Receipts

Above the manual expense form, "Upload Receipt Photo or PDF" lets you pick a photo or PDF of a
receipt (from disk, a phone camera, or an emailed PDF invoice) instead of typing an expense in by
hand. Uploading sends the file to the Claude API (`analyzeReceiptImage` in `server.js`), which
reads the vendor, date, total amount, and a short description off it and picks the closest
category from the current category list (see "Categories" below). Photos are sent as an image;
PDFs are sent as a native document (Claude reads the PDF directly -- no conversion step, no
separate OCR library). The result lands in a **Receipts to Review** queue, not directly in
Expenses -- every field is editable there (including the category dropdown and the amount, in
case the AI misread something), and nothing becomes a real expense line until you click
**Confirm**. **Discard** deletes the file and draft without creating an expense.

This requires both `DATABASE_URL` and `ANTHROPIC_API_KEY` to be set. Without `DATABASE_URL`,
receipts (like the rest of Grants) don't work at all. Without `ANTHROPIC_API_KEY`, the upload
still succeeds and the file is saved to the review queue, but every field comes back blank with
an error note explaining the AI read failed -- you'd fill it in by hand from there, so the queue
still works as a "receipt attached to an expense" feature even with no API key configured.

Each receipt read is independent -- there's no memory carried between uploads. If the AI
misreads a receipt, correcting it in the review queue only affects that one receipt; it won't
change how future receipts from the same vendor get categorized.

**Categories** are fully editable from the **Manage Categories** button next to the Expenses
heading -- add, rename, reorder, or delete any category. They're stored in
`grant_expense_categories` (seeded once from a starter list the first time that table is empty,
then the database is the source of truth). Renaming/reordering takes effect immediately for both
the AI's category choices and the review-queue dropdown. Deleting a category only removes it from
that list going forward -- expenses already recorded with it keep their category text either way,
since `grant_expenses.category` (and the original manual "+ Add Expense" form) is still just
freeform text underneath.

**Storage:** receipt files are stored as raw bytes directly in Postgres (`grant_receipts.image_data`
-- name predates PDF support, holds either an image or a PDF), not on local disk, so they survive
redeploys the same way the rest of the app's data does (see the storage warning in
`deployment-start.md`). A confirmed receipt's file is kept even if its linked expense is later
deleted from the Expenses table.

**Cost:** the Claude API is billed separately from any claude.ai subscription, pay-per-token. A
single receipt read (one image or PDF + a short JSON reply) typically costs a small fraction of a
cent to a few cents with the default model.

## Adjusting the assumptions

- **Confidence weights:** `GRANT_CONFIDENCE_WEIGHTS` in `server.js`.
- **Statuses:** `GRANT_STATUSES` in `server.js` (also mirrored in `admin.js` for section
  ordering).
- **One year/quarter per grant:** see "Data model" above -- would need a schedule table to
  support true multi-year splits.
- **Receipt categories:** edit live via Manage Categories in the UI (see "Categories" above), not
  a code constant -- `DEFAULT_GRANT_EXPENSE_CATEGORIES` in `server.js` is only the one-time seed
  used the first time `grant_expense_categories` is empty.
- **Receipt-reading model:** `ANTHROPIC_MODEL` env var, defaults to `claude-sonnet-5`.
