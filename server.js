const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const attendancePath = path.join(dataDir, "attendance.jsonl");
const rosterPath = path.join(dataDir, "roster.json");
const logsPath = path.join(dataDir, "coach-logs.jsonl");

loadLocalEnv();

const port = Number(process.env.PORT || 8765);
const host = process.env.HOST || "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production" || host === "0.0.0.0";
const adminPassword = process.env.ADMIN_PASSWORD || (isProduction ? "" : "changeme-local-admin");
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? "" : "local-dev-session-secret");
const webhookSecret = process.env.WEBHOOK_SECRET || (isProduction ? "" : "local-dev-webhook-secret");
const databaseUrl = process.env.DATABASE_URL || "";
const databaseSsl = String(process.env.DATABASE_SSL || "true").toLowerCase() !== "false";
const anthropicApiKey = process.env.ANTHROPIC_API_KEY || "";
const anthropicModel = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const sessionCookieName = "coach_logs_session";
let pgPool = null;

if (isProduction) {
  const missing = [
    ["ADMIN_PASSWORD", adminPassword],
    ["SESSION_SECRET", sessionSecret],
    ["WEBHOOK_SECRET", webhookSecret],
  ].filter(([, value]) => !value);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.map(([key]) => key).join(", ")}`);
  }
}

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env");

  if (!fsSync.existsSync(envPath)) return;

  const raw = fsSync.readFileSync(envPath, "utf8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const index = trimmed.indexOf("=");
    if (index === -1) return;

    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  });
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function normalizeName(value) {
  return String(value || "")
    .replace(/[^A-Za-z'\-\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sign(value) {
  return require("node:crypto").createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function createSessionCookie() {
  const payload = JSON.stringify({
    role: "admin",
    exp: Date.now() + 1000 * 60 * 60 * 12,
  });
  const encoded = base64UrlEncode(payload);
  return `${encoded}.${sign(encoded)}`;
}

function verifySession(req) {
  const cookie = parseCookies(req)[sessionCookieName];
  if (!cookie || !cookie.includes(".")) return false;

  const [encoded, signature] = cookie.split(".");
  if (signature !== sign(encoded)) return false;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return payload.role === "admin" && payload.exp > Date.now();
  } catch {
    return false;
  }
}

// The landing page (daily log form + the coach-facing Resources page) doesn't need the shared
// admin password -- only /admin.html and its edit/approve/delete actions do. This is the static
// half of that split: pages and shared assets those two public pages need to render.
function isPublicPath(url) {
  return (
    url.pathname === "/login.html" ||
    url.pathname === "/login" ||
    url.pathname === "/api/login" ||
    url.pathname === "/" ||
    url.pathname === "/index.html" ||
    url.pathname === "/app.js" ||
    url.pathname === "/styles.css" ||
    url.pathname === "/resources.html" ||
    url.pathname === "/resources.js" ||
    url.pathname === "/schedule.html" ||
    url.pathname === "/assets/cybc-watermark.png"
  );
}

// The API half of the same split: specific routes the public log form and Resources page call
// (list/submit) stay open, while everything that edits or removes an existing record (approve,
// deny, reset, delete, create/delete a schedule week, edit a shift) stays behind the admin login.
// Kept as an explicit method+path allowlist rather than a prefix match so those admin-only actions
// on the same resource don't accidentally open up alongside the list/create routes.
function isPublicApiRoute(req, url) {
  const { method } = req;
  const { pathname } = url;

  if (method === "GET" && pathname === "/api/roster") return true;
  if (method === "GET" && pathname === "/api/logs/pattern-phrases") return true;
  if (method === "GET" && pathname === "/api/attendance") return true;
  if (method === "POST" && pathname === "/api/logs") return true;
  if (method === "GET" && pathname === "/api/coaches") return true;

  if (method === "GET" && pathname === "/api/pto-requests") return true;
  if (method === "POST" && pathname === "/api/pto-requests") return true;

  if (method === "GET" && pathname === "/api/mileage-requests") return true;
  if (method === "POST" && pathname === "/api/mileage-requests") return true;
  // Viewing a mileage photo (odometer shot, maps screenshot) is public same as the request list
  // itself -- deleting one, like every other mileage edit power, is not (stays admin-only below).
  if (method === "GET" && /^\/api\/mileage-requests\/photos\/[^/]+\/image$/.test(pathname)) return true;

  if (method === "GET" && pathname === "/api/schedule-weeks") return true;
  if (method === "GET" && /^\/api\/schedule-weeks\/[^/]+\/shifts$/.test(pathname)) return true;

  return false;
}

// Public (logged-out) views of roster and attendance records. Anything not listed here is
// stripped before it leaves the server for a visitor without an admin session.
function toPublicRosterPerson(person) {
  return {
    id: person.id,
    fullName: person.fullName,
    aliases: Array.isArray(person.aliases) ? person.aliases : [],
  };
}

function toPublicAttendanceRecord(record) {
  return {
    id: record.id,
    fullName: record.fullName || record.name || "",
    attendanceDate: record.attendanceDate || String(record.receivedAt || "").slice(0, 10),
  };
}

function isAuthenticatedRequest(req, url) {
  if (isPublicPath(url)) return true;
  if (url.pathname === "/api/health") return true;
  if (url.pathname === "/api/attendance/webhook") return true;
  if (isPublicApiRoute(req, url)) return true;
  return verifySession(req);
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function toIsoDate(value) {
  if (!value) return new Date().toISOString();

  if (typeof value === "number") {
    const excelDate = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(excelDate.getTime())) return excelDate.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

// Converts a "naive" local date-time string with NO utc offset (e.g. ZenPlanner's webhook
// timestamp "2026-05-26T16:48") into the correct UTC instant, given the IANA time zone it's
// actually in (ZenPlanner sends that separately, e.g. timeZone=America/Chicago). This exists
// because `new Date("2026-05-26T16:48")` -- what toIsoDate above ultimately falls back to --
// treats an offset-less date-time string as local time IN THE SERVER'S OWN TIME ZONE (almost
// always UTC on a cloud host), not the club's. Left unconverted, that silently shifts every
// ZenPlanner check-in by however many hours Central time is offset from UTC (5 during daylight
// saving, 6 during standard time) -- see extractAttendanceRecords/attendanceDateFromRecord, the
// only two callers.
//
// Method: interpret the naive wall-clock numbers as if they were UTC (a first guess), ask
// Intl.DateTimeFormat what that guessed instant actually displays as inside the target zone, and
// shift by the difference. That converges in one step for every real IANA zone, DST included,
// since offsets are whole/half-hour steps that don't themselves change within the few minutes this
// correction spans.
function localDateTimeStringToUtcIso(dateTimeString, timeZone) {
  const match = String(dateTimeString || "").match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match || !timeZone) return null;

  const [, year, month, day, hour, minute, second] = match.map(Number);
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second || 0);

  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    return null; // Unrecognized IANA zone name -- let the caller fall back to naive parsing.
  }

  const parts = Object.fromEntries(formatter.formatToParts(new Date(guessUtcMs)).map((part) => [part.type, part.value]));
  const shownAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );

  const correctedUtcMs = guessUtcMs - (shownAsUtcMs - guessUtcMs);
  return new Date(correctedUtcMs).toISOString();
}

function toIsoDateOnly(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const usMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (usMatch) {
    const [, month, day, year] = usMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

// Grant Management (Grants tab). Postgres-only, same as the Attendance Rate Report -- no
// local-file fallback. Statuses/order mirror the reference tool the club was modeling this on;
// "confidence" drives how much of a grant's amount counts toward the weighted forecast.
const GRANT_STATUSES = ["Not Started", "Submitted", "Awarded", "Rejected"];
const GRANT_CONFIDENCE_LEVELS = ["Confirmed", "Optimistic", "Hopeful", "Reach", "Unlikely"];

// Starting category list receipts get sorted into -- seeded into grant_expense_categories once,
// the first time that table is empty. From then on the list lives in the database and is fully
// editable (add/rename/reorder/delete) via the Grants > Budget > Expenses "Manage Categories"
// panel, see listGrantExpenseCategories/createGrantExpenseCategory/etc below. The manual
// "Add Expense" form stays freeform text for backward compatibility; only AI-read receipts are
// pinned to one of these so reporting stays consistent.
const DEFAULT_GRANT_EXPENSE_CATEGORIES = [
  "Equipment",
  "Program Supplies",
  "Facility & Rent",
  "Travel & Transportation",
  "Food & Nutrition",
  "Coaching & Staff",
  "Uniforms & Apparel",
  "Office & Admin",
  "Fundraising & Events",
  "Other",
];

// Guardrail on upload size -- receipts are phone photos or single-page PDFs, not print scans or
// multi-page scanned books; 8MB is generous headroom while still keeping the request body (base64
// is ~33% larger than raw bytes) sane for a server with no framework-level body size limit.
const MAX_RECEIPT_IMAGE_BYTES = 8 * 1024 * 1024;
// Receipts get read as an "image" content block unless the upload is a PDF, in which case the
// Claude API reads it natively as a "document" block (no conversion to images needed on our end).
const RECEIPT_PDF_MIME_TYPE = "application/pdf";
// Phone camera photos are typically 3000-4000px on the long edge -- 1600px keeps every line of
// text on a standard receipt clearly legible (this is well above the resolution needed to read
// printed text/numbers) while cutting typical file size by 70-90%. Quality 82 is the standard
// "visually lossless for photos of text/documents" JPEG setting -- see compressUploadedImage.
const RECEIPT_IMAGE_MAX_DIMENSION = 1600;
const RECEIPT_IMAGE_JPEG_QUALITY = 82;
// A mileage request can attach more than one photo (odometer start, odometer end, a maps
// screenshot) -- capped low since this is meant for a handful of supporting shots, not a full
// photo album, and each one gets the same MAX_RECEIPT_IMAGE_BYTES-per-file size guardrail above.
const MAX_MILEAGE_PHOTOS_PER_REQUEST = 4;
// Who paid and how -- picked once per receipt upload (a receipt is one purchase, so it has one
// cardholder and one payment method even if the items on it get split across expense categories).
// Both lists live in the receipt_options table and are edited from the Budget tab's "Manage
// Cardholders & Payment" dialog -- never hardcode real names or account numbers here.
const RECEIPT_OPTION_KINDS = {
  cardholder: "Cardholder",
  payment_method: "Payment method",
};

// Fixed taxonomy the coach-log auto-tagging matches against -- must stay in sync with the labels in
// app.js's activityPatterns/focusPatterns/categoryMap. The AI pattern-gap review (see
// analyzeLogPatternGaps) is only allowed to suggest new trigger PHRASES for these existing labels,
// never invent a new label -- that keeps every suggestion mapping onto a category a human already
// designed the reporting/taxonomy around.
const LOG_ACTIVITY_LABELS = [
  "Pad work",
  "Footwork",
  "Sparring",
  "Boxing class",
  "Shadow boxing",
  "Bag work",
  "Blocking and defense",
  "Combinations",
  "Technique drills",
  "Conditioning",
  "Strength training",
  "Running",
  "Warm-up",
  "Cool-down",
  "Open gym",
  "School support",
  "Mentoring conversation",
  "Wellness check-in",
];
const LOG_FOCUS_LABELS = [
  "Mechanics",
  "Counters",
  "Rhythm",
  "Timing",
  "Footwork",
  "Defense",
  "Power",
  "Speed",
  "Accuracy",
  "Combinations",
  "Strength and conditioning",
  "Balance",
  "Distance control",
  "Pressure",
  "Ring awareness",
  "Confidence",
  "Teamwork",
];
const LOG_CATEGORY_LABELS = ["Beyond the Ropes", "Fighting Side by Side", "Feel Good, Fight Strong", "Fighting for My Future"];
const LOG_PATTERN_LABELS_BY_TYPE = {
  activity: LOG_ACTIVITY_LABELS,
  focus: LOG_FOCUS_LABELS,
  category: LOG_CATEGORY_LABELS,
};
// How many flagged logs get swept into one "Check for pattern gaps" run. Keeps a single click
// bounded and predictable instead of accidentally reviewing years of backlog (and tokens) at once.
const LOG_PATTERN_REVIEW_BATCH_SIZE = 40;

// Staff live in the staff_members table, managed from the Staff tab on the dashboard.
const PTO_LEAVE_TYPES = ["Vacation", "Sick", "Personal", "Unpaid"];
const PTO_STATUSES = ["pending", "approved", "denied"];
// Same pending/approved/denied review workflow as PTO requests (see setMileageRequestStatus) --
// kept as its own constant so the two resource types can diverge later without coupling.
const MILEAGE_STATUSES = ["pending", "approved", "denied"];
const GRANT_CONFIDENCE_WEIGHTS = {
  Confirmed: 1,
  Optimistic: 0.75,
  Hopeful: 0.5,
  Reach: 0.25,
  Unlikely: 0,
};

const demographicFields = [
  "birthDate",
  "age",
  "address",
  "firstAttDate",
  "raceEthnicity",
  "zipcode",
  "school",
  "gender",
];

// Acceptable ZenPlanner header names for each demographic field. Used both to read a value
// out of an uploaded row and to detect whether a column was present in the file at all (as
// opposed to present-but-blank for a given person).
const demographicHeaderAliases = {
  birthDate: ["Birth Date", "Birthdate", "DOB"],
  age: ["Age"],
  address: ["Address"],
  firstAttDate: ["First Att. Date", "First Attendance Date", "First Att Date"],
  raceEthnicity: ["Race/Ethnicity", "Race / Ethnicity", "Ethnicity", "Race"],
  zipcode: ["Zipcode", "Zip Code", "Zip"],
  school: ["School"],
  gender: ["Gender", "Sex"],
};

// ZenPlanner exports use several different literal placeholder values instead of leaving a cell
// blank (e.g. gender comes through as the literal string "nospec" for "not specified"). Without
// normalizing these, the dashboard's By Gender/By Ethnicity/By School breakdowns show a separate
// row for every placeholder spelling in addition to the bucket already used for blank values.
//
// These placeholders actually mean two different things, so they're split into two buckets rather
// than one catch-all:
//   - "Unknown": we don't have this piece of information at all (blank cell, "unspecified",
//     "nospec", "TBD", etc.)
//   - "N/A": the field doesn't apply to this person (e.g. "N/A" or "no school" for the School
//     column commonly means the person isn't currently enrolled anywhere, which is a real answer,
//     not missing data)
// Collapsing "N/A" into "Unknown" would misrepresent real answers as missing data, so they're kept
// separate everywhere: grouping, filtering, and the filter-dropdown option lists.
//
// Matching is done against a *canonical* form of the value — lowercased with every non-alphanumeric
// character (spaces, slashes, periods, dashes, apostrophes, etc.) stripped out — rather than the
// literal text. That way "N/A", "n/a", "N / A", "n.a.", and "N/A." all reduce to the same "na" and
// get caught by one entry in this list, instead of needing every punctuation/spacing variant
// spelled out separately.
const UNKNOWN_DEMOGRAPHIC_TOKENS = [
  "none",
  "unk",
  "unknown",
  "unspecified",
  "unspecifed",
  "unspec",
  "unspecd",
  "nospec",
  "notspecified",
  "nospecified",
  "nodata",
  "null",
  "tbd",
  "pending",
  "nopreference",
  "declined",
  "declinetoanswer",
  "prefernottosay",
];

const NOT_APPLICABLE_DEMOGRAPHIC_TOKENS = ["na", "notapplicable", "noschool", "notinschool"];

function sqlTextArray(tokens) {
  return `array[${tokens.map((token) => `'${token.replace(/'/g, "''")}'`).join(",")}]`;
}

const UNKNOWN_DEMOGRAPHIC_TOKENS_SQL = sqlTextArray(UNKNOWN_DEMOGRAPHIC_TOKENS);
const NOT_APPLICABLE_DEMOGRAPHIC_TOKENS_SQL = sqlTextArray(NOT_APPLICABLE_DEMOGRAPHIC_TOKENS);

// Lowercased, punctuation/whitespace-stripped form of a column's value, used both to detect a
// known placeholder and as the group-by key so spacing/punctuation variants of the same
// underlying value (e.g. two differently-formatted blanks) collapse together too.
function canonicalDemographicSql(column) {
  return `lower(regexp_replace(coalesce(${column}, ''), '[^a-zA-Z0-9]', '', 'g'))`;
}

// Wraps a SQL column reference so any blank or known "missing data" placeholder (in any
// punctuation/spacing variant) collapses to 'Unknown', any "does not apply" placeholder collapses
// to 'N/A', and anything else passes through trimmed as originally typed.
//
// IMPORTANT: always GROUP BY this full expression, never by the output alias alone. "gender" and
// "school" are real column names on roster_people, and an unqualified `group by gender` silently
// binds to the raw, un-bucketed `roster_people.gender` column instead of this expression whenever
// the two happen to share a name — which defeats the bucketing without erroring, since the SELECT
// list still *displays* the bucketed label per row. Grouping by the expression itself sidesteps
// that ambiguity entirely.
function unknownBucketSql(column) {
  const canonical = canonicalDemographicSql(column);
  return `(case
    when ${canonical} = '' or ${canonical} = any(${UNKNOWN_DEMOGRAPHIC_TOKENS_SQL}) then 'Unknown'
    when ${canonical} = any(${NOT_APPLICABLE_DEMOGRAPHIC_TOKENS_SQL}) then 'N/A'
    else trim(${column})
  end)`;
}

// Same Unknown/N/A bucketing as unknownBucketSql, but for real (non-placeholder) school values,
// prefers a manually-curated school_aliases mapping over the raw text — e.g. so "Infinity High
// School" reports under "Little Village Lawndale High School" once an admin has recorded that
// mapping in the School Groups admin UI. Requires a `left join school_aliases sa on sa.normalized_alias
// = lower(trim(coalesce(r.school, '')))` in the same query (folded into the shared rosterJoin so
// every report query gets it automatically).
function schoolBucketSql(column) {
  const canonical = canonicalDemographicSql(column);
  return `(case
    when ${canonical} = '' or ${canonical} = any(${UNKNOWN_DEMOGRAPHIC_TOKENS_SQL}) then 'Unknown'
    when ${canonical} = any(${NOT_APPLICABLE_DEMOGRAPHIC_TOKENS_SQL}) then 'N/A'
    else coalesce(sa.canonical_name, trim(${column}))
  end)`;
}

function applyDemographics(target, source) {
  demographicFields.forEach((field) => {
    const value = source[field];
    // Only "this field wasn't part of the uploaded row at all" should be skipped. A field
    // that's present-but-blank (null/"") is a real value and must overwrite stale data,
    // otherwise re-importing after someone's info goes blank can never clear it.
    if (value === undefined) return;
    target[field] = value;
  });
}

// Returns undefined when none of the candidate header keys exist on the row at all (column
// absent from the uploaded file). Returns the trimmed string value otherwise, even if that
// value is "" (column present, blank for this row).
function pickField(row, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return String(row[key] ?? "").trim();
    }
  }
  return undefined;
}

// Wraps toIsoDateOnly while preserving the "column absent" (undefined) distinction: an absent
// column stays undefined, a present-but-unparseable/blank value becomes "".
function mapOptionalDate(raw) {
  if (raw === undefined) return undefined;
  return toIsoDateOnly(raw);
}

function extractDemographics(row) {
  const ageRaw = pickField(row, demographicHeaderAliases.age);
  const ageNumber = Number(ageRaw);
  const age = ageRaw === undefined ? undefined : ageRaw && Number.isFinite(ageNumber) ? ageNumber : null;

  return {
    birthDate: mapOptionalDate(pickField(row, demographicHeaderAliases.birthDate)),
    age,
    address: pickField(row, demographicHeaderAliases.address),
    firstAttDate: mapOptionalDate(pickField(row, demographicHeaderAliases.firstAttDate)),
    raceEthnicity: pickField(row, demographicHeaderAliases.raceEthnicity),
    zipcode: pickField(row, demographicHeaderAliases.zipcode),
    school: pickField(row, demographicHeaderAliases.school),
    gender: pickField(row, demographicHeaderAliases.gender),
  };
}

async function ensureDataFiles() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(rosterPath);
  } catch {
    await fs.writeFile(rosterPath, "[]\n", "utf8");
  }
}

async function readJsonBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    const params = new URLSearchParams(raw);
    return Object.fromEntries(params.entries());
  }
}

function repairCsvRowOverflow(values, expectedLength, mergeIndex) {
  const overflow = values.length - expectedLength;
  if (overflow <= 0 || mergeIndex === -1) return values;

  const mergedField = values
    .slice(mergeIndex, mergeIndex + overflow + 1)
    .map((value) => String(value || "").trim())
    .join(", ");

  return [...values.slice(0, mergeIndex), mergedField, ...values.slice(mergeIndex + overflow + 1)];
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0) || "";
  // ZenPlanner's tab-separated export (saved as .txt) sidesteps comma-in-address problems
  // entirely. A real header row for this app never contains a literal tab, so if one shows
  // up in the first line, treat the whole file as tab-delimited instead of comma-delimited.
  return firstLine.includes("\t") ? "\t" : ",";
}

function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      field = "";

      if (row.some((value) => String(value || "").trim())) rows.push(row);
      row = [];
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => String(value || "").trim())) rows.push(row);

  if (!rows.length) return { headers: [], rows: [] };

  const headers = rows[0].map((header, index) =>
    String(header || "")
      .replace(index === 0 ? /^﻿/ : /^$/, "")
      .trim(),
  );

  // ZenPlanner CSV exports sometimes leave a comma in the Address field unquoted, which
  // splits it into extra raw columns and shifts every field after it. When a data row has
  // more fields than there are headers, assume the overflow came from Address (the only
  // free-text column expected to contain commas) and fold those extra fields back together.
  const addressIndex = headers.indexOf("Address");

  const dataRows = rows.slice(1).map((rawValues) => {
    const values = repairCsvRowOverflow(rawValues, headers.length, addressIndex);
    return Object.fromEntries(headers.map((header, index) => [header, String(values[index] || "").trim()]));
  });

  return { headers, rows: dataRows };
}

// ---- Attendance CSV Import (historical backfill) --------------------------------------------
//
// The club kept attendance in a spreadsheet before this app tracked it live. That export is one
// row per (date, person) "stacked" together, with the person's demographics repeated on every
// row: [date column -- literally named whatever the original sheet's first column was, e.g.
// "January" -- , Person, Gender, DOB, Singup, DOW, Age]. "Singup" is their membership start date,
// which doubles as a much better "member since" source than we'd otherwise have for backfilled
// history. Dates are "D-Mon-YY" (e.g. "3-Jan-26"); DOB is "D-FullMonthName-YY" (e.g.
// "12-December-03").

const SHORT_MONTH_INDEX = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const FULL_MONTH_INDEX = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

function monthIndexFromName(monthName) {
  const key = String(monthName || "").toLowerCase();
  return key.length <= 3 ? SHORT_MONTH_INDEX[key.slice(0, 3)] : FULL_MONTH_INDEX[key];
}

// "D-Mon-YY" or "D-FullMonthName-YY" -> ISO yyyy-mm-dd. Two-digit years are always taken as
// 2000+YY, since this is only used for attendance dates and signup dates, which are always
// recent. Returns "" if it doesn't parse.
function parseTwoDigitYearDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})-([A-Za-z]+)-(\d{2})$/);
  if (!match) return "";
  const [, dayRaw, monthName, yyRaw] = match;
  const day = Number(dayRaw);
  const monthIndex = monthIndexFromName(monthName);
  if (monthIndex === undefined || !Number.isFinite(day)) return "";

  const date = new Date(Date.UTC(2000 + Number(yyRaw), monthIndex, day));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

