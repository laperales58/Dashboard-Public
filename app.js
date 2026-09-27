// Filled from /api/coaches (the Staff list managed on the dashboard) on page load -- never
// hardcode staff names here, since this file is served publicly without a login.
const coaches = [];

// Filled from /api/roster on page load -- never hardcode participant names here, since this
// file is served publicly without a login.
let roster = [];

const state = {
  savedAt: null,
  attemptedSubmit: false,
  saving: false,
  saveError: "",
};

const form = document.querySelector("#log-form");
const coachSelect = document.querySelector("#coach");
const dateInput = document.querySelector("#session-date");
const responseInput = document.querySelector("#coach-response");
const nameSuggestions = document.querySelector("#name-suggestions");
const participantList = document.querySelector("#participant-list");
const rosterNameOptions = document.querySelector("#roster-name-options");
const focusOptionsEl = document.querySelector("#focus-options");
const addManualEntryButton = document.querySelector("#add-manual-entry");
const flagsEl = document.querySelector("#flags");
const entryStatus = document.querySelector("#entry-status");
const submittedPanel = document.querySelector("#submitted-panel");
const newLogButton = document.querySelector("#new-log");

// ---- Top-level page tabs (Logs / PTO & Mileage / Schedule) -----------------------------------
// The landing page used to be just the log form, with PTO/Mileage/Schedule living on a separate
// /resources.html page. They're now tabs on this same page so coaches don't have to navigate away
// -- see the nav.tab-bar right under the topbar in index.html. Mirrors the same data-tabs /
// tab-button toggle pattern admin.js's setActiveTab uses. resources.js (loaded right after this
// file) owns the nested "PTO Requests" / "Mileage" sub-tabs inside the "pto-mileage" tab, plus all
// of the PTO/mileage/schedule data loading -- this only controls which top-level tab is visible.
const pageTabButtons = document.querySelectorAll(".tab-button[data-tab]");
const pageTabTargets = document.querySelectorAll("[data-tabs]");
const VALID_PAGE_TABS = ["logs", "pto-mileage", "schedule"];

function setActivePageTab(tab) {
  const nextTab = VALID_PAGE_TABS.includes(tab) ? tab : "logs";

  pageTabTargets.forEach((el) => {
    el.classList.toggle("hidden", el.dataset.tabs !== nextTab);
  });

  pageTabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === nextTab);
  });

  if (window.location.hash.slice(1) !== nextTab) {
    history.replaceState(null, "", `#${nextTab}`);
  }
}

pageTabButtons.forEach((button) => {
  button.addEventListener("click", () => setActivePageTab(button.dataset.tab));
});

setActivePageTab(window.location.hash.slice(1));

const activityPatterns = [
  { label: "Pad work", patterns: [/\bpads?\b/i, /\bmitts?\b/i, /\bpadwork\b/i] },
  { label: "Footwork", patterns: [/\bfootwork\b/i, /\bladder\b/i, /\bpivot/i] },
  { label: "Sparring", patterns: [/\bspar/i, /\blive rounds?\b/i] },
  { label: "Boxing class", patterns: [/\bboxing class\b/i, /\bboxing session\b/i] },
  { label: "Shadow boxing", patterns: [/\bshadow\s*boxing\b/i, /\bshadow\s*box/i] },
  { label: "Bag work", patterns: [/\bbag work\b/i, /\bheavy bag\b/i, /\bbag\b/i] },
  { label: "Blocking and defense", patterns: [/\bblocking\b/i, /\bdefense\b/i, /\bguard\b/i, /\bslip/i, /\broll/i] },
  { label: "Combinations", patterns: [/\bcombinations?\b/i, /\bcombo/i] },
  { label: "Technique drills", patterns: [/\btechnique\b/i, /\bdrills?\b/i, /\bmechanics\b/i] },
  { label: "Conditioning", patterns: [/\bconditioning\b/i, /\bcardio\b/i, /\bworkout\b/i, /\bcircuit\b/i] },
  { label: "Strength training", patterns: [/\bstrength\b/i, /\bweights?\b/i, /\bcalisthenics\b/i] },
  { label: "Running", patterns: [/\brunning\b/i, /\bran\b/i, /\bjog/i, /\bsprints?\b/i] },
  { label: "Warm-up", patterns: [/\bwarm-?ups?\b/i, /\bstretching\b/i] },
  { label: "Cool-down", patterns: [/\bcool-?downs?\b/i] },
  { label: "Open gym", patterns: [/\bopen gym\b/i] },
  { label: "School support", patterns: [/\bhomework\b/i, /\bschool\b/i, /\bcollege\b/i, /\btutoring\b/i] },
  { label: "Mentoring conversation", patterns: [/\btalked\b/i, /\bconversation\b/i, /\bcheck-?in\b/i, /\badvice\b/i] },
  { label: "Wellness check-in", patterns: [/\bhealth\b/i, /\bwellness\b/i, /\bstress\b/i, /\brecovery\b/i] },
];

const customActivityOption = "Other";
const undetectedActivityOption = "Activity not detected";
const activityOptions = [...activityPatterns.map((activity) => activity.label), customActivityOption, undetectedActivityOption];

