#!/usr/bin/env node
/**
 * Fills a DEMO database with realistic-looking FAKE data so every tab of the dashboard has
 * something to show: roster + demographics, attendance check-ins, coach logs (with activities,
 * focus, and program categories), grants/goals/expenses, staff, PTO, mileage, and the schedule.
 *
 * Every name, address, school, funder, and amount is invented. Nothing is copied from the real
 * club database.
 *
 * SAFETY
 *   - Only reads DEMO_DATABASE_URL (env var, or a DEMO_DATABASE_URL= line in .env), never
 *     DATABASE_URL, so it can't accidentally point at the real production database.
 *   - Refuses to touch a database that holds any roster/attendance/log row it didn't create
 *     (every seeded row is tagged with raw_payload.demoSeed = true).
 *   - Dry run by default. Nothing is written unless you pass --apply.
 *
 * FIRST TIME
 *   The app creates the tables on startup, so start it once against the demo database first:
 *     DATABASE_URL=<demo url> npm start      (then stop it)
 *
 * USAGE
 *   DEMO_DATABASE_URL=postgres://... node scripts/seed-demo-data.js                 dry run: shows what it would insert
 *   DEMO_DATABASE_URL=postgres://... node scripts/seed-demo-data.js --apply         insert into an empty demo database
 *   DEMO_DATABASE_URL=postgres://... node scripts/seed-demo-data.js --apply --reset wipe the old demo data and re-seed
 *
 * OPTIONS
 *   --people N     roster size (default 90)
 *   --days N       how many days of history to generate, ending today (default 240)
 *   --end YYYY-MM-DD  last day of generated history (default: today in Chicago)
 *   --seed N       random seed -- the same seed always produces the same data (default 42)
 */

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

// ---------------------------------------------------------------------------------------------
// Config / args
// ---------------------------------------------------------------------------------------------

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const index = args.indexOf(name);
  return index !== -1 && args[index + 1] !== undefined ? args[index + 1] : fallback;
}

const APPLY = args.includes("--apply");
const RESET = args.includes("--reset");
const PEOPLE = Math.max(10, Number(argValue("--people", 90)) || 90);
const DAYS = Math.max(14, Number(argValue("--days", 240)) || 240);
let HISTORY_DAYS = DAYS; // widened in main() so history starts on the 1st of a month
const SEED = Number(argValue("--seed", 42)) || 42;
const TIME_ZONE = "America/Chicago";

function readDemoUrlFromEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return "";
  const line = fs
    .readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .find((row) => row.trim().startsWith("DEMO_DATABASE_URL="));
  return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "") : "";
}

const databaseUrl = process.env.DEMO_DATABASE_URL || readDemoUrlFromEnvFile();
const databaseSsl = String(process.env.DATABASE_SSL || "true").toLowerCase() !== "false";

// ---------------------------------------------------------------------------------------------
// Seeded randomness (so the same --seed gives the same demo every time)
// ---------------------------------------------------------------------------------------------

let rngState = SEED >>> 0;
function rand() {
  // mulberry32
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const chance = (p) => rand() < p;
const pick = (list) => list[Math.floor(rand() * list.length)];
function pickWeighted(entries) {
  // entries: [[value, weight], ...]
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function sample(list, count) {
  return shuffle(list).slice(0, Math.min(count, list.length));
}
function uuid() {
  const hex = Array.from({ length: 32 }, () => Math.floor(rand() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
const roundTo = (value, step) => Math.max(step, Math.round(value / step) * step);

// ---------------------------------------------------------------------------------------------
// Date helpers (ISO YYYY-MM-DD strings, UTC math so there are no DST surprises)
// ---------------------------------------------------------------------------------------------

function todayInChicago() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // en-CA formats as YYYY-MM-DD
}
const END_DATE = argValue("--end", todayInChicago());
if (!/^\d{4}-\d{2}-\d{2}$/.test(END_DATE)) {
  console.error("--end must look like YYYY-MM-DD");
  process.exit(1);
}

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toIso = (date) => date.toISOString().slice(0, 10);
function addDays(iso, days) {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}
const weekday = (iso) => toDate(iso).getUTCDay(); // 0 = Sunday
function diffDays(later, earlier) {
  return Math.round((toDate(later) - toDate(earlier)) / 86400000);
}
function mondayOf(iso) {
  const day = weekday(iso);
  return addDays(iso, day === 0 ? -6 : 1 - day);
}
function nthWeekdayOfMonth(year, month, dayOfWeek, n) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (dayOfWeek - first.getUTCDay() + 7) % 7;
  return toIso(new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7)));
}
function lastWeekdayOfMonth(year, month, dayOfWeek) {
  const last = new Date(Date.UTC(year, month, 0));
  const offset = (last.getUTCDay() - dayOfWeek + 7) % 7;
  return toIso(new Date(Date.UTC(year, month - 1, last.getUTCDate() - offset)));
}
function holidaysFor(year) {
  const thanksgiving = nthWeekdayOfMonth(year, 11, 4, 4);
  return new Set([
    `${year}-01-01`,
    nthWeekdayOfMonth(year, 1, 1, 3), // MLK Day
    lastWeekdayOfMonth(year, 5, 1), // Memorial Day
    `${year}-07-04`,
    nthWeekdayOfMonth(year, 9, 1, 1), // Labor Day
    thanksgiving,
    addDays(thanksgiving, 1),
    `${year}-12-24`,
    `${year}-12-25`,
    `${year}-12-31`,
  ]);
}

// Same idea as server.js's localDateTimeStringToUtcIso: turn a Chicago wall-clock time into UTC.
function chicagoLocalToUtcIso(isoDate, hour, minute) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, part.value]),
  );
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (asIfUtc - guess)).toISOString();
}
const pad2 = (n) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------------------------
// Fake name/place pools
// ---------------------------------------------------------------------------------------------

