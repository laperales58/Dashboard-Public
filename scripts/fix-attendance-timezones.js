#!/usr/bin/env node
/**
 * One-off backfill for attendance_events rows written before the timezone fix.
 *
 * Background: ZenPlanner's attendance webhook sends timestamps as naive local
 * date-time strings with no UTC offset (e.g. "2026-05-26T16:48"), plus a
 * separate "timeZone" field (e.g. "America/Chicago") that the server used to
 * ignore. Because a date-time string with no offset is parsed by JavaScript's
 * Date constructor as local time IN THE SERVER'S OWN RUNTIME TIMEZONE (UTC on
 * most hosts), every webhook-sourced check-in got stored several hours off
 * (5 hours during CDT, 6 during CST).
 *
 * This script re-derives the correct received_at / attendance_date for every
 * row that came from the webhook (identified by raw_payload having a
 * "timeZone" field -- manual entries and CSV imports never set this) and
 * shows you exactly what would change. It NEVER writes to the database unless
 * you pass --apply.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/fix-attendance-timezones.js               (dry run, default)
 *   DATABASE_URL=postgres://... node scripts/fix-attendance-timezones.js --apply        (actually updates rows)
 *   DATABASE_URL=postgres://... node scripts/fix-attendance-timezones.js --apply --limit 5   (apply to first 5 changed rows only, for a spot check)
 *
 * IMPORTANT: if you ever manually corrected a check-in's date/time by hand
 * using the Attendance tab's edit feature, that edit only changes
 * received_at/attendance_date -- it does NOT touch raw_payload. This script
 * always recomputes from raw_payload, so it will overwrite any such manual
 * correction back to the timezone-corrected value derived from the original
 * webhook data. Read the dry-run diff before applying; if a row's *current*
 * value already looks intentional/correct to you, note its id and re-run
 * with --skip <id1,id2,...> to leave it alone.
 */

const { Pool } = require("pg");

const databaseUrl = process.env.DATABASE_URL || "";
const databaseSsl = String(process.env.DATABASE_SSL || "true").toLowerCase() !== "false";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitArg = args.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(args[limitArg + 1]) : null;
const skipArg = args.indexOf("--skip");
const SKIP_IDS = new Set(
  skipArg !== -1 ? String(args[skipArg + 1] || "").split(",").map((s) => s.trim()).filter(Boolean) : []
);

// Same conversion logic as server.js's localDateTimeStringToUtcIso, copied
// here so this script has no dependency on server.js internals.
function localDateTimeStringToUtcIso(dateTimeString, timeZone) {
  const match = String(dateTimeString || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match || !timeZone) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second || 0);

  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
  } catch (formatError) {
    return null;
  }

  const parts = {};
  formatter.formatToParts(new Date(guessUtcMs)).forEach(function (part) {
    parts[part.type] = part.value;
  });
  const shownAsUtcMs = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  );

  const correctedUtcMs = guessUtcMs - (shownAsUtcMs - guessUtcMs);
  return new Date(correctedUtcMs).toISOString();
}

// Renders a UTC instant as a human-readable local wall-clock time, purely for the console diff --
// so a reviewer sees "8:12 PM" instead of the raw UTC value ("...T01:12:00.000Z"), which for an
// evening class lands after midnight UTC and reads as "1 AM" even though nothing is wrong.
function formatLocalDisplay(utcIso, timeZone) {
  if (!utcIso) return "(none)";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(utcIso)) + ` ${timeZone}`;
  } catch (formatError) {
    return utcIso;
  }
}