const focusPatterns = [
  { label: "Mechanics", patterns: [/\bmechanics?\b/i, /\btechnique\b/i, /\bform\b/i, /\brotations?\b/i, /\bpunch mechanics?\b/i, /\bbody mechanics?\b/i, /\bhip rotation\b/i, /\bshoulder rotation\b/i] },
  { label: "Counters", patterns: [/\bcounters?\b/i, /\bcounter ?punch/i, /\bblock counters?\b/i, /\bcountering\b/i, /\breturn fire\b/i] },
  { label: "Rhythm", patterns: [/\brhythm\b/i, /\bcadence\b/i, /\btempo\b/i, /\bflow\b/i, /\bsoviet style\b/i, /\btiming rhythm\b/i] },
  { label: "Timing", patterns: [/\btiming\b/i, /\breaction\b/i, /\breads?\b/i, /\banticipation\b/i] },
  { label: "Footwork", patterns: [/\bfootwork\b/i, /\bfeet\b/i, /\bstep(?:ping)?\b/i, /\bpivots?\b/i, /\bangles?\b/i, /\blateral\b/i] },
  { label: "Defense", patterns: [/\bdefen[sc]e\b/i, /\bguard\b/i, /\bblocks?\b/i, /\bslips?\b/i, /\brolls?\b/i, /\bparr(?:y|ies)\b/i, /\bevading\b/i] },
  { label: "Power", patterns: [/\bpower\b/i, /\bexplosive\b/i, /\bdrive\b/i, /\bforce\b/i, /\bstrong punches?\b/i] },
  { label: "Speed", patterns: [/\bspeed\b/i, /\bquick(?:ness)?\b/i, /\bfast\b/i, /\bhand speed\b/i] },
  { label: "Accuracy", patterns: [/\baccuracy\b/i, /\bprecision\b/i, /\bplacement\b/i, /\btarget(?:ing)?\b/i] },
  { label: "Combinations", patterns: [/\bcombinations?\b/i, /\bcombos?\b/i, /\bsequences?\b/i] },
  { label: "Strength and conditioning", patterns: [/\bstrength\b/i, /\bconditioning\b/i, /\bcardio\b/i, /\bendurance\b/i, /\bstamina\b/i, /\bfitness\b/i, /\bcircuit\b/i] },
  { label: "Balance", patterns: [/\bbalance\b/i, /\bstability\b/i, /\bbase\b/i, /\bstances?\b/i] },
  { label: "Distance control", patterns: [/\bdistance\b/i, /\brange\b/i, /\bspacing\b/i, /\bclosing distance\b/i] },
  { label: "Pressure", patterns: [/\bpressure\b/i, /\baggression\b/i, /\bforward\b/i, /\bpace\b/i] },
  { label: "Ring awareness", patterns: [/\bring awareness\b/i, /\bring generalship\b/i, /\bpositioning\b/i, /\bropes?\b/i, /\bcorners?\b/i] },
  { label: "Confidence", patterns: [/\bconfidence\b/i, /\bcomposure\b/i, /\bcalm\b/i, /\bfocus\b/i] },
  { label: "Teamwork", patterns: [/\bteamwork\b/i, /\bpartner(?:ship)?\b/i, /\bcommunication\b/i, /\bleadership\b/i] },
];

const focusOptions = focusPatterns.map((focus) => focus.label);

const categoryMap = [
  {
    label: "Beyond the Ropes",
    keywords: [
      "technique",
      "mechanics",
      "skill",
      "boxing",
      "jab",
      "cross",
      "hook",
      "uppercut",
      "footwork",
      "pivot",
      "defense",
      "guard",
      "spar",
      "sparring",
      "pads",
      "mitts",
      "bag",
      "shadow boxing",
      "conditioning",
      "cardio",
      "strength",
      "workout",
      "training",
      "drills",
    ],
  },
  {
    label: "Fighting Side by Side",
    keywords: [
      "talked",
      "conversation",
      "check-in",
      "check in",
      "advice",
      "mentor",
      "supported",
      "encouraged",
      "listened",
      "trust",
      "relationship",
      "teamwork",
      "helped",
    ],
  },
  {
    label: "Feel Good, Fight Strong",
    keywords: [
      "health",
      "wellness",
      "nutrition",
      "hydration",
      "sleep",
      "rest",
      "recovery",
      "self-care",
      "mental health",
      "stress",
      "anxiety",
      "confidence",
      "stretching",
      "warm up",
      "cool down",
      "breathing",
    ],
  },
  {
    label: "Fighting for My Future",
    keywords: [
      "homework",
      "school",
      "teacher",
      "grades",
      "gpa",
      "attendance",
      "study",
      "tutoring",
      "reading",
      "math",
      "writing",
      "college",
      "career",
      "job",
      "resume",
      "application",
      "graduation",
    ],
  },
];

const autocompleteState = {
  activeIndex: 0,
  fragment: null,
  matches: [],
};

const attendanceState = {
  date: null,
  names: new Set(),
};

const activityDetails = new Map();
const manualActivityDetails = new Map();
let participantSignature = null;
let manualRowCounter = 0;

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTokens(youth) {
  const parts = youth.name.split(/\s+/);
  const first = parts[0] || "";
  const last = parts.at(-1) || "";
  const initial = last ? `${first} ${last[0]}` : first;
  return [...new Set([youth.name, initial, ...youth.aliases].map(normalize))];
}

function getFirstNameToken(youth) {
  return normalize(youth.name.split(/\s+/)[0] || "");
}

// Letter pairs that are easy to mix up when typing or spelling a name — either because they
// sound alike ("Liz"/"Lis") or because of a common regional spelling difference (organize/
// organise) — so swapping between them counts as a smaller mismatch than a random substitution
// would. This keeps "lis" -> "Liz" ranked ahead of an equally-1-edit-away but unrelated name
// like "Lia". Add more pairs here if you notice other common mix-ups in the roster.
const CONFUSABLE_LETTER_PAIRS = ["sz", "cs", "ck", "kq", "vb", "iy"];
const confusableLetterCost = new Map();
CONFUSABLE_LETTER_PAIRS.forEach((pair) => {
  confusableLetterCost.set(pair, 0.5);
  confusableLetterCost.set(`${pair[1]}${pair[0]}`, 0.5);
});

function substitutionCost(a, b) {
  if (a === b) return 0;
  return confusableLetterCost.get(`${a}${b}`) ?? 1;
}

// Classic edit-distance calculation (insert/delete/substitute), used below so a typo like
// "lis" still finds "Liz" instead of coming back empty.
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let previousRow = Array.from({ length: n + 1 }, (_, index) => index);

  for (let i = 1; i <= m; i += 1) {
    const currentRow = [i];
    for (let j = 1; j <= n; j += 1) {
      const cost = substitutionCost(a[i - 1], b[j - 1]);
      currentRow[j] = Math.min(
        previousRow[j] + 1,
        currentRow[j - 1] + 1,
        previousRow[j - 1] + cost,
      );
    }
    previousRow = currentRow;
  }

  return previousRow[n];
}

// Coaches usually type a name starting from the beginning (a first name, or "First L"), so
// compare the typed text against same-length-ish prefixes of each token rather than the whole
// token — that way "lis" is compared against "liz" (the start of "Liz Sample"), not against
// the entire, much longer, full name.
function fuzzyPrefixDistance(needle, token) {
  if (!needle || !token) return Infinity;
  // A typo almost never changes the very first letter someone typed — without this, dropping
  // that letter (e.g. "lis" -> "is") reads as a 1-edit "fuzzy match" for names that start
  // completely differently, like "Isaac", which then wrongly ties with real near-misses like
  // "Liz".
  if (needle[0] !== token[0]) return Infinity;

  let best = Infinity;
  for (let length = needle.length - 1; length <= needle.length + 1; length += 1) {
    if (length < 1 || length > token.length) continue;
    const distance = levenshteinDistance(needle, token.slice(0, length));
    if (distance < best) best = distance;
  }

  return best;
}

// How many typo'd letters we'll tolerate, scaled to how much text was typed — short fragments
// get a tighter allowance so "al" doesn't fuzzy-match half the roster.
function fuzzyThreshold(length) {
  if (length <= 3) return 1;
  if (length <= 6) return 2;
  return 3;
}