// No accents/apostrophes on purpose -- the coach-log name matcher strips those characters.
const FIRST_NAMES = {
  male: [
    "Adrian", "Andre", "Angel", "Anthony", "Brandon", "Bryan", "Carlos", "Christian", "Daniel", "Darius",
    "David", "Diego", "Eduardo", "Elijah", "Emmanuel", "Gabriel", "Isaiah", "Ivan", "Jacob", "Jaden",
    "Javier", "Jayden", "Jesus", "Jonathan", "Jordan", "Josue", "Julian", "Kevin", "Leonardo", "Luis",
    "Malik", "Marcus", "Mateo", "Miguel", "Nathan", "Omar", "Oscar", "Rafael", "Ricardo", "Samuel",
    "Sebastian", "Terrell", "Tyler", "Victor", "Xavier",
  ],
  female: [
    "Alejandra", "Alyssa", "Amaya", "Ana", "Andrea", "Ariana", "Brianna", "Camila", "Daniela", "Destiny",
    "Diana", "Elena", "Emily", "Esmeralda", "Evelyn", "Gabriela", "Imani", "Isabella", "Jasmine", "Jazmin",
    "Karina", "Kayla", "Leslie", "Maria", "Mariah", "Melanie", "Monica", "Natalie", "Nia", "Paola",
    "Priscilla", "Sofia", "Stephanie", "Valeria", "Vanessa", "Ximena", "Yesenia", "Zoe",
  ],
  neutral: ["Alex", "Avery", "Jordan", "Riley", "Sam", "Taylor"],
};
const LAST_NAMES = [
  "Acosta", "Aguilar", "Alvarez", "Banks", "Barrera", "Bell", "Campos", "Castillo", "Chavez", "Cruz",
  "Delgado", "Dominguez", "Espinoza", "Flores", "Fuentes", "Garcia", "Gomez", "Gonzalez", "Guerrero", "Gutierrez",
  "Harris", "Hernandez", "Herrera", "Jackson", "Jimenez", "Johnson", "Kowalski", "Lee", "Lopez", "Martinez",
  "Medina", "Mendoza", "Morales", "Moreno", "Nguyen", "Novak", "Ortiz", "Patel", "Perez", "Ramirez",
  "Ramos", "Reyes", "Rios", "Rivera", "Robinson", "Rodriguez", "Romero", "Salazar", "Sanchez", "Santos",
  "Soto", "Torres", "Valdez", "Vargas", "Vasquez", "Walker", "Washington", "Williams", "Wright", "Zamora",
];
const STREETS = [
  "Birchwood Ave", "Lantern St", "Oakview Blvd", "Cedar Crest Ave", "Harborline Dr", "Willowmere St",
  "Foxglove Ave", "Stonebridge Rd", "Maple Hollow St", "Copperfield Ave", "Juniper Park Dr", "Kestrel St",
];
const DIRECTIONS = ["S", "W", "N", "E"];
const ZIPCODES = [
  ["60608", 5], ["60623", 5], ["60632", 4], ["60609", 3], ["60629", 3], ["60616", 2], ["60804", 2], ["60402", 1],
];

// Fictional schools, grouped by grade band. A couple of spelling variants are included on purpose
// so the Roster > School Groups board has something to demonstrate.
const SCHOOLS = {
  elementary: ["Oakwood Elementary School", "Oakwood Elem", "Lakeside Elementary", "Pilsen Park Elementary"],
  middle: ["Harbor Point Middle School", "Crestview Academy", "Lakeside Elementary"],
  high: [
    "Riverside High School", "Riverside High School", "Riverside HS", "Riverside High", "Southgate College Prep",
    "Southgate College Prep", "Northbrook Technical High School", "Westfield Academy High School",
  ],
  college: ["Westbrook Community College", "Lakeshore State University", "N/A"],
  adult: ["N/A", "No School", ""],
};
const SCHOOL_ALIAS_GROUPS = [
  ["Riverside HS", "Riverside High School"],
  ["Riverside High", "Riverside High School"],
  ["Oakwood Elem", "Oakwood Elementary School"],
];

// ZenPlanner-style free text, including a few placeholder spellings the reports bucket as
// Unknown/N/A so those features have something to show.
const ETHNICITIES = [
  ["Hispanic/Latino", 55], ["Black/African American", 20], ["White", 7], ["Two or More Races", 5],
  ["Asian", 3], ["Middle Eastern/North African", 1], ["nospec", 5], ["", 4],
];

// ---------------------------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------------------------