// Same format, but for birth dates: a two-digit year could plausibly be either 19YY or 20YY, so
// this picks whichever doesn't land in the future. If the resulting age would be over 100 (or
// somehow both centuries land in the future), returns "" rather than guessing wrong -- better to
// leave a birth date blank than write one that's off by a century.
function parseBirthDate(value) {
  const match = String(value || "").trim().match(/^(\d{1,2})-([A-Za-z]+)-(\d{2})$/);
  if (!match) return "";
  const [, dayRaw, monthName, yyRaw] = match;
  const day = Number(dayRaw);
  const yy = Number(yyRaw);
  const monthIndex = monthIndexFromName(monthName);
  if (monthIndex === undefined || !Number.isFinite(day)) return "";

  const today = new Date();
  const candidate2000 = new Date(Date.UTC(2000 + yy, monthIndex, day));
  const resolved = candidate2000.getTime() <= today.getTime() ? candidate2000 : new Date(Date.UTC(1900 + yy, monthIndex, day));

  const ageYears = (today.getTime() - resolved.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (resolved.getTime() > today.getTime() || ageYears > 100) return "";
  return resolved.toISOString().slice(0, 10);
}

function extractAttendanceImportRows(csvText) {
  const { headers, rows } = parseCsv(csvText);
  if (!headers.length) return { attendanceRows: [], demographics: new Map(), skipped: [], flagged: [], rowCount: 0 };

  const dateHeader = headers[0]; // whatever the sheet's first column happened to be named
  const attendanceRows = [];
  const demographics = new Map(); // normalizedName -> { fullName, gender, birthDate, age, firstAttDate }
  const skipped = [];
  const flagged = [];

  rows.forEach((row, index) => {
    const fullName = String(row.Person || "").replace(/\s+/g, " ").trim();
    const normalizedName = normalizeName(fullName);
    if (!normalizedName) {
      skipped.push({ rowNumber: index + 2, reason: "Missing name" });
      return;
    }

    const attendanceDate = parseTwoDigitYearDate(row[dateHeader]);
    if (!attendanceDate) {
      skipped.push({ rowNumber: index + 2, fullName, reason: `Could not parse date "${row[dateHeader]}"` });
      return;
    }

    attendanceRows.push({ fullName, normalizedName, attendanceDate });

    if (demographics.has(normalizedName)) return; // demographics are repeated per row; only need them once per person

    // When DOB is blank, the source spreadsheet's Age formula produces a meaningless huge
    // placeholder instead of leaving Age blank too (observed as the same ~126.6 value on every
    // such row) -- exclude anything over 100 rather than storing that as someone's real age.
    const rawAge = Number(row.Age);
    const age = Number.isFinite(rawAge) && rawAge >= 0 && rawAge < 100 ? Math.floor(rawAge) : null;

    const rawDob = String(row.DOB || "").trim();
    let birthDate = rawDob ? parseBirthDate(rawDob) : "";
    if (rawDob && !birthDate) {
      flagged.push({ fullName, reason: `Birth date "${rawDob}" didn't parse -- left blank` });
    } else if (birthDate && age !== null) {
      // parseBirthDate already avoids landing in the future, but a two-digit year can still
      // resolve to the "less wrong" of two still-bad centuries (e.g. "26" as either 2026, which
      // is in the future, or 1926, which is merely very old). The file's own Age column is a
      // direct, independently-given value, so use it as a sanity check: if the birth date implies
      // an age way off from what Age says, the date is bad -- drop it rather than trust a guess.
      const impliedAge = (Date.now() - new Date(`${birthDate}T00:00:00Z`).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (Math.abs(impliedAge - age) > 3) {
        flagged.push({ fullName, reason: `Birth date "${rawDob}" implies age ~${Math.floor(impliedAge)}, but Age column says ${age} -- left blank` });
        birthDate = "";
      }
    }

    demographics.set(normalizedName, {
      fullName,
      gender: String(row.Gender || "").trim(),
      birthDate,
      age,
      firstAttDate: parseTwoDigitYearDate(row.Singup),
    });
  });

  return { attendanceRows, demographics, skipped, flagged, rowCount: rows.length };
}

async function importAttendanceRecords(attendanceRows, demographicsByName) {
  const pool = getPgPool();
  if (!pool) return { configured: false };

  // Dedup to unique (normalizedName, attendanceDate) pairs -- the source file can (rarely) list
  // the same person on the same date more than once, and there's no reason to store duplicates
  // when the report already counts distinct attendance dates per person.
  const uniqueRows = [...new Map(attendanceRows.map((row) => [`${row.normalizedName}|${row.attendanceDate}`, row])).values()];

  const client = await pool.connect();
  try {
    await client.query("begin");

    let deletedOverlap = 0;
    if (uniqueRows.length) {
      // Re-uploading the same file, or uploading a file whose dates overlap a previous upload
      // (e.g. later adding July data that overlaps days already captured live via the attendance
      // webhook), should always replace rather than duplicate -- this import is treated as the
      // authoritative record for whichever (person, date) pairs it contains.
      const deleteResult = await client.query(
        `
          delete from attendance_events ae
          using (
            select unnest($1::text[]) as normalized_name, unnest($2::date[]) as attendance_date
          ) as incoming
          where ae.normalized_name = incoming.normalized_name and ae.attendance_date = incoming.attendance_date
        `,
        [uniqueRows.map((row) => row.normalizedName), uniqueRows.map((row) => row.attendanceDate)],
      );
      deletedOverlap = deleteResult.rowCount || 0;

      await client.query(
        `
          insert into attendance_events (id, full_name, normalized_name, received_at, attendance_date, source, raw_payload)
          select unnest($1::uuid[]), unnest($2::text[]), unnest($3::text[]), now(), unnest($4::date[]), 'csv-import', '{}'::jsonb
        `,
        [
          uniqueRows.map(() => randomUUID()),
          uniqueRows.map((row) => row.fullName),
          uniqueRows.map((row) => row.normalizedName),
          uniqueRows.map((row) => row.attendanceDate),
        ],
      );
    }

    // Fills in gender/birth date/age/first-att-date only where the roster doesn't already have a
    // value -- this import should backfill gaps, not overwrite demographics an admin already
    // fixed up by hand (e.g. via the School Groups-style roster editor).
    for (const [normalizedName, demo] of demographicsByName.entries()) {
      await client.query(
        `
          insert into roster_people (
            id, full_name, normalized_name, aliases, first_seen_at, last_seen_at,
            attendance_count, roster_status, raw_payload, gender, birth_date, age, first_att_date, updated_at
          )
          values ($1, $2, $3, '[]'::jsonb, now(), null, 0, 'csv-import', '{}'::jsonb, $4, $5, $6, $7, now())
          on conflict (normalized_name) do update set
            gender = coalesce(nullif(roster_people.gender, ''), excluded.gender),
            birth_date = coalesce(roster_people.birth_date, excluded.birth_date),
            age = coalesce(roster_people.age, excluded.age),
            first_att_date = coalesce(roster_people.first_att_date, excluded.first_att_date),
            updated_at = now()
        `,
        [randomUUID(), demo.fullName, normalizedName, demo.gender || null, demo.birthDate || null, demo.age, demo.firstAttDate || null],
      );
    }

    await client.query("commit");
    return { configured: true, saved: true, inserted: uniqueRows.length, deletedOverlap, peopleUpdated: demographicsByName.size };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function extractRosterImportPeople(csvText) {
  const { headers, rows } = parseCsv(csvText);
  const seen = new Set();
  const skipped = [];
  const people = [];

  // Which demographic fields actually had a matching header column in this upload. Used
  // downstream so a column that's genuinely absent from the file (e.g. a plain name-only
  // roster export) doesn't wipe out demographics captured from a previous, richer import.
  const presentDemographicFields = new Set(
    demographicFields.filter((field) =>
      (demographicHeaderAliases[field] || []).some((alias) => headers.includes(alias)),
    ),
  );

  rows.forEach((row, index) => {
    const fullName =
      row.Name ||
      row["Full Name"] ||
      row.fullName ||
      row.name ||
      row.Member ||
      row["Member Name"] ||
      "";
    const normalizedName = normalizeName(fullName);

    if (!normalizedName) {
      skipped.push({ rowNumber: index + 2, reason: "Missing name" });
      return;
    }

    if (seen.has(normalizedName)) {
      skipped.push({ rowNumber: index + 2, fullName, reason: "Duplicate name in CSV" });
      return;
    }

    seen.add(normalizedName);
    people.push({
      id: row.ID || row.Id || row["Member ID"] || `roster-${normalizedName}`,
      fullName: String(fullName).replace(/\s+/g, " ").trim(),
      normalizedName,
      aliases: [],
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: "",
      attendanceCount: 0,
      rosterStatus: "manual-import",
      ...extractDemographics(row),
      raw: row,
    });
  });

  return { people, skipped, rowCount: rows.length, presentDemographicFields };
}

async function readRoster() {
  await ensureDataFiles();
  const raw = await fs.readFile(rosterPath, "utf8");
  return JSON.parse(raw || "[]");
}

async function writeRoster(roster) {
  await fs.writeFile(rosterPath, `${JSON.stringify(roster, null, 2)}\n`, "utf8");
}

// Builds the full set of roster fields from an admin-submitted form. Manual add/edit always
// sends the whole record (not a partial patch), so this fully replaces demographics rather
// than merging like the CSV import path does.
function normalizeRosterFields(payload) {
  const fullName = String(payload.fullName || "").replace(/\s+/g, " ").trim();

  return {
    fullName,
    normalizedName: normalizeName(fullName),
    birthDate: payload.birthDate ? toIsoDateOnly(payload.birthDate) : "",
    age: payload.age === "" || payload.age === undefined || payload.age === null ? null : Number(payload.age),
    address: String(payload.address || "").trim(),
    firstAttDate: payload.firstAttDate ? toIsoDateOnly(payload.firstAttDate) : "",
    raceEthnicity: String(payload.raceEthnicity || "").trim(),
    zipcode: String(payload.zipcode || "").trim(),
    school: String(payload.school || "").trim(),
    gender: String(payload.gender || "").trim(),
  };
}

async function createRosterPersonLocal(fields) {
  const roster = await readRoster();
  if (roster.some((person) => person.normalizedName === fields.normalizedName)) {
    throw Object.assign(new Error("A roster person with this name already exists."), { statusCode: 409 });
  }

  const person = {
    id: randomUUID(),
    fullName: fields.fullName,
    normalizedName: fields.normalizedName,
    aliases: [],
    firstSeenAt: new Date().toISOString(),
    lastSeenAt: "",
    attendanceCount: 0,
    rosterStatus: "manual-entry",
    birthDate: fields.birthDate,
    age: fields.age,
    address: fields.address,
    firstAttDate: fields.firstAttDate,
    raceEthnicity: fields.raceEthnicity,
    zipcode: fields.zipcode,
    school: fields.school,
    gender: fields.gender,
  };

  roster.push(person);
  roster.sort((a, b) => a.fullName.localeCompare(b.fullName));
  await writeRoster(roster);
  return person;
}

async function updateRosterPersonLocal(id, fields) {
  const roster = await readRoster();
  const index = roster.findIndex((person) => person.id === id);
  if (index === -1) {
    throw Object.assign(new Error("Roster person not found."), { statusCode: 404 });
  }

  const conflict = roster.some((person, i) => i !== index && person.normalizedName === fields.normalizedName);
  if (conflict) {
    throw Object.assign(new Error("Another roster person already has this name."), { statusCode: 409 });
  }

  roster[index] = {
    ...roster[index],
    fullName: fields.fullName,
    normalizedName: fields.normalizedName,
    birthDate: fields.birthDate,
    age: fields.age,
    address: fields.address,
    firstAttDate: fields.firstAttDate,
    raceEthnicity: fields.raceEthnicity,
    zipcode: fields.zipcode,
    school: fields.school,
    gender: fields.gender,
  };

  roster.sort((a, b) => a.fullName.localeCompare(b.fullName));
  await writeRoster(roster);
  return roster[index];
}

async function deleteRosterPersonLocal(id) {
  const roster = await readRoster();
  const index = roster.findIndex((person) => person.id === id);
  if (index === -1) {
    throw Object.assign(new Error("Roster person not found."), { statusCode: 404 });
  }

  roster.splice(index, 1);
  await writeRoster(roster);
}

function extractAttendanceRecords(payload) {
  const source = Array.isArray(payload) ? payload : payload.records || payload.attendance || [payload];

  return source
    .map((item) => {
      // ZenPlanner's attendance webhook sends the attendee's name split across firstName /
      // middleName / lastName, and separately sends a `name` field that is actually the CLASS
      // name (e.g. "Summer General Boxing"), not the attendee -- saveAttendanceToDatabase reads
      // that same raw.name as the class name for the "Class" column, which confirms it never
      // holds a person's name for this integration. Build the name from the real name parts
      // first, and deliberately leave `name` out of the fallback chain entirely below: an event
      // with no firstName/lastName and none of the other real-name fields is a class-level event
      // with no individual attendee attached, not a person whose name happens to be missing, so
      // falling back to `name` there would silently store the class as if it were a person again.
      const zenPlannerName = [item.firstName, item.middleName, item.lastName]
        .map((part) => String(part || "").trim())
        .filter(Boolean)
        .join(" ");

      const fullName =
        zenPlannerName ||
        item.fullName ||
        item.studentName ||
        item.participantName ||
        item.memberName ||
        item.displayName;

      if (!fullName || !String(fullName).trim()) return null;

      // ZenPlanner's timestamp/beginDate fields are naive local time with no UTC offset, plus a
      // separate `timeZone` field (e.g. "America/Chicago") saying what that local time actually
      // is -- see localDateTimeStringToUtcIso for why that needs special handling instead of
      // going through toIsoDate's plain `new Date(...)` parsing. Other sources (manual entries,
      // CSV imports) never set `timeZone`, so they fall through to the old behavior unchanged.
      const rawTimestamp = item.receivedAt || item.timestamp || item.date || item.createdAt;
      const zonedReceivedAt = item.timeZone ? localDateTimeStringToUtcIso(rawTimestamp, item.timeZone) : null;

      return {
        id: randomUUID(),
        fullName: String(fullName).replace(/\s+/g, " ").trim(),
        normalizedName: normalizeName(fullName),
        receivedAt: zonedReceivedAt || toIsoDate(rawTimestamp),
        source: item.source || payload.source || "attendance-webhook",
        raw: item,
      };
    })
    .filter(Boolean);
}

async function upsertRosterFromAttendance(records) {
  const roster = await readRoster();
  const byName = new Map(roster.map((person) => [person.normalizedName, person]));

  records.forEach((record) => {
    if (byName.has(record.normalizedName)) {
      const person = byName.get(record.normalizedName);
      person.lastSeenAt = record.receivedAt;
      person.attendanceCount = (person.attendanceCount || 0) + 1;
      return;
    }

    const person = {
      id: randomUUID(),
      fullName: record.fullName,
      normalizedName: record.normalizedName,
      aliases: [],
      firstSeenAt: record.receivedAt,
      lastSeenAt: record.receivedAt,
      attendanceCount: 1,
      rosterStatus: "auto-added",
    };

    roster.push(person);
    byName.set(record.normalizedName, person);
  });

  roster.sort((a, b) => a.fullName.localeCompare(b.fullName));
  await writeRoster(roster);
  return roster;
}

async function upsertLocalRosterImport(people) {
  const roster = await readRoster();
  const byName = new Map(roster.map((person) => [person.normalizedName, person]));
  let added = 0;
  let existing = 0;

  people.forEach((person) => {
    if (byName.has(person.normalizedName)) {
      const existingPerson = byName.get(person.normalizedName);
      existingPerson.raw = existingPerson.raw || {};
      existingPerson.raw.lastRosterImport = person.raw;
      applyDemographics(existingPerson, person);
      existing += 1;
      return;
    }

    const newPerson = {
      id: person.id,
      fullName: person.fullName,
      normalizedName: person.normalizedName,
      aliases: [],
      firstSeenAt: person.firstSeenAt,
      lastSeenAt: "",
      attendanceCount: 0,
      rosterStatus: "manual-import",
      raw: { rosterImport: person.raw },
    };
    applyDemographics(newPerson, person);
    roster.push(newPerson);
    byName.set(person.normalizedName, newPerson);
    added += 1;
  });

  roster.sort((a, b) => a.fullName.localeCompare(b.fullName));
  await writeRoster(roster);

  return { roster, added, existing };
}

async function appendJsonLines(filePath, records) {
  if (!records.length) return;
  await ensureDataFiles();
  const lines = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.appendFile(filePath, `${lines}\n`, "utf8");
}

async function readJsonLines(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeAttendanceLocal(records) {
  await ensureDataFiles();
  const content = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.writeFile(attendancePath, records.length ? `${content}\n` : "", "utf8");
}

async function updateAttendanceLocal(id, changes) {
  const records = await readJsonLines(attendancePath);
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) {
    throw Object.assign(new Error("Attendance record not found."), { statusCode: 404 });
  }

  const record = records[index];
  if (changes.fullName) {
    record.fullName = changes.fullName;
    record.normalizedName = normalizeName(changes.fullName);
  }
  if (changes.attendanceDate) {
    record.attendanceDate = changes.attendanceDate;
    record.receivedAt = new Date(`${changes.attendanceDate}T12:00:00.000Z`).toISOString();
  }
  if (changes.className !== undefined) {
    record.className = changes.className;
  }

  await writeAttendanceLocal(records);
  return record;
}

async function deleteAttendanceLocal(id) {
  const records = await readJsonLines(attendancePath);
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) {
    throw Object.assign(new Error("Attendance record not found."), { statusCode: 404 });
  }

  records.splice(index, 1);
  await writeAttendanceLocal(records);
}

function mergeRosterRecords(...sources) {
  const byName = new Map();

  sources.flat().forEach((person) => {
    const fullName = person.fullName || person.name || "";
    const normalizedName = person.normalizedName || normalizeName(fullName);
    if (!normalizedName || !fullName) return;

    if (!byName.has(normalizedName)) {
      const record = {
        id: person.id || `roster-${normalizedName}`,
        fullName,
        normalizedName,
        aliases: Array.isArray(person.aliases) ? person.aliases : [],
        firstSeenAt: person.firstSeenAt || person.receivedAt || "",
        lastSeenAt: person.lastSeenAt || person.receivedAt || "",
        attendanceCount: Number(person.attendanceCount || 0),
        lastAttendanceDate: person.lastAttendanceDate || "",
        rosterStatus: person.rosterStatus || "cached",
      };
      applyDemographics(record, person);
      byName.set(normalizedName, record);
      return;
    }

    const existing = byName.get(normalizedName);
    existing.aliases = [...new Set([...existing.aliases, ...((person.aliases || []))])];
    existing.firstSeenAt = minIsoDate(existing.firstSeenAt, person.firstSeenAt || person.receivedAt || "");
    existing.lastSeenAt = maxIsoDate(existing.lastSeenAt, person.lastSeenAt || person.receivedAt || "");
    existing.attendanceCount = Math.max(existing.attendanceCount, Number(person.attendanceCount || 0));
    existing.lastAttendanceDate = maxIsoDate(existing.lastAttendanceDate, person.lastAttendanceDate || "");
    if (existing.rosterStatus !== "auto-added") existing.rosterStatus = person.rosterStatus || existing.rosterStatus;
    applyDemographics(existing, person);
  });

  return [...byName.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function minIsoDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) <= new Date(b) ? a : b;
}

function maxIsoDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) >= new Date(b) ? a : b;
}

async function readRosterCache() {
  try {
    const databaseRoster = await readRosterFromDatabase();
    if (databaseRoster) return mergeRosterRecords(databaseRoster);
  } catch (error) {
    console.warn("Database roster fallback failed:", error.message);
  }

  return mergeRosterRecords(await readRoster());
}

function attendanceRecordInRange(record, { date, from, to }) {
  const recordDate = record.attendanceDate || String(record.receivedAt || "").slice(0, 10);
  if (date) return recordDate === date;
  if (from && recordDate < from) return false;
  if (to && recordDate > to) return false;
  return true;
}

async function readAttendanceCache({ date, from, to } = {}) {
  try {
    const databaseAttendance = await readAttendanceFromDatabase({ date, from, to });
    if (databaseAttendance) return databaseAttendance;
  } catch (error) {
    console.warn("Database attendance fallback failed:", error.message);
  }

  const hasFilter = Boolean(date || from || to);
  const localRecords = await readJsonLines(attendancePath);
  const localFiltered = hasFilter
    ? localRecords.filter((record) => attendanceRecordInRange(record, { date, from, to }))
    : localRecords;

  return localFiltered;
}

function getPgPool() {
  if (!databaseUrl) return null;
  if (pgPool) return pgPool;

  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch (error) {
    throw new Error("Postgres support is not installed. Run npm install before using DATABASE_URL.");
  }

  pgPool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: false } : false,
  });

  return pgPool;
}