// Match tiers, best to worst. Coaches almost always type from the start of a first name, so
// that's checked before anything else — a name that merely *contains* the typed text somewhere
// (like "Solis" containing "lis") should never outrank an actual first-name match or even a
// near-miss spelling of one (like "Liz" for "lis").
const MATCH_TIER = {
  FIRST_NAME_EXACT: 0,
  FIRST_NAME_STARTS: 1,
  FIRST_NAME_FUZZY: 2,
  OTHER_EXACT: 3,
  OTHER_STARTS: 4,
  OTHER_CONTAINS: 5,
  OTHER_FUZZY: 6,
};

const FUZZY_TIERS = new Set([MATCH_TIER.FIRST_NAME_FUZZY, MATCH_TIER.OTHER_FUZZY]);

function findYouth(query) {
  const needle = normalize(query);
  if (!needle) return [];

  return roster
    .map((youth) => {
      const firstName = getFirstNameToken(youth);
      const tokens = getSearchTokens(youth);

      let score = 9;
      let fuzzyDistance = 0;

      if (firstName === needle) {
        score = MATCH_TIER.FIRST_NAME_EXACT;
      } else if (firstName.startsWith(needle)) {
        score = MATCH_TIER.FIRST_NAME_STARTS;
      } else if (needle.length >= 3) {
        const firstNameDistance = fuzzyPrefixDistance(needle, firstName);
        if (firstNameDistance <= fuzzyThreshold(needle.length)) {
          score = MATCH_TIER.FIRST_NAME_FUZZY;
          fuzzyDistance = firstNameDistance;
        }
      }

      if (score === 9 && tokens.some((token) => token === needle)) {
        score = MATCH_TIER.OTHER_EXACT;
      } else if (score === 9 && tokens.some((token) => token.startsWith(needle))) {
        score = MATCH_TIER.OTHER_STARTS;
      } else if (score === 9 && tokens.some((token) => token.includes(needle))) {
        score = MATCH_TIER.OTHER_CONTAINS;
      } else if (score === 9 && needle.length >= 3) {
        // Nothing matched normally — see if it's just a near-miss spelling anywhere else in
        // the name (an alias, or the last name) before giving up on this person entirely.
        const closest = Math.min(...tokens.map((token) => fuzzyPrefixDistance(needle, token)));
        if (closest <= fuzzyThreshold(needle.length)) {
          score = MATCH_TIER.OTHER_FUZZY;
          fuzzyDistance = closest;
        }
      }

      const attended = attendanceState.names.has(normalize(youth.name));

      return { youth, score, attended, fuzzyDistance };
    })
    .filter((match) => match.score < 9)
    .sort((a, b) => {
      // Priority 1: checked in today. Priority 2: how the text matched (first-name matches
      // first). Priority 3: for fuzzy matches, how close the spelling actually is — so among
      // several near-misses, "Liz" (a common s/z mix-up) still beats "Lia" (an unrelated typo)
      // even though both are "one edit" away in the plainest sense.
      if (a.attended !== b.attended) return a.attended ? -1 : 1;
      if (a.score !== b.score) return a.score - b.score;
      if (a.fuzzyDistance !== b.fuzzyDistance) return a.fuzzyDistance - b.fuzzyDistance;
      return a.youth.name.localeCompare(b.youth.name);
    })
    .slice(0, 8)
    .map((match) => ({ ...match.youth, matchScore: match.score, attended: match.attended }));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function populateCoachSelect(names = coaches) {
  // Preserve whatever the coach already picked (e.g. from the fallback list) if it's still valid
  // once the real list loads, instead of silently resetting their selection.
  const previousValue = coachSelect.value;

  coachSelect.innerHTML = `<option value="">Select coach</option>`;
  names.forEach((coach) => {
    const option = document.createElement("option");
    option.value = coach;
    option.textContent = coach;
    coachSelect.append(option);
  });

  if (previousValue && names.includes(previousValue)) coachSelect.value = previousValue;
}

async function loadCoachNames() {
  try {
    const response = await fetch("/api/coaches", { credentials: "same-origin" });
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.coachNames)) return;
    populateCoachSelect(data.coachNames);
  } catch {
    // Keep whatever populateCoachSelect() already rendered from the fallback list.
  }
}

function normalizeRosterPerson(person) {
  const name = person.fullName || person.name || "";
  if (!name.trim()) return null;

  return {
    id: person.id || `roster-${normalize(name)}`,
    name: name.replace(/\s+/g, " ").trim(),
    aliases: Array.isArray(person.aliases) ? person.aliases.filter(Boolean) : [],
  };
}

function mergeRoster(importedRoster) {
  const byName = new Map(roster.map((person) => [normalize(person.name), person]));

  importedRoster.forEach((person) => {
    const normalized = normalize(person.name);
    if (!normalized) return;

    if (!byName.has(normalized)) {
      roster.push(person);
      byName.set(normalized, person);
      return;
    }

    const existing = byName.get(normalized);
    existing.aliases = [...new Set([...(existing.aliases || []), ...(person.aliases || [])])];
  });

  roster.sort((a, b) => a.name.localeCompare(b.name));
}

function updateRosterNameOptions() {
  rosterNameOptions.innerHTML = roster
    .map((person) => `<option value="${escapeHtml(person.name)}"></option>`)
    .join("");
}

function updateFocusOptions() {
  focusOptionsEl.innerHTML = focusOptions
    .map((focus) => `<option value="${escapeHtml(focus)}"></option>`)
    .join("");
}

function findRosterPersonByName(name) {
  const normalizedName = normalize(name);
  if (!normalizedName) return null;

  return roster.find((person) => getSearchTokens(person).includes(normalizedName)) || null;
}

async function loadRosterFromBackend() {
  try {
    const response = await fetch("/api/roster", { credentials: "same-origin" });
    if (!response.ok) return;

    const data = await response.json();
    const importedRoster = (data.roster || []).map(normalizeRosterPerson).filter(Boolean);
    mergeRoster(importedRoster);
    updateRosterNameOptions();
  } catch (error) {
    console.warn("Could not load backend roster.", error);
  }
}