// workDays: 0 = Sunday ... 6 = Saturday. coach: whether they write coach logs.
const STAFF = [
  { name: "Marcus Bell", coach: true, workDays: [1, 2, 3, 4], start: "14:00", end: "20:00" },
  { name: "Elena Ruiz", coach: true, workDays: [2, 3, 4, 5, 6], start: "13:00", end: "19:00" },
  { name: "Tasha Greene", coach: true, workDays: [1, 3, 5, 6], start: "15:00", end: "20:00" },
  { name: "Kevin Nowak", coach: true, workDays: [1, 2, 4, 5], start: "15:00", end: "19:00" },
  { name: "Sam Okafor", coach: false, workDays: [1, 2, 3, 4, 5], start: "10:00", end: "18:00" }, // program director
  { name: "Dana Whitfield", coach: false, workDays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" }, // office admin
];
const COACHES = STAFF.filter((member) => member.coach);

// ---------------------------------------------------------------------------------------------
// Coach-log sentence templates. Each one is written so the app's own keyword matcher (app.js
// activityPatterns/focusPatterns/categoryMap) would detect the same activity/focus if a coach
// typed it -- so the demo behaves like real data if someone edits or re-analyzes a log.
// {A} = one youth, {B} = a second youth (only used by pair templates).
// ---------------------------------------------------------------------------------------------

const TEMPLATES = [
  { activity: "Pad work", focus: ["Counters", "Timing"], minutes: [15, 30], text: "{A} did pad work with me, focusing on counters and timing." },
  { activity: "Pad work", focus: ["Combinations"], minutes: [15, 30], pair: true, text: "Held mitts for {A} and {B} with a focus on combinations." },
  { activity: "Pad work", focus: ["Mechanics"], minutes: [15, 25], text: "Worked pads with {A}, focusing on hip rotation on the hook." },
  { activity: "Bag work", focus: ["Power"], minutes: [15, 30], text: "{A} put in heavy bag rounds with a focus on power." },
  { activity: "Bag work", focus: ["Speed", "Accuracy"], minutes: [15, 25], text: "{A} did bag work focused on hand speed and accuracy." },
  { activity: "Sparring", focus: ["Distance control", "Defense"], minutes: [10, 25], pair: true, text: "{A} and {B} sparred a few rounds, focusing on distance and defense." },
  { activity: "Sparring", focus: ["Pressure", "Ring awareness"], minutes: [10, 20], text: "{A} had live rounds today with a focus on pressure and ring awareness." },
  { activity: "Footwork", focus: ["Balance"], minutes: [10, 20], text: "{A} worked on footwork on the ladder with a focus on balance." },
  { activity: "Footwork", focus: ["Footwork"], minutes: [10, 20], pair: true, text: "{A} and {B} worked on footwork, focusing on pivots and angles." },
  { activity: "Shadow boxing", focus: ["Rhythm"], minutes: [10, 15], text: "{A} did shadow boxing focused on rhythm." },
  { activity: "Blocking and defense", focus: ["Defense", "Counters"], minutes: [15, 25], text: "Worked on blocking with {A}, focusing on slips and counters." },
  { activity: "Combinations", focus: ["Combinations", "Speed"], minutes: [15, 20], text: "{A} drilled combinations with a focus on speed." },
  { activity: "Technique drills", focus: ["Mechanics"], minutes: [15, 30], text: "{A} went through technique drills focusing on mechanics." },
  { activity: "Conditioning", focus: ["Strength and conditioning"], minutes: [15, 30], text: "{A} finished the conditioning circuit with a focus on endurance." },
  { activity: "Strength training", focus: ["Strength and conditioning"], minutes: [15, 25], text: "{A} did strength training with calisthenics." },
  { activity: "Running", focus: ["Speed"], minutes: [10, 20], text: "{A} ran sprints outside with a focus on speed." },
  { activity: "Warm-up", focus: ["Teamwork"], minutes: [10, 15], text: "{A} led the group warm-up and stretching, focusing on leadership." },
  { activity: "School support", focus: [], minutes: [20, 45], text: "Helped {A} with math homework before training." },
  { activity: "School support", focus: [], minutes: [20, 40], text: "{A} got tutoring on a reading assignment for school." },
  { activity: "Mentoring conversation", focus: ["Confidence"], minutes: [10, 20], text: "Talked with {A} about staying calm and confident before the tournament." },
  { activity: "Mentoring conversation", focus: [], minutes: [10, 20], text: "Had a conversation with {A} about college applications and gave some advice." },
  { activity: "Mentoring conversation", focus: [], minutes: [10, 15], text: "Talked with {A} about a job application and resume." },
  { activity: "Wellness check-in", focus: [], minutes: [10, 15], text: "Did a wellness check-in with {A} about sleep and stress." },
  { activity: "Wellness check-in", focus: [], minutes: [10, 15], text: "{A} and I talked about hydration and recovery after a long week." },
];
const CLOSERS = [
  "Good energy in the gym overall.",
  "Group was locked in today.",
  "Smaller group because of the weather.",
  "Everyone stayed for cool-down.",
  "",
  "",
];

// Same keyword lists as app.js categoryMap -- used to fill assistant_draft.possibleCategories.
const CATEGORY_KEYWORDS = {
  "Beyond the Ropes": ["technique", "mechanics", "skill", "boxing", "jab", "cross", "hook", "uppercut", "footwork", "pivot", "defense", "guard", "spar", "sparring", "pads", "mitts", "bag", "shadow boxing", "conditioning", "cardio", "strength", "workout", "training", "drills"],
  "Fighting Side by Side": ["talked", "conversation", "check-in", "check in", "advice", "mentor", "supported", "encouraged", "listened", "trust", "relationship", "teamwork", "helped"],
  "Feel Good, Fight Strong": ["health", "wellness", "nutrition", "hydration", "sleep", "rest", "recovery", "self-care", "mental health", "stress", "anxiety", "confidence", "stretching", "warm up", "cool down", "breathing"],
  "Fighting for My Future": ["homework", "school", "teacher", "grades", "gpa", "attendance", "study", "tutoring", "reading", "math", "writing", "college", "career", "job", "resume", "application", "graduation"],
};
function detectCategories(text) {
  const lower = text.toLowerCase();
  return Object.entries(CATEGORY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => lower.includes(keyword)))
    .map(([label]) => label);
}
const normalizeForRowId = (value) => String(value).toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
// Same as server.js normalizeName.
const normalizeName = (value) => String(value || "").replace(/[^A-Za-z'\-\s]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

// ---------------------------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------------------------

function generateRoster(startDate) {
  const people = [];
  const usedNames = new Set();

  while (people.length < PEOPLE) {
    const gender = pickWeighted([["Male", 58], ["Female", 36], ["Non-binary", 2], ["nospec", 3], ["M", 1]]);
    const pool = gender === "Female" ? FIRST_NAMES.female : gender === "Male" || gender === "M" ? FIRST_NAMES.male : [...FIRST_NAMES.neutral, ...FIRST_NAMES.male, ...FIRST_NAMES.female];
    const firstName = pick(pool);
    const lastName = pick(LAST_NAMES);
    const fullName = `${firstName} ${lastName}`;
    if (usedNames.has(normalizeName(fullName))) continue;
    usedNames.add(normalizeName(fullName));

    const age = pickWeighted([
      [randInt(8, 10), 14], [randInt(11, 13), 22], [randInt(14, 17), 34], [randInt(18, 24), 16], [randInt(25, 52), 14],
    ]);
    const band = age <= 10 ? "elementary" : age <= 13 ? "middle" : age <= 17 ? "high" : age <= 22 ? "college" : "adult";
    const birthDate = addDays(END_DATE, -(age * 365 + randInt(15, 350)));

    // Most people were members before the demo window starts; some join partway through; a few
    // stop coming, so the attendance/tenure reports show movement.
    const joinedEarlier = chance(0.62);
    const firstAttDate = joinedEarlier ? addDays(startDate, -randInt(30, 1400)) : addDays(startDate, randInt(0, HISTORY_DAYS - 10));
    const leaveDate = chance(0.12) ? addDays(startDate, randInt(40, HISTORY_DAYS - 20)) : null;

    const regularDays = sample([1, 2, 3, 4, 5], randInt(2, 5));
    const competitionTeam = age >= 13 && age <= 30 && chance(0.14);

    people.push({
      id: uuid(),
      firstName,
      lastName,
      fullName,
      normalizedName: normalizeName(fullName),
      gender,
      age,
      birthDate,
      address: `${randInt(1200, 4899)} ${pick(DIRECTIONS)} ${pick(STREETS)}`,
      zipcode: pickWeighted(ZIPCODES),
      raceEthnicity: pickWeighted(ETHNICITIES),
      school: chance(0.05) ? "" : pick(SCHOOLS[band]),
      firstAttDate,
      activeFrom: firstAttDate > startDate ? firstAttDate : startDate,
      activeUntil: leaveDate,
      regularDays,
      commitment: 0.45 + rand() * 0.45, // chance they show up on one of their regular days
      saturdays: chance(0.3),
      competitionTeam,
      className: competitionTeam ? "Competition Team" : age <= 17 ? "Youth Boxing" : "Adult Boxing",
    });
  }
  return people;
}

function programDays(startDate) {
  const days = [];
  const holidays = new Set([...holidaysFor(Number(startDate.slice(0, 4))), ...holidaysFor(Number(END_DATE.slice(0, 4)))]);
  for (let i = 0; i < HISTORY_DAYS; i += 1) {
    const date = addDays(startDate, i);
    const day = weekday(date);
    if (day === 0 || holidays.has(date)) continue;
    if (chance(0.015)) continue; // the odd unplanned closure (weather, building issue)
    days.push(date);
  }
  return days;
}

function generateAttendance(people, days) {
  const events = [];
  const attendeesByDay = new Map();

  for (const date of days) {
    const day = weekday(date);
    const month = Number(date.slice(5, 7));
    const summerBoost = month >= 6 && month <= 8 ? 0.1 : 0;
    const attendees = [];

    for (const person of people) {
      if (date < person.activeFrom) continue;
      if (person.activeUntil && date > person.activeUntil) continue;

      let probability;
      if (day === 6) probability = person.saturdays ? 0.55 : 0.04;
      else if (person.regularDays.includes(day)) probability = person.commitment + (person.age <= 17 ? summerBoost : 0);
      else probability = 0.07;
      if (person.competitionTeam && (day === 2 || day === 4)) probability = Math.max(probability, 0.85);
      // A new member's very first day always counts, so first_att_date lines up with a check-in.
      if (date === person.firstAttDate) probability = 1;
      if (!chance(Math.min(probability, 0.97))) continue;

      const hour = day === 6 ? randInt(9, 11) : person.age <= 17 ? randInt(15, 17) : randInt(17, 19);
      const minute = randInt(0, 59);
      const localStamp = `${date}T${pad2(hour)}:${pad2(minute)}`;
      const className = day === 6 ? "Saturday Open Gym" : person.className;
      const attendanceId = uuid();

      events.push({
        id: uuid(),
        externalId: attendanceId,
        person,
        receivedAt: chicagoLocalToUtcIso(date, hour, minute),
        attendanceDate: date,
        className,
        raw: {
          demoSeed: true,
          attendanceId,
          personId: person.id,
          firstName: person.firstName,
          lastName: person.lastName,
          name: className,
          beginDate: localStamp,
          timestamp: localStamp,
          timeZone: TIME_ZONE,
          source: "zen-planner",
        },
      });
      attendees.push(person);
    }
    attendeesByDay.set(date, attendees);
  }
  return { events, attendeesByDay };
}

function buildLog(coach, date, attendees) {
  const youth = sample(attendees, randInt(2, Math.min(5, attendees.length)));
  const sentences = [];
  const activities = [];
  const mentions = [];

  // Refer to people by full name most of the time, "First L." sometimes (both forms are ones the
  // log page's name matcher recognizes), unless the short form would be ambiguous in the roster.
  const displayName = (person) => (person.shortNameUnique && chance(0.3) ? `${person.firstName} ${person.lastName[0]}.` : person.fullName);

  const usedTemplates = new Set(); // don't repeat the same sentence twice in one log
  const nextTemplate = (filter) => {
    const options = TEMPLATES.filter((t) => filter(t) && !usedTemplates.has(t));
    const template = pick(options.length ? options : TEMPLATES.filter(filter));
    usedTemplates.add(template);
    return template;
  };

  let queue = [...youth];
  while (queue.length) {
    const canPair = queue.length >= 2;
    const template = nextTemplate((t) => !t.pair || canPair);
    const people = template.pair ? queue.splice(0, 2) : queue.splice(0, 1);
    const names = people.map(displayName);
    let text = template.text.replace("{A}", names[0]);
    if (template.pair) text = text.replace("{B}", names[1]);
    sentences.push({ text, template, people, names });

    // Now and then the same kid gets a second activity (e.g. pads, then a homework check).
    if (!template.pair && chance(0.2)) {
      const followUp = nextTemplate((t) => !t.pair && t.activity !== template.activity);
      sentences.push({ text: followUp.text.replace("{A}", names[0]), template: followUp, people, names });
    }
  }
  const closer = pick(CLOSERS);

  let response = "";
  sentences.forEach((sentence) => {
    const offset = response ? response.length + 1 : 0;
    response = response ? `${response} ${sentence.text}` : sentence.text;
    sentence.people.forEach((person, personIndex) => {
      const name = sentence.names[personIndex];
      const index = offset + sentence.text.indexOf(name);
      mentions.push({ matchedText: name.replace(/\.$/, ""), index, status: "matched", matches: [{ id: person.id, name: person.fullName }] });
      const [min, max] = sentence.template.minutes;
      activities.push({
        rowId: `${person.id}:${index}:0:${normalizeForRowId(sentence.template.activity)}`,
        youthId: person.id,
        youthName: person.fullName,
        minutes: roundTo(randInt(min, max), 5),
        minutesSource: "manual",
        activity: sentence.template.activity,
        activitySource: "detected-from-response",
        activityModifier: sentence.template.focus.join(", "),
        sourceClause: sentence.text,
        sourceSentence: sentence.text,
      });
    });
  });
  if (closer) response = `${response} ${closer}`;

  // Logs get written that evening, after the gym closes.
  const receivedAt = chicagoLocalToUtcIso(date, randInt(19, 21), randInt(0, 59));
  const assistantDraft = {
    possibleYouth: mentions.sort((a, b) => a.index - b.index),
    possibleCategories: detectCategories(response),
    sentenceCount: sentences.length + (closer ? 1 : 0),
  };
  const id = uuid();
  const log = {
    id,
    receivedAt,
    coach: coach.name,
    sessionDate: date,
    response,
    confirmedActivities: activities,
    assistantDraft,
    savedAt: null,
    demoSeed: true,
  };
  return log;
}

function generateLogs(days, attendeesByDay) {
  const logs = [];
  for (const date of days) {
    const attendees = attendeesByDay.get(date) || [];
    if (attendees.length < 2) continue;
    for (const coach of COACHES) {
      if (!coach.workDays.includes(weekday(date))) continue;
      if (!chance(0.72)) continue; // coaches don't log every single shift
      logs.push(buildLog(coach, date, attendees));
    }
  }
  return logs;
}

function generateGrants(currentYear) {
  const funders = [
    ["Youth Athletics Operating Grant", "Lakeshore Community Foundation", 60000],
    ["After-School Enrichment Program", "Midwest Youth Opportunity Fund", 45000],
    ["Healthy Kids Initiative", "Great Lakes Health Alliance", 25000],
    ["Community Safety & Mentoring", "Northside Family Trust", 75000],
    ["Equipment Renewal Grant", "Summit Bank Community Giving", 12000],
    ["Summer Youth Programming", "City Youth Services Partnership", 90000],
    ["College & Career Readiness", "Riverbend Education Fund", 30000],
    ["Capacity Building Award", "Prairie Philanthropy Network", 50000],
    ["Girls in Sports Fund", "Heartland Women's Giving Circle", 15000],
    ["Neighborhood Wellness Mini-Grant", "Westside Neighbors Association", 5000],
    ["Tournament Travel Support", "Great Lakes Amateur Athletics Council", 8000],
    ["Mental Health in Sports Pilot", "Lighthouse Health Foundation", 40000],
  ];
  const statusPlans = [
    ["Awarded", "Confirmed"], ["Awarded", "Confirmed"], ["Awarded", "Confirmed"], ["Awarded", "Confirmed"],
    ["Submitted", "Optimistic"], ["Submitted", "Hopeful"], ["Submitted", "Optimistic"],
    ["Not Started", "Hopeful"], ["Not Started", "Reach"], ["Not Started", "Reach"],
    ["Rejected", "Unlikely"], ["Submitted", "Reach"],
  ];
  const noteOptions = {
    Awarded: ["Reporting due at end of grant period.", "Multi-year -- renewal expected.", "Includes a site visit in Q3."],
    Submitted: ["Program officer asked for updated attendance numbers.", "Decision expected next quarter.", ""],
    "Not Started": ["LOI first, full proposal by invitation.", "Need board list and audited financials.", ""],
    Rejected: ["Feedback: reapply next cycle with outcome data."],
  };

  const grants = [];
  for (const year of [currentYear - 1, currentYear]) {
    const plans = year === currentYear ? shuffle(statusPlans) : statusPlans.map(() => (chance(0.75) ? ["Awarded", "Confirmed"] : ["Rejected", "Unlikely"]));
    funders.forEach(([name, org, base], index) => {
      if (year < currentYear && chance(0.35)) return;
      const [status, confidence] = plans[index];
      const quarter = randInt(1, 4);
      const opens = `${year}-${pad2((quarter - 1) * 3 + 1)}-${pad2(randInt(1, 20))}`;
      const closes = addDays(opens, randInt(30, 75));
      grants.push({
        id: uuid(),
        name,
        org,
        status,
        confidence,
        year,
        quarter,
        amount: roundTo(base * (0.8 + rand() * 0.5), 500),
        appOpens: opens,
        appCloses: closes,
        submittedDate: status === "Not Started" ? null : addDays(closes, -randInt(1, 14)),
        notes: pick(noteOptions[status]),
      });
    });
  }
  return grants;
}

function generateExpenses(currentYear, grants, endDate) {
  const awarded = grants.filter((grant) => grant.year === currentYear && grant.status === "Awarded");
  const items = [
    ["Equipment", "Boxing gloves (12 pairs)", 540], ["Equipment", "Heavy bag replacement", 320], ["Equipment", "Hand wraps, bulk order", 180],
    ["Equipment", "Headgear for sparring", 460], ["Program Supplies", "First aid kit restock", 95], ["Program Supplies", "Jump ropes and cones", 140],
    ["Facility & Rent", "Monthly gym rent", 2800], ["Travel & Transportation", "Van rental for regional tournament", 610],
    ["Travel & Transportation", "Transit passes for team travel", 220], ["Food & Nutrition", "Post-practice snacks", 160],
    ["Food & Nutrition", "Tournament day team lunch", 240], ["Coaching & Staff", "USA Boxing coach certification fees", 350],
    ["Uniforms & Apparel", "Team t-shirts", 480], ["Uniforms & Apparel", "Competition trunks and tank tops", 620],
    ["Office & Admin", "Printer ink and paper", 85], ["Office & Admin", "Scheduling software subscription", 60],
    ["Fundraising & Events", "Fundraiser venue deposit", 750], ["Fundraising & Events", "Raffle prizes", 200],
  ];
  const cardholders = STAFF.filter((member) => !member.coach).map((member) => member.name).concat(["Marcus Bell"]);
  const expenses = [];
  const monthsSoFar = Number(endDate.slice(5, 7));
  for (let month = 1; month <= monthsSoFar; month += 1) {
    expenses.push({ category: "Facility & Rent", description: `Monthly gym rent (${new Date(Date.UTC(currentYear, month - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })})`, amount: 2800 });
    sample(items.filter(([category]) => category !== "Facility & Rent"), randInt(2, 4)).forEach(([category, description, base]) => {
      expenses.push({ category, description, amount: Math.round(base * (0.8 + rand() * 0.4) * 100) / 100 });
    });
  }
  return expenses.map((expense) => ({
    id: uuid(),
    year: currentYear,
    ...expense,
    note: chance(0.2) ? pick(["Split with another program.", "Reimbursed to staff.", "Receipt in shared drive."]) : "",
    cardholder: pick(cardholders),
    paymentMethod: pickWeighted([["Org Debit Card", 5], ["Org Credit Card", 3], ["Check", 2], ["Petty Cash", 1]]),
    grantId: awarded.length && chance(0.8) ? pick(awarded).id : null,
  }));
}

function generatePto(endDate) {
  const requests = [];
  const notes = ["Family trip", "Doctor appointment", "Moving day", "Wedding out of town", "", ""];
  STAFF.forEach((member) => {
    const count = randInt(1, 2);
    for (let i = 0; i < count; i += 1) {
      const future = chance(0.45);
      const start = addDays(endDate, future ? randInt(5, 60) : -randInt(5, 120));
      const length = pickWeighted([[0, 4], [1, 2], [2, 1], [4, 1]]);
      requests.push({
        id: uuid(),
        staffName: member.name,
        startDate: start,
        endDate: addDays(start, length),
        leaveType: pickWeighted([["Vacation", 5], ["Sick", 2], ["Personal", 2], ["Unpaid", 1]]),
        note: pick(notes),
        status: future ? pickWeighted([["pending", 3], ["approved", 2]]) : pickWeighted([["approved", 6], ["denied", 1]]),
      });
    }
  });
  return requests;
}

function generateMileage(endDate) {
  const trips = [
    ["Drove equipment to Riverside High School after-school site", "Club gym", "Riverside High School", 6],
    ["Team pickup for regional tournament", "Club gym", "Great Lakes Sports Complex", 28],
    ["Picked up snacks and supplies", "Club gym", "Warehouse store", 9],
    ["Partner meeting at community center", "Club gym", "Westside Community Center", 5],
    ["Drove equipment to Southgate College Prep site", "Club gym", "Southgate College Prep", 11],
    ["Bank deposit and office supply run", "Club gym", "Bank branch", 4],
  ];
  const drivers = STAFF.map((member) => member.name);
  return Array.from({ length: 14 }, () => {
    const [purpose, startAddress, endAddress, baseMiles] = pick(trips);
    const roundTrip = chance(0.6);
    const tripDate = addDays(endDate, -randInt(0, 100));
    const status = diffDays(endDate, tripDate) < 10 ? "pending" : pickWeighted([["approved", 8], ["denied", 1], ["pending", 1]]);
    return {
      id: uuid(),
      staffName: pick(drivers),
      tripDate,
      purpose,
      miles: Math.round(baseMiles * (roundTrip ? 2 : 1) * (0.9 + rand() * 0.2) * 10) / 10,
      note: roundTrip ? "Round trip" : "",
      startAddress,
      endAddress,
      status,
    };
  });
}

function generateSchedule(endDate) {
  const thisMonday = mondayOf(endDate);
  const weeks = [];
  for (let offset = -4; offset <= 2; offset += 1) {
    const startDate = addDays(thisMonday, offset * 7);
    const week = { id: uuid(), startDate, shifts: [] };
    for (let i = 0; i < 7; i += 1) {
      const date = addDays(startDate, i);
      STAFF.forEach((member) => {
        if (!member.workDays.includes(weekday(date))) return;
        if (chance(0.05)) return; // swapped/covered shift
        const saturday = weekday(date) === 6;
        week.shifts.push({
          id: uuid(),
          staffName: member.name,
          shiftDate: date,
          startTime: saturday ? "09:00" : member.start,
          endTime: saturday ? "13:00" : member.end,
        });
      });
    }
    weeks.push(week);
  }
  return weeks;
}

// ---------------------------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------------------------

const APP_TABLES = [
  "coach_log_activities", "coach_logs", "attendance_events", "roster_people", "school_aliases",
  "grant_receipt_items", "grant_receipts", "grant_expenses", "grant_goals", "grants", "receipt_options",
  "log_pattern_phrases", "log_pattern_suggestions", "log_pattern_review_state",
  "mileage_request_photos", "mileage_requests", "pto_requests", "schedule_shifts", "schedule_weeks", "staff_members",
];

async function insertRows(client, table, columns, rows, casts = {}) {
  const CHUNK = 500;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const values = [];
    const placeholders = chunk.map((row) => {
      const cells = row.map((value, index) => {
        values.push(value);
        const cast = casts[columns[index]];
        return cast ? `$${values.length}::${cast}` : `$${values.length}`;
      });
      return `(${cells.join(", ")})`;
    });
    await client.query(`insert into ${table} (${columns.join(", ")}) values ${placeholders.join(", ")}`, values);
  }
}

async function safetyChecks(pool) {
  const missing = [];
  for (const table of APP_TABLES) {
    const result = await pool.query("select to_regclass($1) as name", [table]);
    if (!result.rows[0].name) missing.push(table);
  }
  if (missing.length) {
    throw new Error(
      `These tables don't exist yet: ${missing.join(", ")}.\n` +
        "Start the app once against the demo database so it creates them (DATABASE_URL=<demo url> npm start), then rerun this.",
    );
  }

  const counts = (
    await pool.query(`
      select
        (select count(*)::int from roster_people where coalesce(raw_payload->>'demoSeed', '') <> 'true') as real_roster,
        (select count(*)::int from attendance_events where coalesce(raw_payload->>'demoSeed', '') <> 'true') as real_attendance,
        (select count(*)::int from coach_logs where coalesce(raw_payload->>'demoSeed', '') <> 'true') as real_logs,
        (select count(*)::int from roster_people where raw_payload->>'demoSeed' = 'true') as demo_roster,
        (select count(*)::int from coach_logs where raw_payload->>'demoSeed' = 'true') as demo_logs,
        (select count(*)::int from staff_members where not (name = any($1::text[]))) as other_staff
    `, [STAFF.map((member) => member.name)])
  ).rows[0];

  const realRows = counts.real_roster + counts.real_attendance + counts.real_logs;
  if (realRows > 0 || counts.other_staff > 0) {
    throw new Error(
      "STOPPING: this database already has data this script didn't create " +
        `(${counts.real_roster} roster, ${counts.real_attendance} attendance, ${counts.real_logs} logs, ${counts.other_staff} other staff).\n` +
        "It may be a real database. Point DEMO_DATABASE_URL at a separate, empty demo database instead.",
    );
  }
  return { hasDemoData: counts.demo_roster + counts.demo_logs > 0 };
}

async function writeEverything(client, data) {
  const { people, attendance, logs, grants, expenses, pto, mileage, schedule, currentYear } = data;

  // Staff (feeds the coach dropdown on the log form and the Resources tab).
  await insertRows(client, "staff_members", ["id", "name", "active", "sort_order"], STAFF.map((member, index) => [uuid(), member.name, true, index]));

  // Roster -- first/last seen and attendance counts line up with the generated check-ins.
  const statsById = new Map();
  attendance.events.forEach((event) => {
    const stats = statsById.get(event.person.id) || { count: 0, first: event.receivedAt, last: event.receivedAt };
    stats.count += 1;
    if (event.receivedAt < stats.first) stats.first = event.receivedAt;
    if (event.receivedAt > stats.last) stats.last = event.receivedAt;
    statsById.set(event.person.id, stats);
  });
  await insertRows(
    client,
    "roster_people",
    ["id", "full_name", "normalized_name", "aliases", "first_seen_at", "last_seen_at", "attendance_count", "roster_status", "raw_payload", "birth_date", "age", "address", "first_att_date", "race_ethnicity", "zipcode", "school", "gender"],
    people.map((person) => {
      const stats = statsById.get(person.id);
      return [
        person.id, person.fullName, person.normalizedName, "[]", stats?.first || null, stats?.last || null, stats?.count || 0,
        "manual-import", JSON.stringify({ demoSeed: true, source: "seed-demo-data" }), person.birthDate, person.age, person.address,
        person.firstAttDate, person.raceEthnicity, person.zipcode, person.school, person.gender,
      ];
    }),
    { aliases: "jsonb", raw_payload: "jsonb" },
  );

  await insertRows(
    client,
    "school_aliases",
    ["id", "normalized_alias", "raw_alias", "canonical_name"],
    SCHOOL_ALIAS_GROUPS.map(([alias, canonical]) => [uuid(), alias.trim().toLowerCase(), alias, canonical]),
  );

  await insertRows(
    client,
    "attendance_events",
    ["id", "external_id", "full_name", "normalized_name", "received_at", "attendance_date", "person_id", "class_name", "source", "raw_payload"],
    attendance.events.map((event) => [
      event.id, event.externalId, event.person.fullName, event.person.normalizedName, event.receivedAt, event.attendanceDate,
      event.person.id, event.className, "zen-planner", JSON.stringify(event.raw),
    ]),
    { raw_payload: "jsonb" },
  );

  await insertRows(
    client,
    "coach_logs",
    ["id", "received_at", "coach", "session_date", "response", "assistant_draft", "raw_payload"],
    logs.map((log) => [log.id, log.receivedAt, log.coach, log.sessionDate, log.response, JSON.stringify(log.assistantDraft), JSON.stringify(log)]),
    { assistant_draft: "jsonb", raw_payload: "jsonb" },
  );
  await insertRows(
    client,
    "coach_log_activities",
    ["id", "coach_log_id", "row_id", "youth_id", "youth_name", "minutes", "minutes_source", "activity", "activity_source", "activity_modifier", "source_clause", "source_sentence"],
    logs.flatMap((log) =>
      log.confirmedActivities.map((activity) => [
        uuid(), log.id, activity.rowId, activity.youthId, activity.youthName, activity.minutes, activity.minutesSource,
        activity.activity, activity.activitySource, activity.activityModifier, activity.sourceClause, activity.sourceSentence,
      ]),
    ),
  );

  // Grants
  await insertRows(
    client,
    "grants",
    ["id", "name", "org", "status", "confidence", "year", "quarter", "amount", "app_opens", "app_closes", "submitted_date", "notes"],
    grants.map((grant) => [grant.id, grant.name, grant.org, grant.status, grant.confidence, grant.year, grant.quarter, grant.amount, grant.appOpens, grant.appCloses, grant.submittedDate, grant.notes]),
  );
  await insertRows(client, "grant_goals", ["year", "goal_amount"], [[currentYear - 1, 350000], [currentYear, 425000]]);
  await insertRows(
    client,
    "grant_expenses",
    ["id", "year", "category", "description", "amount", "note", "cardholder", "payment_method", "grant_id"],
    expenses.map((expense) => [expense.id, expense.year, expense.category, expense.description, expense.amount, expense.note, expense.cardholder, expense.paymentMethod, expense.grantId]),
  );
  const cardholders = [...new Set(expenses.map((expense) => expense.cardholder))].sort();
  const paymentMethods = ["Org Debit Card", "Org Credit Card", "Check", "Petty Cash"];
  await insertRows(
    client,
    "receipt_options",
    ["id", "kind", "name", "sort_order"],
    [...cardholders.map((name, index) => [uuid(), "cardholder", name, index]), ...paymentMethods.map((name, index) => [uuid(), "payment_method", name, index])],
  );

  // Resources: PTO, mileage, schedule
  await insertRows(
    client,
    "pto_requests",
    ["id", "staff_name", "start_date", "end_date", "leave_type", "note", "status", "reviewed_at"],
    pto.map((request) => [request.id, request.staffName, request.startDate, request.endDate, request.leaveType, request.note, request.status, request.status === "pending" ? null : new Date().toISOString()]),
  );
  await insertRows(
    client,
    "mileage_requests",
    ["id", "staff_name", "trip_date", "purpose", "miles", "note", "status", "start_address", "end_address", "reviewed_at"],
    mileage.map((trip) => [trip.id, trip.staffName, trip.tripDate, trip.purpose, trip.miles, trip.note, trip.status, trip.startAddress, trip.endAddress, trip.status === "pending" ? null : new Date().toISOString()]),
  );
  await insertRows(client, "schedule_weeks", ["id", "start_date"], schedule.map((week) => [week.id, week.startDate]));
  await insertRows(
    client,
    "schedule_shifts",
    ["id", "week_id", "staff_name", "shift_date", "start_time", "end_time"],
    schedule.flatMap((week) => week.shifts.map((shift) => [shift.id, week.id, shift.staffName, shift.shiftDate, shift.startTime, shift.endTime])),
  );
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

async function main() {
  if (!databaseUrl) {
    console.error(
      "Set DEMO_DATABASE_URL to your demo database's connection string (env var or a line in .env).\n" +
        "This script intentionally ignores DATABASE_URL so it can never write to the real database by accident.",
    );
    process.exit(1);
  }

  // Start on the 1st of a month so the monthly attendance-rate report never opens on a stub month.
  const startDate = `${addDays(END_DATE, -(DAYS - 1)).slice(0, 7)}-01`;
  HISTORY_DAYS = diffDays(END_DATE, startDate) + 1;
  const currentYear = Number(END_DATE.slice(0, 4));

  // Generate everything in memory first.
  const people = generateRoster(startDate);
  const shortNameCounts = new Map();
  people.forEach((person) => {
    const key = normalizeName(`${person.firstName} ${person.lastName[0]}`);
    shortNameCounts.set(key, (shortNameCounts.get(key) || 0) + 1);
  });
  people.forEach((person) => {
    person.shortNameUnique = shortNameCounts.get(normalizeName(`${person.firstName} ${person.lastName[0]}`)) === 1;
  });
  const days = programDays(startDate);
  const attendance = generateAttendance(people, days);
  const logs = generateLogs(days, attendance.attendeesByDay);
  const grants = generateGrants(currentYear);
  const expenses = generateExpenses(currentYear, grants, END_DATE);
  const pto = generatePto(END_DATE);
  const mileage = generateMileage(END_DATE);
  const schedule = generateSchedule(END_DATE);
  const data = { people, attendance, logs, grants, expenses, pto, mileage, schedule, currentYear };

  const activityCount = logs.reduce((sum, log) => sum + log.confirmedActivities.length, 0);
  console.log(`Demo data plan (${startDate} to ${END_DATE}, seed ${SEED}):`);
  console.table({
    "Staff members": STAFF.length,
    "Roster people": people.length,
    "Program days": days.length,
    "Attendance check-ins": attendance.events.length,
    "Coach logs": logs.length,
    "Log activity rows": activityCount,
    Grants: grants.length,
    Expenses: expenses.length,
    "PTO requests": pto.length,
    "Mileage requests": mileage.length,
    "Schedule weeks": schedule.length,
  });
  console.log("\nSample coach log:");
  console.log(`  ${logs[logs.length - 1].sessionDate} -- ${logs[logs.length - 1].coach}: "${logs[logs.length - 1].response}"`);

  const pool = new Pool({ connectionString: databaseUrl, ssl: databaseSsl ? { rejectUnauthorized: false } : false });
  try {
    const { hasDemoData } = await safetyChecks(pool);

    if (!APPLY) {
      console.log(`\nDry run only -- nothing was written. Rerun with --apply${hasDemoData ? " --reset" : ""} to insert this data.`);
      return;
    }
    if (hasDemoData && !RESET) {
      console.error("\nThis demo database already has seeded data. Rerun with --apply --reset to wipe it and re-seed.");
      process.exitCode = 1;
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("begin");
      if (RESET) {
        await client.query(`truncate ${APP_TABLES.join(", ")} restart identity cascade`);
        console.log("\nCleared the previous demo data.");
      }
      await writeEverything(client, data);
      await client.query("commit");
      console.log("\nDone. Demo data inserted -- open the dashboard to see it.");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