async function initDatabase() {
  const pool = getPgPool();
  if (!pool) return { configured: false };

  await pool.query(`
    create table if not exists coach_logs (
      id uuid primary key,
      received_at timestamptz not null,
      coach text not null,
      session_date date not null,
      response text not null,
      assistant_draft jsonb not null default '{}'::jsonb,
      raw_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create table if not exists coach_log_activities (
      id uuid primary key,
      coach_log_id uuid not null references coach_logs(id) on delete cascade,
      row_id text,
      youth_id text,
      youth_name text not null,
      minutes integer not null,
      minutes_source text,
      activity text not null,
      activity_source text,
      activity_modifier text,
      source_clause text,
      source_sentence text,
      created_at timestamptz not null default now()
    );

    create table if not exists roster_people (
      id text primary key,
      full_name text not null,
      normalized_name text not null unique,
      aliases jsonb not null default '[]'::jsonb,
      first_seen_at timestamptz,
      last_seen_at timestamptz,
      attendance_count integer not null default 0,
      roster_status text not null default 'auto-added',
      raw_payload jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );

    create table if not exists attendance_events (
      id uuid primary key,
      external_id text,
      full_name text not null,
      normalized_name text not null,
      received_at timestamptz not null,
      attendance_date date,
      person_id text,
      class_name text,
      source text,
      raw_payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists coach_logs_session_date_idx on coach_logs (session_date);
    create index if not exists coach_logs_coach_idx on coach_logs (coach);
    create index if not exists coach_log_activities_log_idx on coach_log_activities (coach_log_id);
    create index if not exists coach_log_activities_youth_name_idx on coach_log_activities (lower(youth_name));
    create index if not exists coach_log_activities_activity_idx on coach_log_activities (activity);
    create index if not exists coach_log_activities_modifier_idx on coach_log_activities (activity_modifier);
    create index if not exists roster_people_name_idx on roster_people (lower(full_name));
    create index if not exists roster_people_last_seen_idx on roster_people (last_seen_at);
    create index if not exists attendance_events_date_idx on attendance_events (attendance_date);
    create index if not exists attendance_events_name_idx on attendance_events (lower(full_name));
    create index if not exists attendance_events_person_idx on attendance_events (person_id);

    alter table roster_people add column if not exists birth_date date;
    alter table roster_people add column if not exists age integer;
    alter table roster_people add column if not exists address text;
    alter table roster_people add column if not exists first_att_date date;
    alter table roster_people add column if not exists race_ethnicity text;
    alter table roster_people add column if not exists zipcode text;
    alter table roster_people add column if not exists school text;
    alter table roster_people add column if not exists gender text;

    create index if not exists roster_people_gender_idx on roster_people (gender);
    create index if not exists roster_people_race_ethnicity_idx on roster_people (race_ethnicity);
    create index if not exists roster_people_school_idx on roster_people (school);

    -- Real-world school names don't cleanly cluster on their own (e.g. "Infinity High School" is
    -- actually one of several small schools inside "Little Village Lawndale High School", and
    -- "Little Village Academy" / "Little Village Elementary" may be the same institution under two
    -- names an admin recognizes but no text-matching rule would). This is a manually-curated,
    -- growing list of "this raw value should be reported under this name" overrides.
    create table if not exists school_aliases (
      id uuid primary key,
      normalized_alias text not null unique,
      raw_alias text not null,
      canonical_name text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists school_aliases_canonical_idx on school_aliases (canonical_name);

    create table if not exists grants (
      id uuid primary key,
      name text not null,
      org text not null default '',
      status text not null default 'Not Started',
      confidence text not null default 'Reach',
      year integer not null,
      quarter integer,
      amount numeric not null default 0,
      app_opens date,
      app_closes date,
      submitted_date date,
      notes text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists grants_year_idx on grants (year);
    create index if not exists grants_status_idx on grants (status);
    create index if not exists grants_confidence_idx on grants (confidence);

    create table if not exists grant_goals (
      year integer primary key,
      goal_amount numeric not null default 0
    );

    -- category/description/amount are the always-present basics; note/cardholder/payment_method
    -- and grant_id are the bookkeeper-facing fields added later (see the "bookkeeper info" ALTERs
    -- below) -- listed here too so a brand-new install gets the full shape in one shot.
    create table if not exists grant_expenses (
      id uuid primary key,
      year integer not null,
      category text not null default '',
      description text not null default '',
      amount numeric not null default 0,
      note text not null default '',
      cardholder text not null default '',
      payment_method text not null default '',
      grant_id uuid references grants(id) on delete set null,
      created_at timestamptz not null default now()
    );

    create index if not exists grant_expenses_year_idx on grant_expenses (year);

    -- Uploaded receipt photos, read and categorized by the Claude API (see analyzeReceiptImage).
    -- This is now just the uploaded file plus the info that applies to the whole receipt (who
    -- paid, how, vendor, date) -- what was actually bought lives in grant_receipt_items below,
    -- since one receipt can cover purchases that split across more than one expense category.
    create table if not exists grant_receipts (
      id uuid primary key,
      year integer not null,
      image_data bytea not null,
      image_mime text not null default 'image/jpeg',
      vendor text not null default '',
      receipt_date date,
      cardholder text not null default '',
      payment_method text not null default '',
      ai_notes text not null default '',
      ai_error text,
      uploaded_at timestamptz not null default now()
    );

    create index if not exists grant_receipts_year_idx on grant_receipts (year);

    -- One row per expense-category line on a receipt. Most receipts have exactly one line (the
    -- whole total, one category); a receipt that mixes purchases -- e.g. some items for general
    -- club operations and other items bought for resale -- gets split into more than one line,
    -- each with its own category/amount/description/note. A line sits here as a "pending" draft
    -- until it's reviewed and confirmed, at which point a grant_expenses row is created from it.
    -- Deleting a line (see deleteGrantReceiptItem, used both for discarding a pending draft and
    -- for the "All Receipts" table's Delete action) removes this row, the parent receipt too once
    -- its last line is gone, and -- if the line had already been confirmed -- the grant_expenses
    -- row it spawned, so nothing lingers in the ledger with no receipt behind it. grant_id is
    -- deliberately optional here -- the grant manager assigns it later, it doesn't need to be set
    -- at upload or confirm time.
    create table if not exists grant_receipt_items (
      id uuid primary key,
      receipt_id uuid not null references grant_receipts(id) on delete cascade,
      status text not null default 'pending',
      category text not null default '',
      description text not null default '',
      amount numeric not null default 0,
      note text not null default '',
      grant_id uuid references grants(id) on delete set null,
      expense_id uuid references grant_expenses(id) on delete set null,
      created_at timestamptz not null default now(),
      confirmed_at timestamptz
    );

    create index if not exists grant_receipt_items_receipt_idx on grant_receipt_items (receipt_id);
    create index if not exists grant_receipt_items_status_idx on grant_receipt_items (status);

    -- Editable list of receipt categories (Grants > Budget > Expenses > Manage Categories).
    -- Seeded once from DEFAULT_GRANT_EXPENSE_CATEGORIES below when empty; from then on this
    -- table is the source of truth and the constant is only ever used as that one-time seed.
    create table if not exists grant_expense_categories (
      id uuid primary key,
      name text not null unique,
      sort_order integer not null default 0,
      created_at timestamptz not null default now()
    );

    create index if not exists grant_expense_categories_sort_idx on grant_expense_categories (sort_order);
  `);

  // Bookkeeper info added to grant_expenses after it first shipped -- installs that already ran
  // the create table above without these columns need them added explicitly; "add column if not
  // exists" is a no-op for anyone whose create table already included them.
  await pool.query(`
    alter table grant_expenses add column if not exists note text not null default '';
    alter table grant_expenses add column if not exists cardholder text not null default '';
    alter table grant_expenses add column if not exists payment_method text not null default '';
    alter table grant_expenses add column if not exists grant_id uuid references grants(id) on delete set null;
    alter table grant_receipts add column if not exists cardholder text not null default '';
    alter table grant_receipts add column if not exists payment_method text not null default '';
  `);

  // One-time migration: the first version of receipts stored status/category/description/amount/
  // expense_id/confirmed_at directly on grant_receipts (one row = one expense line, no splitting).
  // Move any of that data into grant_receipt_items before dropping those columns, so nothing
  // already uploaded or confirmed under the old shape gets lost.
  const legacyReceiptColumn = await pool.query(
    "select column_name from information_schema.columns where table_name = 'grant_receipts' and column_name = 'status'",
  );
  if (legacyReceiptColumn.rows.length) {
    const legacyReceipts = await pool.query(
      "select id, status, category, description, amount, expense_id, confirmed_at, uploaded_at from grant_receipts",
    );
    for (const legacyRow of legacyReceipts.rows) {
      await pool.query(
        `
          insert into grant_receipt_items (id, receipt_id, status, category, description, amount, expense_id, confirmed_at, created_at)
          select $1, $2, $3, $4, $5, $6, $7, $8, $9
          where not exists (select 1 from grant_receipt_items where receipt_id = $2)
        `,
        [
          randomUUID(),
          legacyRow.id,
          legacyRow.status,
          legacyRow.category || "",
          legacyRow.description || "",
          legacyRow.amount || 0,
          legacyRow.expense_id,
          legacyRow.confirmed_at,
          legacyRow.uploaded_at,
        ],
      );
    }
    await pool.query(`
      alter table grant_receipts
        drop column if exists status,
        drop column if exists amount,
        drop column if exists category,
        drop column if exists description,
        drop column if exists expense_id,
        drop column if exists confirmed_at;
    `);
  }

  const categoryCount = await pool.query("select count(*)::int as count from grant_expense_categories");
  if (categoryCount.rows[0].count === 0) {
    for (let index = 0; index < DEFAULT_GRANT_EXPENSE_CATEGORIES.length; index += 1) {
      await pool.query(
        "insert into grant_expense_categories (id, name, sort_order) values ($1,$2,$3) on conflict (name) do nothing",
        [randomUUID(), DEFAULT_GRANT_EXPENSE_CATEGORIES[index], index],
      );
    }
  }

  // Receipt cardholders/payment methods. On the very first run after these moved out of the code,
  // carry over whatever values existing expenses/receipts already use so nothing has to be
  // re-entered by hand; a fresh database (e.g. a demo) just starts empty.
  const receiptOptionsExisted = (await pool.query("select to_regclass('receipt_options') as name")).rows[0].name;
  await pool.query(`
    create table if not exists receipt_options (
      id uuid primary key,
      kind text not null,
      name text not null,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      unique (kind, name)
    );
  `);
  if (!receiptOptionsExisted) {
    for (const kind of ["cardholder", "payment_method"]) {
      const used = await pool.query(`
        select distinct value from (
          select ${kind} as value from grant_expenses
          union
          select ${kind} as value from grant_receipts
        ) used
        where value <> ''
        order by value
      `);
      for (let index = 0; index < used.rows.length; index += 1) {
        await pool.query(
          "insert into receipt_options (id, kind, name, sort_order) values ($1,$2,$3,$4) on conflict (kind, name) do nothing",
          [randomUUID(), kind, used.rows[index].value, index],
        );
      }
    }
  }

  // Coach-log auto-tagging (activities/focus/program categories) is matched client-side against
  // fixed keyword lists baked into app.js. These two tables let that get better over time without a
  // code deploy: `log_pattern_phrases` holds admin-approved extra trigger phrases layered on top of
  // the built-in lists (fetched by the coach-facing page on load); `log_pattern_suggestions` is the
  // review queue Claude's gap analysis writes to, which an admin approves or dismisses. Approving a
  // suggestion is what actually inserts it into log_pattern_phrases and makes it live.
  await pool.query(`
    create table if not exists log_pattern_phrases (
      id uuid primary key,
      pattern_type text not null,
      label text not null,
      phrase text not null,
      created_at timestamptz not null default now()
    );

    create index if not exists log_pattern_phrases_type_label_idx on log_pattern_phrases (pattern_type, label);

    create table if not exists log_pattern_suggestions (
      id uuid primary key,
      pattern_type text not null,
      label text not null,
      phrase text not null,
      example_log_id uuid,
      example_quote text not null default '',
      reason text not null default '',
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      reviewed_at timestamptz
    );

    create index if not exists log_pattern_suggestions_status_idx on log_pattern_suggestions (status);

    -- Single-row watermark: only logs created after last_reviewed_at get considered by the next
    -- "Check for pattern gaps" run, so re-running never re-analyzes (and re-bills) the same logs.
    create table if not exists log_pattern_review_state (
      id text primary key default 'default',
      last_reviewed_at timestamptz
    );

    -- Resources tab, starting with PTO Requests -- more resource types (mileage, schedule) are
    -- planned as separate tables/sub-tabs later, same shape as this one.
    create table if not exists pto_requests (
      id uuid primary key,
      staff_name text not null,
      start_date date not null,
      end_date date not null,
      leave_type text not null default 'Vacation',
      note text not null default '',
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      reviewed_at timestamptz
    );

    create index if not exists pto_requests_status_idx on pto_requests (status);
    create index if not exists pto_requests_staff_idx on pto_requests (staff_name);
    create index if not exists pto_requests_start_date_idx on pto_requests (start_date);

    -- Resources tab: Mileage. Just a log (staff, date, purpose, miles, note) -- no rate/dollar
    -- calculation, that math happens off-app same as receipt amounts aren't tax-categorized here.
    create table if not exists mileage_requests (
      id uuid primary key,
      staff_name text not null,
      trip_date date not null,
      purpose text not null default '',
      miles numeric not null default 0,
      note text not null default '',
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      reviewed_at timestamptz
    );

    create index if not exists mileage_requests_status_idx on mileage_requests (status);
    create index if not exists mileage_requests_staff_idx on mileage_requests (staff_name);
    create index if not exists mileage_requests_trip_date_idx on mileage_requests (trip_date);

    -- Optional free-text start/end locations for the trip -- addresses, not coordinates, since
    -- this is a manual mileage log rather than something computed from real GPS data.
    alter table mileage_requests add column if not exists start_address text not null default '';
    alter table mileage_requests add column if not exists end_address text not null default '';

    -- Optional photos attached to a mileage request -- odometer start/end shots or a maps
    -- screenshot showing the route/distance. Multiple per request (unlike a grant receipt, which
    -- is always exactly one image -- see grant_receipts), so these live in their own table instead
    -- of a single bytea column on mileage_requests.
    create table if not exists mileage_request_photos (
      id uuid primary key,
      mileage_request_id uuid not null references mileage_requests(id) on delete cascade,
      image_data bytea not null,
      image_mime text not null default 'image/jpeg',
      uploaded_at timestamptz not null default now()
    );

    create index if not exists mileage_request_photos_request_idx on mileage_request_photos (mileage_request_id);

    -- Resources tab: Schedule. Replaces the weekly staff schedule spreadsheet the office admin used
    -- to email out. Kept as distinct "weeks" (not one overwritten grid) so past weeks stay browsable.
    -- Each week is just a 7-day grid anchored at start_date; sign-off/confirmation fields from the
    -- old sheet were deliberately dropped -- just the staff x day x shift-time grid.
    create table if not exists schedule_weeks (
      id uuid primary key,
      start_date date not null unique,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists schedule_weeks_start_date_idx on schedule_weeks (start_date desc);

    -- One row per staff member per day that has a shift; a day with no shift just has no row here.
    create table if not exists schedule_shifts (
      id uuid primary key,
      week_id uuid not null references schedule_weeks (id) on delete cascade,
      staff_name text not null,
      shift_date date not null,
      start_time text not null,
      end_time text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (week_id, staff_name, shift_date)
    );

    create index if not exists schedule_shifts_week_idx on schedule_shifts (week_id);
    create index if not exists schedule_shifts_staff_idx on schedule_shifts (staff_name);

    -- Staff roster for the Resources tab (PTO/Mileage/Schedule) and the coach log form's Coach
    -- dropdown. Deactivating someone (rather than deleting) keeps their name selectable in history
    -- and lets them come back later without losing continuity with past requests/logs/shifts.
    create table if not exists staff_members (
      id uuid primary key,
      name text not null unique,
      active boolean not null default true,
      sort_order integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create index if not exists staff_members_active_idx on staff_members (active);
  `);

  return { configured: true };
}