function buildPhraseRegex(phrase) {
  const escaped = escapeRegex(phrase.trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

// Layers admin-approved trigger phrases (see the Logs tab's "AI Pattern Suggestions" panel) on top
// of the built-in activityPatterns/focusPatterns/categoryMap lists above, so an approved suggestion
// takes effect for every coach the next time this page loads -- no code deploy needed. If this fetch
// fails (offline, fresh install with no DB, etc.) the built-in lists still work exactly as before.
async function loadLogPatternPhrases() {
  try {
    const response = await fetch("/api/logs/pattern-phrases", { credentials: "same-origin" });
    if (!response.ok) return;

    const data = await response.json();
    const phrases = Array.isArray(data.phrases) ? data.phrases : [];

    phrases.forEach((entry) => {
      const phrase = String(entry.phrase || "").trim();
      if (!phrase) return;

      if (entry.patternType === "activity") {
        const activity = activityPatterns.find((item) => item.label === entry.label);
        if (activity) activity.patterns.push(buildPhraseRegex(phrase));
      } else if (entry.patternType === "focus") {
        const focus = focusPatterns.find((item) => item.label === entry.label);
        if (focus) focus.patterns.push(buildPhraseRegex(phrase));
      } else if (entry.patternType === "category") {
        const category = categoryMap.find((item) => item.label === entry.label);
        if (category) category.keywords.push(phrase.toLowerCase());
      }
    });
  } catch (error) {
    console.warn("Could not load custom log pattern phrases.", error);
  }
}

// Pulls who's actually checked in for the selected session date, so the name suggestions can
// bubble those people to the top instead of making the coach hunt through everyone on roster.
async function loadAttendanceForDate(date) {
  if (!date) return;
  attendanceState.date = date;

  try {
    const response = await fetch(`/api/attendance?date=${encodeURIComponent(date)}`, { credentials: "same-origin" });
    if (!response.ok) return;

    const data = await response.json();
    const records = Array.isArray(data.attendance) ? data.attendance : [];
    attendanceState.names = new Set(
      records.map((record) => normalize(record.fullName || record.name || "")).filter(Boolean),
    );
    updateNameSuggestions();
  } catch (error) {
    console.warn("Could not load attendance for this date.", error);
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function getActiveNameFragment() {
  const cursor = responseInput.selectionStart;
  const beforeCursor = responseInput.value.slice(0, cursor);
  const match = beforeCursor.match(/(?:^|[\s.,;:!?()[\]{}])([A-Za-z][A-Za-z'\-]*(?:\s+[A-Za-z][A-Za-z'\-]*){0,2})$/);

  if (!match) return null;

  const rawFragment = match[1];
  const rawStart = cursor - rawFragment.length;
  const words = [...rawFragment.matchAll(/[A-Za-z][A-Za-z'\-]*/g)];
  const connectorWords = new Set(["and", "for", "to", "with", "on", "about", "then", "also"]);

  for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
    const candidateWords = words.slice(words.length - size);
    if (connectorWords.has(candidateWords[0][0].toLowerCase())) continue;

    const query = candidateWords.map((word) => word[0]).join(" ");
    if (query.length < 2 || !findYouth(query).length) continue;

    return {
      query,
      start: rawStart + candidateWords[0].index,
      end: cursor,
    };
  }

  return {
    query: words.at(-1)?.[0] || "",
    start: rawStart + (words.at(-1)?.index || 0),
    end: cursor,
  };
}

function updateNameSuggestions() {
  const fragment = getActiveNameFragment();

  if (!fragment) {
    closeNameSuggestions();
    return;
  }

  const matches = findYouth(fragment.query);
  if (!matches.length) {
    closeNameSuggestions();
    return;
  }

  autocompleteState.fragment = fragment;
  autocompleteState.matches = matches;
  autocompleteState.activeIndex = Math.min(autocompleteState.activeIndex, matches.length - 1);

  nameSuggestions.innerHTML = matches
    .map((youth, index) => {
      const aliasText = youth.attended
        ? "Checked in"
        : youth.aliases.length
          ? youth.aliases.join(", ")
          : FUZZY_TIERS.has(youth.matchScore)
            ? "Similar spelling"
            : "Roster match";
      const active = index === autocompleteState.activeIndex ? " active" : "";
      const attended = youth.attended ? " attended" : "";
      return `
        <button class="name-suggestion${active}${attended}" type="button" data-index="${index}" role="option">
          <strong>${escapeHtml(youth.name)}</strong>
          <small>${escapeHtml(aliasText)}</small>
        </button>
      `;
    })
    .join("");

  nameSuggestions.classList.add("open");
}

function closeNameSuggestions() {
  nameSuggestions.classList.remove("open");
  nameSuggestions.innerHTML = "";
  autocompleteState.fragment = null;
  autocompleteState.matches = [];
  autocompleteState.activeIndex = 0;
}

function chooseNameSuggestion(index = autocompleteState.activeIndex) {
  const youth = autocompleteState.matches[index];
  const fragment = autocompleteState.fragment;
  if (!youth || !fragment) return;

  const before = responseInput.value.slice(0, fragment.start);
  const after = responseInput.value.slice(fragment.end);
  const nextText = `${before}${youth.name}${after}`;
  const nextCursor = before.length + youth.name.length;

  responseInput.value = nextText;
  responseInput.focus();
  responseInput.setSelectionRange(nextCursor, nextCursor);
  closeNameSuggestions();
  state.savedAt = null;
  updatePreview();
}

function handleNameSuggestionKeys(event) {
  if (!nameSuggestions.classList.contains("open")) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    autocompleteState.activeIndex = (autocompleteState.activeIndex + 1) % autocompleteState.matches.length;
    updateNameSuggestions();
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    autocompleteState.activeIndex =
      (autocompleteState.activeIndex - 1 + autocompleteState.matches.length) % autocompleteState.matches.length;
    updateNameSuggestions();
  }

  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    chooseNameSuggestion();
  }

  if (event.key === "Escape") {
    event.preventDefault();
    closeNameSuggestions();
  }
}

function sentenceSplit(text) {
  return text
    .replace(/\r/g, "\n")
    .split(/[\n]+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function sentenceSpans(text) {
  const spans = [];
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const isBoundary = char === "." || char === "!" || char === "?" || char === "\n";
    const isDecimalPoint = char === "." && /\d/.test(text[index - 1] || "") && /\d/.test(text[index + 1] || "");
    if (!isBoundary || isDecimalPoint) continue;

    const rawSentence = text.slice(start, index + 1);
    const sentence = rawSentence.trim();
    if (sentence) {
      const leadingWhitespace = rawSentence.search(/\S/);
      const offset = leadingWhitespace === -1 ? 0 : leadingWhitespace;
      spans.push({
        text: sentence,
        start: start + offset,
        end: index + 1,
      });
    }

    start = index + 1;
  }

  const rawSentence = text.slice(start);
  const sentence = rawSentence.trim();
  if (sentence) {
    const leadingWhitespace = rawSentence.search(/\S/);
    const offset = leadingWhitespace === -1 ? 0 : leadingWhitespace;
    spans.push({
      text: sentence,
      start: start + offset,
      end: text.length,
    });
  }

  return spans;
}

function sentenceForIndex(text, index) {
  return sentenceSpans(text).find((span) => index >= span.start && index <= span.end)?.text || text;
}

function clauseForMention(sentence, matchedText) {
  const clauses = sentence
    .split(/\b(?:and then|then|also|and)\b|[,;]/i)
    .map((clause) => clause.trim())
    .filter(Boolean);

  const matched = normalize(matchedText);
  return clauses.find((clause) => normalize(clause).includes(matched)) || sentence;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A "round" here means a 3-minute boxing round plus its ~30-second rest, so each round mentioned
// counts as 3.5 minutes toward the activity's duration (e.g. "3 rounds on the bag" -> ~10.5 min).
const MINUTES_PER_ROUND = 3.5;

function detectMinutes(text) {
  const regex = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes|minute|mins|min|miuntes|rounds?)\b/gi;
  return [...text.matchAll(regex)].map((match) => {
    const unit = match[2].toLowerCase();
    const amount = Number(match[1]);
    const minutes = /^h/.test(unit) ? amount * 60 : /^r/.test(unit) ? amount * MINUTES_PER_ROUND : amount;

    return {
      // coach_log_activities.minutes is an integer column, so round rounds/hours conversions the
      // same way hours already were -- whole minutes only.
      value: Math.round(minutes),
      text: match[0],
      index: match.index,
      end: match.index + match[0].length,
    };
  });
}

function detectCategories(text) {
  const normalizedText = text.toLowerCase();
  return categoryMap
    .filter((category) => category.keywords.some((keyword) => normalizedText.includes(keyword)))
    .map((category) => category.label);
}

function detectYouth(text) {
  const found = new Map();

  roster.forEach((youth) => {
    getSearchTokens(youth).forEach((token) => {
      if (!token || token.length < 3) return;
      const pattern = new RegExp(`\\b${escapeRegex(token).replace(/\s+/g, "[\\s\\u00A0]+")}\\.?\\b`, "gi");

      let match;
      while ((match = pattern.exec(text)) !== null) {
        const matchedText = match[0].trim().replace(/\.$/, "");
        const key = `${normalize(matchedText)}:${match.index}`;
        if (!found.has(key)) found.set(key, { matchedText, index: match.index, matches: [] });
        found.get(key).matches.push(youth);
      }
    });
  });

  return [...found.values()]
    .map((result) => {
      const uniqueMatches = [...new Map(result.matches.map((youth) => [youth.id, youth])).values()];

      return {
        matchedText: result.matchedText,
        index: result.index,
        status: uniqueMatches.length === 1 ? "matched" : "ambiguous",
        matches: uniqueMatches.map((youth) => ({ id: youth.id, name: youth.name })),
      };
    })
    .sort((a, b) => a.index - b.index);
}

function detectedActivities(text) {
  const activityText = stripActivityModifier(text);
  return activityPatterns
    .filter((activity) => activity.patterns.some((pattern) => pattern.test(activityText)))
    .map((activity) => activity.label);
}

function stripActivityModifier(text) {
  return String(text || "").split(/\b(?:with\s+(?:a\s+)?focus\s+on|focus(?:ed|ing)?\s+on)\b/i)[0].trim();
}

function extractActivityModifier(text) {
  const match = String(text || "").match(/\b(?:with\s+(?:a\s+)?focus\s+on|focus(?:ed|ing)?\s+on)\s+(.+)$/i);
  return match ? normalizeActivityModifier(match[1].replace(/[.!?]+$/, "").trim()) : "";
}

function mergeActivityModifiers(...modifiers) {
  return joinFocusValues([...new Set(modifiers.flatMap(splitFocusValues))]);
}

function normalizeActivityModifier(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const matched = focusPatterns
    .filter((focus) => focus.patterns.some((pattern) => pattern.test(raw)))
    .map((focus) => focus.label);
  let unique = [...new Set(matched)];

  if (unique.includes("Counters")) {
    unique = unique.filter((focus) => focus !== "Defense");
  }

  return unique.length ? unique.join(", ") : raw;
}

function activityMentionPositions(text, activityLabel) {
  const activity = activityPatterns.find((candidate) => candidate.label === activityLabel);
  if (!activity) return [];

  return activity.patterns.flatMap((pattern) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    const matches = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
      matches.push({
        index: match.index,
        end: match.index + match[0].length,
        text: match[0],
      });
    }

    return matches;
  });
}

function distanceBetweenRanges(first, second) {
  if (first.end < second.index) return second.index - first.end;
  if (second.end < first.index) return first.index - second.end;
  return 0;
}

function inferMinutesForActivity(text, activityLabel) {
  const minutes = detectMinutes(text);
  if (!minutes.length) return "";
  if (minutes.length === 1) return minutes[0].value;

  const activityMentions = activityMentionPositions(text, activityLabel);
  if (!activityMentions.length) return "";

  const nearest = minutes
    .map((minute) => ({
      minute,
      distance: Math.min(
        ...activityMentions.map((activity) => distanceBetweenRanges(minute, activity))
      ),
    }))
    .sort((a, b) => a.distance - b.distance || a.minute.index - b.minute.index)[0];

  return nearest?.minute.value || "";
}

function inferActivities(text) {
  const activities = detectedActivities(text);

  return activities.length ? activities : ["Activity not detected"];
}

function getMatchedParticipants(possibleYouth, response) {
  const rows = [];

  possibleYouth.forEach((mention) => {
    if (mention.status !== "matched") return;
    const match = mention.matches[0];
    if (!match) return;
    const sourceSentence = sentenceForIndex(response, mention.index || 0);
    const mentionsInSentence = possibleYouth.filter((candidate) => {
      if (candidate.status !== "matched") return false;
      return sentenceForIndex(response, candidate.index || 0) === sourceSentence;
    });
    const sourceClause = clauseForMention(sourceSentence, mention.matchedText);
    const clauseActivities = detectedActivities(sourceClause);
    const activityText = mentionsInSentence.length === 1 || !clauseActivities.length ? sourceSentence : sourceClause;
    const activityModifier = mergeActivityModifiers(
      extractActivityModifier(activityText),
      mentionsInSentence.length > 1 ? extractActivityModifier(sourceSentence) : "",
    );
    const activities = inferActivities(activityText);

    activities.forEach((activity, activityIndex) => {
      rows.push({
        rowId: `${match.id}:${mention.index}:${activityIndex}:${normalize(activity)}`,
        youthId: match.id,
        youthName: match.name,
        matchedText: mention.matchedText,
        detectedActivity: activity,
        inferredMinutes: inferMinutesForActivity(activityText, activity),
        activityModifier,
        sourceSentence,
        sourceClause: activityText,
      });
    });
  });

  return rows;
}

function getParticipantDetails(rowId) {
  return activityDetails.get(rowId) || {
    minutes: "",
    minutesSource: "empty",
    activity: "",
    customActivity: "",
    activitySource: "empty",
    activityModifier: "",
    activityModifierValues: [],
    activityModifierSource: "empty",
  };
}

function setParticipantDetails(rowId, updates) {
  activityDetails.set(rowId, {
    ...getParticipantDetails(rowId),
    ...updates,
  });
}

function resolvedActivity(details, fallbackActivity) {
  const selectedActivity = details.activity || fallbackActivity;
  if (selectedActivity === customActivityOption) return String(details.customActivity || "").trim();
  return selectedActivity;
}

function createManualActivityRow() {
  manualRowCounter += 1;
  const rowId = `manual:${manualRowCounter}`;
  manualActivityDetails.set(rowId, {
    rowId,
    youthName: "",
    youthId: "",
    minutes: "",
    minutesSource: "manual",
    activity: undetectedActivityOption,
    customActivity: "",
    activitySource: "manual",
    activityModifier: "",
    activityModifierValues: [],
    activityModifierSource: "manual",
  });
  participantSignature = null;
  updatePreview();
}

function manualActivitiesSignature() {
  return [...manualActivityDetails.values()]
    .map((entry) => `${entry.rowId}:${entry.activity || ""}:${editableFocusValues(entry).join("|")}`)
    .join("|");
}

function splitFocusValues(value) {
  return String(value || "")
    .split(",")
    .map((focus) => focus.trim())
    .filter(Boolean);
}

function joinFocusValues(values) {
  return values
    .map((focus) => String(focus || "").trim())
    .filter(Boolean)
    .join(", ");
}

function editableFocusValues(entry) {
  return Array.isArray(entry.activityModifierValues) ? entry.activityModifierValues : splitFocusValues(entry.activityModifier);
}

function setFocusValue(entry, index, value) {
  const values = editableFocusValues(entry);
  values[index] = value;
  return values;
}

function appendFocusValue(entry) {
  const values = editableFocusValues(entry);
  values.push("");
  return values;
}

function removeFocusValue(entry, index) {
  return editableFocusValues(entry).filter((_, focusIndex) => focusIndex !== index);
}

function renderActivityControls(selectedActivity, customActivity = "") {
  const showCustomActivity = selectedActivity === customActivityOption;

  return `
    <select class="participant-activity">
      ${activityOptions
        .map(
          (activity) =>
            `<option value="${escapeHtml(activity)}"${activity === selectedActivity ? " selected" : ""}>${escapeHtml(activity)}</option>`,
        )
        .join("")}
    </select>
    <input
      class="participant-custom-activity${showCustomActivity ? "" : " hidden"}"
      type="text"
      value="${escapeHtml(customActivity || "")}"
      placeholder="Type activity"
    />
  `;
}

function renderFocusControls(activityModifier = "") {
  const focusValues = Array.isArray(activityModifier) ? activityModifier : splitFocusValues(activityModifier);
  const focusInputs = focusValues
    .map(
      (focus, index) => `
        <div class="focus-entry">
          <input
            class="participant-focus"
            type="text"
            list="focus-options"
            data-focus-index="${index}"
            value="${escapeHtml(focus)}"
            placeholder="Focus"
          />
          <button type="button" class="remove-entry remove-focus-entry" data-focus-index="${index}" aria-label="Remove focus">x</button>
        </div>
      `,
    )
    .join("");

  return `
    <div class="focus-list">
      ${focusInputs || `<small class="empty-focus">No focus added</small>`}
    </div>
    <button type="button" class="secondary add-focus-entry">Add focus</button>
  `;
}

function renderManualActivityRows() {
  return [...manualActivityDetails.values()]
    .map((entry) => {
      const selectedActivity = entry.activity || undetectedActivityOption;

      return `
        <article class="participant-row manual-row" data-row-id="${escapeHtml(entry.rowId)}">
          <label class="field participant-name manual-name-field">
            <span>Name</span>
            <input
              class="manual-youth-name"
              type="text"
              list="roster-name-options"
              value="${escapeHtml(entry.youthName || "")}"
              placeholder="Type or select name"
            />
          </label>
          <label class="field compact-field">
            <span>Minutes</span>
            <input class="participant-minutes" type="number" min="1" step="1" value="${escapeHtml(String(entry.minutes || ""))}" />
          </label>
          <div class="field activity-display-field">
            <span>Activity</span>
            ${renderActivityControls(selectedActivity, entry.customActivity)}
          </div>
          <label class="field focus-field">
            <span>Focus</span>
            ${renderFocusControls(editableFocusValues(entry))}
          </label>
          <button type="button" class="remove-entry remove-manual-entry" aria-label="Remove manual entry">x</button>
        </article>
      `;
    })
    .join("");
}

function renderParticipantList(participants) {
  participants.forEach((participant) => {
    const details = getParticipantDetails(participant.rowId);
    const updates = {};

    if (details.minutesSource !== "manual") {
      updates.minutes = participant.inferredMinutes || "";
      updates.minutesSource = participant.inferredMinutes ? "detected" : "empty";
    }

    if (details.activitySource !== "manual") {
      updates.activity = participant.detectedActivity;
      updates.activitySource = "detected-from-response";
    }

    if (details.activityModifierSource !== "manual") {
      updates.activityModifier = participant.activityModifier || "";
      updates.activityModifierValues = splitFocusValues(participant.activityModifier);
      updates.activityModifierSource = participant.activityModifier ? "detected-from-response" : "empty";
    }

    setParticipantDetails(participant.rowId, updates);
  });

  const nextSignature = participants
    .map((participant) => {
      const details = getParticipantDetails(participant.rowId);
      return `${participant.rowId}:${participant.inferredMinutes || ""}:${details.activity || ""}:${details.activityModifier || ""}:${participant.sourceClause}`;
    })
    .concat(manualActivitiesSignature())
    .join("|");
  if (nextSignature === participantSignature) return;
  participantSignature = nextSignature;

  const activeIds = new Set(participants.map((participant) => participant.rowId));
  [...activityDetails.keys()].forEach((rowId) => {
    if (!activeIds.has(rowId)) activityDetails.delete(rowId);
  });

  if (!participants.length && !manualActivityDetails.size) {
    participantList.innerHTML = `
      <div class="empty-participants">
        Names selected from the response will appear here.
      </div>
    `;
    return;
  }

  const detectedRows = participants
    .map((participant) => {
      const details = getParticipantDetails(participant.rowId);
      const selectedActivity = details.activity || participant.detectedActivity;

      return `
        <article class="participant-row" data-row-id="${escapeHtml(participant.rowId)}">
          <div class="participant-name">
            <strong>${escapeHtml(participant.youthName)}</strong>
            <small>${escapeHtml(participant.sourceClause)}</small>
          </div>
          <label class="field compact-field">
            <span>Minutes</span>
            <input class="participant-minutes" type="number" min="1" step="1" value="${escapeHtml(String(details.minutes))}" />
          </label>
          <div class="field activity-display-field">
            <span>Activity</span>
            ${renderActivityControls(selectedActivity, details.customActivity)}
          </div>
          <label class="field focus-field">
            <span>Focus</span>
            ${renderFocusControls(editableFocusValues(details))}
          </label>
        </article>
      `;
    })
    .join("");

  participantList.innerHTML = `${detectedRows}${renderManualActivityRows()}`;
}

function collectConfirmedActivities(participants) {
  const detectedActivities = participants.map((participant) => {
    const details = getParticipantDetails(participant.rowId);
    const activity = resolvedActivity(details, participant.detectedActivity);
    return {
      rowId: participant.rowId,
      youthId: participant.youthId,
      youthName: participant.youthName,
      minutes: Number(details.minutes || 0),
      minutesSource: details.minutesSource || "manual",
      activity,
      activitySource: details.activitySource || "detected-from-response",
      activityModifier: joinFocusValues(editableFocusValues(details)),
      sourceClause: participant.sourceClause,
      sourceSentence: participant.sourceSentence,
    };
  });

  const manualActivities = [...manualActivityDetails.values()].map((entry) => {
    const matchedPerson = findRosterPersonByName(entry.youthName);
    const activity = resolvedActivity(entry, undetectedActivityOption);
    return {
      rowId: entry.rowId,
      youthId: matchedPerson?.id || entry.youthId || `manual-${normalize(entry.youthName || "")}`,
      youthName: String(entry.youthName || "").trim(),
      minutes: Number(entry.minutes || 0),
      minutesSource: "manual",
      activity,
      activitySource: "manual",
      activityModifier: joinFocusValues(editableFocusValues(entry)),
      sourceClause: "Manually added in confirmation",
      sourceSentence: "",
    };
  });

  return [...detectedActivities, ...manualActivities];
}

function buildAssistantDraft(response) {
  const sentences = sentenceSplit(response);
  const youthMentions = detectYouth(response);
  const categories = detectCategories(response);

  return {
    possibleYouth: youthMentions,
    possibleCategories: categories,
    sentenceCount: sentences.length,
  };
}

function collectLog() {
  const response = responseInput.value.trim();
  const assistantDraft = buildAssistantDraft(response);
  const participants = getMatchedParticipants(assistantDraft.possibleYouth, response);
  const confirmedActivities = collectConfirmedActivities(participants);

  return {
    coach: coachSelect.value,
    sessionDate: dateInput.value,
    response,
    confirmedActivities,
    assistantDraft,
    savedAt: state.savedAt,
  };
}

function findFlags(log) {
  const flags = [];

  if (!log.coach) flags.push({ type: "danger", text: "Select your coach name." });
  if (!log.sessionDate) flags.push({ type: "danger", text: "Select the session date." });
  if (!log.response) flags.push({ type: "danger", text: "Type the coaching response." });

  const ambiguous = log.assistantDraft.possibleYouth.filter((mention) => mention.status === "ambiguous");
  ambiguous.forEach((mention) => {
    const names = mention.matches.map((match) => match.name).join(", ");
    flags.push({ type: "warning", text: `"${mention.matchedText}" could mean: ${names}.` });
  });

  if (log.response && !log.assistantDraft.possibleYouth.length && !log.confirmedActivities.length) {
    flags.push({ type: "warning", text: "No roster names detected yet." });
  }

  log.confirmedActivities.forEach((entry) => {
    if (!entry.youthName) {
      flags.push({ type: "danger", text: "Add a name for each person/activity row." });
    }

    if (!entry.minutes || entry.minutes < 1) {
      flags.push({ type: "danger", text: `Add minutes for ${entry.youthName || "each person/activity row"}.` });
    }

    if (!entry.activity || entry.activity === undetectedActivityOption) {
      flags.push({ type: "danger", text: `Choose an activity for ${entry.youthName || "each person/activity row"}.` });
    }
  });

  return flags;
}

function updatePreview() {
  const response = responseInput.value.trim();
  const assistantDraft = buildAssistantDraft(response);
  const participants = getMatchedParticipants(assistantDraft.possibleYouth, response);

  renderParticipantList(participants);

  const log = collectLog();
  const flags = findFlags(log);

  flagsEl.innerHTML = "";
  const visibleFlags = state.attemptedSubmit || state.saveError ? flags : [];
  visibleFlags.forEach((flag) => {
    const item = document.createElement("div");
    item.className = `flag ${flag.type === "danger" ? "danger" : ""}`;
    item.textContent = flag.text;
    flagsEl.append(item);
  });

  const hasBlockingFlags = flags.some((flag) => flag.type === "danger");
  if (state.saving) {
    entryStatus.textContent = "Saving";
  } else if (state.saveError) {
    entryStatus.textContent = "Save failed";
  } else {
    entryStatus.textContent = state.savedAt ? "Saved" : state.attemptedSubmit && hasBlockingFlags ? "Needs review" : "Draft";
  }
  entryStatus.classList.toggle("saved", Boolean(state.savedAt));

  if (state.saveError) {
    const item = document.createElement("div");
    item.className = "flag danger";
    item.textContent = state.saveError;
    flagsEl.append(item);
  }
}

function resetForm() {
  state.savedAt = null;
  state.attemptedSubmit = false;
  state.saving = false;
  state.saveError = "";
  form.reset();
  dateInput.value = todayIso();
  activityDetails.clear();
  manualActivityDetails.clear();
  participantSignature = null;
  form.classList.remove("hidden");
  submittedPanel.classList.add("hidden");
  updatePreview();
  loadAttendanceForDate(dateInput.value);
}

async function init() {
  populateCoachSelect();
  updateRosterNameOptions();
  updateFocusOptions();
  dateInput.value = todayIso();
  await Promise.all([loadRosterFromBackend(), loadLogPatternPhrases(), loadCoachNames()]);
  loadAttendanceForDate(dateInput.value);
  dateInput.addEventListener("change", () => loadAttendanceForDate(dateInput.value));

  responseInput.addEventListener("input", updateNameSuggestions);
  responseInput.addEventListener("click", updateNameSuggestions);
  responseInput.addEventListener("keyup", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
    updateNameSuggestions();
  });
  responseInput.addEventListener("keydown", handleNameSuggestionKeys);
  responseInput.addEventListener("blur", () => {
    window.setTimeout(closeNameSuggestions, 140);
  });
  nameSuggestions.addEventListener("mousedown", (event) => {
    const button = event.target.closest(".name-suggestion");
    if (!button) return;
    event.preventDefault();
  });
  nameSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest(".name-suggestion");
    if (!button) return;
    event.preventDefault();
    chooseNameSuggestion(Number(button.dataset.index));
  });
  function handleParticipantDetailChange(event) {
    const row = event.target.closest(".participant-row");
    if (!row) return;
    const isManualRow = row.classList.contains("manual-row");
    const manualEntry = manualActivityDetails.get(row.dataset.rowId);

    if (event.target.classList.contains("manual-youth-name") && manualEntry) {
      const matchedPerson = findRosterPersonByName(event.target.value);
      manualActivityDetails.set(row.dataset.rowId, {
        ...manualEntry,
        youthName: event.target.value,
        youthId: matchedPerson?.id || "",
      });
      state.savedAt = null;
      updatePreview();
      return;
    }

    if (event.target.classList.contains("participant-minutes")) {
      if (isManualRow && manualEntry) {
        manualActivityDetails.set(row.dataset.rowId, {
          ...manualEntry,
          minutes: event.target.value,
          minutesSource: "manual",
        });
        state.savedAt = null;
        updatePreview();
        return;
      }

      setParticipantDetails(row.dataset.rowId, { minutes: event.target.value, minutesSource: "manual" });
      state.savedAt = null;
      updatePreview();
    }

    if (event.target.classList.contains("participant-activity")) {
      if (isManualRow && manualEntry) {
        manualActivityDetails.set(row.dataset.rowId, {
          ...manualEntry,
          activity: event.target.value,
          activitySource: "manual",
        });
        state.savedAt = null;
        updatePreview();
        return;
      }

      setParticipantDetails(row.dataset.rowId, { activity: event.target.value, activitySource: "manual" });
      state.savedAt = null;
      updatePreview();
    }

    if (event.target.classList.contains("participant-custom-activity")) {
      if (isManualRow && manualEntry) {
        manualActivityDetails.set(row.dataset.rowId, {
          ...manualEntry,
          activity: customActivityOption,
          customActivity: event.target.value,
          activitySource: "manual",
        });
        state.savedAt = null;
        updatePreview();
        return;
      }

      setParticipantDetails(row.dataset.rowId, {
        activity: customActivityOption,
        customActivity: event.target.value,
        activitySource: "manual",
      });
      state.savedAt = null;
      updatePreview();
    }

    if (event.target.classList.contains("participant-focus")) {
      const focusIndex = Number(event.target.dataset.focusIndex || 0);

      if (isManualRow && manualEntry) {
        const activityModifierValues = setFocusValue(manualEntry, focusIndex, event.target.value);
        manualActivityDetails.set(row.dataset.rowId, {
          ...manualEntry,
          activityModifier: joinFocusValues(activityModifierValues),
          activityModifierValues,
          activityModifierSource: "manual",
        });
        state.savedAt = null;
        return;
      }

      const details = getParticipantDetails(row.dataset.rowId);
      const activityModifierValues = setFocusValue(details, focusIndex, event.target.value);
      setParticipantDetails(row.dataset.rowId, {
        activityModifier: joinFocusValues(activityModifierValues),
        activityModifierValues,
        activityModifierSource: "manual",
      });
      state.savedAt = null;
    }
  }

  participantList.addEventListener("input", handleParticipantDetailChange);
  participantList.addEventListener("change", handleParticipantDetailChange);
  participantList.addEventListener("click", (event) => {
    const addFocusButton = event.target.closest(".add-focus-entry");
    if (addFocusButton) {
      const row = addFocusButton.closest(".participant-row");
      if (!row) return;

      const manualEntry = manualActivityDetails.get(row.dataset.rowId);
      if (manualEntry) {
        const activityModifierValues = appendFocusValue(manualEntry);
        manualActivityDetails.set(row.dataset.rowId, {
          ...manualEntry,
          activityModifier: joinFocusValues(activityModifierValues),
          activityModifierValues,
          activityModifierSource: "manual",
        });
      } else {
        const details = getParticipantDetails(row.dataset.rowId);
        const activityModifierValues = appendFocusValue(details);
        setParticipantDetails(row.dataset.rowId, {
          activityModifier: joinFocusValues(activityModifierValues),
          activityModifierValues,
          activityModifierSource: "manual",
        });
      }

      participantSignature = null;
      state.savedAt = null;
      updatePreview();
      return;
    }

    const removeFocusButton = event.target.closest(".remove-focus-entry");
    if (removeFocusButton) {
      const row = removeFocusButton.closest(".participant-row");
      if (!row) return;

      const focusIndex = Number(removeFocusButton.dataset.focusIndex || 0);
      const manualEntry = manualActivityDetails.get(row.dataset.rowId);
      if (manualEntry) {
        const activityModifierValues = removeFocusValue(manualEntry, focusIndex);
        manualActivityDetails.set(row.dataset.rowId, {
          ...manualEntry,
          activityModifier: joinFocusValues(activityModifierValues),
          activityModifierValues,
          activityModifierSource: "manual",
        });
      } else {
        const details = getParticipantDetails(row.dataset.rowId);
        const activityModifierValues = removeFocusValue(details, focusIndex);
        setParticipantDetails(row.dataset.rowId, {
          activityModifier: joinFocusValues(activityModifierValues),
          activityModifierValues,
          activityModifierSource: "manual",
        });
      }

      participantSignature = null;
      state.savedAt = null;
      updatePreview();
      return;
    }

    const button = event.target.closest(".remove-manual-entry");
    if (!button) return;

    const row = button.closest(".participant-row");
    if (!row) return;

    manualActivityDetails.delete(row.dataset.rowId);
    participantSignature = null;
    state.savedAt = null;
    updatePreview();
  });
  addManualEntryButton.addEventListener("click", createManualActivityRow);
  document.querySelector("#clear-form").addEventListener("click", resetForm);
  newLogButton.addEventListener("click", resetForm);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.saving) return;

    state.attemptedSubmit = true;
    state.saveError = "";
    const log = collectLog();
    const hasBlockingFlags = findFlags(log).some((flag) => flag.type === "danger");

    if (hasBlockingFlags) {
      state.savedAt = null;
      updatePreview();
      return;
    }

    state.saving = true;
    updatePreview();

    try {
      const response = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(log),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.detail ? `${data.error} ${data.detail}` : data.error || "Could not save log.");
      }

      state.savedAt = data.log?.receivedAt || new Date().toISOString();
      state.saveError = "";
      form.classList.add("hidden");
      submittedPanel.classList.remove("hidden");
    } catch (error) {
      state.savedAt = null;
      state.saveError = error.message || "Could not save log.";
    } finally {
      state.saving = false;
      updatePreview();
    }
  });

  form.addEventListener("input", (event) => {
    if (event.target.closest("#participant-list")) return;

    state.savedAt = null;
    state.attemptedSubmit = false;
    state.saveError = "";
    updatePreview();
  });

  updatePreview();
}

init();