function recompute(rawPayload) {
  const timeZone = rawPayload.timeZone;
  if (!timeZone) return null;

  // Mirrors extractAttendanceRecords()'s fallback order for the check-in time. receivedAt is a
  // point-in-time (timestamptz), so it needs the naive-local-string -> UTC conversion.
  const rawTimestamp = rawPayload.receivedAt || rawPayload.timestamp || rawPayload.date || rawPayload.createdAt;
  const zonedReceivedAt = localDateTimeStringToUtcIso(rawTimestamp, timeZone);

  // Mirrors attendanceDateFromRecord()'s fallback order for the class date. Unlike receivedAt,
  // this is a calendar day, not an instant -- beginDate/attendanceDate are already naive local
  // time, so their date portion IS the correct local day with no conversion needed. Converting to
  // UTC first (an earlier version of this script did that) pushes evening classes onto the next day.
  const rawDate = rawPayload.beginDate || rawPayload.attendanceDate || rawTimestamp;
  const localDateMatch = String(rawDate).match(/^(\d{4}-\d{2}-\d{2})/);

  if (!zonedReceivedAt) return null;

  return {
    receivedAt: zonedReceivedAt,
    attendanceDate: localDateMatch ? localDateMatch[1] : zonedReceivedAt.slice(0, 10),
  };
}

async function main() {
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set. Point it at the database you want to fix and re-run.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: false } : false,
  });

  console.log(APPLY ? "Mode: APPLY (rows will be updated)" : "Mode: DRY RUN (no changes will be written -- pass --apply to write them)");
  console.log("");

  const result = await pool.query(`
    select id, full_name, class_name, received_at, attendance_date, raw_payload
    from attendance_events
    where raw_payload ? 'timeZone' and coalesce(raw_payload->>'timeZone', '') <> ''
    order by received_at asc
  `);

  let changedCount = 0;
  let unchangedCount = 0;
  let skippedCount = 0;
  let uncomputable = 0;
  const toApply = [];

  for (const row of result.rows) {
    if (SKIP_IDS.has(row.id)) {
      skippedCount += 1;
      continue;
    }

    const fixed = recompute(row.raw_payload);
    if (!fixed) {
      uncomputable += 1;
      console.log(`[skip: could not parse] id=${row.id} name="${row.full_name}" raw timestamp/timeZone unusable`);
      continue;
    }

    const currentReceivedAt = new Date(row.received_at).toISOString();
    const currentAttendanceDate = row.attendance_date
      ? new Date(row.attendance_date).toISOString().slice(0, 10)
      : null;

    const receivedAtChanged = currentReceivedAt !== fixed.receivedAt;
    const dateChanged = currentAttendanceDate !== fixed.attendanceDate;

    if (!receivedAtChanged && !dateChanged) {
      unchangedCount += 1;
      continue;
    }

    changedCount += 1;
    const timeZone = row.raw_payload.timeZone;
    console.log(
      `id=${row.id} name="${row.full_name}" class="${row.class_name || ""}"\n` +
      `  check-in time:   ${formatLocalDisplay(currentReceivedAt, timeZone)}  ->  ${formatLocalDisplay(fixed.receivedAt, timeZone)}\n` +
      `  attendance_date: ${currentAttendanceDate}  ->  ${fixed.attendanceDate}\n` +
      `  (stored as UTC:  ${currentReceivedAt}  ->  ${fixed.receivedAt})`
    );

    toApply.push({ id: row.id, receivedAt: fixed.receivedAt, attendanceDate: fixed.attendanceDate });
  }

  console.log("");
  console.log(
    `Scanned ${result.rows.length} webhook-sourced row(s): ${changedCount} would change, ` +
    `${unchangedCount} already correct, ${skippedCount} explicitly skipped, ${uncomputable} could not be parsed.`
  );

  if (!APPLY) {
    console.log("");
    console.log("This was a dry run -- nothing was written. Re-run with --apply once you've reviewed the diff above.");
    await pool.end();
    return;
  }

  const rowsToWrite = LIMIT ? toApply.slice(0, LIMIT) : toApply;
  if (!rowsToWrite.length) {
    console.log("Nothing to apply.");
    await pool.end();
    return;
  }

  console.log("");
  console.log(`Applying ${rowsToWrite.length} update(s)...`);

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const row of rowsToWrite) {
      await client.query(
        "update attendance_events set received_at = $1, attendance_date = $2 where id = $3",
        [row.receivedAt, row.attendanceDate, row.id]
      );
    }
    await client.query("commit");
    console.log(`Done -- updated ${rowsToWrite.length} row(s).`);
  } catch (error) {
    await client.query("rollback");
    console.error("Update failed, rolled back. No rows were changed.", error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