async function saveCoachLogToDatabase(log) {
  const pool = getPgPool();
  if (!pool) return { configured: false, saved: false };

  const client = await pool.connect();
  try {
    await client.query("begin");

    await client.query(
      `
        insert into coach_logs (
          id,
          received_at,
          coach,
          session_date,
          response,
          assistant_draft,
          raw_payload
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      `,
      [
        log.id,
        log.receivedAt,
        log.coach,
        log.sessionDate,
        log.response,
        JSON.stringify(log.assistantDraft || {}),
        JSON.stringify(log),
      ],
    );

    const activities = Array.isArray(log.confirmedActivities) ? log.confirmedActivities : [];
    for (const activity of activities) {
      await client.query(
        `
          insert into coach_log_activities (
            id,
            coach_log_id,
            row_id,
            youth_id,
            youth_name,
            minutes,
            minutes_source,
            activity,
            activity_source,
            activity_modifier,
            source_clause,
            source_sentence
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          randomUUID(),
          log.id,
          activity.rowId || "",
          activity.youthId || "",
          activity.youthName || "",
          Number(activity.minutes || 0),
          activity.minutesSource || "",
          activity.activity || "",
          activity.activitySource || "",
          activity.activityModifier || "",
          activity.sourceClause || "",
          activity.sourceSentence || "",
        ],
      );
    }

    await client.query("commit");

    return {
      configured: true,
      saved: true,
      logId: log.id,
      activityCount: activities.length,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function attendanceDateFromRecord(record) {
  const rawDate = record.raw?.beginDate || record.raw?.attendanceDate || record.attendanceDate || record.receivedAt;

  // ZenPlanner's beginDate/attendanceDate are naive local time already (no UTC offset), so their
  // date portion IS the correct local calendar day as-is -- unlike receivedAt, this needs no
  // timezone conversion at all. Converting it to a UTC instant first (as an earlier version of
  // this function did) is actively wrong: it pushes any evening class past 6-7pm Central onto the
  // next UTC day, filing it under tomorrow instead of today.
  if (record.raw?.timeZone) {
    const localMatch = String(rawDate).match(/^(\d{4}-\d{2}-\d{2})/);
    if (localMatch) return localMatch[1];
  }

  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return record.receivedAt.slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

async function saveAttendanceToDatabase(records) {
  const pool = getPgPool();
  if (!pool) return { configured: false, saved: false, rosterCount: 0 };

  const client = await pool.connect();
  try {
    await client.query("begin");

    for (const record of records) {
      const attendanceDate = attendanceDateFromRecord(record);
      const personId = record.raw?.personId || "";
      const className = record.raw?.className || record.raw?.name || "";
      const rosterId = personId || `roster-${record.normalizedName}`;

      await client.query(
        `
          insert into attendance_events (
            id,
            external_id,
            full_name,
            normalized_name,
            received_at,
            attendance_date,
            person_id,
            class_name,
            source,
            raw_payload
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        `,
        [
          record.id,
          record.raw?.attendanceId || record.raw?.id || "",
          record.fullName,
          record.normalizedName,
          record.receivedAt,
          attendanceDate,
          personId,
          className,
          record.source || "attendance-webhook",
          JSON.stringify(record.raw || {}),
        ],
      );

      await client.query(
        `
          insert into roster_people (
            id,
            full_name,
            normalized_name,
            aliases,
            first_seen_at,
            last_seen_at,
            attendance_count,
            roster_status,
            raw_payload,
            updated_at
          )
          values ($1, $2, $3, '[]'::jsonb, $4, $4, 1, 'auto-added', $5::jsonb, now())
          on conflict (normalized_name) do update set
            full_name = excluded.full_name,
            last_seen_at = greatest(roster_people.last_seen_at, excluded.last_seen_at),
            attendance_count = roster_people.attendance_count + 1,
            roster_status = 'auto-added',
            raw_payload = excluded.raw_payload,
            updated_at = now()
        `,
        [
          rosterId,
          record.fullName,
          record.normalizedName,
          record.receivedAt,
          JSON.stringify(record.raw || {}),
        ],
      );
    }

    const rosterResult = await client.query("select count(*)::int as count from roster_people");
    await client.query("commit");

    return {
      configured: true,
      saved: true,
      rosterCount: rosterResult.rows[0]?.count || 0,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

// Maps our camelCase demographic field names to their roster_people columns. Used to build
// the on-conflict SET clause dynamically, below.
const demographicColumnByField = {
  birthDate: "birth_date",
  age: "age",
  address: "address",
  firstAttDate: "first_att_date",
  raceEthnicity: "race_ethnicity",
  zipcode: "zipcode",
  school: "school",
  gender: "gender",
};

async function importRosterToDatabase(people, presentDemographicFields = new Set()) {
  const pool = getPgPool();
  if (!pool) return { configured: false, saved: false, added: 0, existing: 0, rosterCount: 0 };

  const client = await pool.connect();
  try {
    await client.query("begin");

    let added = 0;
    let existing = 0;

    // Only assign a demographic column on conflict if its column was actually present in the
    // uploaded file. This is computed once per file (not per person) so it reflects "was this
    // column in the file" rather than "was this value blank for this particular person" —
    // otherwise a plain name-only roster upload would wipe out demographics from an earlier,
    // richer import just because those columns are missing from this file.
    const demographicSetClauses = demographicFields
      .filter((field) => presentDemographicFields.has(field))
      .map((field) => {
        const column = demographicColumnByField[field];
        return `${column} = excluded.${column}`;
      });

    for (const person of people) {
      const setClauses = [
        "full_name = excluded.full_name",
        "raw_payload = roster_people.raw_payload || excluded.raw_payload",
        ...demographicSetClauses,
        "updated_at = now()",
      ];

      const result = await client.query(
        `
          insert into roster_people (
            id,
            full_name,
            normalized_name,
            aliases,
            first_seen_at,
            last_seen_at,
            attendance_count,
            roster_status,
            raw_payload,
            birth_date,
            age,
            address,
            first_att_date,
            race_ethnicity,
            zipcode,
            school,
            gender,
            updated_at
          )
          values ($1, $2, $3, '[]'::jsonb, now(), null, 0, 'manual-import', $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, now())
          on conflict (normalized_name) do update set
            ${setClauses.join(",\n            ")}
          returning (xmax = 0) as inserted
        `,
        [
          person.id,
          person.fullName,
          person.normalizedName,
          JSON.stringify({
            source: "zenplanner-roster-csv",
            importedAt: new Date().toISOString(),
            row: person.raw,
          }),
          person.birthDate || null,
          person.age ?? null,
          person.address || "",
          person.firstAttDate || null,
          person.raceEthnicity || "",
          person.zipcode || "",
          person.school || "",
          person.gender || "",
        ],
      );

      if (result.rows[0]?.inserted) added += 1;
      else existing += 1;
    }

    const rosterResult = await client.query("select count(*)::int as count from roster_people");
    await client.query("commit");

    return {
      configured: true,
      saved: true,
      added,
      existing,
      rosterCount: rosterResult.rows[0]?.count || 0,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

const rosterSelectColumns = `
  id, full_name, normalized_name, aliases, first_seen_at, last_seen_at,
  attendance_count, roster_status, birth_date, age, address, first_att_date,
  race_ethnicity, zipcode, school, gender
`;

function mapRosterRow(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    normalizedName: row.normalized_name,
    aliases: Array.isArray(row.aliases) ? row.aliases : [],
    firstSeenAt: row.first_seen_at ? row.first_seen_at.toISOString() : "",
    lastSeenAt: row.last_seen_at ? row.last_seen_at.toISOString() : "",
    attendanceCount: Number(row.attendance_count || 0),
    rosterStatus: row.roster_status || "auto-added",
    birthDate: row.birth_date ? row.birth_date.toISOString().slice(0, 10) : "",
    age: row.age === null || row.age === undefined ? null : Number(row.age),
    address: row.address || "",
    firstAttDate: row.first_att_date ? row.first_att_date.toISOString().slice(0, 10) : "",
    raceEthnicity: row.race_ethnicity || "",
    zipcode: row.zipcode || "",
    school: row.school || "",
    gender: row.gender || "",
    // Only present on queries that specifically select it (e.g. readRosterFromDatabase's roster
    // list, used to filter the admin Roster tab to recently-active people) -- "" on any query that
    // doesn't join attendance_events, which is fine since those callers don't use this field.
    lastAttendanceDate: row.last_attendance_date ? row.last_attendance_date.toISOString().slice(0, 10) : "",
  };
}

async function readRosterFromDatabase() {
  const pool = getPgPool();
  if (!pool) return null;

  const result = await pool.query(`
    select
      ${rosterSelectColumns},
      (
        select max(ae.attendance_date)
        from attendance_events ae
        where ae.normalized_name = roster_people.normalized_name
      ) as last_attendance_date
    from roster_people
    order by full_name
  `);
  return result.rows.map(mapRosterRow);
}

async function getRosterPersonDb(id) {
  const pool = getPgPool();
  if (!pool) return null;

  const result = await pool.query(`select ${rosterSelectColumns} from roster_people where id = $1`, [id]);
  return result.rows[0] ? mapRosterRow(result.rows[0]) : null;
}

async function createRosterPersonDb(fields) {
  const pool = getPgPool();
  if (!pool) return null;

  const conflict = await pool.query("select id from roster_people where normalized_name = $1", [fields.normalizedName]);
  if (conflict.rows.length) {
    throw Object.assign(new Error("A roster person with this name already exists."), { statusCode: 409 });
  }

  const id = randomUUID();
  await pool.query(
    `
      insert into roster_people (
        id, full_name, normalized_name, aliases, first_seen_at, last_seen_at,
        attendance_count, roster_status, raw_payload,
        birth_date, age, address, first_att_date, race_ethnicity, zipcode, school, gender, updated_at
      )
      values ($1, $2, $3, '[]'::jsonb, now(), null, 0, 'manual-entry', '{}'::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, now())
    `,
    [
      id,
      fields.fullName,
      fields.normalizedName,
      fields.birthDate || null,
      fields.age,
      fields.address,
      fields.firstAttDate || null,
      fields.raceEthnicity,
      fields.zipcode,
      fields.school,
      fields.gender,
    ],
  );

  return getRosterPersonDb(id);
}

async function updateRosterPersonDb(id, fields) {
  const pool = getPgPool();
  if (!pool) return null;

  const conflict = await pool.query("select id from roster_people where normalized_name = $1 and id <> $2", [
    fields.normalizedName,
    id,
  ]);
  if (conflict.rows.length) {
    throw Object.assign(new Error("Another roster person already has this name."), { statusCode: 409 });
  }

  const result = await pool.query(
    `
      update roster_people set
        full_name = $2,
        normalized_name = $3,
        birth_date = $4,
        age = $5,
        address = $6,
        first_att_date = $7,
        race_ethnicity = $8,
        zipcode = $9,
        school = $10,
        gender = $11,
        updated_at = now()
      where id = $1
      returning id
    `,
    [
      id,
      fields.fullName,
      fields.normalizedName,
      fields.birthDate || null,
      fields.age,
      fields.address,
      fields.firstAttDate || null,
      fields.raceEthnicity,
      fields.zipcode,
      fields.school,
      fields.gender,
    ],
  );

  if (!result.rows.length) {
    throw Object.assign(new Error("Roster person not found."), { statusCode: 404 });
  }

  return getRosterPersonDb(id);
}

async function deleteRosterPersonDb(id) {
  const pool = getPgPool();
  if (!pool) return;

  const result = await pool.query("delete from roster_people where id = $1 returning id", [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error("Roster person not found."), { statusCode: 404 });
  }
}

function schoolAliasRowToJson(row) {
  return {
    id: row.id,
    rawAlias: row.raw_alias,
    canonicalName: row.canonical_name,
  };
}

// Real-world school naming doesn't reduce to a text-matching rule (e.g. "Infinity High School" is
// one of several small schools physically inside "Little Village Lawndale High School" — no amount
// of fuzzy string matching would know that). This is a manually-curated list an admin builds over
// time: "when you see this raw value, report it under this name instead."
async function listSchoolAliases() {
  const pool = getPgPool();
  if (!pool) return [];

  const result = await pool.query("select id, raw_alias, canonical_name from school_aliases order by canonical_name, raw_alias");
  return result.rows.map(schoolAliasRowToJson);
}

async function upsertSchoolAlias(fields) {
  const pool = getPgPool();
  if (!pool) return null;

  const rawAlias = String(fields.rawAlias || "").trim();
  const canonicalName = String(fields.canonicalName || "").trim();
  const normalizedAlias = rawAlias.toLowerCase();

  if (!rawAlias) {
    throw Object.assign(new Error("Raw school value is required."), { statusCode: 400 });
  }
  if (!canonicalName) {
    throw Object.assign(new Error("Canonical (group as) name is required."), { statusCode: 400 });
  }

  const result = await pool.query(
    `
      insert into school_aliases (id, normalized_alias, raw_alias, canonical_name, created_at, updated_at)
      values ($1, $2, $3, $4, now(), now())
      on conflict (normalized_alias) do update set
        raw_alias = excluded.raw_alias,
        canonical_name = excluded.canonical_name,
        updated_at = now()
      returning id, raw_alias, canonical_name
    `,
    [randomUUID(), normalizedAlias, rawAlias, canonicalName],
  );

  return schoolAliasRowToJson(result.rows[0]);
}

async function deleteSchoolAlias(id) {
  const pool = getPgPool();
  if (!pool) return;

  const result = await pool.query("delete from school_aliases where id = $1 returning id", [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error("School alias not found."), { statusCode: 404 });
  }
}

async function readAttendanceFromDatabase({ date, from, to } = {}) {
  const pool = getPgPool();
  if (!pool) return null;

  const params = [];
  const conditions = [];
  if (date) {
    params.push(date);
    conditions.push(`attendance_date = $${params.length}`);
  } else {
    if (from) {
      params.push(from);
      conditions.push(`attendance_date >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`attendance_date <= $${params.length}`);
    }
  }
  const where = conditions.length ? `where ${conditions.join(" and ")}` : "";

  // A single exact date or the unfiltered "most recent" view is capped at 1000 rows same as
  // always; a from/to range is a deliberate query for a specific stretch (a month, a season,
  // "how many unique people in July") so silently truncating it would make the report wrong
  // with no sign anything was cut off.
  const limitClause = from || to ? "" : "limit 1000";

  const result = await pool.query(
    `
      select
        id,
        external_id,
        full_name,
        normalized_name,
        received_at,
        attendance_date,
        person_id,
        class_name,
        source,
        raw_payload
      from attendance_events
      ${where}
      order by received_at desc
      ${limitClause}
    `,
    params,
  );

  return result.rows.map((row) => ({
    id: row.id,
    externalId: row.external_id,
    fullName: row.full_name,
    normalizedName: row.normalized_name,
    receivedAt: row.received_at ? row.received_at.toISOString() : "",
    attendanceDate: row.attendance_date ? row.attendance_date.toISOString().slice(0, 10) : "",
    personId: row.person_id || "",
    className: row.class_name || "",
    source: row.source || "attendance-webhook",
    raw: row.raw_payload || {},
  }));
}

async function updateAttendanceDb(id, changes) {
  const pool = getPgPool();
  if (!pool) return;

  const sets = [];
  const values = [];
  function add(column, value) {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  }

  if (changes.fullName) {
    add("full_name", changes.fullName);
    add("normalized_name", normalizeName(changes.fullName));
  }
  if (changes.attendanceDate) {
    add("attendance_date", changes.attendanceDate);
    add("received_at", `${changes.attendanceDate}T12:00:00.000Z`);
  }
  if (changes.className !== undefined) {
    add("class_name", changes.className);
  }

  if (!sets.length) return;

  values.push(id);
  const result = await pool.query(
    `update attendance_events set ${sets.join(", ")} where id = $${values.length} returning id`,
    values,
  );

  if (!result.rows.length) {
    throw Object.assign(new Error("Attendance record not found."), { statusCode: 404 });
  }
}

async function deleteAttendanceDb(id) {
  const pool = getPgPool();
  if (!pool) return;

  const result = await pool.query("delete from attendance_events where id = $1 returning id", [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error("Attendance record not found."), { statusCode: 404 });
  }
}

async function getDatabaseStatus() {
  const status = {
    databaseConfigured: Boolean(databaseUrl),
    databaseSsl,
    ok: false,
    error: null,
  };

  if (!databaseUrl) {
    status.error = "DATABASE_URL is not set.";
    return status;
  }

  try {
    await initDatabase();
    const result = await getPgPool().query(`
      select
        (select count(*)::int from coach_logs) as log_count,
        (select count(*)::int from coach_log_activities) as activity_count,
        (select count(*)::int from attendance_events) as attendance_count,
        (select count(*)::int from roster_people) as roster_count
    `);
    status.ok = true;
    status.logCount = result.rows[0]?.log_count || 0;
    status.activityCount = result.rows[0]?.activity_count || 0;
    status.attendanceCount = result.rows[0]?.attendance_count || 0;
    status.rosterCount = result.rows[0]?.roster_count || 0;
  } catch (error) {
    status.error = error.message;
  }

  return status;
}

function buildReportWhere(searchParams) {
  const clauses = [];
  const values = [];

  function add(value) {
    values.push(value);
    return `$${values.length}`;
  }

  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const coach = searchParams.get("coach");
  const youth = searchParams.get("youth");
  const activity = searchParams.get("activity");
  const focus = searchParams.get("focus");
  const gender = searchParams.get("gender");
  const ethnicity = searchParams.get("ethnicity");
  const school = searchParams.get("school");
  const competency = searchParams.get("competency");

  if (dateFrom) clauses.push(`l.session_date >= ${add(dateFrom)}`);
  if (dateTo) clauses.push(`l.session_date <= ${add(dateTo)}`);
  if (coach) clauses.push(`lower(l.coach) = lower(${add(coach)})`);
  if (youth) clauses.push(`a.youth_name ilike ${add(`%${youth}%`)}`);
  if (activity) clauses.push(`a.activity = ${add(activity)}`);
  if (focus) clauses.push(`a.activity_modifier ilike ${add(`%${focus}%`)}`);
  if (gender) clauses.push(`lower(${unknownBucketSql("r.gender")}) = lower(${add(gender)})`);
  if (ethnicity) clauses.push(`lower(${unknownBucketSql("r.race_ethnicity")}) = lower(${add(ethnicity)})`);
  if (school) clauses.push(`lower(${schoolBucketSql("r.school")}) = lower(${add(school)})`);
  // possibleCategories is a jsonb array of competency labels the coach's narrative was auto-tagged
  // with (see app.js's categoryMap/detectCategories) — `?` checks array membership.
  if (competency) clauses.push(`coalesce(l.assistant_draft->'possibleCategories', '[]'::jsonb) ? ${add(competency)}`);

  return {
    where: clauses.length ? `where ${clauses.join(" and ")}` : "",
    values,
  };
}

async function getDashboardReport(searchParams) {
  const pool = getPgPool();
  if (!pool) {
    return {
      ok: false,
      error: "DATABASE_URL is not set.",
    };
  }

  const { where, values } = buildReportWhere(searchParams);
  const period = searchParams.get("period") === "month" ? "month" : "week";
  // school_aliases is joined here (not just in the bySchool query) so schoolBucketSql(...) can be
  // used inside buildReportWhere's shared school filter too, which every query below includes.
  const rosterJoin = `
    left join roster_people r on lower(r.full_name) = lower(a.youth_name)
    left join school_aliases sa on sa.normalized_alias = lower(trim(coalesce(r.school, '')))
  `;

  const [
    summaryResult,
    periodTrendResult,
    byCoachResult,
    byYouthResult,
    byActivityResult,
    byFocusResult,
    byGenderResult,
    byEthnicityResult,
    bySchoolResult,
    byCompetencyResult,
    recentActivitiesResult,
    recentLogsResult,
    optionsResult,
  ] = await Promise.all([
    pool.query(
      `
        select
          count(distinct l.id)::int as log_count,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes,
          count(distinct nullif(a.youth_name, ''))::int as youth_count
        from coach_logs l
        left join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
      `,
      values,
    ),
    pool.query(
      `
        select
          date_trunc('${period}', l.session_date)::date::text as period_start,
          count(distinct l.id)::int as log_count,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes,
          count(distinct nullif(a.youth_name, ''))::int as youth_count
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        group by period_start
        order by period_start desc
        limit 18
      `,
      values,
    ),
    pool.query(
      `
        select
          l.coach,
          count(distinct l.id)::int as log_count,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        group by l.coach
        order by total_minutes desc, activity_count desc
        limit 25
      `,
      values,
    ),
    pool.query(
      `
        select
          a.youth_name,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes,
          max(l.session_date)::text as last_session_date
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        group by a.youth_name
        order by total_minutes desc, activity_count desc
        limit 50
      `,
      values,
    ),
    pool.query(
      `
        select
          a.activity,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        group by a.activity
        order by total_minutes desc, activity_count desc
        limit 25
      `,
      values,
    ),
    pool.query(
      `
        select
          trim(focus_value) as focus,
          count(*)::int as activity_count,
          coalesce(sum(minutes), 0)::int as total_minutes
        from (
          select
            regexp_split_to_table(coalesce(a.activity_modifier, ''), '\\s*,\\s*') as focus_value,
            a.minutes
          from coach_logs l
          join coach_log_activities a on a.coach_log_id = l.id
          ${rosterJoin}
          ${where}
        ) focus_rows
        where trim(focus_value) <> ''
        group by trim(focus_value)
        order by total_minutes desc, activity_count desc
        limit 25
      `,
      values,
    ),
    pool.query(
      `
        select
          ${unknownBucketSql("r.gender")} as gender,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes,
          count(distinct nullif(a.youth_name, ''))::int as youth_count
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        group by ${unknownBucketSql("r.gender")}
        order by total_minutes desc, activity_count desc
        limit 25
      `,
      values,
    ),
    pool.query(
      `
        select
          ${unknownBucketSql("r.race_ethnicity")} as ethnicity,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes,
          count(distinct nullif(a.youth_name, ''))::int as youth_count
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        group by ${unknownBucketSql("r.race_ethnicity")}
        order by total_minutes desc, activity_count desc
        limit 25
      `,
      values,
    ),
    pool.query(
      `
        select
          ${schoolBucketSql("r.school")} as school,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes,
          count(distinct nullif(a.youth_name, ''))::int as youth_count
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        group by ${schoolBucketSql("r.school")}
        order by total_minutes desc, activity_count desc
        limit 25
      `,
      values,
    ),
    pool.query(
      `
        select
          competency,
          count(distinct l.id)::int as log_count,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes,
          count(distinct nullif(a.youth_name, ''))::int as youth_count
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        cross join lateral jsonb_array_elements_text(coalesce(l.assistant_draft->'possibleCategories', '[]'::jsonb)) as competency
        ${rosterJoin}
        ${where}
        group by competency
        order by total_minutes desc, activity_count desc
        limit 25
      `,
      values,
    ),
    pool.query(
      `
        select
          l.session_date::text as session_date,
          l.coach,
          a.youth_name,
          a.minutes,
          a.activity,
          a.activity_modifier,
          a.source_clause
        from coach_logs l
        join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        order by l.session_date desc, l.received_at desc
        limit 100
      `,
      values,
    ),
    pool.query(
      `
        select
          l.id,
          l.session_date::text as session_date,
          l.received_at,
          l.coach,
          l.response,
          count(a.id)::int as activity_count,
          coalesce(sum(a.minutes), 0)::int as total_minutes
        from coach_logs l
        left join coach_log_activities a on a.coach_log_id = l.id
        ${rosterJoin}
        ${where}
        group by l.id
        order by l.session_date desc, l.received_at desc
        limit 50
      `,
      values,
    ),
    pool.query(`
      select
        (select coalesce(json_agg(distinct coach order by coach), '[]'::json) from coach_logs) as coaches,
        (select coalesce(json_agg(distinct activity order by activity), '[]'::json) from coach_log_activities) as activities,
        (
          select coalesce(json_agg(distinct trim(focus_value) order by trim(focus_value)), '[]'::json)
          from (
            select regexp_split_to_table(coalesce(activity_modifier, ''), '\\s*,\\s*') as focus_value
            from coach_log_activities
          ) focus_rows
          where trim(focus_value) <> ''
        ) as focuses,
        (select coalesce(json_agg(distinct bucket order by bucket), '[]'::json) from (select ${unknownBucketSql("gender")} as bucket from roster_people) as gender_buckets) as genders,
        (select coalesce(json_agg(distinct bucket order by bucket), '[]'::json) from (select ${unknownBucketSql("race_ethnicity")} as bucket from roster_people) as ethnicity_buckets) as ethnicities,
        (
          select coalesce(json_agg(distinct bucket order by bucket), '[]'::json)
          from (
            select ${schoolBucketSql("rp.school")} as bucket
            from roster_people rp
            left join school_aliases sa on sa.normalized_alias = lower(trim(coalesce(rp.school, '')))
          ) as school_buckets
        ) as schools,
        (
          select coalesce(json_agg(distinct competency order by competency), '[]'::json)
          from coach_logs l3
          cross join lateral jsonb_array_elements_text(coalesce(l3.assistant_draft->'possibleCategories', '[]'::jsonb)) as competency
        ) as competencies
    `),
  ]);

  return {
    ok: true,
    summary: summaryResult.rows[0] || {},
    byCoach: byCoachResult.rows,
    byYouth: byYouthResult.rows,
    byActivity: byActivityResult.rows,
    byFocus: byFocusResult.rows,
    byGender: byGenderResult.rows,
    byEthnicity: byEthnicityResult.rows,
    bySchool: bySchoolResult.rows,
    byCompetency: byCompetencyResult.rows,
    period,
    periodTrend: periodTrendResult.rows,
    recentActivities: recentActivitiesResult.rows,
    recentLogs: recentLogsResult.rows,
    options: optionsResult.rows[0] || {
      coaches: [],
      activities: [],
      focuses: [],
      genders: [],
      ethnicities: [],
      schools: [],
      competencies: [],
    },
  };
}

// ---- Attendance Rate Report -----------------------------------------------------------------
//
// This mirrors a spreadsheet the coaches kept by hand: for each month, "attendance rate" for a
// person is the percentage of program dates (days the gym was open) that they actually attended,
// and the report averages that rate across people in a demographic bucket. Concretely, for a
// bucket of members in a given month:
//
//   attendanceRate = (sum of each member's attended-days that month) / (programDates * memberCount)
//   avgAttendancePerDay = (sum of each member's attended-days that month) / programDates
//
// "Program dates" = distinct calendar dates on which *any* check-in was recorded in that month.
// There's no separate "gym schedule" table, so this assumes the gym was open exactly on the days
// someone checked in — a deliberate simplification the club signed off on, not a data gap.
//
// "Members counted in a given month" = anyone with at least one check-in that month. People who
// never attended in a given month simply don't appear in that month's buckets (there's no master
// "expected to attend" roster to compare against), so a month's attendance rate is really "of the
// people who came in at all this month, what fraction of open days did they average," not "of
// everyone technically enrolled, who showed up."

const YOUTH_MAX_AGE = 24; // DFSS Chicago's youth cutoff, per the club — change here if that's off.

const GENDER_BUCKET_ALIASES = {
  m: "Male",
  male: "Male",
  f: "Female",
  female: "Female",
};

// Same canonical-token approach as unknownBucketSql, but done in JS since this report's grouping
// (by person-month, then by bucket) is easier to build up outside SQL than as one giant query.
function canonicalDemographicToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function genderBucketLabel(rawGender) {
  const token = canonicalDemographicToken(rawGender);
  if (!token || UNKNOWN_DEMOGRAPHIC_TOKENS.includes(token) || NOT_APPLICABLE_DEMOGRAPHIC_TOKENS.includes(token)) {
    return "Unknown";
  }
  return GENDER_BUCKET_ALIASES[token] || "Other";
}

function ageGroupBucketLabel(age) {
  if (age === null || age === undefined || !Number.isFinite(Number(age))) return "Unknown";
  return Number(age) <= YOUTH_MAX_AGE ? "Youth" : "Adult";
}

const TENURE_BUCKET_ORDER = ["Under 6 months", "6-12 months", "1-2 years", "2+ years", "Unknown"];

// `asOf` is the reference date (typically the last day of the month being reported), since tenure
// is relative to when the report is looking, not to today — a member's tenure bucket moves up as
// the months in a yearly view go by.
function tenureBucketLabel(memberSinceIso, asOfIso) {
  if (!memberSinceIso) return "Unknown";

  const memberSince = new Date(`${memberSinceIso}T00:00:00Z`);
  const asOf = new Date(`${asOfIso}T00:00:00Z`);
  if (Number.isNaN(memberSince.getTime()) || Number.isNaN(asOf.getTime())) return "Unknown";

  const months =
    (asOf.getUTCFullYear() - memberSince.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - memberSince.getUTCMonth()) +
    (asOf.getUTCDate() >= memberSince.getUTCDate() ? 0 : -1);

  if (months < 0) return "Unknown"; // member-since date is after the reference date somehow
  if (months < 6) return "Under 6 months";
  if (months < 12) return "6-12 months";
  if (months < 24) return "1-2 years";
  return "2+ years";
}

function lastDayOfMonthIso(year, month) {
  // month is 1-12; day 0 of the *next* month is the last day of this one.
  const date = new Date(Date.UTC(year, month, 0));
  return date.toISOString().slice(0, 10);
}

// Earlier of the two candidate "been coming since" dates: the roster's manually-entered First
// Att. Date, and the earliest attendance_events check-in on record for that person (all-time, not
// limited to the report year, so long-time members already tracked before the report year still
// get their correct tenure). Falls back to whichever one is actually present.
function resolveMemberSince(firstAttDateIso, earliestCheckinIso) {
  if (firstAttDateIso && earliestCheckinIso) return firstAttDateIso < earliestCheckinIso ? firstAttDateIso : earliestCheckinIso;
  return firstAttDateIso || earliestCheckinIso || "";
}

// Pure aggregation step, factored out so it can be unit tested without a database: given each
// person's attended-day count for a specific month plus their demographic buckets for that month,
// roll them up into per-bucket totals for each of the three dimensions, then compute the rate and
// avg-per-day metrics. `people` is an array of { normalizedName, daysAttended, gender, ageGroup,
// tenure }. Returns { gender: [...], ageGroup: [...], tenure: [...] } where each entry is
// { bucket, memberCount, totalDaysAttended, attendanceRate, avgAttendancePerDay }.
function summarizeAttendanceBuckets(people, programDates) {
  function rollUp(dimension, bucketOrder) {
    const totals = new Map(); // bucket -> { memberCount, totalDaysAttended }
    people.forEach((person) => {
      const bucket = person[dimension];
      const existing = totals.get(bucket) || { memberCount: 0, totalDaysAttended: 0 };
      existing.memberCount += 1;
      existing.totalDaysAttended += person.daysAttended;
      totals.set(bucket, existing);
    });

    const rows = [...totals.entries()].map(([bucket, { memberCount, totalDaysAttended }]) => ({
      bucket,
      memberCount,
      totalDaysAttended,
      attendanceRate: programDates > 0 && memberCount > 0 ? totalDaysAttended / (programDates * memberCount) : 0,
      avgAttendancePerDay: programDates > 0 ? totalDaysAttended / programDates : 0,
    }));

    rows.sort((a, b) => {
      const orderDiff = (bucketOrder ? bucketOrder.indexOf(a.bucket) : -1) - (bucketOrder ? bucketOrder.indexOf(b.bucket) : -1);
      return orderDiff !== 0 && bucketOrder ? orderDiff : a.bucket.localeCompare(b.bucket);
    });

    return rows;
  }

  return {
    gender: rollUp("gender", ["Male", "Female", "Other", "Unknown"]),
    ageGroup: rollUp("ageGroup", ["Youth", "Adult", "Unknown"]),
    tenure: rollUp("tenure", TENURE_BUCKET_ORDER),
  };
}

async function getAttendanceRateReport(searchParams) {
  const pool = getPgPool();
  if (!pool) {
    return { ok: false, error: "DATABASE_URL is not set." };
  }

  const year = Number(searchParams.get("year")) || new Date().getUTCFullYear();
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;

  const [rosterResult, earliestCheckinResult, monthlyPersonResult, programDatesResult] = await Promise.all([
    pool.query(`select normalized_name, gender, age, first_att_date from roster_people`),
    pool.query(`select normalized_name, min(attendance_date) as earliest_checkin from attendance_events group by normalized_name`),
    pool.query(
      `
        select
          extract(month from attendance_date)::int as month,
          normalized_name,
          count(distinct attendance_date)::int as days_attended
        from attendance_events
        where attendance_date >= $1 and attendance_date < $2
        group by month, normalized_name
      `,
      [yearStart, yearEnd],
    ),
    pool.query(
      `
        select
          extract(month from attendance_date)::int as month,
          count(distinct attendance_date)::int as program_dates
        from attendance_events
        where attendance_date >= $1 and attendance_date < $2
        group by month
        order by month
      `,
      [yearStart, yearEnd],
    ),
  ]);

  const rosterByName = new Map(
    rosterResult.rows.map((row) => [
      row.normalized_name,
      {
        gender: row.gender || "",
        age: row.age === null || row.age === undefined ? null : Number(row.age),
        firstAttDate: row.first_att_date ? row.first_att_date.toISOString().slice(0, 10) : "",
      },
    ]),
  );

  const earliestCheckinByName = new Map(
    earliestCheckinResult.rows.map((row) => [row.normalized_name, row.earliest_checkin ? row.earliest_checkin.toISOString().slice(0, 10) : ""]),
  );

  const memberSinceByName = new Map();
  const allNames = new Set([...rosterByName.keys(), ...earliestCheckinByName.keys()]);
  allNames.forEach((name) => {
    const roster = rosterByName.get(name);
    memberSinceByName.set(name, resolveMemberSince(roster ? roster.firstAttDate : "", earliestCheckinByName.get(name) || ""));
  });

  const programDatesByMonth = new Map(programDatesResult.rows.map((row) => [row.month, row.program_dates]));

  const personRowsByMonth = new Map();
  monthlyPersonResult.rows.forEach((row) => {
    if (!personRowsByMonth.has(row.month)) personRowsByMonth.set(row.month, []);
    personRowsByMonth.get(row.month).push(row);
  });

  const monthly = [...programDatesByMonth.keys()]
    .sort((a, b) => a - b)
    .map((month) => {
      const asOfIso = lastDayOfMonthIso(year, month);
      const rosterRowsForMonth = personRowsByMonth.get(month) || [];

      const people = rosterRowsForMonth.map((row) => {
        const roster = rosterByName.get(row.normalized_name) || { gender: "", age: null };
        const memberSince = memberSinceByName.get(row.normalized_name) || "";
        return {
          normalizedName: row.normalized_name,
          daysAttended: Number(row.days_attended),
          gender: genderBucketLabel(roster.gender),
          ageGroup: ageGroupBucketLabel(roster.age),
          tenure: tenureBucketLabel(memberSince, asOfIso),
        };
      });

      return {
        month,
        programDates: programDatesByMonth.get(month) || 0,
        memberCount: people.length,
        ...summarizeAttendanceBuckets(people, programDatesByMonth.get(month) || 0),
      };
    });

  // Year-total rollup: every person who attended at least once anywhere in the year, bucketed by
  // gender/age (static) and by tenure as of Dec 31 of the report year, against the year's total
  // program-date count.
  const yearTotalDaysByName = new Map();
  monthlyPersonResult.rows.forEach((row) => {
    yearTotalDaysByName.set(row.normalized_name, (yearTotalDaysByName.get(row.normalized_name) || 0) + Number(row.days_attended));
  });
  const yearProgramDates = programDatesResult.rows.reduce((sum, row) => sum + row.program_dates, 0);
  const yearAsOfIso = `${year}-12-31`;
  const yearPeople = [...yearTotalDaysByName.entries()].map(([normalizedName, daysAttended]) => {
    const roster = rosterByName.get(normalizedName) || { gender: "", age: null };
    const memberSince = memberSinceByName.get(normalizedName) || "";
    return {
      normalizedName,
      daysAttended,
      gender: genderBucketLabel(roster.gender),
      ageGroup: ageGroupBucketLabel(roster.age),
      tenure: tenureBucketLabel(memberSince, yearAsOfIso),
    };
  });

  return {
    ok: true,
    year,
    youthMaxAge: YOUTH_MAX_AGE,
    monthly,
    yearTotal: {
      programDates: yearProgramDates,
      memberCount: yearPeople.length,
      ...summarizeAttendanceBuckets(yearPeople, yearProgramDates),
    },
  };
}

// Rolling 30-day attendance snapshot for the Overview tab -- same rate/avg-per-day formulas as
// the Attendance Rate Report (see docs/attendance-reporting.md), just over a trailing 30-day
// window instead of a calendar month, and with no demographic breakdown.
async function getOverviewAttendanceSummary() {
  const pool = getPgPool();
  if (!pool) {
    return { ok: false, error: "DATABASE_URL is not set." };
  }

  const now = new Date();
  const windowEnd = now.toISOString().slice(0, 10);
  const windowStart = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const result = await pool.query(
    `
      select
        count(distinct attendance_date)::int as program_dates,
        count(distinct normalized_name)::int as member_count,
        count(*)::int as total_attended_days
      from (
        select distinct normalized_name, attendance_date
        from attendance_events
        where attendance_date >= $1 and attendance_date <= $2
      ) as attended_days
    `,
    [windowStart, windowEnd],
  );

  const row = result.rows[0] || {};
  const programDates = Number(row.program_dates) || 0;
  const memberCount = Number(row.member_count) || 0;
  const totalAttendedDays = Number(row.total_attended_days) || 0;

  return {
    ok: true,
    windowStart,
    windowEnd,
    programDates,
    memberCount,
    totalAttendedDays,
    avgAttendancePerDay: programDates > 0 ? totalAttendedDays / programDates : 0,
    attendanceRate: programDates > 0 && memberCount > 0 ? totalAttendedDays / (programDates * memberCount) : 0,
  };
}

// ---- Grant Management (Grants tab) -------------------------------------------------------
// Postgres-only, same as the Attendance Rate Report. Each grant is modeled as landing in a
// single year/quarter with one amount -- a deliberate simplification of the multi-year-split
// grants a real funder database might have (see docs/grant-management.md). "Confidence" is the
// single field that drives how much of a grant's amount counts toward the weighted forecast;
// Rejected grants are excluded from forecast/budget entirely regardless of confidence.

function grantRowToJson(row) {
  return {
    id: row.id,
    name: row.name,
    org: row.org || "",
    status: row.status,
    confidence: row.confidence,
    year: Number(row.year),
    quarter: row.quarter === null || row.quarter === undefined ? null : Number(row.quarter),
    amount: Number(row.amount),
    appOpens: row.app_opens ? row.app_opens.toISOString().slice(0, 10) : "",
    appCloses: row.app_closes ? row.app_closes.toISOString().slice(0, 10) : "",
    submittedDate: row.submitted_date ? row.submitted_date.toISOString().slice(0, 10) : "",
    notes: row.notes || "",
  };
}

function normalizeGrantFields(payload = {}) {
  const name = String(payload.name || "").trim();
  const org = String(payload.org || "").trim();
  let status = GRANT_STATUSES.includes(payload.status) ? payload.status : "Not Started";
  const confidence = GRANT_CONFIDENCE_LEVELS.includes(payload.confidence) ? payload.confidence : "Reach";
  const year = Number(payload.year) || new Date().getUTCFullYear();
  const quarterRaw = Number(payload.quarter);
  const quarter = [1, 2, 3, 4].includes(quarterRaw) ? quarterRaw : null;
  const amount = Number(payload.amount) || 0;
  const appOpens = payload.appOpens ? String(payload.appOpens).slice(0, 10) : null;
  const appCloses = payload.appCloses ? String(payload.appCloses).slice(0, 10) : null;
  const submittedDate = payload.submittedDate ? String(payload.submittedDate).slice(0, 10) : null;
  const notes = String(payload.notes || "").trim();

  if (!name) {
    throw Object.assign(new Error("Grant name is required."), { statusCode: 400 });
  }

  // A submission date is unambiguous evidence the grant was actually submitted -- if the Status
  // field was left at the "Not Started" default (easy to forget when you're focused on filling
  // in the date), bump it forward automatically rather than silently leaving the grant stuck in
  // the wrong Applications-list section. Awarded/Rejected are left alone either way since those
  // are decisions only an admin should make explicitly.
  if (submittedDate && status === "Not Started") {
    status = "Submitted";
  }

  return { name, org, status, confidence, year, quarter, amount, appOpens, appCloses, submittedDate, notes };
}

async function listGrants(searchParams) {
  const pool = getPgPool();
  if (!pool) return { ok: false, error: "DATABASE_URL is not set." };

  const year = searchParams && searchParams.get ? searchParams.get("year") : null;
  const params = [];
  let where = "";
  if (year) {
    params.push(Number(year));
    where = "where year = $1";
  }

  const result = await pool.query(
    `
      select * from grants ${where}
      order by
        case status
          when 'Awarded' then 0
          when 'Submitted' then 1
          when 'Not Started' then 2
          when 'Rejected' then 3
          else 4
        end,
        app_closes desc nulls last,
        created_at desc
    `,
    params,
  );

  return { ok: true, grants: result.rows.map(grantRowToJson) };
}

async function createGrant(payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const fields = normalizeGrantFields(payload);
  const result = await pool.query(
    `
      insert into grants (
        id, name, org, status, confidence, year, quarter, amount,
        app_opens, app_closes, submitted_date, notes, created_at, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now(), now())
      returning *
    `,
    [
      randomUUID(),
      fields.name,
      fields.org,
      fields.status,
      fields.confidence,
      fields.year,
      fields.quarter,
      fields.amount,
      fields.appOpens,
      fields.appCloses,
      fields.submittedDate,
      fields.notes,
    ],
  );
  return grantRowToJson(result.rows[0]);
}

async function updateGrant(id, payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const fields = normalizeGrantFields(payload);
  const result = await pool.query(
    `
      update grants set
        name = $2, org = $3, status = $4, confidence = $5, year = $6, quarter = $7,
        amount = $8, app_opens = $9, app_closes = $10, submitted_date = $11, notes = $12, updated_at = now()
      where id = $1
      returning *
    `,
    [
      id,
      fields.name,
      fields.org,
      fields.status,
      fields.confidence,
      fields.year,
      fields.quarter,
      fields.amount,
      fields.appOpens,
      fields.appCloses,
      fields.submittedDate,
      fields.notes,
    ],
  );
  if (!result.rows.length) {
    throw Object.assign(new Error("Grant not found."), { statusCode: 404 });
  }
  return grantRowToJson(result.rows[0]);
}

async function deleteGrant(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const result = await pool.query("delete from grants where id = $1 returning id", [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error("Grant not found."), { statusCode: 404 });
  }
}

async function getGrantGoal(year) {
  const pool = getPgPool();
  if (!pool) return 0;
  const result = await pool.query("select goal_amount from grant_goals where year = $1", [year]);
  return result.rows.length ? Number(result.rows[0].goal_amount) : 0;
}

async function setGrantGoal(payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const year = Number(payload.year) || new Date().getUTCFullYear();
  const goalAmount = Number(payload.goalAmount) || 0;
  await pool.query(
    `
      insert into grant_goals (year, goal_amount) values ($1, $2)
      on conflict (year) do update set goal_amount = excluded.goal_amount
    `,
    [year, goalAmount],
  );
  return { year, goalAmount };
}

async function getGrantsDashboard(year) {
  const pool = getPgPool();
  if (!pool) return { ok: false, error: "DATABASE_URL is not set." };

  const result = await pool.query("select status, confidence, amount from grants where year = $1", [year]);
  const rows = result.rows;

  let weightedForecast = 0;
  let confirmedAmount = 0;
  let totalAwarded = 0;
  let pipeline = 0;
  let submittedCount = 0;
  let wonCount = 0;
  let rejectedCount = 0;
  const confidenceBreakdown = {};
  GRANT_CONFIDENCE_LEVELS.forEach((level) => {
    confidenceBreakdown[level] = { count: 0, amount: 0 };
  });

  rows.forEach((row) => {
    const amount = Number(row.amount) || 0;
    const weight = GRANT_CONFIDENCE_WEIGHTS[row.confidence] ?? 0;
    const isConfirmed = row.confidence === "Confirmed";
    const isRejected = row.status === "Rejected";

    if (!isRejected) {
      weightedForecast += amount * weight;
      if (isConfirmed) confirmedAmount += amount;
    }

    // "Total Awarded" counts money that's locked in -- either formally Awarded, or Confirmed
    // confidence even before the status field has been flipped over (e.g. a funder verbally
    // confirms before the paperwork/status update catches up). "Pipeline" is what's left of
    // Submitted: still genuinely awaiting a decision, not yet Confirmed. "Won" (for Win Rate)
    // uses this exact same rule, so a Confirmed grant counts as a win even before its status
    // field is manually flipped to "Awarded" -- otherwise Win Rate and Total Awarded would
    // disagree about which grants have actually been won.
    const isWon = !isRejected && (row.status === "Awarded" || isConfirmed);
    if (isWon) {
      totalAwarded += amount;
      wonCount += 1;
    } else if (row.status === "Submitted") {
      pipeline += amount;
      submittedCount += 1;
    }

    if (isRejected) {
      rejectedCount += 1;
    }
    if (confidenceBreakdown[row.confidence]) {
      confidenceBreakdown[row.confidence].count += 1;
      confidenceBreakdown[row.confidence].amount += amount;
    }
  });

  const decided = wonCount + rejectedCount;
  const winRate = decided > 0 ? wonCount / decided : 0;
  const goalAmount = await getGrantGoal(year);

  return {
    ok: true,
    year,
    weightedForecast,
    confirmedAmount,
    totalAwarded,
    awardedCount: wonCount,
    pipeline,
    submittedCount,
    rejectedCount,
    decided,
    winRate,
    goalAmount,
    goalGap: Math.max(goalAmount - confirmedAmount, 0),
    goalProgress: goalAmount > 0 ? confirmedAmount / goalAmount : 0,
    confidenceBreakdown: GRANT_CONFIDENCE_LEVELS.map((level) => ({
      level,
      count: confidenceBreakdown[level].count,
      amount: confidenceBreakdown[level].amount,
    })),
  };
}

async function getGrantsForecast(year) {
  const pool = getPgPool();
  if (!pool) return { ok: false, error: "DATABASE_URL is not set." };

  const result = await pool.query(
    `
      select id, name, org, status, confidence, quarter, amount, notes
      from grants
      where year = $1 and status != 'Rejected'
      order by
        case confidence
          when 'Confirmed' then 0
          when 'Optimistic' then 1
          when 'Hopeful' then 2
          when 'Reach' then 3
          when 'Unlikely' then 4
          else 5
        end,
        name
    `,
    [year],
  );

  const rows = result.rows.map((row) => {
    const amount = Number(row.amount);
    return {
      id: row.id,
      name: row.name,
      org: row.org || "",
      status: row.status,
      confidence: row.confidence,
      quarter: row.quarter === null ? null : Number(row.quarter),
      amount,
      notes: row.notes || "",
      quarterAmounts: [1, 2, 3, 4].map((q) => (Number(row.quarter) === q ? amount : 0)),
    };
  });

  const groups = GRANT_CONFIDENCE_LEVELS.map((level) => {
    const groupRows = rows.filter((row) => row.confidence === level);
    const quarterTotals = [0, 0, 0, 0];
    groupRows.forEach((row) => row.quarterAmounts.forEach((amt, i) => { quarterTotals[i] += amt; }));
    return {
      confidence: level,
      weight: GRANT_CONFIDENCE_WEIGHTS[level],
      rows: groupRows,
      quarterTotals,
      total: quarterTotals.reduce((a, b) => a + b, 0),
    };
  });

  const confirmedGroup = groups.find((group) => group.confidence === "Confirmed");
  const anticipatedGroups = groups.filter((group) => group.confidence !== "Confirmed" && group.confidence !== "Unlikely");
  const anticipatedQuarterTotals = [0, 1, 2, 3].map((i) => anticipatedGroups.reduce((sum, group) => sum + group.quarterTotals[i], 0));

  return {
    ok: true,
    year,
    groups,
    confirmedQuarterTotals: confirmedGroup ? confirmedGroup.quarterTotals : [0, 0, 0, 0],
    confirmedTotal: confirmedGroup ? confirmedGroup.total : 0,
    anticipatedQuarterTotals,
    anticipatedTotal: anticipatedQuarterTotals.reduce((a, b) => a + b, 0),
    goalAmount: await getGrantGoal(year),
  };
}

function formatGrantExpenseRow(row) {
  return {
    id: row.id,
    category: row.category || "",
    description: row.description || "",
    amount: Number(row.amount),
    note: row.note || "",
    cardholder: row.cardholder || "",
    paymentMethod: row.payment_method || "",
    grantId: row.grant_id || null,
  };
}

async function listGrantExpenses(year) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    "select id, category, description, amount, note, cardholder, payment_method, grant_id from grant_expenses where year = $1 order by created_at",
    [year],
  );
  return result.rows.map(formatGrantExpenseRow);
}

async function createGrantExpense(year, payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  const { cardholders: cardholderOptions, paymentMethods: paymentMethodOptions } = await getReceiptOptionNames();

  const category = String(payload.category || "").trim();
  const description = String(payload.description || "").trim();
  const amount = Number(payload.amount) || 0;
  const note = String(payload.note || "").trim();
  const cardholder = cardholderOptions.includes(payload.cardholder) ? payload.cardholder : "";
  const paymentMethod = paymentMethodOptions.includes(payload.paymentMethod) ? payload.paymentMethod : "";
  const grantId = payload.grantId || null;
  if (!category && !description) {
    throw Object.assign(new Error("Description or category is required."), { statusCode: 400 });
  }

  const result = await pool.query(
    `
      insert into grant_expenses (id, year, category, description, amount, note, cardholder, payment_method, grant_id, created_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
      returning id, category, description, amount, note, cardholder, payment_method, grant_id
    `,
    [randomUUID(), year, category, description, amount, note, cardholder, paymentMethod, grantId],
  );
  return formatGrantExpenseRow(result.rows[0]);
}

// Only the grant assignment is meant to be edited after an expense already exists (the grant
// manager assigns/reassigns it whenever they get to it, independent of when the expense was
// created) -- see /api/grants/expenses/:id/update. Other fields go through this too so the same
// function can be reused if that ever needs to widen, but the UI today only calls it for grantId.
async function updateGrantExpense(id, payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  const { cardholders: cardholderOptions, paymentMethods: paymentMethodOptions } = await getReceiptOptionNames();

  const existing = await pool.query("select * from grant_expenses where id = $1", [id]);
  if (!existing.rows.length) {
    throw Object.assign(new Error("Expense not found."), { statusCode: 404 });
  }
  const current = existing.rows[0];

  const category = payload.category !== undefined ? String(payload.category).trim() : current.category;
  const description = payload.description !== undefined ? String(payload.description).trim() : current.description;
  const amount = payload.amount !== undefined ? Number(payload.amount) || 0 : Number(current.amount);
  const note = payload.note !== undefined ? String(payload.note).trim() : current.note;
  const cardholder =
    payload.cardholder !== undefined
      ? cardholderOptions.includes(payload.cardholder) || payload.cardholder === current.cardholder
        ? payload.cardholder
        : ""
      : current.cardholder;
  const paymentMethod =
    payload.paymentMethod !== undefined
      ? paymentMethodOptions.includes(payload.paymentMethod) || payload.paymentMethod === current.payment_method
        ? payload.paymentMethod
        : ""
      : current.payment_method;
  const grantId = payload.grantId !== undefined ? payload.grantId || null : current.grant_id;

  if (!category && !description) {
    throw Object.assign(new Error("Description or category is required."), { statusCode: 400 });
  }

  const result = await pool.query(
    `
      update grant_expenses
      set category = $2, description = $3, amount = $4, note = $5, cardholder = $6, payment_method = $7, grant_id = $8
      where id = $1
      returning id, category, description, amount, note, cardholder, payment_method, grant_id
    `,
    [id, category, description, amount, note, cardholder, paymentMethod, grantId],
  );

  // If this expense came from a confirmed receipt line, keep that line's own grant_id in sync --
  // otherwise the "All Receipts" table would keep showing whatever grant was assigned at confirm
  // time even after the grant manager reassigns it here.
  if (payload.grantId !== undefined) {
    await pool.query("update grant_receipt_items set grant_id = $2 where expense_id = $1", [id, grantId]);
  }

  return formatGrantExpenseRow(result.rows[0]);
}

async function deleteGrantExpense(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const result = await pool.query("delete from grant_expenses where id = $1 returning id", [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error("Expense not found."), { statusCode: 404 });
  }
}

async function listGrantExpenseCategories() {
  const pool = getPgPool();
  if (!pool) return DEFAULT_GRANT_EXPENSE_CATEGORIES.map((name, index) => ({ id: name, name, sortOrder: index }));

  const result = await pool.query("select id, name, sort_order from grant_expense_categories order by sort_order, name");
  return result.rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sort_order }));
}

async function createGrantExpenseCategory(name) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const trimmed = String(name || "").trim();
  if (!trimmed) throw Object.assign(new Error("Category name is required."), { statusCode: 400 });

  const maxOrder = await pool.query("select coalesce(max(sort_order), -1) + 1 as next from grant_expense_categories");
  try {
    const result = await pool.query(
      "insert into grant_expense_categories (id, name, sort_order) values ($1,$2,$3) returning id, name, sort_order",
      [randomUUID(), trimmed, maxOrder.rows[0].next],
    );
    const row = result.rows[0];
    return { id: row.id, name: row.name, sortOrder: row.sort_order };
  } catch (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error(`"${trimmed}" is already a category.`), { statusCode: 400 });
    }
    throw error;
  }
}

async function renameGrantExpenseCategory(id, name) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const trimmed = String(name || "").trim();
  if (!trimmed) throw Object.assign(new Error("Category name is required."), { statusCode: 400 });

  try {
    const result = await pool.query(
      "update grant_expense_categories set name = $2 where id = $1 returning id, name, sort_order",
      [id, trimmed],
    );
    if (!result.rows.length) throw Object.assign(new Error("Category not found."), { statusCode: 404 });
    const row = result.rows[0];
    return { id: row.id, name: row.name, sortOrder: row.sort_order };
  } catch (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error(`"${trimmed}" is already a category.`), { statusCode: 400 });
    }
    throw error;
  }
}

async function moveGrantExpenseCategory(id, direction) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const categories = await pool.query("select id, sort_order from grant_expense_categories order by sort_order, name");
  const rows = categories.rows;
  const index = rows.findIndex((row) => row.id === id);
  if (index === -1) throw Object.assign(new Error("Category not found."), { statusCode: 404 });

  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= rows.length) return; // already at the edge -- no-op, not an error

  const a = rows[index];
  const b = rows[swapIndex];
  await pool.query("update grant_expense_categories set sort_order = $2 where id = $1", [a.id, b.sort_order]);
  await pool.query("update grant_expense_categories set sort_order = $2 where id = $1", [b.id, a.sort_order]);
}

async function deleteGrantExpenseCategory(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const result = await pool.query("delete from grant_expense_categories where id = $1 returning id", [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error("Category not found."), { statusCode: 404 });
  }
}

function receiptOptionKind(kind) {
  if (!Object.prototype.hasOwnProperty.call(RECEIPT_OPTION_KINDS, kind)) {
    throw Object.assign(new Error("Unknown list."), { statusCode: 400 });
  }
  return kind;
}

async function listReceiptOptions(kind) {
  const pool = getPgPool();
  if (!pool) return [];

  const result = await pool.query(
    "select id, kind, name, sort_order from receipt_options where kind = $1 order by sort_order, name",
    [receiptOptionKind(kind)],
  );
  return result.rows.map((row) => ({ id: row.id, kind: row.kind, name: row.name, sortOrder: row.sort_order }));
}

// Just the names, in display order -- what the Budget tab's dropdowns need and what incoming
// expense/receipt payloads are validated against.
async function getReceiptOptionNames() {
  const [cardholders, paymentMethods] = await Promise.all([
    listReceiptOptions("cardholder"),
    listReceiptOptions("payment_method"),
  ]);
  return {
    cardholders: cardholders.map((option) => option.name),
    paymentMethods: paymentMethods.map((option) => option.name),
  };
}

async function createReceiptOption(kind, name) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const label = RECEIPT_OPTION_KINDS[receiptOptionKind(kind)];
  const trimmed = String(name || "").trim();
  if (!trimmed) throw Object.assign(new Error(`${label} name is required.`), { statusCode: 400 });

  const maxOrder = await pool.query(
    "select coalesce(max(sort_order), -1) + 1 as next from receipt_options where kind = $1",
    [kind],
  );
  try {
    const result = await pool.query(
      "insert into receipt_options (id, kind, name, sort_order) values ($1,$2,$3,$4) returning id, kind, name, sort_order",
      [randomUUID(), kind, trimmed, maxOrder.rows[0].next],
    );
    const row = result.rows[0];
    return { id: row.id, kind: row.kind, name: row.name, sortOrder: row.sort_order };
  } catch (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error(`"${trimmed}" is already on the list.`), { statusCode: 400 });
    }
    throw error;
  }
}

async function renameReceiptOption(id, name) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const trimmed = String(name || "").trim();
  if (!trimmed) throw Object.assign(new Error("Name is required."), { statusCode: 400 });

  try {
    const result = await pool.query(
      "update receipt_options set name = $2 where id = $1 returning id, kind, name, sort_order",
      [id, trimmed],
    );
    if (!result.rows.length) throw Object.assign(new Error("Not found."), { statusCode: 404 });
    const row = result.rows[0];
    return { id: row.id, kind: row.kind, name: row.name, sortOrder: row.sort_order };
  } catch (error) {
    if (error.code === "23505") {
      throw Object.assign(new Error(`"${trimmed}" is already on the list.`), { statusCode: 400 });
    }
    throw error;
  }
}

async function moveReceiptOption(id, direction) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const target = await pool.query("select kind from receipt_options where id = $1", [id]);
  if (!target.rows.length) throw Object.assign(new Error("Not found."), { statusCode: 404 });

  const siblings = await pool.query(
    "select id from receipt_options where kind = $1 order by sort_order, name",
    [target.rows[0].kind],
  );
  const ordered = siblings.rows.map((row) => row.id);
  const index = ordered.indexOf(id);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= ordered.length) return; // already at the edge -- no-op, not an error

  // Renumber the whole list after swapping -- guards against duplicate sort_order values.
  [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];
  for (let position = 0; position < ordered.length; position += 1) {
    await pool.query("update receipt_options set sort_order = $2 where id = $1", [ordered[position], position]);
  }
}

async function deleteReceiptOption(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const result = await pool.query("delete from receipt_options where id = $1 returning id", [id]);
  if (!result.rows.length) throw Object.assign(new Error("Not found."), { statusCode: 404 });
}

// Sends a receipt photo to the Claude API and asks it to read + categorize it via forced tool
// use (much more reliable than parsing free-form text for a number/date/enum). Throws if the key
// isn't configured, the request fails, or the model doesn't call the tool -- callers decide what
// to do with a failed read (createGrantReceipt still saves the photo as a pending draft so it
// can be filled in by hand). Returns an `items` array rather than one flat category/amount --
// most receipts still come back as a single item, but a receipt that mixes purchases across
// categories (e.g. some items for general operations, some for resale) can come back split into
// more than one, each with its own category and just that portion of the total.
async function analyzeReceiptImage(fileBuffer, mimeType, categories) {
  if (!anthropicApiKey) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY is not set."), { statusCode: 400 });
  }

  const categoryNames = categories.length ? categories : DEFAULT_GRANT_EXPENSE_CATEGORIES;
  const isPdf = mimeType === RECEIPT_PDF_MIME_TYPE;

  const recordReceiptTool = {
    name: "record_receipt",
    description: "Record structured details read off a photo or PDF of a purchase receipt.",
    input_schema: {
      type: "object",
      properties: {
        vendor: { type: "string", description: "Store or business name on the receipt. Empty string if illegible." },
        receiptDate: {
          type: "string",
          description: "Date on the receipt as YYYY-MM-DD. Empty string if no date is legible.",
        },
        notes: {
          type: "string",
          description: "Anything illegible, ambiguous, or worth a human double-checking. Empty string if none.",
        },
        items: {
          type: "array",
          minItems: 1,
          description:
            'One entry per expense category represented on this receipt. Most receipts only need one entry ' +
            "covering the full total. Split into multiple entries only when the receipt clearly mixes purchases " +
            "that belong in different categories -- for example, some items bought for general club operations " +
            "and other items bought for resale. Each entry's amount should be just that portion of the total; " +
            "the entries' amounts should add up to the receipt's grand total.",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: categoryNames,
                description: "Best-fit expense category for this portion of the receipt.",
              },
              amount: { type: "number", description: "Dollar amount for just this portion (e.g. 42.50)." },
              description: {
                type: "string",
                description: "Short 5-10 word summary of what was purchased in this portion, for a budget line item.",
              },
            },
            required: ["category", "amount", "description"],
          },
        },
      },
      required: ["vendor", "receiptDate", "notes", "items"],
    },
  };

  const fileContentBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: RECEIPT_PDF_MIME_TYPE, data: fileBuffer.toString("base64") } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: fileBuffer.toString("base64") } };

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 1536,
      tools: [recordReceiptTool],
      tool_choice: { type: "tool", name: "record_receipt" },
      messages: [
        {
          role: "user",
          content: [
            fileContentBlock,
            {
              type: "text",
              text: `This is a ${isPdf ? "PDF" : "photo"} of a receipt for a nonprofit youth boxing club's expenses. Read it and call record_receipt with the details. Pick the single closest category for each item even if it's an imperfect fit -- use "Other" only when nothing else is reasonably close.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Claude API error (${response.status}): ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const toolUse = (data.content || []).find((block) => block.type === "tool_use" && block.name === "record_receipt");
  if (!toolUse) {
    throw new Error("Claude did not return structured receipt data.");
  }

  const input = toolUse.input || {};
  const items =
    Array.isArray(input.items) && input.items.length
      ? input.items.map((item) => ({
          category: categoryNames.includes(item?.category) ? item.category : "Other",
          amount: Number(item?.amount) || 0,
          description: String(item?.description || "").trim(),
        }))
      : [{ category: "Other", amount: 0, description: "" }];

  return {
    vendor: String(input.vendor || "").trim(),
    receiptDate: String(input.receiptDate || "").trim(),
    notes: String(input.notes || "").trim(),
    items,
  };
}

// ---- Coach-log pattern-gap review: find logs the built-in keyword matcher missed, ask Claude to ----
// ---- suggest new trigger phrases, and let an admin approve them into the live phrase list. --------

async function getPatternReviewState() {
  const pool = getPgPool();
  if (!pool) return { lastReviewedAt: null };
  const result = await pool.query("select last_reviewed_at from log_pattern_review_state where id = 'default'");
  return { lastReviewedAt: result.rows[0]?.last_reviewed_at || null };
}

async function setPatternReviewState(lastReviewedAt) {
  const pool = getPgPool();
  if (!pool) return;
  await pool.query(
    `insert into log_pattern_review_state (id, last_reviewed_at) values ('default', $1)
     on conflict (id) do update set last_reviewed_at = excluded.last_reviewed_at`,
    [lastReviewedAt],
  );
}

async function listActivePatternPhrases() {
  const pool = getPgPool();
  if (!pool) return [];
  const result = await pool.query(
    "select id, pattern_type, label, phrase, created_at from log_pattern_phrases order by created_at asc",
  );
  return result.rows.map((row) => ({
    id: row.id,
    patternType: row.pattern_type,
    label: row.label,
    phrase: row.phrase,
    createdAt: row.created_at,
  }));
}

async function addActivePatternPhrase(patternType, label, phrase) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const labels = LOG_PATTERN_LABELS_BY_TYPE[patternType];
  if (!labels) throw Object.assign(new Error("Unknown pattern type."), { statusCode: 400 });
  if (!labels.includes(label)) throw Object.assign(new Error(`"${label}" isn't one of the existing labels.`), { statusCode: 400 });

  const trimmedPhrase = String(phrase || "").trim();
  if (!trimmedPhrase) throw Object.assign(new Error("Phrase is required."), { statusCode: 400 });

  const id = randomUUID();
  await pool.query(
    "insert into log_pattern_phrases (id, pattern_type, label, phrase) values ($1, $2, $3, $4)",
    [id, patternType, label, trimmedPhrase],
  );
  return { id, patternType, label, phrase: trimmedPhrase };
}

async function deleteActivePatternPhrase(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  await pool.query("delete from log_pattern_phrases where id = $1", [id]);
}

async function listPatternSuggestions(status) {
  const pool = getPgPool();
  if (!pool) return [];
  const result = status
    ? await pool.query(
        "select * from log_pattern_suggestions where status = $1 order by created_at desc",
        [status],
      )
    : await pool.query("select * from log_pattern_suggestions order by created_at desc");

  return result.rows.map((row) => ({
    id: row.id,
    patternType: row.pattern_type,
    label: row.label,
    phrase: row.phrase,
    exampleLogId: row.example_log_id,
    exampleQuote: row.example_quote,
    reason: row.reason,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  }));
}

async function approvePatternSuggestion(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const result = await pool.query("select * from log_pattern_suggestions where id = $1", [id]);
  const suggestion = result.rows[0];
  if (!suggestion) throw Object.assign(new Error("Suggestion not found."), { statusCode: 404 });
  if (suggestion.status !== "pending") {
    throw Object.assign(new Error(`Suggestion was already ${suggestion.status}.`), { statusCode: 400 });
  }

  const phrase = await addActivePatternPhrase(suggestion.pattern_type, suggestion.label, suggestion.phrase);
  await pool.query(
    "update log_pattern_suggestions set status = 'approved', reviewed_at = now() where id = $1",
    [id],
  );
  return phrase;
}

async function dismissPatternSuggestion(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  const result = await pool.query(
    "update log_pattern_suggestions set status = 'dismissed', reviewed_at = now() where id = $1 and status = 'pending' returning id",
    [id],
  );
  if (!result.rows.length) throw Object.assign(new Error("Suggestion not found or already reviewed."), { statusCode: 404 });
}

// ---- Staff roster ------------------------------------------------------------------------------

function formatStaffMemberRow(row) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
  };
}

async function listStaffMembers({ activeOnly = false } = {}) {
  const pool = getPgPool();
  if (!pool) return [];

  const result = activeOnly
    ? await pool.query("select * from staff_members where active = true order by sort_order, name")
    : await pool.query("select * from staff_members order by sort_order, name");

  return result.rows.map(formatStaffMemberRow);
}

async function listActiveStaffNames() {
  return (await listStaffMembers({ activeOnly: true })).map((s) => s.name);
}

function normalizeStaffName(value) {
  return String(value || "").trim();
}

async function createStaffMember(payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const name = normalizeStaffName(payload?.name);
  if (!name) throw Object.assign(new Error("Enter a name."), { statusCode: 400 });

  const existing = await pool.query("select id from staff_members where lower(name) = lower($1)", [name]);
  if (existing.rows.length) throw Object.assign(new Error("Someone with that name already exists."), { statusCode: 400 });

  const sortResult = await pool.query("select coalesce(max(sort_order), -1) + 1 as next_sort from staff_members");
  const id = randomUUID();
  await pool.query("insert into staff_members (id, name, sort_order) values ($1, $2, $3)", [
    id,
    name,
    sortResult.rows[0].next_sort,
  ]);

  const result = await pool.query("select * from staff_members where id = $1", [id]);
  return formatStaffMemberRow(result.rows[0]);
}

// Renaming cascades onto every table that stores the staff name as plain text (there's no staff_id
// foreign key anywhere) so past PTO/mileage/schedule/log history reads under the corrected name
// instead of splitting that person's history across two different strings.
async function renameStaffMember(id, payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const nextName = normalizeStaffName(payload?.name);
  if (!nextName) throw Object.assign(new Error("Enter a name."), { statusCode: 400 });

  const currentResult = await pool.query("select * from staff_members where id = $1", [id]);
  if (!currentResult.rows.length) throw Object.assign(new Error("Staff member not found."), { statusCode: 404 });
  const previousName = currentResult.rows[0].name;
  if (previousName === nextName) return formatStaffMemberRow(currentResult.rows[0]);

  const existing = await pool.query("select id from staff_members where lower(name) = lower($1) and id != $2", [nextName, id]);
  if (existing.rows.length) throw Object.assign(new Error("Someone with that name already exists."), { statusCode: 400 });

  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("update staff_members set name = $2, updated_at = now() where id = $1", [id, nextName]);
    await client.query("update pto_requests set staff_name = $2 where staff_name = $1", [previousName, nextName]);
    await client.query("update mileage_requests set staff_name = $2 where staff_name = $1", [previousName, nextName]);
    await client.query("update schedule_shifts set staff_name = $2 where staff_name = $1", [previousName, nextName]);
    await client.query("update coach_logs set coach = $2 where coach = $1", [previousName, nextName]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const result = await pool.query("select * from staff_members where id = $1", [id]);
  return formatStaffMemberRow(result.rows[0]);
}

async function setStaffMemberActive(id, active) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const result = await pool.query("update staff_members set active = $2, updated_at = now() where id = $1 returning *", [
    id,
    active,
  ]);
  if (!result.rows.length) throw Object.assign(new Error("Staff member not found."), { statusCode: 404 });
  return formatStaffMemberRow(result.rows[0]);
}

// Only allowed when the name has no history anywhere -- otherwise deactivating is the right tool
// (keeps their name in past records instead of leaving it dangling with no matching roster entry).
async function deleteStaffMember(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const staffResult = await pool.query("select * from staff_members where id = $1", [id]);
  if (!staffResult.rows.length) throw Object.assign(new Error("Staff member not found."), { statusCode: 404 });
  const name = staffResult.rows[0].name;

  const [pto, mileage, shifts, logs] = await Promise.all([
    pool.query("select 1 from pto_requests where staff_name = $1 limit 1", [name]),
    pool.query("select 1 from mileage_requests where staff_name = $1 limit 1", [name]),
    pool.query("select 1 from schedule_shifts where staff_name = $1 limit 1", [name]),
    pool.query("select 1 from coach_logs where coach = $1 limit 1", [name]),
  ]);

  if (pto.rows.length || mileage.rows.length || shifts.rows.length || logs.rows.length) {
    throw Object.assign(new Error("This person has existing history -- deactivate them instead of deleting."), {
      statusCode: 400,
    });
  }

  await pool.query("delete from staff_members where id = $1", [id]);
}

// ---- Resources tab: PTO requests -------------------------------------------------------------

function formatPtoRequestRow(row) {
  return {
    id: row.id,
    staffName: row.staff_name,
    // pg returns `date` columns as JS Date objects (UTC midnight) -- slice to a plain YYYY-MM-DD
    // string like the rest of the app does for date-only fields (see grants' app_opens/app_closes),
    // so it round-trips cleanly through JSON and an <input type="date"> without a timezone shift.
    startDate: row.start_date ? row.start_date.toISOString().slice(0, 10) : "",
    endDate: row.end_date ? row.end_date.toISOString().slice(0, 10) : "",
    leaveType: row.leave_type,
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

async function listPtoRequests(status) {
  const pool = getPgPool();
  if (!pool) return [];

  const result = status
    ? await pool.query("select * from pto_requests where status = $1 order by start_date desc, created_at desc", [status])
    : await pool.query("select * from pto_requests order by start_date desc, created_at desc");

  return result.rows.map(formatPtoRequestRow);
}

async function createPtoRequest(payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const activeStaffNames = await listActiveStaffNames();
  const staffName = activeStaffNames.includes(payload?.staffName) ? payload.staffName : "";
  if (!staffName) throw Object.assign(new Error("Choose who this request is for."), { statusCode: 400 });

  const startDate = String(payload?.startDate || "").trim();
  const endDate = String(payload?.endDate || "").trim() || startDate;
  if (!startDate) throw Object.assign(new Error("Start date is required."), { statusCode: 400 });
  if (endDate < startDate) throw Object.assign(new Error("End date can't be before the start date."), { statusCode: 400 });

  const leaveType = PTO_LEAVE_TYPES.includes(payload?.leaveType) ? payload.leaveType : PTO_LEAVE_TYPES[0];
  const note = String(payload?.note || "").trim();

  const id = randomUUID();
  await pool.query(
    `insert into pto_requests (id, staff_name, start_date, end_date, leave_type, note)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, staffName, startDate, endDate, leaveType, note],
  );

  const result = await pool.query("select * from pto_requests where id = $1", [id]);
  return formatPtoRequestRow(result.rows[0]);
}

async function setPtoRequestStatus(id, status) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  if (!PTO_STATUSES.includes(status)) throw Object.assign(new Error("Unknown status."), { statusCode: 400 });

  const result = await pool.query(
    "update pto_requests set status = $2, reviewed_at = now() where id = $1 returning *",
    [id, status],
  );
  if (!result.rows.length) throw Object.assign(new Error("Request not found."), { statusCode: 404 });
  return formatPtoRequestRow(result.rows[0]);
}

async function deletePtoRequest(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  await pool.query("delete from pto_requests where id = $1", [id]);
}

// ---- Resources tab: Mileage requests ---------------------------------------------------------

function formatMileageRequestRow(row) {
  return {
    id: row.id,
    staffName: row.staff_name,
    // See formatPtoRequestRow for why `date` columns get sliced to YYYY-MM-DD here.
    tripDate: row.trip_date ? row.trip_date.toISOString().slice(0, 10) : "",
    purpose: row.purpose,
    miles: Number(row.miles) || 0,
    note: row.note,
    startAddress: row.start_address || "",
    endAddress: row.end_address || "",
    status: row.status,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    // Filled in by listMileageRequests/createMileageRequest below -- this function only ever sees
    // the mileage_requests row itself, never the photos, since those live in a separate table.
    photos: [],
  };
}

// Batches the photo-metadata lookup for a page of requests into one query instead of one-per-row.
// Only id/uploadedAt come back -- never image_data -- so listing a page of mileage requests never
// pulls actual photo bytes over the wire; those are fetched lazily per-photo via the image route
// (getMileageRequestPhoto) when a thumbnail is actually displayed.
async function attachMileageRequestPhotos(requests) {
  if (!requests.length) return requests;
  const pool = getPgPool();
  if (!pool) return requests;

  const result = await pool.query(
    "select id, mileage_request_id, uploaded_at from mileage_request_photos where mileage_request_id = any($1::uuid[]) order by uploaded_at asc",
    [requests.map((request) => request.id)],
  );

  const photosByRequestId = new Map();
  result.rows.forEach((row) => {
    const list = photosByRequestId.get(row.mileage_request_id) || [];
    list.push({ id: row.id, uploadedAt: row.uploaded_at });
    photosByRequestId.set(row.mileage_request_id, list);
  });

  requests.forEach((request) => {
    request.photos = photosByRequestId.get(request.id) || [];
  });
  return requests;
}

async function listMileageRequests(status) {
  const pool = getPgPool();
  if (!pool) return [];

  const result = status
    ? await pool.query("select * from mileage_requests where status = $1 order by trip_date desc, created_at desc", [status])
    : await pool.query("select * from mileage_requests order by trip_date desc, created_at desc");

  return attachMileageRequestPhotos(result.rows.map(formatMileageRequestRow));
}

async function addMileageRequestPhoto(mileageRequestId, fileBuffer, mimeType) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  if (fileBuffer.length > MAX_RECEIPT_IMAGE_BYTES) {
    throw Object.assign(new Error("Photo is too large (8MB max)."), { statusCode: 400 });
  }
  if (!mimeType.startsWith("image/")) {
    throw Object.assign(new Error("Only image files are supported for mileage photos."), { statusCode: 400 });
  }

  const stored = await compressUploadedImage(fileBuffer, mimeType);
  const result = await pool.query(
    `insert into mileage_request_photos (id, mileage_request_id, image_data, image_mime)
     values ($1, $2, $3, $4)
     returning id, uploaded_at`,
    [randomUUID(), mileageRequestId, stored.buffer, stored.mimeType],
  );
  return { id: result.rows[0].id, uploadedAt: result.rows[0].uploaded_at };
}

async function getMileageRequestPhoto(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const result = await pool.query("select image_data, image_mime from mileage_request_photos where id = $1", [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error("Photo not found."), { statusCode: 404 });
  }
  return { data: result.rows[0].image_data, mimeType: result.rows[0].image_mime };
}

async function deleteMileageRequestPhoto(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  await pool.query("delete from mileage_request_photos where id = $1", [id]);
}

async function createMileageRequest(payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const activeStaffNames = await listActiveStaffNames();
  const staffName = activeStaffNames.includes(payload?.staffName) ? payload.staffName : "";
  if (!staffName) throw Object.assign(new Error("Choose who this request is for."), { statusCode: 400 });

  const tripDate = String(payload?.tripDate || "").trim();
  if (!tripDate) throw Object.assign(new Error("Trip date is required."), { statusCode: 400 });

  const miles = Number(payload?.miles);
  if (!Number.isFinite(miles) || miles <= 0) throw Object.assign(new Error("Enter miles driven."), { statusCode: 400 });

  const purpose = String(payload?.purpose || "").trim();
  const note = String(payload?.note || "").trim();
  const startAddress = String(payload?.startAddress || "").trim();
  const endAddress = String(payload?.endAddress || "").trim();

  // Optional supporting photos (odometer shots, a maps screenshot) -- each is
  // { mimeType, imageBase64 }, same shape as a single grant-receipt upload. Bad photos are
  // rejected the same way a bad request field would be: the whole submission fails rather than
  // silently dropping a photo the coach thought they'd attached.
  const photos = Array.isArray(payload?.photos) ? payload.photos.slice(0, MAX_MILEAGE_PHOTOS_PER_REQUEST) : [];
  const decodedPhotos = photos.map((photo) => {
    const mimeType = String(photo?.mimeType || "image/jpeg").toLowerCase();
    const base64 = String(photo?.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
    if (!base64) throw Object.assign(new Error("Could not read one of the attached photos."), { statusCode: 400 });
    if (!mimeType.startsWith("image/")) {
      throw Object.assign(new Error("Only image files are supported for mileage photos."), { statusCode: 400 });
    }
    return { mimeType, buffer: Buffer.from(base64, "base64") };
  });

  const id = randomUUID();
  await pool.query(
    `insert into mileage_requests (id, staff_name, trip_date, purpose, miles, note, start_address, end_address)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, staffName, tripDate, purpose, miles, note, startAddress, endAddress],
  );

  for (const photo of decodedPhotos) {
    await addMileageRequestPhoto(id, photo.buffer, photo.mimeType);
  }

  const result = await pool.query("select * from mileage_requests where id = $1", [id]);
  const [request] = await attachMileageRequestPhotos([formatMileageRequestRow(result.rows[0])]);
  return request;
}

async function setMileageRequestStatus(id, status) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  if (!MILEAGE_STATUSES.includes(status)) throw Object.assign(new Error("Unknown status."), { statusCode: 400 });

  const result = await pool.query(
    "update mileage_requests set status = $2, reviewed_at = now() where id = $1 returning *",
    [id, status],
  );
  if (!result.rows.length) throw Object.assign(new Error("Request not found."), { statusCode: 404 });
  return formatMileageRequestRow(result.rows[0]);
}

async function deleteMileageRequest(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  await pool.query("delete from mileage_requests where id = $1", [id]);
}

const SCHEDULE_WEEK_DAYS = 7;
const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function addDaysToIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatScheduleWeekRow(row) {
  const startDate = row.start_date.toISOString().slice(0, 10);
  return {
    id: row.id,
    startDate,
    endDate: addDaysToIsoDate(startDate, SCHEDULE_WEEK_DAYS - 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatScheduleShiftRow(row) {
  return {
    id: row.id,
    weekId: row.week_id,
    staffName: row.staff_name,
    shiftDate: row.shift_date.toISOString().slice(0, 10),
    startTime: row.start_time,
    endTime: row.end_time,
  };
}

async function listScheduleWeeks() {
  const pool = getPgPool();
  if (!pool) return [];

  const result = await pool.query("select * from schedule_weeks order by start_date desc");
  return result.rows.map(formatScheduleWeekRow);
}

async function createScheduleWeek(payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const startDate = String(payload?.startDate || "").trim();
  if (!startDate || Number.isNaN(new Date(startDate).getTime())) {
    throw Object.assign(new Error("Choose a start date for the week."), { statusCode: 400 });
  }

  const existing = await pool.query("select id from schedule_weeks where start_date = $1", [startDate]);
  if (existing.rows.length) {
    throw Object.assign(new Error("A week already starts on that date."), { statusCode: 400 });
  }

  const id = randomUUID();
  await pool.query("insert into schedule_weeks (id, start_date) values ($1, $2)", [id, startDate]);

  const result = await pool.query("select * from schedule_weeks where id = $1", [id]);
  const week = formatScheduleWeekRow(result.rows[0]);

  const copyFromWeekId = String(payload?.copyFromWeekId || "").trim();
  if (copyFromWeekId) await copyScheduleWeekShifts(copyFromWeekId, week);

  return week;
}

function diffIsoDays(laterIsoDate, earlierIsoDate) {
  const [ly, lm, ld] = laterIsoDate.split("-").map(Number);
  const [ey, em, ed] = earlierIsoDate.split("-").map(Number);
  const later = Date.UTC(ly, lm - 1, ld);
  const earlier = Date.UTC(ey, em - 1, ed);
  return Math.round((later - earlier) / 86400000);
}

// Most weeks barely change from the one before, so "+ New week" offers to carry every shift over
// (same staff, same day-of-week, same times) onto the new week's matching dates -- the admin only
// has to touch the days that actually changed instead of re-typing the whole grid. Silently no-ops
// if the source week no longer exists (e.g. it was deleted in the meantime).
async function copyScheduleWeekShifts(sourceWeekId, targetWeek) {
  const pool = getPgPool();
  if (!pool) return;

  const sourceResult = await pool.query("select * from schedule_weeks where id = $1", [sourceWeekId]);
  if (!sourceResult.rows.length) return;
  const sourceWeek = formatScheduleWeekRow(sourceResult.rows[0]);

  const shifts = await listScheduleShiftsForWeek(sourceWeekId);
  for (const shift of shifts) {
    const dayOffset = diffIsoDays(shift.shiftDate, sourceWeek.startDate);
    const targetDate = addDaysToIsoDate(targetWeek.startDate, dayOffset);
    const id = randomUUID();
    await pool.query(
      `insert into schedule_shifts (id, week_id, staff_name, shift_date, start_time, end_time)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (week_id, staff_name, shift_date)
       do update set start_time = excluded.start_time, end_time = excluded.end_time, updated_at = now()`,
      [id, targetWeek.id, shift.staffName, targetDate, shift.startTime, shift.endTime],
    );
  }
}

async function deleteScheduleWeek(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  await pool.query("delete from schedule_weeks where id = $1", [id]);
}

async function listScheduleShiftsForWeek(weekId) {
  const pool = getPgPool();
  if (!pool) return [];

  const result = await pool.query("select * from schedule_shifts where week_id = $1 order by shift_date, staff_name", [weekId]);
  return result.rows.map(formatScheduleShiftRow);
}

async function upsertScheduleShift(weekId, payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const weekResult = await pool.query("select * from schedule_weeks where id = $1", [weekId]);
  if (!weekResult.rows.length) throw Object.assign(new Error("Week not found."), { statusCode: 404 });
  const week = formatScheduleWeekRow(weekResult.rows[0]);

  // Any staff member, active or not -- this also has to accept edits to a since-deactivated
  // person's shift on a week where they already have one (fixing a typo in their hours, etc.).
  const allStaffNames = (await listStaffMembers()).map((s) => s.name);
  const staffName = allStaffNames.includes(payload?.staffName) ? payload.staffName : "";
  if (!staffName) throw Object.assign(new Error("Unknown staff member."), { statusCode: 400 });

  const shiftDate = String(payload?.shiftDate || "").trim();
  if (shiftDate < week.startDate || shiftDate > week.endDate) {
    throw Object.assign(new Error("Date is outside this week."), { statusCode: 400 });
  }

  const startTime = String(payload?.startTime || "").trim();
  const endTime = String(payload?.endTime || "").trim();

  // Both blank clears the shift for this staff/day (a day off) instead of erroring.
  if (!startTime && !endTime) {
    await pool.query("delete from schedule_shifts where week_id = $1 and staff_name = $2 and shift_date = $3", [
      weekId,
      staffName,
      shiftDate,
    ]);
    return null;
  }

  if (!SCHEDULE_TIME_PATTERN.test(startTime) || !SCHEDULE_TIME_PATTERN.test(endTime)) {
    throw Object.assign(new Error("Enter both a start and end time."), { statusCode: 400 });
  }
  if (endTime <= startTime) {
    throw Object.assign(new Error("End time must be after start time."), { statusCode: 400 });
  }

  const id = randomUUID();
  await pool.query(
    `insert into schedule_shifts (id, week_id, staff_name, shift_date, start_time, end_time)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (week_id, staff_name, shift_date)
     do update set start_time = excluded.start_time, end_time = excluded.end_time, updated_at = now()`,
    [id, weekId, staffName, shiftDate, startTime, endTime],
  );

  const result = await pool.query(
    "select * from schedule_shifts where week_id = $1 and staff_name = $2 and shift_date = $3",
    [weekId, staffName, shiftDate],
  );
  return formatScheduleShiftRow(result.rows[0]);
}

// A log only counts as "flagged" if a human had to pick or type an activity/minutes value the
// built-in matcher should have caught live -- that provenance is already tracked per row
// (activity_source/minutes_source), so this costs one query, no AI involved.
async function findFlaggedLogsForPatternReview(sinceIso, limit = LOG_PATTERN_REVIEW_BATCH_SIZE) {
  const pool = getPgPool();
  if (!pool) return [];

  const flaggedIds = await pool.query(
    `
      select distinct l.id, l.created_at
      from coach_logs l
      join coach_log_activities a on a.coach_log_id = l.id
      where l.created_at > $1
        and (a.activity_source = 'manual' or a.minutes_source in ('manual', 'empty'))
      order by l.created_at asc
      limit $2
    `,
    [sinceIso, limit],
  );

  const ids = flaggedIds.rows.map((row) => row.id);
  if (!ids.length) return [];

  const [logsResult, activitiesResult] = await Promise.all([
    pool.query(
      "select id, response, assistant_draft, session_date, coach, created_at from coach_logs where id = any($1::uuid[])",
      [ids],
    ),
    pool.query(
      `select coach_log_id, youth_name, activity, activity_source, minutes, minutes_source, activity_modifier
       from coach_log_activities where coach_log_id = any($1::uuid[]) order by created_at asc`,
      [ids],
    ),
  ]);

  const activitiesByLog = new Map();
  for (const row of activitiesResult.rows) {
    if (!activitiesByLog.has(row.coach_log_id)) activitiesByLog.set(row.coach_log_id, []);
    activitiesByLog.get(row.coach_log_id).push(row);
  }

  return logsResult.rows
    .map((row) => ({
      id: row.id,
      response: row.response,
      possibleCategories: (row.assistant_draft && row.assistant_draft.possibleCategories) || [],
      activities: activitiesByLog.get(row.id) || [],
      createdAt: row.created_at,
    }))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

async function analyzeLogPatternGaps(flaggedLogs) {
  if (!anthropicApiKey) {
    throw Object.assign(new Error("ANTHROPIC_API_KEY is not set."), { statusCode: 400 });
  }
  if (!flaggedLogs.length) return [];

  const suggestPatternUpdatesTool = {
    name: "suggest_pattern_updates",
    description:
      "Suggest new trigger phrases to add to a youth boxing club's coach-log auto-tagging system, based on " +
      "logs where a coach had to manually pick or type something the automatic matcher should have caught.",
    input_schema: {
      type: "object",
      properties: {
        suggestions: {
          type: "array",
          description:
            "Zero or more new trigger phrases. Only suggest a phrase if you're confident it would correctly " +
            "and specifically indicate that label in future logs -- skip anything vague or already obviously " +
            "covered by common synonyms. It's fine to return an empty array.",
          items: {
            type: "object",
            properties: {
              patternType: { type: "string", enum: ["activity", "focus", "category"] },
              label: {
                type: "string",
                description:
                  "Must be exactly one of the existing labels provided for that patternType -- never invent a new one.",
              },
              phrase: {
                type: "string",
                description:
                  "The new word or short phrase to match on (as it would literally appear in a coach's log), e.g. 'mitt work'.",
              },
              exampleLogId: { type: "string", description: "The id of the log that motivated this suggestion." },
              exampleQuote: { type: "string", description: "Short quote from that log showing the phrase in context." },
              reason: { type: "string", description: "One sentence on why this phrase should map to that label." },
            },
            required: ["patternType", "label", "phrase", "exampleLogId", "exampleQuote", "reason"],
          },
        },
      },
      required: ["suggestions"],
    },
  };

  const logsDescription = flaggedLogs
    .map((log) => {
      const activityLines = log.activities
        .map((activity) => {
          const flags = [];
          if (activity.activity_source === "manual") flags.push("activity was manually picked/typed by the coach");
          if (activity.minutes_source === "manual") flags.push("minutes was manually typed by the coach");
          if (activity.minutes_source === "empty") flags.push("minutes could not be auto-detected at all");
          return `    - ${activity.youth_name || "(unnamed)"}: activity="${activity.activity || ""}", minutes=${activity.minutes ?? ""}, focus="${activity.activity_modifier || ""}"${flags.length ? ` [${flags.join("; ")}]` : ""}`;
        })
        .join("\n");

      return (
        `Log ${log.id}:\n` +
        `  Text: "${log.response}"\n` +
        `  Auto-tagged program categories: ${log.possibleCategories.length ? log.possibleCategories.join(", ") : "(none)"}\n` +
        `  Activity rows:\n${activityLines || "    (none)"}`
      );
    })
    .join("\n\n");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: anthropicModel,
      max_tokens: 4096,
      tools: [suggestPatternUpdatesTool],
      tool_choice: { type: "tool", name: "suggest_pattern_updates" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "These are coach logs from a nonprofit youth boxing club where a keyword matcher flagged a possible " +
                "gap -- either the coach had to manually pick an activity/minutes value, or nothing could be " +
                "auto-detected at all. For each log, decide whether some specific word or phrase in the text " +
                "should be added as a new trigger for one of the existing labels below, so future logs using " +
                "similar language get caught automatically. Only suggest phrases mapped to labels in these exact lists:\n\n" +
                `Activity labels: ${LOG_ACTIVITY_LABELS.join(", ")}\n` +
                `Focus labels: ${LOG_FOCUS_LABELS.join(", ")}\n` +
                `Program category labels: ${LOG_CATEGORY_LABELS.join(", ")}\n\n` +
                `${logsDescription}\n\n` +
                "Call suggest_pattern_updates with what you find. Return an empty array if nothing in these logs " +
                "warrants a new trigger phrase.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Claude API error (${response.status}): ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  const toolUse = (data.content || []).find((block) => block.type === "tool_use" && block.name === "suggest_pattern_updates");
  if (!toolUse) throw new Error("Claude did not return structured pattern suggestions.");

  const rawSuggestions = Array.isArray(toolUse.input?.suggestions) ? toolUse.input.suggestions : [];
  const flaggedLogIds = new Set(flaggedLogs.map((log) => log.id));

  return rawSuggestions
    .filter((suggestion) => {
      const labels = LOG_PATTERN_LABELS_BY_TYPE[suggestion?.patternType];
      return labels && labels.includes(suggestion.label) && String(suggestion.phrase || "").trim();
    })
    .map((suggestion) => ({
      patternType: suggestion.patternType,
      label: suggestion.label,
      phrase: String(suggestion.phrase).trim(),
      exampleLogId: flaggedLogIds.has(suggestion.exampleLogId) ? suggestion.exampleLogId : null,
      exampleQuote: String(suggestion.exampleQuote || "").trim(),
      reason: String(suggestion.reason || "").trim(),
    }));
}

// Inserts only suggestions that aren't already an active phrase or an existing pending suggestion
// (case-insensitive, same type+label+phrase) -- re-running a review after a quiet period shouldn't
// pile up duplicate rows for the same wording.
async function saveNewPatternSuggestions(suggestions) {
  const pool = getPgPool();
  if (!pool || !suggestions.length) return [];

  const [activeResult, pendingResult] = await Promise.all([
    pool.query("select pattern_type, label, phrase from log_pattern_phrases"),
    pool.query("select pattern_type, label, phrase from log_pattern_suggestions where status = 'pending'"),
  ]);

  const existingKey = (row) => `${row.pattern_type || row.patternType}:${row.label}:${String(row.phrase).toLowerCase()}`;
  const existing = new Set([...activeResult.rows, ...pendingResult.rows].map(existingKey));

  const inserted = [];
  for (const suggestion of suggestions) {
    const key = existingKey(suggestion);
    if (existing.has(key)) continue;
    existing.add(key);

    const id = randomUUID();
    await pool.query(
      `insert into log_pattern_suggestions
        (id, pattern_type, label, phrase, example_log_id, example_quote, reason)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, suggestion.patternType, suggestion.label, suggestion.phrase, suggestion.exampleLogId, suggestion.exampleQuote, suggestion.reason],
    );
    inserted.push({ id, ...suggestion, status: "pending" });
  }

  return inserted;
}

// Shrinks an uploaded photo before it's stored, since phone photos (often 3000-4000px, several MB)
// are the single biggest driver of database storage growth in this app -- coaching log/attendance
// rows are a few hundred bytes each, but one photo can be 1-3MB on its own. Shared by every
// feature that stores an uploaded image as bytea: grant receipts (see createGrantReceipt, which
// runs this *after* the AI read so the automated extraction always sees the original, full-quality
// photo) and mileage-request photos (see addMileageRequestPhoto). Compression only ever affects
// what gets written to disk, never what the AI or the upload-size guardrail see. PDFs are left
// untouched (this only knows how to re-encode raster images), and if the resulting file isn't
// actually smaller, or Jimp can't read the file at all (unsupported/corrupt image, or the
// dependency isn't installed), the original bytes are kept as-is -- compression can only ever make
// a photo smaller, never fail the upload or replace a working image with a broken one.
async function compressUploadedImage(fileBuffer, mimeType) {
  if (mimeType === RECEIPT_PDF_MIME_TYPE || !mimeType.startsWith("image/")) {
    return { buffer: fileBuffer, mimeType };
  }

  let Jimp;
  try {
    Jimp = requireJimp();
  } catch (error) {
    return { buffer: fileBuffer, mimeType };
  }

  try {
    const image = await Jimp.read(fileBuffer);
    const { width, height } = image.bitmap;
    if (Math.max(width, height) > RECEIPT_IMAGE_MAX_DIMENSION) {
      if (width >= height) {
        image.resize(RECEIPT_IMAGE_MAX_DIMENSION, Jimp.AUTO);
      } else {
        image.resize(Jimp.AUTO, RECEIPT_IMAGE_MAX_DIMENSION);
      }
    }
    image.quality(RECEIPT_IMAGE_JPEG_QUALITY);
    const compressed = await image.getBufferAsync(Jimp.MIME_JPEG);

    if (compressed.length < fileBuffer.length) {
      return { buffer: compressed, mimeType: Jimp.MIME_JPEG };
    }
    return { buffer: fileBuffer, mimeType };
  } catch (error) {
    return { buffer: fileBuffer, mimeType };
  }
}

// Lazy require, same pattern as getPgPool()'s `require("pg")" -- keeps startup from crashing if
// the dependency is ever missing, and lets compressUploadedImage fail open into "store the
// original" instead of blocking the whole upload.
function requireJimp() {
  return require("jimp");
}

async function createGrantReceipt(year, fileBuffer, mimeType, cardholder, paymentMethod) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  const { cardholders: cardholderOptions, paymentMethods: paymentMethodOptions } = await getReceiptOptionNames();

  if (fileBuffer.length > MAX_RECEIPT_IMAGE_BYTES) {
    throw Object.assign(new Error("Receipt file is too large (8MB max)."), { statusCode: 400 });
  }
  if (!cardholderOptions.includes(cardholder)) {
    throw Object.assign(new Error("Cardholder is required."), { statusCode: 400 });
  }
  if (!paymentMethodOptions.includes(paymentMethod)) {
    throw Object.assign(new Error("Payment method is required."), { statusCode: 400 });
  }

  // The AI read always runs against the original, full-quality upload -- compression (below)
  // only decides what gets written to disk, so it can never affect what the automated extraction
  // sees.
  let read = null;
  let aiError = "";
  try {
    const categories = (await listGrantExpenseCategories()).map((category) => category.name);
    read = await analyzeReceiptImage(fileBuffer, mimeType, categories);
  } catch (error) {
    aiError = error.message;
  }

  const stored = await compressUploadedImage(fileBuffer, mimeType);

  const fileResult = await pool.query(
    `
      insert into grant_receipts
        (id, year, image_data, image_mime, vendor, receipt_date, cardholder, payment_method, ai_notes, ai_error, uploaded_at)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
      returning id as receipt_id, vendor, receipt_date, cardholder, payment_method, ai_notes, ai_error, uploaded_at, image_mime
    `,
    [
      randomUUID(),
      year,
      stored.buffer,
      stored.mimeType,
      read?.vendor || "",
      read?.receiptDate || null,
      cardholder,
      paymentMethod,
      read?.notes || "",
      aiError || null,
    ],
  );
  const fileRow = fileResult.rows[0];

  const itemDrafts = read?.items?.length ? read.items : [{ category: "", amount: 0, description: "" }];
  const items = [];
  for (const draft of itemDrafts) {
    const itemResult = await pool.query(
      `
        insert into grant_receipt_items (id, receipt_id, status, category, description, amount, created_at)
        values ($1,$2,'pending',$3,$4,$5, now())
        returning id, status, category, description, amount, note, grant_id, expense_id, confirmed_at, created_at
      `,
      [randomUUID(), fileRow.receipt_id, draft.category || "", draft.description || "", draft.amount || 0],
    );
    items.push(formatGrantReceiptItemRow({ ...itemResult.rows[0], ...fileRow }));
  }

  return {
    receipt: {
      id: fileRow.receipt_id,
      vendor: fileRow.vendor || "",
      receiptDate: fileRow.receipt_date ? new Date(fileRow.receipt_date).toISOString().slice(0, 10) : "",
      cardholder: fileRow.cardholder || "",
      paymentMethod: fileRow.payment_method || "",
      aiNotes: fileRow.ai_notes || "",
      aiError: fileRow.ai_error || "",
      uploadedAt: fileRow.uploaded_at,
      mimeType: fileRow.image_mime || "image/jpeg",
    },
    items,
  };
}

// Formats one joined grant_receipt_items x grant_receipts row -- the shape used everywhere the
// review queue reads/writes a single split line, with the parent receipt's file-level info
// (vendor/date/cardholder/payment/photo) merged in so the UI doesn't need a second lookup.
function formatGrantReceiptItemRow(row) {
  return {
    id: row.id,
    receiptId: row.receipt_id,
    status: row.status,
    vendor: row.vendor || "",
    receiptDate: row.receipt_date ? new Date(row.receipt_date).toISOString().slice(0, 10) : "",
    cardholder: row.cardholder || "",
    paymentMethod: row.payment_method || "",
    category: row.category || "",
    description: row.description || "",
    note: row.note || "",
    amount: Number(row.amount),
    grantId: row.grant_id || null,
    expenseId: row.expense_id || null,
    aiNotes: row.ai_notes || "",
    aiError: row.ai_error || "",
    uploadedAt: row.uploaded_at,
    mimeType: row.image_mime || "image/jpeg",
  };
}

async function listGrantReceiptItems(year, status) {
  const pool = getPgPool();
  if (!pool) return [];

  const conditions = ["r.year = $1"];
  const params = [year];
  if (status) {
    conditions.push(`i.status = $${params.length + 1}`);
    params.push(status);
  }

  const result = await pool.query(
    `
      select
        i.id, i.status, i.category, i.description, i.amount, i.note, i.grant_id, i.expense_id,
        i.confirmed_at, i.created_at,
        r.id as receipt_id, r.vendor, r.receipt_date, r.cardholder, r.payment_method,
        r.ai_notes, r.ai_error, r.image_mime, r.uploaded_at
      from grant_receipt_items i
      join grant_receipts r on r.id = i.receipt_id
      where ${conditions.join(" and ")}
      order by r.uploaded_at desc, i.created_at asc
    `,
    params,
  );

  return result.rows.map(formatGrantReceiptItemRow);
}

async function getGrantReceiptImage(id) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const result = await pool.query("select image_data, image_mime from grant_receipts where id = $1", [id]);
  if (!result.rows.length) {
    throw Object.assign(new Error("Receipt not found."), { statusCode: 404 });
  }

  return { data: result.rows[0].image_data, mimeType: result.rows[0].image_mime };
}

// Adds a blank split line to an existing receipt -- for when the AI should have split a receipt
// into more than one category but didn't; the human adds the missing line by hand instead of
// re-uploading the whole file.
async function addGrantReceiptItem(receiptId) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const fileResult = await pool.query(
    "select id as receipt_id, vendor, receipt_date, cardholder, payment_method, ai_notes, ai_error, image_mime, uploaded_at from grant_receipts where id = $1",
    [receiptId],
  );
  if (!fileResult.rows.length) {
    throw Object.assign(new Error("Receipt not found."), { statusCode: 404 });
  }

  const itemResult = await pool.query(
    `
      insert into grant_receipt_items (id, receipt_id, status, category, description, amount, created_at)
      values ($1,$2,'pending','','',0, now())
      returning id, status, category, description, amount, note, grant_id, expense_id, confirmed_at, created_at
    `,
    [randomUUID(), receiptId],
  );

  return formatGrantReceiptItemRow({ ...itemResult.rows[0], ...fileResult.rows[0] });
}

async function confirmGrantReceiptItem(itemId, payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  const { cardholders: cardholderOptions, paymentMethods: paymentMethodOptions } = await getReceiptOptionNames();

  const existing = await pool.query(
    `
      select
        i.*, r.year as receipt_year, r.vendor as receipt_vendor, r.receipt_date,
        r.cardholder as receipt_cardholder, r.payment_method as receipt_payment_method
      from grant_receipt_items i
      join grant_receipts r on r.id = i.receipt_id
      where i.id = $1
    `,
    [itemId],
  );
  if (!existing.rows.length) {
    throw Object.assign(new Error("Receipt line not found."), { statusCode: 404 });
  }
  const item = existing.rows[0];
  if (item.status === "confirmed") {
    throw Object.assign(new Error("This line was already confirmed."), { statusCode: 400 });
  }

  const category = String(payload.category ?? item.category ?? "").trim();
  const description = String(payload.description ?? item.description ?? "").trim();
  const amount = payload.amount !== undefined ? Number(payload.amount) || 0 : Number(item.amount) || 0;
  const note = String(payload.note ?? item.note ?? "").trim();
  const grantId = payload.grantId !== undefined ? payload.grantId || null : item.grant_id;
  const year = Number(payload.year) || item.receipt_year;

  const vendor = String(payload.vendor ?? item.receipt_vendor ?? "").trim();
  const receiptDate = payload.receiptDate !== undefined ? payload.receiptDate || null : item.receipt_date;
  const cardholder = cardholderOptions.includes(payload.cardholder) ? payload.cardholder : item.receipt_cardholder;
  const paymentMethod = paymentMethodOptions.includes(payload.paymentMethod)
    ? payload.paymentMethod
    : item.receipt_payment_method;

  if (!category && !description) {
    throw Object.assign(new Error("Description or category is required."), { statusCode: 400 });
  }

  const expenseDescription = description || vendor;
  const expense = await createGrantExpense(year, {
    category,
    description: expenseDescription,
    amount,
    note,
    cardholder,
    paymentMethod,
    grantId,
  });

  await pool.query(
    "update grant_receipts set vendor = $2, receipt_date = $3, cardholder = $4, payment_method = $5 where id = $1",
    [item.receipt_id, vendor, receiptDate, cardholder, paymentMethod],
  );

  const updatedItem = await pool.query(
    `
      update grant_receipt_items
      set status = 'confirmed', expense_id = $2, category = $3, description = $4, amount = $5, note = $6,
          grant_id = $7, confirmed_at = now()
      where id = $1
      returning id, status, category, description, amount, note, grant_id, expense_id, confirmed_at, created_at
    `,
    [itemId, expense.id, category, description, amount, note, grantId],
  );

  const fileRow = await pool.query(
    "select id as receipt_id, vendor, receipt_date, cardholder, payment_method, ai_notes, ai_error, image_mime, uploaded_at from grant_receipts where id = $1",
    [item.receipt_id],
  );

  return { expense, item: formatGrantReceiptItemRow({ ...updatedItem.rows[0], ...fileRow.rows[0] }) };
}

// Edits any field on a receipt line after the fact -- used by the "All Receipts" table's Edit
// action, for both pending and already-confirmed lines. Vendor/date/cardholder/payment-method
// live on the shared grant_receipts file row (so they apply to every split line on that receipt);
// category/description/note/amount/grant live on this specific grant_receipt_items line. If the
// line has already been confirmed into an expense, that expense is updated too so the Expenses
// ledger doesn't keep showing stale values after an edit here.
async function updateGrantReceiptItem(id, payload) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });
  const { cardholders: cardholderOptions, paymentMethods: paymentMethodOptions } = await getReceiptOptionNames();

  const existing = await pool.query(
    `
      select
        i.*, r.vendor as receipt_vendor, r.receipt_date, r.cardholder as receipt_cardholder,
        r.payment_method as receipt_payment_method
      from grant_receipt_items i
      join grant_receipts r on r.id = i.receipt_id
      where i.id = $1
    `,
    [id],
  );
  if (!existing.rows.length) {
    throw Object.assign(new Error("Receipt line not found."), { statusCode: 404 });
  }
  const item = existing.rows[0];

  const vendor = payload.vendor !== undefined ? String(payload.vendor).trim() : item.receipt_vendor;
  const receiptDate = payload.receiptDate !== undefined ? payload.receiptDate || null : item.receipt_date;
  const cardholder =
    payload.cardholder !== undefined
      ? cardholderOptions.includes(payload.cardholder) || payload.cardholder === item.receipt_cardholder
        ? payload.cardholder
        : ""
      : item.receipt_cardholder;
  const paymentMethod =
    payload.paymentMethod !== undefined
      ? paymentMethodOptions.includes(payload.paymentMethod) || payload.paymentMethod === item.receipt_payment_method
        ? payload.paymentMethod
        : ""
      : item.receipt_payment_method;

  const category = payload.category !== undefined ? String(payload.category).trim() : item.category;
  const description = payload.description !== undefined ? String(payload.description).trim() : item.description;
  const note = payload.note !== undefined ? String(payload.note).trim() : item.note;
  const amount = payload.amount !== undefined ? Number(payload.amount) || 0 : Number(item.amount);
  const grantId = payload.grantId !== undefined ? payload.grantId || null : item.grant_id;

  if (!category && !description) {
    throw Object.assign(new Error("Description or category is required."), { statusCode: 400 });
  }

  await pool.query(
    "update grant_receipts set vendor = $2, receipt_date = $3, cardholder = $4, payment_method = $5 where id = $1",
    [item.receipt_id, vendor, receiptDate, cardholder, paymentMethod],
  );

  await pool.query(
    `
      update grant_receipt_items
      set category = $2, description = $3, amount = $4, note = $5, grant_id = $6
      where id = $1
    `,
    [id, category, description, amount, note, grantId],
  );

  if (item.expense_id) {
    await updateGrantExpense(item.expense_id, {
      category,
      description,
      amount,
      note,
      cardholder,
      paymentMethod,
      grantId,
    });
  }

  const fileRow = await pool.query(
    "select id as receipt_id, vendor, receipt_date, cardholder, payment_method, ai_notes, ai_error, image_mime, uploaded_at from grant_receipts where id = $1",
    [item.receipt_id],
  );
  const itemRow = await pool.query(
    "select id, status, category, description, amount, note, grant_id, expense_id, confirmed_at, created_at from grant_receipt_items where id = $1",
    [id],
  );

  return formatGrantReceiptItemRow({ ...itemRow.rows[0], ...fileRow.rows[0] });
}

// Discarding the last remaining line on a receipt also removes the receipt file itself (and its
// image) -- otherwise it'd sit around forever with zero lines and no way to see or discard it.
async function deleteGrantReceiptItem(itemId) {
  const pool = getPgPool();
  if (!pool) throw Object.assign(new Error("DATABASE_URL is not set."), { statusCode: 400 });

  const existing = await pool.query("select receipt_id, expense_id from grant_receipt_items where id = $1", [
    itemId,
  ]);
  if (!existing.rows.length) {
    throw Object.assign(new Error("Receipt line not found."), { statusCode: 404 });
  }
  const { receipt_id: receiptId, expense_id: expenseId } = existing.rows[0];

  await pool.query("delete from grant_receipt_items where id = $1", [itemId]);

  // A confirmed line has already spawned its own row in grant_expenses (see
  // confirmGrantReceiptItem) with no FK tying it back to this item, so deleting the item alone
  // would leave a phantom entry sitting in the Expenses ledger forever. Clean it up too.
  if (expenseId) {
    await pool.query("delete from grant_expenses where id = $1", [expenseId]);
  }

  const remaining = await pool.query(
    "select count(*)::int as count from grant_receipt_items where receipt_id = $1",
    [receiptId],
  );
  if (remaining.rows[0].count === 0) {
    await pool.query("delete from grant_receipts where id = $1", [receiptId]);
  }
}

async function getGrantsBudget(year) {
  const forecast = await getGrantsForecast(year);
  const expenses = await listGrantExpenses(year);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const revenue = forecast.ok ? forecast.confirmedTotal + forecast.anticipatedTotal : 0;
  const grantsResult = await listGrants({ get: (key) => (key === "year" ? String(year) : null) });

  return {
    ok: true,
    year,
    forecast,
    expenses,
    totalExpenses,
    revenue,
    net: revenue - totalExpenses,
    ...(await getReceiptOptionNames()),
    grants: grantsResult.ok ? grantsResult.grants : [],
  };
}

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  res.end(body);
}

function sendJsonWithHeaders(res, statusCode, data, headers) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Secret",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...headers,
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

async function serveStatic(req, res, url) {
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(rootDir, safePath);

  if (!filePath.startsWith(rootDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(file);
  } catch (error) {
    sendText(res, error.code === "ENOENT" ? 404 : 500, error.code === "ENOENT" ? "Not found" : "Server error");
  }
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, service: "coach-daily-logs", time: new Date().toISOString() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    const payload = await readJsonBody(req);

    if (payload.password !== adminPassword) {
      sendJson(res, 401, { ok: false, error: "Invalid password" });
      return;
    }

    sendJsonWithHeaders(res, 200, { ok: true }, {
      "Set-Cookie": `${sessionCookieName}=${encodeURIComponent(createSessionCookie())}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`,
    });
    return;
  }

  if (!isAuthenticatedRequest(req, url)) {
    sendJson(res, 401, { ok: false, error: "Authentication required" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/roster") {
    const roster = await readRosterCache();
    // Logged-out visitors (the public daily log form) only get what name autocomplete needs.
    // Demographics -- birth date, address, race/ethnicity, school, etc. -- stay admin-only.
    sendJson(res, 200, { roster: verifySession(req) ? roster : roster.map(toPublicRosterPerson) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/database/status") {
    sendJson(res, 200, await getDatabaseStatus());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/reports/dashboard") {
    sendJson(res, 200, await getDashboardReport(url.searchParams));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/reports/attendance-rate") {
    sendJson(res, 200, await getAttendanceRateReport(url.searchParams));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/reports/overview-attendance") {
    sendJson(res, 200, await getOverviewAttendanceSummary());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/roster/import") {
    const payload = await readJsonBody(req);
    const csvText = String(payload.csv || "");

    if (!csvText.trim()) {
      sendJson(res, 400, { ok: false, error: "CSV content is required." });
      return;
    }

    const parsed = extractRosterImportPeople(csvText);
    if (!parsed.people.length) {
      sendJson(res, 400, {
        ok: false,
        error: "No roster names found. Expected a Name or Full Name column.",
        skipped: parsed.skipped,
      });
      return;
    }

    const localImport = await upsertLocalRosterImport(parsed.people);
    let databaseImport = {
      configured: Boolean(databaseUrl),
      saved: false,
      added: localImport.added,
      existing: localImport.existing,
      rosterCount: localImport.roster.length,
    };

    if (databaseUrl) {
      databaseImport = await importRosterToDatabase(parsed.people, parsed.presentDemographicFields);
    }

    sendJson(res, 201, {
      ok: true,
      rowCount: parsed.rowCount,
      imported: parsed.people.length,
      added: databaseImport.added,
      existing: databaseImport.existing,
      skipped: parsed.skipped,
      rosterCount: databaseImport.rosterCount || localImport.roster.length,
      storage: databaseImport.saved ? "postgres" : "local-file",
      databaseImport,
    });
    return;
  }

  const rosterIdMatch = url.pathname.match(/^\/api\/roster\/([^/]+)$/);

  if (rosterIdMatch && req.method === "PUT") {
    const id = decodeURIComponent(rosterIdMatch[1]);
    const payload = await readJsonBody(req);
    const fields = normalizeRosterFields(payload);

    if (!fields.fullName || !fields.normalizedName) {
      sendJson(res, 400, { ok: false, error: "Full name is required." });
      return;
    }

    try {
      let person;
      if (databaseUrl) {
        person = await updateRosterPersonDb(id, fields);
        await updateRosterPersonLocal(id, fields).catch(() => {});
      } else {
        person = await updateRosterPersonLocal(id, fields);
      }
      sendJson(res, 200, { ok: true, person });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (rosterIdMatch && req.method === "DELETE") {
    const id = decodeURIComponent(rosterIdMatch[1]);

    try {
      if (databaseUrl) {
        await deleteRosterPersonDb(id);
        await deleteRosterPersonLocal(id).catch(() => {});
      } else {
        await deleteRosterPersonLocal(id);
      }
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/roster") {
    const payload = await readJsonBody(req);
    const fields = normalizeRosterFields(payload);

    if (!fields.fullName || !fields.normalizedName) {
      sendJson(res, 400, { ok: false, error: "Full name is required." });
      return;
    }

    try {
      let person;
      if (databaseUrl) {
        person = await createRosterPersonDb(fields);
        await createRosterPersonLocal(fields).catch(() => {});
      } else {
        person = await createRosterPersonLocal(fields);
      }
      sendJson(res, 201, { ok: true, person, storage: databaseUrl ? "postgres" : "local-file" });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/school-aliases") {
    if (!databaseUrl) {
      sendJson(res, 200, { ok: true, aliases: [], configured: false });
      return;
    }
    try {
      const aliases = await listSchoolAliases();
      sendJson(res, 200, { ok: true, aliases, configured: true });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/school-aliases") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const payload = await readJsonBody(req);
    try {
      const alias = await upsertSchoolAlias(payload);
      sendJson(res, 200, { ok: true, alias });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const schoolAliasIdMatch = url.pathname.match(/^\/api\/school-aliases\/([^/]+)$/);

  if (schoolAliasIdMatch && req.method === "DELETE") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(schoolAliasIdMatch[1]);
    try {
      await deleteSchoolAlias(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/grants/dashboard") {
    const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    sendJson(res, 200, await getGrantsDashboard(year));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/grants/forecast") {
    const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    sendJson(res, 200, await getGrantsForecast(year));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/grants/budget") {
    const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    sendJson(res, 200, await getGrantsBudget(year));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/grants/goal") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const payload = await readJsonBody(req);
    try {
      const goal = await setGrantGoal(payload);
      sendJson(res, 200, { ok: true, goal });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/grants/expenses") {
    const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    const grantsResult = await listGrants(url.searchParams);
    sendJson(res, 200, {
      ok: true,
      expenses: await listGrantExpenses(year),
      ...(await getReceiptOptionNames()),
      grants: grantsResult.ok ? grantsResult.grants : [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/grants/expenses") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const payload = await readJsonBody(req);
    const year = Number(payload.year) || new Date().getUTCFullYear();
    try {
      const expense = await createGrantExpense(year, payload);
      sendJson(res, 201, { ok: true, expense });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantExpenseUpdateMatch = url.pathname.match(/^\/api\/grants\/expenses\/([^/]+)\/update$/);

  if (grantExpenseUpdateMatch && req.method === "POST") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantExpenseUpdateMatch[1]);
    const payload = await readJsonBody(req);
    try {
      const expense = await updateGrantExpense(id, payload);
      sendJson(res, 200, { ok: true, expense });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantExpenseIdMatch = url.pathname.match(/^\/api\/grants\/expenses\/([^/]+)$/);

  if (grantExpenseIdMatch && req.method === "DELETE") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantExpenseIdMatch[1]);
    try {
      await deleteGrantExpense(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/grants/receipts") {
    const year = Number(url.searchParams.get("year")) || new Date().getUTCFullYear();
    const status = url.searchParams.get("status") || "";
    const categories = await listGrantExpenseCategories();
    const grantsResult = await listGrants(url.searchParams);
    sendJson(res, 200, {
      ok: true,
      receipts: await listGrantReceiptItems(year, status),
      categories: categories.map((category) => category.name),
      ...(await getReceiptOptionNames()),
      grants: grantsResult.ok ? grantsResult.grants : [],
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/grants/receipts") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const payload = await readJsonBody(req);
    const year = Number(payload.year) || new Date().getUTCFullYear();
    const mimeType = String(payload.mimeType || "image/jpeg").toLowerCase();
    const base64 = String(payload.imageBase64 || "").replace(/^data:[^;]+;base64,/, "");
    const cardholder = String(payload.cardholder || "");
    const paymentMethod = String(payload.paymentMethod || "");

    if (!base64) {
      sendJson(res, 400, { ok: false, error: "A receipt photo or PDF is required." });
      return;
    }
    if (mimeType !== RECEIPT_PDF_MIME_TYPE && !mimeType.startsWith("image/")) {
      sendJson(res, 400, { ok: false, error: "Only image files or PDFs are supported for receipts." });
      return;
    }

    try {
      const fileBuffer = Buffer.from(base64, "base64");
      const result = await createGrantReceipt(year, fileBuffer, mimeType, cardholder, paymentMethod);
      sendJson(res, 201, { ok: true, ...result });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantReceiptImageMatch = url.pathname.match(/^\/api\/grants\/receipts\/([^/]+)\/image$/);

  if (grantReceiptImageMatch && req.method === "GET") {
    const id = decodeURIComponent(grantReceiptImageMatch[1]);
    try {
      const image = await getGrantReceiptImage(id);
      res.writeHead(200, { "Content-Type": image.mimeType || "application/octet-stream" });
      res.end(image.data);
    } catch (error) {
      sendText(res, error.statusCode || 500, error.message);
    }
    return;
  }

  const grantReceiptItemsMatch = url.pathname.match(/^\/api\/grants\/receipts\/([^/]+)\/items$/);

  if (grantReceiptItemsMatch && req.method === "POST") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const receiptId = decodeURIComponent(grantReceiptItemsMatch[1]);
    try {
      const item = await addGrantReceiptItem(receiptId);
      sendJson(res, 201, { ok: true, item });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantReceiptItemConfirmMatch = url.pathname.match(/^\/api\/grants\/receipt-items\/([^/]+)\/confirm$/);

  if (grantReceiptItemConfirmMatch && req.method === "POST") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantReceiptItemConfirmMatch[1]);
    const payload = await readJsonBody(req);
    try {
      const result = await confirmGrantReceiptItem(id, payload);
      sendJson(res, 200, { ok: true, ...result });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantReceiptItemUpdateMatch = url.pathname.match(/^\/api\/grants\/receipt-items\/([^/]+)\/update$/);

  if (grantReceiptItemUpdateMatch && req.method === "POST") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantReceiptItemUpdateMatch[1]);
    const payload = await readJsonBody(req);
    try {
      const item = await updateGrantReceiptItem(id, payload);
      sendJson(res, 200, { ok: true, item });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantReceiptItemIdMatch = url.pathname.match(/^\/api\/grants\/receipt-items\/([^/]+)$/);

  if (grantReceiptItemIdMatch && req.method === "DELETE") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantReceiptItemIdMatch[1]);
    try {
      await deleteGrantReceiptItem(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/grants/categories") {
    sendJson(res, 200, { ok: true, categories: await listGrantExpenseCategories() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/grants/categories") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const payload = await readJsonBody(req);
    try {
      const category = await createGrantExpenseCategory(payload.name);
      sendJson(res, 201, { ok: true, category });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantCategoryRenameMatch = url.pathname.match(/^\/api\/grants\/categories\/([^/]+)\/rename$/);

  if (grantCategoryRenameMatch && req.method === "POST") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantCategoryRenameMatch[1]);
    const payload = await readJsonBody(req);
    try {
      const category = await renameGrantExpenseCategory(id, payload.name);
      sendJson(res, 200, { ok: true, category });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantCategoryMoveMatch = url.pathname.match(/^\/api\/grants\/categories\/([^/]+)\/move$/);

  if (grantCategoryMoveMatch && req.method === "POST") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantCategoryMoveMatch[1]);
    const payload = await readJsonBody(req);
    try {
      await moveGrantExpenseCategory(id, payload.direction === "up" ? "up" : "down");
      sendJson(res, 200, { ok: true, categories: await listGrantExpenseCategories() });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantCategoryIdMatch = url.pathname.match(/^\/api\/grants\/categories\/([^/]+)$/);

  if (grantCategoryIdMatch && req.method === "DELETE") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantCategoryIdMatch[1]);
    try {
      await deleteGrantExpenseCategory(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/grants/receipt-options") {
    try {
      const [cardholders, paymentMethods] = await Promise.all([
        listReceiptOptions("cardholder"),
        listReceiptOptions("payment_method"),
      ]);
      sendJson(res, 200, { ok: true, cardholders, paymentMethods });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/grants/receipt-options") {
    const payload = await readJsonBody(req);
    try {
      const option = await createReceiptOption(payload.kind, payload.name);
      sendJson(res, 201, { ok: true, option });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const receiptOptionRenameMatch = url.pathname.match(/^\/api\/grants\/receipt-options\/([^/]+)\/rename$/);

  if (receiptOptionRenameMatch && req.method === "POST") {
    const payload = await readJsonBody(req);
    try {
      const option = await renameReceiptOption(decodeURIComponent(receiptOptionRenameMatch[1]), payload.name);
      sendJson(res, 200, { ok: true, option });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const receiptOptionMoveMatch = url.pathname.match(/^\/api\/grants\/receipt-options\/([^/]+)\/move$/);

  if (receiptOptionMoveMatch && req.method === "POST") {
    const payload = await readJsonBody(req);
    try {
      await moveReceiptOption(decodeURIComponent(receiptOptionMoveMatch[1]), payload.direction === "up" ? "up" : "down");
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const receiptOptionIdMatch = url.pathname.match(/^\/api\/grants\/receipt-options\/([^/]+)$/);

  if (receiptOptionIdMatch && req.method === "DELETE") {
    try {
      await deleteReceiptOption(decodeURIComponent(receiptOptionIdMatch[1]));
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/grants") {
    if (!databaseUrl) {
      sendJson(res, 200, { ok: true, grants: [], configured: false });
      return;
    }
    sendJson(res, 200, await listGrants(url.searchParams));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/grants") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const payload = await readJsonBody(req);
    try {
      const grant = await createGrant(payload);
      sendJson(res, 201, { ok: true, grant });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const grantIdMatch = url.pathname.match(/^\/api\/grants\/([^/]+)$/);

  if (grantIdMatch && req.method === "PUT") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantIdMatch[1]);
    const payload = await readJsonBody(req);
    try {
      const grant = await updateGrant(id, payload);
      sendJson(res, 200, { ok: true, grant });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (grantIdMatch && req.method === "DELETE") {
    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set." });
      return;
    }
    const id = decodeURIComponent(grantIdMatch[1]);
    try {
      await deleteGrant(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/attendance") {
    const date = url.searchParams.get("date");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const attendance = await readAttendanceCache({ date, from, to });
    // Same split as /api/roster: the public log form only needs who checked in, never the raw
    // Zen Planner payload or other record details.
    sendJson(res, 200, { attendance: verifySession(req) ? attendance : attendance.map(toPublicAttendanceRecord) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/attendance/webhook") {
    const providedSecret = req.headers["x-webhook-secret"] || url.searchParams.get("secret");
    if (providedSecret !== webhookSecret) {
      sendJson(res, 401, { ok: false, error: "Invalid webhook secret" });
      return;
    }

    const payload = await readJsonBody(req);
    const records = extractAttendanceRecords(payload);

    if (!records.length) {
      sendJson(res, 400, { ok: false, error: "No attendance records found. Expected a fullName/name field." });
      return;
    }

    await appendJsonLines(attendancePath, records);
    const localRoster = await upsertRosterFromAttendance(records);
    let databaseStorage = { configured: Boolean(databaseUrl), saved: false, rosterCount: localRoster.length };

    if (databaseUrl) {
      databaseStorage = await saveAttendanceToDatabase(records);
    }

    sendJson(res, 201, {
      ok: true,
      imported: records.length,
      records,
      rosterCount: databaseStorage.rosterCount || localRoster.length,
      storage: databaseStorage.saved ? "postgres" : "local-file",
      databaseStorage,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/attendance") {
    const payload = await readJsonBody(req);
    const fullName = String(payload.fullName || "").trim();

    if (!fullName) {
      sendJson(res, 400, { ok: false, error: "Full name is required." });
      return;
    }

    const records = extractAttendanceRecords({
      fullName,
      date: payload.attendanceDate || payload.date,
      className: payload.className,
      source: "manual-entry",
    });

    if (!records.length) {
      sendJson(res, 400, { ok: false, error: "Could not build an attendance record." });
      return;
    }

    await appendJsonLines(attendancePath, records);
    const localRoster = await upsertRosterFromAttendance(records);
    let databaseStorage = { configured: Boolean(databaseUrl), saved: false, rosterCount: localRoster.length };

    if (databaseUrl) {
      databaseStorage = await saveAttendanceToDatabase(records);
    }

    sendJson(res, 201, {
      ok: true,
      record: records[0],
      rosterCount: databaseStorage.rosterCount || localRoster.length,
      storage: databaseStorage.saved ? "postgres" : "local-file",
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/attendance/import") {
    const payload = await readJsonBody(req);
    const csvText = String(payload.csv || "");

    if (!csvText.trim()) {
      sendJson(res, 400, { ok: false, error: "CSV content is required." });
      return;
    }

    const parsed = extractAttendanceImportRows(csvText);
    if (!parsed.attendanceRows.length) {
      sendJson(res, 400, {
        ok: false,
        error: "No usable attendance rows found. Expected a date column and a Person column, with parseable dates.",
        skipped: parsed.skipped,
      });
      return;
    }

    if (!databaseUrl) {
      sendJson(res, 400, { ok: false, error: "DATABASE_URL is not set -- attendance import requires Postgres." });
      return;
    }

    try {
      const result = await importAttendanceRecords(parsed.attendanceRows, parsed.demographics);
      sendJson(res, 201, {
        ok: true,
        rowCount: parsed.rowCount,
        inserted: result.inserted,
        deletedOverlap: result.deletedOverlap,
        peopleUpdated: result.peopleUpdated,
        skipped: parsed.skipped,
        flagged: parsed.flagged,
      });
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message });
    }
    return;
  }

  const attendanceIdMatch = url.pathname.match(/^\/api\/attendance\/([^/]+)$/);

  if (attendanceIdMatch && req.method === "PUT") {
    const id = decodeURIComponent(attendanceIdMatch[1]);
    const payload = await readJsonBody(req);
    const changes = {};
    if (payload.fullName !== undefined) changes.fullName = String(payload.fullName).replace(/\s+/g, " ").trim();
    if (payload.attendanceDate !== undefined) changes.attendanceDate = String(payload.attendanceDate).trim();
    if (payload.className !== undefined) changes.className = String(payload.className).trim();

    try {
      if (databaseUrl) {
        await updateAttendanceDb(id, changes);
        await updateAttendanceLocal(id, changes).catch(() => {});
      } else {
        await updateAttendanceLocal(id, changes);
      }
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (attendanceIdMatch && req.method === "DELETE") {
    const id = decodeURIComponent(attendanceIdMatch[1]);

    try {
      if (databaseUrl) {
        await deleteAttendanceDb(id);
        await deleteAttendanceLocal(id).catch(() => {});
      } else {
        await deleteAttendanceLocal(id);
      }
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  // Public, read-only: just the active-staff names for the log form's Coach dropdown. The
  // manageable roster (id, active flag, rename, delete) lives behind /api/staff on the dashboard.
  if (req.method === "GET" && url.pathname === "/api/coaches") {
    try {
      sendJson(res, 200, { ok: true, coachNames: await listActiveStaffNames() });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/logs") {
    const payload = await readJsonBody(req);
    const log = {
      id: randomUUID(),
      receivedAt: new Date().toISOString(),
      ...payload,
    };

    await appendJsonLines(logsPath, [log]);

    try {
      const databaseStorage = await saveCoachLogToDatabase(log);

      sendJson(res, 201, {
        ok: true,
        log,
        storage: databaseStorage.saved ? "postgres" : "local-file",
        databaseStorage,
      });
    } catch (error) {
      console.error("Primary log storage failed:", error.message);
      sendJson(res, 502, {
        ok: false,
        log,
        storage: "local-file",
        error: `The log was saved locally, but database storage failed: ${error.message}`,
        detail: error.message,
      });
    }
    return;
  }

  // Active phrases: fetched by the coach-facing page on load and layered onto the built-in
  // activity/focus/category keyword lists, so an approved suggestion takes effect for every coach
  // without a code deploy.
  if (req.method === "GET" && url.pathname === "/api/logs/pattern-phrases") {
    sendJson(res, 200, { ok: true, phrases: await listActivePatternPhrases() });
    return;
  }

  if (req.method === "DELETE" && url.pathname.match(/^\/api\/logs\/pattern-phrases\/([^/]+)$/)) {
    const id = decodeURIComponent(url.pathname.match(/^\/api\/logs\/pattern-phrases\/([^/]+)$/)[1]);
    try {
      await deleteActivePatternPhrase(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/logs/pattern-suggestions") {
    const status = url.searchParams.get("status") || "";
    try {
      sendJson(res, 200, { ok: true, suggestions: await listPatternSuggestions(status || null) });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const patternSuggestionApproveMatch = url.pathname.match(/^\/api\/logs\/pattern-suggestions\/([^/]+)\/approve$/);

  if (patternSuggestionApproveMatch && req.method === "POST") {
    const id = decodeURIComponent(patternSuggestionApproveMatch[1]);
    try {
      const phrase = await approvePatternSuggestion(id);
      sendJson(res, 200, { ok: true, phrase });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const patternSuggestionDismissMatch = url.pathname.match(/^\/api\/logs\/pattern-suggestions\/([^/]+)\/dismiss$/);

  if (patternSuggestionDismissMatch && req.method === "POST") {
    const id = decodeURIComponent(patternSuggestionDismissMatch[1]);
    try {
      await dismissPatternSuggestion(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  // Admin-triggered: find logs since the last run where a human had to fix what the matcher should
  // have caught (free, no AI), then -- only if there's at least one -- send that batch to Claude for
  // suggestions. Zero flagged logs means zero tokens spent.
  if (req.method === "POST" && url.pathname === "/api/logs/pattern-check") {
    try {
      const state = await getPatternReviewState();
      const sinceIso = state.lastReviewedAt || "1970-01-01T00:00:00Z";
      const runStartedAt = new Date().toISOString();

      const flaggedLogs = await findFlaggedLogsForPatternReview(sinceIso);
      let suggestions = [];
      if (flaggedLogs.length) {
        const rawSuggestions = await analyzeLogPatternGaps(flaggedLogs);
        suggestions = await saveNewPatternSuggestions(rawSuggestions);
      }
      await setPatternReviewState(runStartedAt);

      sendJson(res, 200, {
        ok: true,
        logsChecked: flaggedLogs.length,
        newSuggestions: suggestions.length,
        suggestions,
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/pto-requests") {
    const status = url.searchParams.get("status") || "";
    try {
      sendJson(res, 200, {
        ok: true,
        requests: await listPtoRequests(status || null),
        staffNames: await listActiveStaffNames(),
        leaveTypes: PTO_LEAVE_TYPES,
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/pto-requests") {
    const payload = await readJsonBody(req);
    try {
      const request = await createPtoRequest(payload);
      sendJson(res, 201, { ok: true, request });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const ptoApproveMatch = url.pathname.match(/^\/api\/pto-requests\/([^/]+)\/approve$/);

  if (ptoApproveMatch && req.method === "POST") {
    const id = decodeURIComponent(ptoApproveMatch[1]);
    try {
      const request = await setPtoRequestStatus(id, "approved");
      sendJson(res, 200, { ok: true, request });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const ptoDenyMatch = url.pathname.match(/^\/api\/pto-requests\/([^/]+)\/deny$/);

  if (ptoDenyMatch && req.method === "POST") {
    const id = decodeURIComponent(ptoDenyMatch[1]);
    try {
      const request = await setPtoRequestStatus(id, "denied");
      sendJson(res, 200, { ok: true, request });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const ptoResetMatch = url.pathname.match(/^\/api\/pto-requests\/([^/]+)\/reset$/);

  if (ptoResetMatch && req.method === "POST") {
    const id = decodeURIComponent(ptoResetMatch[1]);
    try {
      const request = await setPtoRequestStatus(id, "pending");
      sendJson(res, 200, { ok: true, request });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const ptoIdMatch = url.pathname.match(/^\/api\/pto-requests\/([^/]+)$/);

  if (ptoIdMatch && req.method === "DELETE") {
    const id = decodeURIComponent(ptoIdMatch[1]);
    try {
      await deletePtoRequest(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/mileage-requests") {
    const status = url.searchParams.get("status") || "";
    try {
      sendJson(res, 200, {
        ok: true,
        requests: await listMileageRequests(status || null),
        staffNames: await listActiveStaffNames(),
      });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mileage-requests") {
    const payload = await readJsonBody(req);
    try {
      const request = await createMileageRequest(payload);
      sendJson(res, 201, { ok: true, request });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const mileageApproveMatch = url.pathname.match(/^\/api\/mileage-requests\/([^/]+)\/approve$/);

  if (mileageApproveMatch && req.method === "POST") {
    const id = decodeURIComponent(mileageApproveMatch[1]);
    try {
      const request = await setMileageRequestStatus(id, "approved");
      sendJson(res, 200, { ok: true, request });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const mileageDenyMatch = url.pathname.match(/^\/api\/mileage-requests\/([^/]+)\/deny$/);

  if (mileageDenyMatch && req.method === "POST") {
    const id = decodeURIComponent(mileageDenyMatch[1]);
    try {
      const request = await setMileageRequestStatus(id, "denied");
      sendJson(res, 200, { ok: true, request });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const mileageResetMatch = url.pathname.match(/^\/api\/mileage-requests\/([^/]+)\/reset$/);

  if (mileageResetMatch && req.method === "POST") {
    const id = decodeURIComponent(mileageResetMatch[1]);
    try {
      const request = await setMileageRequestStatus(id, "pending");
      sendJson(res, 200, { ok: true, request });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const mileagePhotoImageMatch = url.pathname.match(/^\/api\/mileage-requests\/photos\/([^/]+)\/image$/);

  if (mileagePhotoImageMatch && req.method === "GET") {
    const id = decodeURIComponent(mileagePhotoImageMatch[1]);
    try {
      const photo = await getMileageRequestPhoto(id);
      res.writeHead(200, { "Content-Type": photo.mimeType || "application/octet-stream" });
      res.end(photo.data);
    } catch (error) {
      sendText(res, error.statusCode || 500, error.message);
    }
    return;
  }

  const mileagePhotoMatch = url.pathname.match(/^\/api\/mileage-requests\/photos\/([^/]+)$/);

  if (mileagePhotoMatch && req.method === "DELETE") {
    const id = decodeURIComponent(mileagePhotoMatch[1]);
    try {
      await deleteMileageRequestPhoto(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const mileageIdMatch = url.pathname.match(/^\/api\/mileage-requests\/([^/]+)$/);

  if (mileageIdMatch && req.method === "DELETE") {
    const id = decodeURIComponent(mileageIdMatch[1]);
    try {
      await deleteMileageRequest(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/schedule-weeks") {
    try {
      sendJson(res, 200, { ok: true, weeks: await listScheduleWeeks(), staffNames: await listActiveStaffNames() });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/schedule-weeks") {
    const payload = await readJsonBody(req);
    try {
      const week = await createScheduleWeek(payload);
      sendJson(res, 201, { ok: true, week });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const scheduleWeekIdMatch = url.pathname.match(/^\/api\/schedule-weeks\/([^/]+)$/);

  if (scheduleWeekIdMatch && req.method === "DELETE") {
    const id = decodeURIComponent(scheduleWeekIdMatch[1]);
    try {
      await deleteScheduleWeek(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const scheduleShiftsMatch = url.pathname.match(/^\/api\/schedule-weeks\/([^/]+)\/shifts$/);

  if (scheduleShiftsMatch && req.method === "GET") {
    const weekId = decodeURIComponent(scheduleShiftsMatch[1]);
    try {
      sendJson(res, 200, { ok: true, shifts: await listScheduleShiftsForWeek(weekId) });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (scheduleShiftsMatch && req.method === "PUT") {
    const weekId = decodeURIComponent(scheduleShiftsMatch[1]);
    const payload = await readJsonBody(req);
    try {
      const shift = await upsertScheduleShift(weekId, payload);
      sendJson(res, 200, { ok: true, shift });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  // Staff roster management -- admin-only (not in isPublicApiRoute). The public log/PTO/mileage/
  // schedule pages only ever see names via those resources' own GET responses.
  if (req.method === "GET" && url.pathname === "/api/staff") {
    try {
      sendJson(res, 200, { ok: true, staff: await listStaffMembers() });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/staff") {
    const payload = await readJsonBody(req);
    try {
      const staff = await createStaffMember(payload);
      sendJson(res, 201, { ok: true, staff });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const staffIdMatch = url.pathname.match(/^\/api\/staff\/([^/]+)$/);

  if (staffIdMatch && req.method === "PUT") {
    const id = decodeURIComponent(staffIdMatch[1]);
    const payload = await readJsonBody(req);
    try {
      const staff = await renameStaffMember(id, payload);
      sendJson(res, 200, { ok: true, staff });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  if (staffIdMatch && req.method === "DELETE") {
    const id = decodeURIComponent(staffIdMatch[1]);
    try {
      await deleteStaffMember(id);
      sendJson(res, 200, { ok: true });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const staffActivateMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/activate$/);

  if (staffActivateMatch && req.method === "POST") {
    const id = decodeURIComponent(staffActivateMatch[1]);
    try {
      const staff = await setStaffMemberActive(id, true);
      sendJson(res, 200, { ok: true, staff });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  const staffDeactivateMatch = url.pathname.match(/^\/api\/staff\/([^/]+)\/deactivate$/);

  if (staffDeactivateMatch && req.method === "POST") {
    const id = decodeURIComponent(staffDeactivateMatch[1]);
    try {
      const staff = await setStaffMemberActive(id, false);
      sendJson(res, 200, { ok: true, staff });
    } catch (error) {
      sendJson(res, error.statusCode || 500, { ok: false, error: error.message });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "API route not found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

  try {
    if (!isAuthenticatedRequest(req, url)) {
      if (url.pathname.startsWith("/api/")) {
        sendJson(res, 401, { ok: false, error: "Authentication required" });
        return;
      }

      // Preserve where the user was headed (e.g. "/admin.html") through the login round-trip --
      // login.html reads this back and sends them straight there after a successful password
      // submit, instead of dumping everyone back on the landing page and making them click
      // "Dashboard" a second time.
      const next = encodeURIComponent(url.pathname + url.search);
      sendRedirect(res, `/login.html?next=${next}`);
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: "Server error" });
  }
});

Promise.all([ensureDataFiles(), initDatabase()]).then(() => {
  server.listen(port, host, () => {
    console.log(`CYBC Dashboard running at http://${host}:${port}/`);
  });
});
