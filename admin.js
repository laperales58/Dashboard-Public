const reportState = {
  data: null,
  loading: false,
};

const filtersForm = document.querySelector("#report-filters");
const statusEl = document.querySelector("#dashboard-status");
const refreshButton = document.querySelector("#refresh-report");
const clearButton = document.querySelector("#clear-filters");
const coachFilter = document.querySelector("#coach-filter");
const activityFilter = document.querySelector("#activity-filter");
const focusFilter = document.querySelector("#focus-filter");
const genderFilter = document.querySelector("#gender-filter");
const ethnicityFilter = document.querySelector("#ethnicity-filter");
const schoolFilter = document.querySelector("#school-filter");
const competencyFilter = document.querySelector("#competency-filter");
const downloadActivityCsvButton = document.querySelector("#download-activity-csv");
const checkPatternGapsButton = document.querySelector("#check-pattern-gaps");
const patternCheckStatusEl = document.querySelector("#pattern-check-status");
const patternSuggestionsBody = document.querySelector("#pattern-suggestions-body");
const patternSuggestionsEmptyEl = document.querySelector("#pattern-suggestions-empty");
const patternPhrasesBody = document.querySelector("#pattern-phrases-body");
const patternPhrasesEmptyEl = document.querySelector("#pattern-phrases-empty");
const downloadReportCsvButton = document.querySelector("#download-report-csv");
const downloadReportPdfButton = document.querySelector("#download-report-pdf");
const rosterImportForm = document.querySelector("#roster-import-form");
const rosterCsvInput = document.querySelector("#roster-csv");
const rosterImportStatus = document.querySelector("#roster-import-status");
const summaryList = document.querySelector("#summary-list");

const overviewStatusEl = document.querySelector("#overview-status");
const refreshOverviewButton = document.querySelector("#refresh-overview");
const overviewMetricEls = {
  activeRoster: document.querySelector("#overview-metric-active-roster"),
  logs30d: document.querySelector("#overview-metric-logs-30d"),
  hours30d: document.querySelector("#overview-metric-hours-30d"),
  attendanceRate: document.querySelector("#overview-metric-attendance-rate"),
  avgAttendance: document.querySelector("#overview-metric-avg-attendance"),
  grantForecast: document.querySelector("#overview-metric-grant-forecast"),
};

const rosterTableBody = document.querySelector("#roster-table-body");
const rosterSearchInput = document.querySelector("#roster-search");
const rosterStatusEl = document.querySelector("#roster-table-status");
const refreshRosterButton = document.querySelector("#refresh-roster");
const downloadRosterCsvButton = document.querySelector("#download-roster-csv");
const addRosterPersonButton = document.querySelector("#add-roster-person");

const rosterPersonDialog = document.querySelector("#roster-person-dialog");
const rosterPersonForm = document.querySelector("#roster-person-form");
const rosterPersonDialogTitle = document.querySelector("#roster-person-dialog-title");
const rosterPersonDialogStatus = document.querySelector("#roster-person-dialog-status");
const rosterPersonCancelButton = document.querySelector("#roster-person-cancel");
const rosterPersonFields = {
  id: document.querySelector("#roster-person-id"),
  fullName: document.querySelector("#roster-person-name"),
  birthDate: document.querySelector("#roster-person-birth-date"),
  age: document.querySelector("#roster-person-age"),
  address: document.querySelector("#roster-person-address"),
  firstAttDate: document.querySelector("#roster-person-first-att-date"),
  raceEthnicity: document.querySelector("#roster-person-ethnicity"),
  zipcode: document.querySelector("#roster-person-zipcode"),
  school: document.querySelector("#roster-person-school"),
  gender: document.querySelector("#roster-person-gender"),
};

const rosterState = {
  data: [],
  loading: false,
};

// The Roster tab's People list only shows people who've actually been in recently -- this does
// NOT filter rosterState.data itself, since School Groups (and anything else reading rosterState
// directly) still needs everyone for accurate historical school-alias management.
const ROSTER_ACTIVE_WINDOW_DAYS = 60;

function isRosterPersonActive(person) {
  if (!person.lastAttendanceDate) return false;
  const lastAttendance = new Date(`${person.lastAttendanceDate}T00:00:00Z`);
  if (Number.isNaN(lastAttendance.getTime())) return false;
  // Compares whole calendar days (both sides at UTC midnight) rather than the exact current
  // timestamp, so "attended exactly 60 days ago" reads as active no matter what time of day this
  // runs.
  const today = new Date(`${todayIso()}T00:00:00Z`);
  const daysSince = (today.getTime() - lastAttendance.getTime()) / (24 * 60 * 60 * 1000);
  return daysSince >= 0 && daysSince <= ROSTER_ACTIVE_WINDOW_DAYS;
}

function activeRosterRows() {
  return rosterState.data.filter(isRosterPersonActive);
}

const schoolGroupsStatusEl = document.querySelector("#school-groups-status");
const schoolGroupsBoardEl = document.querySelector("#school-groups-board");
const addSchoolGroupButton = document.querySelector("#add-school-group");
const refreshSchoolGroupsButton = document.querySelector("#refresh-school-groups");

const rosterSubtabButtons = document.querySelectorAll(".roster-subtab-button");
const rosterViewPanels = document.querySelectorAll("[data-roster-view-panel]");

const schoolAliasState = {
  data: [], // [{ id, rawAlias, canonicalName }]
  loading: false,
};

// Excludes .roster-subtab-button/.grants-subtab-button/.resources-subtab-button/
// .attendance-subtab-button: those share the ".tab-button" class for styling only, but they have
// no `data-tab` attribute, so without this exclusion clicking a sub-tab (e.g. "School Groups" or
// Grants' "Forecasting") would also fire the main-tab click handler below with an undefined tab,
// which falls back to "overview" and yanks the user out of the parent tab entirely.
const tabButtons = document.querySelectorAll(
  ".tab-button:not(.roster-subtab-button):not(.grants-subtab-button):not(.resources-subtab-button):not(.attendance-subtab-button)",
);
const tabTargets = document.querySelectorAll("[data-tabs]");
const validTabs = ["overview", "roster", "logs", "attendance", "grants", "expenses", "resources"];

const grantsSubtabButtons = document.querySelectorAll(".grants-subtab-button");
const grantsViewPanels = document.querySelectorAll("[data-grants-view-panel]");

const resourcesSubtabButtons = document.querySelectorAll(".resources-subtab-button");
const resourcesViewPanels = document.querySelectorAll("[data-resources-view-panel]");

const attendanceSubtabButtons = document.querySelectorAll(".attendance-subtab-button");
const attendanceViewPanels = document.querySelectorAll("[data-attendance-view-panel]");

const grantsYearSelect = document.querySelector("#grants-year");
const refreshGrantsDashboardButton = document.querySelector("#refresh-grants-dashboard");
const grantsDashboardStatusEl = document.querySelector("#grants-dashboard-status");
const grantsGoalInput = document.querySelector("#grants-goal-input");
const saveGrantsGoalButton = document.querySelector("#save-grants-goal");
const grantsGoalProgressFill = document.querySelector("#grants-goal-progress-fill");
const grantsGoalSummaryEl = document.querySelector("#grants-goal-summary");
const grantsConfidenceBody = document.querySelector("#grants-confidence-body");
const grantsMetricEls = {
  weighted: document.querySelector("#grants-metric-weighted"),
  awarded: document.querySelector("#grants-metric-awarded"),
  pipeline: document.querySelector("#grants-metric-pipeline"),
  winRate: document.querySelector("#grants-metric-winrate"),
};

const refreshGrantsButton = document.querySelector("#refresh-grants");
const addGrantButton = document.querySelector("#add-grant");
const grantsApplicationsStatusEl = document.querySelector("#grants-applications-status");
const grantsApplicationsGroupsEl = document.querySelector("#grants-applications-groups");

const grantDialog = document.querySelector("#grant-dialog");
const grantForm = document.querySelector("#grant-form");
const grantDialogTitle = document.querySelector("#grant-dialog-title");
const grantDialogStatus = document.querySelector("#grant-dialog-status");
const grantCancelButton = document.querySelector("#grant-cancel");
const grantFields = {
  id: document.querySelector("#grant-id"),
  name: document.querySelector("#grant-name"),
  org: document.querySelector("#grant-org"),
  status: document.querySelector("#grant-status"),
  confidence: document.querySelector("#grant-confidence"),
  year: document.querySelector("#grant-year"),
  quarter: document.querySelector("#grant-quarter"),
  amount: document.querySelector("#grant-amount"),
  appOpens: document.querySelector("#grant-app-opens"),
  appCloses: document.querySelector("#grant-app-closes"),
  submittedDate: document.querySelector("#grant-submitted-date"),
  notes: document.querySelector("#grant-notes"),
};

const refreshGrantsForecastButton = document.querySelector("#refresh-grants-forecast");
const grantsForecastStatusEl = document.querySelector("#grants-forecast-status");
const grantsForecastGroupsEl = document.querySelector("#grants-forecast-groups");
const grantsForecastMetricEls = {
  confirmedTotal: document.querySelector("#grants-forecast-confirmed-total"),
  anticipatedTotal: document.querySelector("#grants-forecast-anticipated-total"),
  combinedTotal: document.querySelector("#grants-forecast-combined-total"),
  goalGap: document.querySelector("#grants-forecast-goal-gap"),
};

const refreshGrantsBudgetButton = document.querySelector("#refresh-grants-budget");
const grantsBudgetStatusEl = document.querySelector("#grants-budget-status");
const grantsBudgetMetricEls = {
  revenue: document.querySelector("#grants-budget-revenue"),
  expenses: document.querySelector("#grants-budget-expenses"),
  net: document.querySelector("#grants-budget-net"),
};
const grantsBudgetConfidenceFilters = document.querySelector("#grants-budget-confidence-filters");
const grantsBudgetRevenueBody = document.querySelector("#grants-budget-revenue-body");
const grantsExpenseForm = document.querySelector("#grants-expense-form");
const grantsExpenseCategoryInput = document.querySelector("#grants-expense-category");
const grantsExpenseDescriptionInput = document.querySelector("#grants-expense-description");
const grantsExpenseNoteInput = document.querySelector("#grants-expense-note");
const grantsExpenseCardholderSelect = document.querySelector("#grants-expense-cardholder");
const grantsExpensePaymentMethodSelect = document.querySelector("#grants-expense-payment-method");
const grantsExpenseAmountInput = document.querySelector("#grants-expense-amount");
const grantsExpensesBody = document.querySelector("#grants-expenses-body");
const grantsReceiptFileInput = document.querySelector("#grants-receipt-file");
const grantsReceiptCardholderSelect = document.querySelector("#grants-receipt-cardholder");
const grantsReceiptPaymentMethodSelect = document.querySelector("#grants-receipt-payment-method");
const grantsReceiptUploadButton = document.querySelector("#grants-receipt-upload-button");
const grantsReceiptUploadStatusEl = document.querySelector("#grants-receipt-upload-status");
const grantsReceiptsReviewSection = document.querySelector("#grants-receipts-review-section");
const grantsReceiptsReviewEmptyEl = document.querySelector("#grants-receipts-review-empty");
const grantsReceiptsReviewBody = document.querySelector("#grants-receipts-review-body");
const expensesYearSelect = document.querySelector("#expenses-year");
const refreshExpensesButton = document.querySelector("#refresh-expenses");
const allReceiptsEmptyEl = document.querySelector("#all-receipts-empty");
const allReceiptsSection = document.querySelector(".all-receipts-section");
const allReceiptsBody = document.querySelector("#all-receipts-body");
const manageCategoriesButton = document.querySelector("#manage-categories-button");
const categoriesDialog = document.querySelector("#categories-dialog");
const categoriesDialogStatusEl = document.querySelector("#categories-dialog-status");
const categoriesDialogCloseButton = document.querySelector("#categories-dialog-close");
const categoriesListEl = document.querySelector("#categories-list");
const categoriesAddForm = document.querySelector("#categories-add-form");
const categoryNewNameInput = document.querySelector("#category-new-name");
const manageReceiptOptionsButton = document.querySelector("#manage-receipt-options-button");
const receiptOptionsDialog = document.querySelector("#receipt-options-dialog");
const receiptOptionsDialogStatusEl = document.querySelector("#receipt-options-dialog-status");
const receiptOptionsDialogCloseButton = document.querySelector("#receipt-options-dialog-close");
const RECEIPT_OPTION_KINDS = ["cardholder", "payment_method"];

const ptoStatusFilterSelect = document.querySelector("#pto-status-filter");
const refreshPtoButton = document.querySelector("#refresh-pto");
const ptoRequestForm = document.querySelector("#pto-request-form");
const ptoStaffSelect = document.querySelector("#pto-staff");
const ptoStartDateInput = document.querySelector("#pto-start-date");
const ptoEndDateInput = document.querySelector("#pto-end-date");
const ptoLeaveTypeSelect = document.querySelector("#pto-leave-type");
const ptoNoteInput = document.querySelector("#pto-note");
const ptoRequestButton = document.querySelector("#pto-request-button");
const ptoStatusEl = document.querySelector("#pto-status");
const ptoRequestsBody = document.querySelector("#pto-requests-body");
const ptoRequestsEmptyEl = document.querySelector("#pto-requests-empty");

const mileageStatusFilterSelect = document.querySelector("#mileage-status-filter");
const refreshMileageButton = document.querySelector("#refresh-mileage");
const mileageRequestForm = document.querySelector("#mileage-request-form");
const mileageStaffSelect = document.querySelector("#mileage-staff");
const mileageTripDateInput = document.querySelector("#mileage-trip-date");
const mileageStartAddressInput = document.querySelector("#mileage-start-address");
const mileageEndAddressInput = document.querySelector("#mileage-end-address");
const mileagePurposeInput = document.querySelector("#mileage-purpose");
const mileageMilesInput = document.querySelector("#mileage-miles");
const mileageNoteInput = document.querySelector("#mileage-note");
const mileagePhotosInput = document.querySelector("#mileage-photos");
const mileageRequestButton = document.querySelector("#mileage-request-button");
const mileageStatusEl = document.querySelector("#mileage-status");
const mileageRequestsBody = document.querySelector("#mileage-requests-body");
const mileageRequestsEmptyEl = document.querySelector("#mileage-requests-empty");

const scheduleWeekSelect = document.querySelector("#schedule-week-select");
const newScheduleWeekButton = document.querySelector("#new-schedule-week");
const deleteScheduleWeekButton = document.querySelector("#delete-schedule-week");
const scheduleStatusEl = document.querySelector("#schedule-status");
const scheduleGridHeaderRow = document.querySelector("#schedule-grid-header-row");
const scheduleGridBody = document.querySelector("#schedule-grid-body");
const scheduleEmptyEl = document.querySelector("#schedule-empty");
const scheduleWeekDialog = document.querySelector("#schedule-week-dialog");
const scheduleWeekForm = document.querySelector("#schedule-week-form");
const scheduleWeekStartInput = document.querySelector("#schedule-week-start");
const scheduleWeekDialogStatus = document.querySelector("#schedule-week-dialog-status");
const scheduleWeekCancelButton = document.querySelector("#schedule-week-cancel");
const scheduleWeekCopyField = document.querySelector("#schedule-week-copy-field");
const scheduleWeekCopyPreviousCheckbox = document.querySelector("#schedule-week-copy-previous");
const scheduleWeekCopyPreviousLabel = document.querySelector("#schedule-week-copy-previous-label");

const staffAddForm = document.querySelector("#staff-add-form");
const staffAddNameInput = document.querySelector("#staff-add-name");
const staffAddButton = document.querySelector("#staff-add-button");
const staffStatusEl = document.querySelector("#staff-status");
const staffBody = document.querySelector("#staff-body");
const staffEmptyEl = document.querySelector("#staff-empty");

const GRANT_STATUSES = ["Awarded", "Submitted", "Not Started", "Rejected"];
const GRANT_CONFIDENCE_LEVELS = ["Confirmed", "Optimistic", "Hopeful", "Reach", "Unlikely"];
// Receipt categories are fully editable now (Manage Categories, backed by grant_expense_categories
// in server.js) -- this just holds whatever the server last reported, refreshed by
// loadGrantsReceipts. Seeded with a placeholder so the review-queue dropdown isn't empty before
// the first load completes.
let grantExpenseCategoryNames = ["Other"];
// Cardholders/payment methods are editable lists (Manage Cardholders & Payment, backed by
// receipt_options in server.js) -- these just hold whatever the server last reported, refreshed
// by loadGrantsReceipts/loadExpensesLedger.
let grantReceiptCardholders = [];
let grantReceiptPaymentMethods = [];
// Grants available to assign to an expense/receipt line, refreshed alongside the above. Scoped to
// the selected year (same as the rest of the Budget tab).
let grantsForPicker = [];

const grantsState = {
  grants: [],
  loading: false,
};

const grantsDashboardState = {
  loading: false,
};

const grantsForecastState = {
  data: null,
  loading: false,
};

const grantsBudgetState = {
  data: null,
  confidenceFilter: "",
  loading: false,
};

const grantsReceiptsState = {
  receipts: [],
  loading: false,
  uploading: false,
};

// The Expenses tab's own ledger + all-receipts data, decoupled from grantsBudgetState (which now
// only backs the Grants > Budget summary tiles and Revenue table).
const expensesLedgerState = {
  expenses: [],
  loading: false,
  editingId: null,
};

const allReceiptsState = {
  receipts: [],
  loading: false,
  editingId: null,
};

const attendanceDateInput = document.querySelector("#attendance-date");
const attendanceFromInput = document.querySelector("#attendance-from");
const attendanceToInput = document.querySelector("#attendance-to");
const attendanceThisMonthButton = document.querySelector("#attendance-this-month");
const attendanceLastMonthButton = document.querySelector("#attendance-last-month");
const attendanceStatusEl = document.querySelector("#attendance-status");
const attendanceTableBody = document.querySelector("#attendance-table-body");
const attendanceCountEl = document.querySelector("#attendance-metric-count");
const attendancePeopleEl = document.querySelector("#attendance-metric-people");
const attendanceTodayButton = document.querySelector("#attendance-today");
const attendanceClearDateButton = document.querySelector("#attendance-clear-date");
const refreshAttendanceButton = document.querySelector("#refresh-attendance");
const downloadAttendanceCsvButton = document.querySelector("#download-attendance-csv");
const downloadAttendanceByPersonCsvButton = document.querySelector("#download-attendance-by-person-csv");
const addAttendanceRecordButton = document.querySelector("#add-attendance-record");

const attendanceRecordDialog = document.querySelector("#attendance-record-dialog");
const attendanceRecordForm = document.querySelector("#attendance-record-form");
const attendanceRecordDialogTitle = document.querySelector("#attendance-record-dialog-title");
const attendanceRecordDialogStatus = document.querySelector("#attendance-record-dialog-status");
const attendanceRecordCancelButton = document.querySelector("#attendance-record-cancel");
const attendanceRecordFields = {
  id: document.querySelector("#attendance-record-id"),
  fullName: document.querySelector("#attendance-record-name"),
  attendanceDate: document.querySelector("#attendance-record-date"),
  className: document.querySelector("#attendance-record-class"),
};

const attendanceImportForm = document.querySelector("#attendance-import-form");
const attendanceImportCsvInput = document.querySelector("#attendance-import-csv");
const attendanceImportStatusEl = document.querySelector("#attendance-import-status");

const attendanceRateYearSelect = document.querySelector("#attendance-rate-year");
const refreshAttendanceRateButton = document.querySelector("#refresh-attendance-rate");
const downloadAttendanceRatePdfButton = document.querySelector("#download-attendance-rate-pdf");
const attendanceRateStatusEl = document.querySelector("#attendance-rate-status");

const attendanceRateState = {
  data: null,
  loading: false,
};

const attendanceState = {
  data: [],
  loading: false,
};

const knownGenders = new Set([
  "male",
  "female",
  "m",
  "f",
  "non-binary",
  "nonbinary",
  "genderqueer",
  "transgender",
  "other",
  "prefer not to say",
  "unknown",
]);

const metricEls = {
  logs: document.querySelector("#metric-logs"),
  activities: document.querySelector("#metric-activities"),
  minutes: document.querySelector("#metric-minutes"),
  youth: document.querySelector("#metric-youth"),
};

function tableFor(tbodySelector) {
  return document.querySelector(tbodySelector).closest("table");
}

// Every data table on the dashboard gets Excel-style per-column filter/sort controls via
// table-filters.js. Each entry below owns rendering for its table from here on — call
// `.setRows(...)` instead of writing rows into the DOM directly.
const filterableTables = {
  recentActivities: createFilterableTable({
    table: tableFor("#recent-activities-body"),
    emptyMessage: "No interactions found for this range.",
    columns: [
      { value: (row) => formatDate(row.session_date) },
      { value: "coach" },
      { value: "youth_name" },
      { value: "activity" },
      { value: "activity_modifier" },
      { value: (row) => formatHours(row.minutes), className: "numeric", filterValue: (row) => numberValue(row.minutes) },
    ],
  }),
  recentLogs: createFilterableTable({
    table: tableFor("#recent-logs-body"),
    emptyMessage: "No logs found for this range.",
    columns: [
      { value: (row) => formatDate(row.session_date) },
      { value: "coach" },
      { value: (row) => formatNumber(row.activity_count), className: "numeric", filterValue: (row) => numberValue(row.activity_count) },
      { value: (row) => formatHours(row.total_minutes), className: "numeric", filterValue: (row) => numberValue(row.total_minutes) },
      { value: "response" },
    ],
  }),
};

// Roster and attendance keep their custom row markup (flag badges, edit/delete buttons), so
// they supply `extraCells` renderers for the trailing, non-filterable columns instead of using
// plain `columns` for everything.
const rosterFilterTable = createFilterableTable({
  table: tableFor("#roster-table-body"),
  emptyMessage: "No roster data yet.",
  rowClassName: (person) => (flagRosterPerson(person).length ? "row-flagged" : ""),
  columns: [
    { value: "fullName" },
    { value: "rosterStatus" },
    { value: (person) => formatDate(person.birthDate) },
    {
      value: (person) => person.age ?? "",
      className: "numeric",
      filterValue: (person) => (person.age === null || person.age === undefined ? "" : Number(person.age)),
    },
    { value: "address" },
    { value: (person) => formatDate(person.firstAttDate) },
    { value: "raceEthnicity" },
    { value: "zipcode" },
    { value: "school" },
    { value: "gender" },
    {
      value: (person) => formatNumber(person.attendanceCount),
      className: "numeric",
      filterValue: (person) => numberValue(person.attendanceCount),
    },
    { value: (person) => formatDate(person.lastSeenAt) },
  ],
  extraCells: [
    (person) => {
      const cell = document.createElement("td");
      const flags = flagRosterPerson(person);
      cell.innerHTML = flags.map((flag) => `<span class="row-flag-badge">${escapeHtml(flag)}</span>`).join("");
      return cell;
    },
    (person) => {
      const cell = document.createElement("td");
      cell.className = "row-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "row-action-button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => openRosterPersonDialog(person));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "row-action-button danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteRosterPerson(person));

      cell.append(editButton, deleteButton);
      return cell;
    },
  ],
});

const attendanceFilterTable = createFilterableTable({
  table: tableFor("#attendance-table-body"),
  emptyMessage: "No attendance records found.",
  columns: [
    { value: (record) => attendanceRecordDate(record) },
    { value: (record) => formatTime(record.receivedAt), filterValue: (record) => record.receivedAt || "" },
    { value: "fullName" },
    { value: (record) => attendanceRecordClass(record) },
    { value: "source" },
  ],
  extraCells: [
    (record) => {
      const cell = document.createElement("td");
      cell.className = "row-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "row-action-button";
      editButton.textContent = "Edit";
      editButton.addEventListener("click", () => openAttendanceRecordDialog(record));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "row-action-button danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteAttendanceRecord(record));

      cell.append(editButton, deleteButton);
      return cell;
    },
  ],
});

// Per-person rollup of whatever's currently loaded into attendanceFilterTable above (same date
// filter, just grouped) -- lets "how many unique people came in July" or "how often does this
// kid show up" be answered by sorting/filtering a table instead of hand-counting rows.
const attendanceByPersonFilterTable = createFilterableTable({
  table: tableFor("#attendance-by-person-body"),
  emptyMessage: "No attendance records found.",
  columns: [
    { value: "name" },
    { value: (person) => formatNumber(person.visits), filterValue: (person) => person.visits },
    { value: (person) => person.firstVisit || "—" },
    { value: (person) => person.lastVisit || "—" },
  ],
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function dateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function localIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

function endOfWeek(date) {
  const copy = startOfWeek(date);
  copy.setDate(copy.getDate() + 6);
  return copy;
}

function setDateRange(range) {
  const now = new Date();
  let from = new Date();
  let to = new Date();

  if (range === "week") {
    from = startOfWeek(now);
    to = endOfWeek(now);
    document.querySelector("#period-filter").value = "week";
  }

  if (range === "last-week") {
    from = startOfWeek(now);
    from.setDate(from.getDate() - 7);
    to = endOfWeek(from);
    document.querySelector("#period-filter").value = "week";
  }

  if (range === "month") {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    document.querySelector("#period-filter").value = "month";
  }

  if (range === "last-month") {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
    document.querySelector("#period-filter").value = "month";
  }

  document.querySelector("#date-from").value = localIsoDate(from);
  document.querySelector("#date-to").value = localIsoDate(to);
}

function numberValue(value) {
  return Number(value || 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(numberValue(value));
}

// The report is tracked/stored in minutes everywhere, but coaches and admins think in hours —
// these two helpers are the only place minutes get converted for display.
function minutesToHours(value) {
  return numberValue(value) / 60;
}

function formatHours(value) {
  return minutesToHours(value).toFixed(1);
}

// CSV exports keep a bit more precision than the on-screen 1-decimal display, since they're
// meant for further spreadsheet analysis rather than at-a-glance reading.
function csvHours(value) {
  return Math.round(minutesToHours(value) * 100) / 100;
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function setStatus(message, type = "") {
  statusEl.textContent = message || "";
  statusEl.className = `dashboard-status ${type}`.trim();
}

function setImportStatus(message, type = "") {
  rosterImportStatus.textContent = message || "";
  rosterImportStatus.className = `import-status ${type}`.trim();
}

function getFiltersQuery() {
  const params = new URLSearchParams();
  const formData = new FormData(filtersForm);

  for (const [key, value] of formData.entries()) {
    const trimmed = String(value || "").trim();
    if (trimmed) params.set(key, trimmed);
  }

  return params;
}

function setSelectOptions(select, values, emptyLabel) {
  const currentValue = select.value;
  select.replaceChildren(new Option(emptyLabel, ""));

  values
    .filter(Boolean)
    .forEach((value) => {
      select.append(new Option(value, value));
    });

  if (values.includes(currentValue)) {
    select.value = currentValue;
  }
}

function renderMetrics(summary = {}) {
  metricEls.logs.textContent = formatNumber(summary.log_count);
  metricEls.activities.textContent = formatNumber(summary.activity_count);
  metricEls.minutes.textContent = formatHours(summary.total_minutes);
  metricEls.youth.textContent = formatNumber(summary.youth_count);
}

function firstRow(rows = []) {
  return rows.length ? rows[0] : null;
}

function renderSummary(data) {
  const summary = data.summary || {};
  const topActivity = firstRow(data.byActivity || []);
  const topFocus = firstRow(data.byFocus || []);
  const topParticipant = firstRow(data.byYouth || []);
  const trend = [...(data.periodTrend || [])].reverse();
  const latestPeriod = trend.at(-1);
  const previousPeriod = trend.at(-2);
  const trendText =
    latestPeriod && previousPeriod
      ? `Most recent ${data.period || "week"}: ${formatHours(latestPeriod.total_minutes)} hours, ${
          numberValue(latestPeriod.total_minutes) >= numberValue(previousPeriod.total_minutes) ? "up from" : "down from"
        } ${formatHours(previousPeriod.total_minutes)}.`
      : "Trend comparison will appear after at least two periods have data.";

  const items = [
    `${formatNumber(summary.log_count)} logs captured, covering ${formatNumber(summary.youth_count)} participants and ${formatHours(summary.total_minutes)} total hours.`,
    topActivity
      ? `Most logged activity: ${topActivity.activity} (${formatHours(topActivity.total_minutes)} hours).`
      : "No activity has been logged for this range yet.",
    topFocus
      ? `Most common focus: ${topFocus.focus} (${formatHours(topFocus.total_minutes)} hours).`
      : "No focus area has been logged for this range yet.",
    topParticipant
      ? `Most supported participant: ${topParticipant.youth_name} (${formatHours(topParticipant.total_minutes)} hours).`
      : "No participant interactions found for this range.",
    trendText,
  ];

  summaryList.replaceChildren(
    ...items.map((item) => {
      const el = document.createElement("p");
      el.textContent = item;
      return el;
    }),
  );
}

function renderOptions(options = {}) {
  setSelectOptions(coachFilter, options.coaches || [], "All coaches");
  setSelectOptions(activityFilter, options.activities || [], "All activities");
  setSelectOptions(focusFilter, options.focuses || [], "All focuses");
  setSelectOptions(genderFilter, options.genders || [], "All genders");
  setSelectOptions(ethnicityFilter, options.ethnicities || [], "All race/ethnicities");
  setSelectOptions(schoolFilter, options.schools || [], "All schools");
  setSelectOptions(competencyFilter, options.competencies || [], "All competencies");
}

const CHART_PALETTE = ["#0b6f6a", "#e08e45", "#4c6ef5", "#c2255c", "#2b8a3e", "#f08c00", "#7048e8", "#1098ad"];

function chartColor(index) {
  return CHART_PALETTE[index % CHART_PALETTE.length];
}

const chartInstances = {};

function renderOrUpdateChart(selector, config) {
  const canvas = document.querySelector(selector);
  if (!canvas || typeof Chart === "undefined") return;
  if (chartInstances[selector]) chartInstances[selector].destroy();
  chartInstances[selector] = new Chart(canvas, config);
}

function baseChartOptions(overrides = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
    ...overrides,
  };
}

function barChartConfig(rows, labelKey, valueKey, valueLabel, horizontal = false) {
  const top = [...rows]
    .sort((a, b) => numberValue(b[valueKey]) - numberValue(a[valueKey]))
    .slice(0, 10);

  return {
    type: "bar",
    data: {
      labels: top.map((row) => row[labelKey] || "Unknown"),
      datasets: [
        {
          label: valueLabel,
          data: top.map((row) => minutesToHours(row[valueKey])),
          backgroundColor: "rgba(11, 111, 106, 0.75)",
          borderRadius: 4,
        },
      ],
    },
    options: baseChartOptions(horizontal ? { indexAxis: "y", scales: { x: { beginAtZero: true } } } : {}),
  };
}

function donutChartConfig(rows, labelKey, valueKey) {
  const filtered = rows.filter((row) => numberValue(row[valueKey]) > 0);

  return {
    type: "doughnut",
    data: {
      labels: filtered.map((row) => row[labelKey] || "Unknown"),
      datasets: [
        {
          data: filtered.map((row) => minutesToHours(row[valueKey])),
          backgroundColor: filtered.map((_, index) => chartColor(index)),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  };
}

function renderCharts(data) {
  const trend = [...(data.periodTrend || [])].reverse();

  renderOrUpdateChart("#chart-trend", {
    type: "line",
    data: {
      labels: trend.map((row) => row.period_start),
      datasets: [
        {
          label: "Hours",
          data: trend.map((row) => minutesToHours(row.total_minutes)),
          borderColor: "#0b6f6a",
          backgroundColor: "rgba(11, 111, 106, 0.12)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    },
    options: baseChartOptions(),
  });

  renderOrUpdateChart("#chart-by-coach", barChartConfig(data.byCoach || [], "coach", "total_minutes", "Hours"));
  renderOrUpdateChart("#chart-by-activity", barChartConfig(data.byActivity || [], "activity", "total_minutes", "Hours"));
  renderOrUpdateChart("#chart-by-gender", donutChartConfig(data.byGender || [], "gender", "total_minutes"));
  renderOrUpdateChart("#chart-by-ethnicity", donutChartConfig(data.byEthnicity || [], "ethnicity", "total_minutes"));
  renderOrUpdateChart("#chart-by-school", barChartConfig(data.bySchool || [], "school", "total_minutes", "Hours", true));
  renderOrUpdateChart("#chart-by-competency", donutChartConfig(data.byCompetency || [], "competency", "total_minutes"));
}

function renderReport(data) {
  renderOptions(data.options || {});
  renderMetrics(data.summary || {});
  renderSummary(data);

  filterableTables.recentActivities.setRows(data.recentActivities || []);
  filterableTables.recentLogs.setRows(data.recentLogs || []);

  // The breakdown tables (By Coach/Activity/Gender/etc.) no longer have a live view on the
  // dashboard, but their chart counterparts still render into the hidden pdf-chart-source
  // canvases below, since the PDF report still includes them.
  renderCharts(data);
}

async function loadReport() {
  if (reportState.loading) return;
  reportState.loading = true;
  setStatus("Loading report...");

  try {
    const query = getFiltersQuery();
    const response = await fetch(`/api/reports/dashboard?${query.toString()}`);

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Report failed to load.");
    }

    reportState.data = data;
    renderReport(data);
    setStatus(`Updated ${new Date().toLocaleString()}.`);
  } catch (error) {
    setStatus(error.message, "danger");
  } finally {
    reportState.loading = false;
  }
}

const overviewState = {
  loading: false,
};

function setOverviewStatus(message, type = "") {
  overviewStatusEl.textContent = message || "";
  overviewStatusEl.className = `dashboard-status ${type}`.trim();
}

// Independent of reportState/loadReport (which reflects whatever filters are set on the Logs
// tab) -- this always pulls a plain trailing-30-day snapshot, regardless of what filters the user
// has applied elsewhere.
async function loadOverview() {
  if (overviewState.loading) return;
  overviewState.loading = true;
  setOverviewStatus("Loading overview...");

  overviewMetricEls.activeRoster.textContent = formatNumber(activeRosterRows().length);

  try {
    const last30Query = new URLSearchParams({ dateFrom: dateDaysAgo(30), dateTo: todayIso() });
    const [reportResponse, attendanceRateResponse, grantsDashboardResponse] = await Promise.all([
      fetch(`/api/reports/dashboard?${last30Query.toString()}`),
      fetch("/api/reports/overview-attendance"),
      fetch(`/api/grants/dashboard?year=${new Date().getFullYear()}`),
    ]);

    if (reportResponse.status === 401 || attendanceRateResponse.status === 401 || grantsDashboardResponse.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const reportData = await reportResponse.json();
    if (reportResponse.ok && reportData.ok) {
      const summary = reportData.summary || {};
      overviewMetricEls.logs30d.textContent = formatNumber(summary.log_count);
      overviewMetricEls.hours30d.textContent = formatHours(summary.total_minutes);
    }

    const attendanceRateData = await attendanceRateResponse.json();
    if (attendanceRateResponse.ok && attendanceRateData.ok) {
      overviewMetricEls.attendanceRate.textContent = `${Math.round(numberValue(attendanceRateData.attendanceRate) * 100)}%`;
      overviewMetricEls.avgAttendance.textContent = numberValue(attendanceRateData.avgAttendancePerDay).toFixed(1);
    } else {
      overviewMetricEls.attendanceRate.textContent = "N/A";
      overviewMetricEls.avgAttendance.textContent = "N/A";
    }

    const grantsDashboardData = await grantsDashboardResponse.json();
    overviewMetricEls.grantForecast.textContent =
      grantsDashboardResponse.ok && grantsDashboardData.ok ? formatCurrency(grantsDashboardData.weightedForecast) : "N/A";

    setOverviewStatus(`Updated ${new Date().toLocaleString()}.`);
  } catch (error) {
    setOverviewStatus(error.message, "danger");
  } finally {
    overviewState.loading = false;
  }
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read file.")));
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read file.")));
    reader.readAsDataURL(file);
  });
}

async function importRosterCsv(event) {
  event.preventDefault();

  const file = rosterCsvInput.files?.[0];
  if (!file) {
    setImportStatus("Choose a CSV file first.", "danger");
    return;
  }

  setImportStatus("Importing roster...");

  try {
    const csv = await readFileAsText(file);
    const response = await fetch("/api/roster/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, csv }),
    });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Roster import failed.");
    }

    const skippedText = data.skipped?.length ? ` ${data.skipped.length} skipped.` : "";
    setImportStatus(
      `Imported ${formatNumber(data.imported)} rows. Added ${formatNumber(data.added)} new names, found ${formatNumber(
        data.existing,
      )} already in roster.${skippedText}`,
    );
    rosterImportForm.reset();
    loadReport();
  } catch (error) {
    setImportStatus(error.message, "danger");
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
  });
}

function looksLikeDateText(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return true;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(raw)) return true;
  return false;
}

function flagRosterPerson(person) {
  const flags = [];
  const gender = String(person.gender || "").trim();
  if (gender && !knownGenders.has(gender.toLowerCase())) {
    flags.push(`Gender "${gender}" is unexpected`);
  }

  if (person.raceEthnicity && looksLikeDateText(person.raceEthnicity)) {
    flags.push(`Race/Ethnicity looks like a date ("${person.raceEthnicity}")`);
  }

  if (person.school && looksLikeDateText(person.school)) {
    flags.push(`School looks like a date ("${person.school}")`);
  }

  if (person.zipcode && !/^\d{3,10}(-\d{4})?$/.test(String(person.zipcode).trim())) {
    flags.push(`Zipcode "${person.zipcode}" doesn't look like a zipcode`);
  }

  return flags;
}

function setRosterStatus(message, type = "") {
  rosterStatusEl.textContent = message || "";
  rosterStatusEl.className = `roster-table-status ${type}`.trim();
}

function renderRosterTable() {
  const query = String(rosterSearchInput.value || "").trim().toLowerCase();
  const rows = activeRosterRows().filter(
    (person) => !query || String(person.fullName || "").toLowerCase().includes(query),
  );
  rosterFilterTable.setRows(rows);
}

function setRosterPersonDialogStatus(message, type = "") {
  rosterPersonDialogStatus.textContent = message || "";
  rosterPersonDialogStatus.className = `import-status ${type}`.trim();
}

function openRosterPersonDialog(person = null) {
  rosterPersonForm.reset();
  setRosterPersonDialogStatus("");
  rosterPersonFields.id.value = person?.id || "";
  rosterPersonFields.fullName.value = person?.fullName || "";
  rosterPersonFields.birthDate.value = formatDate(person?.birthDate);
  rosterPersonFields.age.value = person?.age ?? "";
  rosterPersonFields.address.value = person?.address || "";
  rosterPersonFields.firstAttDate.value = formatDate(person?.firstAttDate);
  rosterPersonFields.raceEthnicity.value = person?.raceEthnicity || "";
  rosterPersonFields.zipcode.value = person?.zipcode || "";
  rosterPersonFields.school.value = person?.school || "";
  rosterPersonFields.gender.value = person?.gender || "";
  rosterPersonDialogTitle.textContent = person ? "Edit person" : "Add person";
  rosterPersonDialog.showModal();
}

async function submitRosterPersonForm(event) {
  event.preventDefault();

  const id = rosterPersonFields.id.value;
  const payload = {
    fullName: rosterPersonFields.fullName.value,
    birthDate: rosterPersonFields.birthDate.value,
    age: rosterPersonFields.age.value,
    address: rosterPersonFields.address.value,
    firstAttDate: rosterPersonFields.firstAttDate.value,
    raceEthnicity: rosterPersonFields.raceEthnicity.value,
    zipcode: rosterPersonFields.zipcode.value,
    school: rosterPersonFields.school.value,
    gender: rosterPersonFields.gender.value,
  };

  setRosterPersonDialogStatus("Saving...");

  try {
    const response = await fetch(id ? `/api/roster/${encodeURIComponent(id)}` : "/api/roster", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Could not save this person.");
    }

    rosterPersonDialog.close();
    loadRosterTable();
    loadReport();
  } catch (error) {
    setRosterPersonDialogStatus(error.message, "danger");
  }
}

async function deleteRosterPerson(person) {
  if (!window.confirm(`Delete ${person.fullName} from the roster? This cannot be undone.`)) return;

  try {
    const response = await fetch(`/api/roster/${encodeURIComponent(person.id)}`, { method: "DELETE" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Could not delete this person.");
    }

    loadRosterTable();
    loadReport();
  } catch (error) {
    setRosterStatus(error.message, "danger");
  }
}

async function loadRosterTable() {
  if (rosterState.loading) return;
  rosterState.loading = true;
  setRosterStatus("Loading roster...");

  try {
    const response = await fetch("/api/roster", { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Roster failed to load.");

    rosterState.data = [...(data.roster || [])].sort((a, b) =>
      String(a.fullName || "").localeCompare(String(b.fullName || "")),
    );

    const activeCount = activeRosterRows().length;
    const flaggedCount = activeRosterRows().filter((person) => flagRosterPerson(person).length).length;
    setRosterStatus(
      flaggedCount
        ? `Showing ${formatNumber(activeCount)} active in the last ${ROSTER_ACTIVE_WINDOW_DAYS} days (of ${formatNumber(rosterState.data.length)} total). ${formatNumber(flaggedCount)} row(s) flagged for review.`
        : `Showing ${formatNumber(activeCount)} active in the last ${ROSTER_ACTIVE_WINDOW_DAYS} days (of ${formatNumber(rosterState.data.length)} total).`,
      flaggedCount ? "danger" : "",
    );
    renderRosterTable();
    renderSchoolGroups();
    if (overviewMetricEls.activeRoster) overviewMetricEls.activeRoster.textContent = formatNumber(activeCount);
  } catch (error) {
    setRosterStatus(error.message, "danger");
  } finally {
    rosterState.loading = false;
  }
}

// ---- School Groups: manually curated "report this raw school value under this name" list -----
// Mirrors the Unknown/N/A token lists in server.js (UNKNOWN_DEMOGRAPHIC_TOKENS /
// NOT_APPLICABLE_DEMOGRAPHIC_TOKENS). Kept as two separate sets, same as the server, so this board
// can treat them differently: "N/A"-token schools are a real, deliberate answer (not currently
// enrolled anywhere) and stay excluded from the board — grouping them wouldn't do anything, since
// the server already buckets them before ever consulting the alias table. "Unknown"-token schools
// (including a genuinely blank cell) mean the data is simply missing, so instead of being hidden
// they're folded into a single "Unknown" box so an admin can see who's missing school data.
const SCHOOL_UNKNOWN_TOKENS = new Set([
  "",
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
]);

const SCHOOL_NOT_APPLICABLE_TOKENS = new Set(["na", "notapplicable", "noschool", "notinschool"]);

const SCHOOL_UNKNOWN_GROUP_KEY = "__unknown__";

function canonicalSchoolToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function setSchoolGroupsStatus(message, type = "") {
  schoolGroupsStatusEl.textContent = message || "";
  schoolGroupsStatusEl.className = `school-groups-status ${type}`.trim();
}

async function loadSchoolAliases() {
  if (schoolAliasState.loading) return;
  schoolAliasState.loading = true;

  try {
    const response = await fetch("/api/school-aliases", { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "School groups failed to load.");

    schoolAliasState.data = data.aliases || [];
    if (data.configured === false) {
      setSchoolGroupsStatus("School groups require the database connection (DATABASE_URL) to be configured.", "danger");
    }
  } catch (error) {
    setSchoolGroupsStatus(error.message, "danger");
  } finally {
    schoolAliasState.loading = false;
    renderSchoolGroups();
  }
}

// Names for empty boxes an admin has created (via "Add empty group") but hasn't dragged anything
// into yet. Purely client-side scratch state — a group only becomes real (persisted) once it has
// at least one school in it, since school_aliases only stores per-school rows.
let pendingEmptyGroupNames = [];
let draggedRawSchool = null;

function personDisplayName(person) {
  return person.fullName || person.name || "Unnamed";
}

function personDisplayLabel(person) {
  const name = personDisplayName(person);
  const age = person.age === null || person.age === undefined || person.age === "" ? null : person.age;
  return age === null ? name : `${name} (${age})`;
}

function computeSchoolGroups() {
  const aliasByNormalized = new Map(schoolAliasState.data.map((alias) => [alias.rawAlias.toLowerCase().trim(), alias]));

  // normalized raw text (or SCHOOL_UNKNOWN_GROUP_KEY) -> { rawSchool (display casing), peopleCount, people }
  const counts = new Map();
  rosterState.data.forEach((person) => {
    const raw = String(person.school || "").trim();
    const token = canonicalSchoolToken(raw);
    if (SCHOOL_NOT_APPLICABLE_TOKENS.has(token)) return;

    const isUnknown = !raw || SCHOOL_UNKNOWN_TOKENS.has(token);
    const key = isUnknown ? SCHOOL_UNKNOWN_GROUP_KEY : raw.toLowerCase();
    const displayName = isUnknown ? "Unknown" : raw;

    const existing = counts.get(key);
    if (existing) {
      existing.peopleCount += 1;
      existing.people.push(person);
    } else {
      counts.set(key, { rawSchool: displayName, peopleCount: 1, people: [person] });
    }
  });

  const groups = new Map(); // canonicalName.toLowerCase() -> { canonicalName, members: [] }

  function groupFor(canonicalName) {
    const key = canonicalName.toLowerCase();
    if (!groups.has(key)) groups.set(key, { canonicalName, members: [] });
    return groups.get(key);
  }

  counts.forEach(({ rawSchool, peopleCount, people }) => {
    const alias = aliasByNormalized.get(rawSchool.toLowerCase());
    const canonicalName = alias ? alias.canonicalName : rawSchool;
    groupFor(canonicalName).members.push({ rawSchool, peopleCount, people, aliasId: alias ? alias.id : null });
  });

  pendingEmptyGroupNames.forEach((name) => groupFor(name));

  return [...groups.values()].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

function renderSchoolGroups() {
  const groups = computeSchoolGroups();
  schoolGroupsBoardEl.replaceChildren();

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "school-groups-status";
    empty.textContent = "No school data found in the roster yet.";
    schoolGroupsBoardEl.append(empty);
    return;
  }

  groups.forEach((group) => {
    schoolGroupsBoardEl.append(buildSchoolGroupBox(group));
  });
}

function buildSchoolGroupBox(group) {
  const totalPeople = group.members.reduce((sum, member) => sum + member.peopleCount, 0);

  const box = document.createElement("div");
  box.className = "school-group-box";
  if (group.members.length <= 1) box.classList.add("self-group");

  const header = document.createElement("div");
  header.className = "school-group-header";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "school-group-name";
  nameInput.value = group.canonicalName;
  nameInput.setAttribute("aria-label", "Group name");
  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") nameInput.blur();
    if (event.key === "Escape") {
      nameInput.value = group.canonicalName;
      nameInput.blur();
    }
  });
  nameInput.addEventListener("blur", () => {
    const nextName = nameInput.value.trim();
    if (!nextName || nextName.toLowerCase() === group.canonicalName.toLowerCase()) {
      nameInput.value = group.canonicalName;
      return;
    }
    renameSchoolGroup(group, nextName);
  });

  const count = document.createElement("span");
  count.className = "school-group-count";
  count.textContent = `${formatNumber(totalPeople)} ${totalPeople === 1 ? "person" : "people"}`;

  header.append(nameInput, count);

  const chipsHost = document.createElement("div");
  chipsHost.className = "school-group-chips";

  if (!group.members.length) {
    const hint = document.createElement("p");
    hint.className = "school-group-empty-hint";
    hint.textContent = "Drag a school here";
    chipsHost.append(hint);
  } else {
    group.members
      .sort((a, b) => a.rawSchool.localeCompare(b.rawSchool))
      .forEach((member) => chipsHost.append(buildSchoolChip(member)));
  }

  box.append(header, chipsHost);

  box.addEventListener("dragover", (event) => {
    event.preventDefault();
    box.classList.add("drag-over");
  });
  box.addEventListener("dragleave", () => {
    box.classList.remove("drag-over");
  });
  box.addEventListener("drop", (event) => {
    event.preventDefault();
    box.classList.remove("drag-over");
    const rawSchool = event.dataTransfer.getData("text/plain") || draggedRawSchool;
    if (rawSchool) moveSchoolToGroup(rawSchool, group.canonicalName);
  });

  return box;
}

function buildSchoolChip(member) {
  const chip = document.createElement("div");
  chip.className = "school-chip";
  chip.draggable = true;

  chip.addEventListener("dragstart", (event) => {
    draggedRawSchool = member.rawSchool;
    event.dataTransfer.setData("text/plain", member.rawSchool);
    event.dataTransfer.effectAllowed = "move";
    chip.classList.add("dragging");
  });
  chip.addEventListener("dragend", () => {
    chip.classList.remove("dragging");
    draggedRawSchool = null;
  });

  const chipHead = document.createElement("div");
  chipHead.className = "school-chip-head";

  const label = document.createElement("span");
  label.className = "school-chip-label";
  label.textContent = member.rawSchool;

  const count = document.createElement("span");
  count.className = "school-chip-count";
  count.textContent = String(member.peopleCount);

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "school-chip-remove";
  removeButton.setAttribute("aria-label", `Ungroup ${member.rawSchool}`);
  removeButton.textContent = "×";
  removeButton.addEventListener("click", () => moveSchoolToGroup(member.rawSchool, member.rawSchool));

  chipHead.append(label, count, removeButton);
  chip.append(chipHead);

  // Name (age) for each person currently bucketed under this raw school value, so an admin can
  // eyeball whether it makes sense for that person to be in this group.
  const peopleList = document.createElement("ul");
  peopleList.className = "school-chip-people";
  member.people
    .slice()
    .sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b)))
    .forEach((person) => {
      const item = document.createElement("li");
      item.textContent = personDisplayLabel(person);
      peopleList.append(item);
    });
  chip.append(peopleList);

  return chip;
}

async function moveSchoolToGroup(rawSchool, targetCanonicalName) {
  const revertingToSelf = targetCanonicalName.trim().toLowerCase() === rawSchool.toLowerCase();

  try {
    let response;
    if (revertingToSelf) {
      const existing = schoolAliasState.data.find((alias) => alias.rawAlias.toLowerCase() === rawSchool.toLowerCase());
      if (!existing) {
        setSchoolGroupsStatus(`"${rawSchool}" already reports under its own name.`, "ok");
        return;
      }
      response = await fetch(`/api/school-aliases/${encodeURIComponent(existing.id)}`, { method: "DELETE" });
    } else {
      response = await fetch("/api/school-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawAlias: rawSchool, canonicalName: targetCanonicalName.trim() }),
      });
    }

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not update this school group.");

    setSchoolGroupsStatus(
      revertingToSelf
        ? `"${rawSchool}" now reports under its own name again.`
        : `"${rawSchool}" now reports as "${targetCanonicalName.trim()}".`,
      "ok",
    );

    pendingEmptyGroupNames = pendingEmptyGroupNames.filter((name) => name.toLowerCase() !== targetCanonicalName.trim().toLowerCase());

    await loadSchoolAliases();
    loadReport();
  } catch (error) {
    setSchoolGroupsStatus(error.message, "danger");
  }
}

async function renameSchoolGroup(group, nextName) {
  setSchoolGroupsStatus(`Renaming "${group.canonicalName}" to "${nextName}"...`);

  try {
    if (!group.members.length) {
      // Empty box: just relabel the pending placeholder, nothing to persist yet.
      pendingEmptyGroupNames = pendingEmptyGroupNames.map((name) =>
        name.toLowerCase() === group.canonicalName.toLowerCase() ? nextName : name,
      );
      renderSchoolGroups();
      setSchoolGroupsStatus(`Empty group renamed to "${nextName}".`, "ok");
      return;
    }

    for (const member of group.members) {
      const response = await fetch("/api/school-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawAlias: member.rawSchool, canonicalName: nextName }),
      });

      if (response.status === 401) {
        window.location.href = "/login.html";
        return;
      }

      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || `Could not rename the group for "${member.rawSchool}".`);
    }

    setSchoolGroupsStatus(`Group renamed to "${nextName}".`, "ok");
    await loadSchoolAliases();
    loadReport();
  } catch (error) {
    setSchoolGroupsStatus(error.message, "danger");
    renderSchoolGroups();
  }
}

function addEmptySchoolGroup() {
  const name = window.prompt("Name for the new group:", "New Group");
  if (!name || !name.trim()) return;

  const trimmed = name.trim();
  const groups = computeSchoolGroups();
  if (groups.some((group) => group.canonicalName.toLowerCase() === trimmed.toLowerCase())) {
    setSchoolGroupsStatus(`A group named "${trimmed}" already exists.`, "danger");
    return;
  }

  pendingEmptyGroupNames.push(trimmed);
  renderSchoolGroups();
  setSchoolGroupsStatus(`Added empty group "${trimmed}" — drag a school into it.`, "ok");
}

function downloadRosterCsv() {
  const rows = activeRosterRows();
  if (!rows.length) return;

  const headers = [
    "Name",
    "Status",
    "Birth Date",
    "Age",
    "Address",
    "First Att. Date",
    "Race/Ethnicity",
    "Zipcode",
    "School",
    "Gender",
    "Attendance Count",
    "Last Seen",
    "Flags",
  ];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((person) =>
      [
        person.fullName,
        person.rosterStatus,
        formatDate(person.birthDate),
        person.age ?? "",
        person.address,
        formatDate(person.firstAttDate),
        person.raceEthnicity,
        person.zipcode,
        person.school,
        person.gender,
        person.attendanceCount,
        formatDate(person.lastSeenAt),
        flagRosterPerson(person).join("; "),
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];

  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `coach-log-roster-${todayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function setAttendanceStatus(message, type = "") {
  attendanceStatusEl.textContent = message || "";
  attendanceStatusEl.className = `attendance-status ${type}`.trim();
}

function formatTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function attendanceRecordDate(record) {
  return record.attendanceDate || formatDate(record.receivedAt);
}

function attendanceRecordClass(record) {
  return record.className || record.raw?.className || record.raw?.name || "";
}

// Groups the currently-loaded attendance rows (whatever date/range is selected) into one entry
// per unique person, with a visit count and their first/last date within that same selection --
// the data behind both the "Unique people" metric and the "By Person" table.
function computeAttendanceByPerson(rows) {
  const people = new Map();

  rows.forEach((record) => {
    const key = String(record.normalizedName || record.fullName || "").toLowerCase().trim();
    if (!key) return;

    const date = attendanceRecordDate(record);
    if (!people.has(key)) {
      people.set(key, { name: record.fullName || key, visits: 0, firstVisit: "", lastVisit: "" });
    }

    const person = people.get(key);
    person.visits += 1;
    if (date && (!person.firstVisit || date < person.firstVisit)) person.firstVisit = date;
    if (date && (!person.lastVisit || date > person.lastVisit)) person.lastVisit = date;
  });

  return [...people.values()].sort((a, b) => b.visits - a.visits);
}

function renderAttendanceTable() {
  const rows = attendanceState.data;
  const byPerson = computeAttendanceByPerson(rows);

  attendanceCountEl.textContent = formatNumber(rows.length);
  attendancePeopleEl.textContent = formatNumber(byPerson.length);

  attendanceFilterTable.setRows(rows);
  attendanceByPersonFilterTable.setRows(byPerson);
}

function setAttendanceRecordDialogStatus(message, type = "") {
  attendanceRecordDialogStatus.textContent = message || "";
  attendanceRecordDialogStatus.className = `import-status ${type}`.trim();
}

function openAttendanceRecordDialog(record = null) {
  attendanceRecordForm.reset();
  setAttendanceRecordDialogStatus("");
  attendanceRecordFields.id.value = record?.id || "";
  attendanceRecordFields.fullName.value = record?.fullName || "";
  attendanceRecordFields.attendanceDate.value = record ? attendanceRecordDate(record) : todayIso();
  attendanceRecordFields.className.value = record ? attendanceRecordClass(record) : "";
  attendanceRecordDialogTitle.textContent = record ? "Edit check-in" : "Add check-in";
  attendanceRecordDialog.showModal();
}

async function submitAttendanceRecordForm(event) {
  event.preventDefault();

  const id = attendanceRecordFields.id.value;
  const payload = {
    fullName: attendanceRecordFields.fullName.value,
    attendanceDate: attendanceRecordFields.attendanceDate.value,
    className: attendanceRecordFields.className.value,
  };

  setAttendanceRecordDialogStatus("Saving...");

  try {
    const response = await fetch(id ? `/api/attendance/${encodeURIComponent(id)}` : "/api/attendance", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Could not save this check-in.");
    }

    attendanceRecordDialog.close();
    loadAttendance();
    loadRosterTable();
  } catch (error) {
    setAttendanceRecordDialogStatus(error.message, "danger");
  }
}

async function deleteAttendanceRecord(record) {
  if (!window.confirm(`Delete this check-in for ${record.fullName}? This cannot be undone.`)) return;

  try {
    const response = await fetch(`/api/attendance/${encodeURIComponent(record.id)}`, { method: "DELETE" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Could not delete this check-in.");
    }

    loadAttendance();
  } catch (error) {
    setAttendanceStatus(error.message, "danger");
  }
}

async function loadAttendance() {
  if (attendanceState.loading) return;
  attendanceState.loading = true;
  setAttendanceStatus("Loading attendance...");

  try {
    // The exact-day picker and the From/To range are mutually exclusive (see the input
    // listeners below, which clear one when the other is used) -- an exact date wins if both
    // somehow ended up set, since it's the more specific request.
    const date = attendanceDateInput.value;
    const from = attendanceFromInput.value;
    const to = attendanceToInput.value;

    const params = new URLSearchParams();
    if (date) params.set("date", date);
    else {
      if (from) params.set("from", from);
      if (to) params.set("to", to);
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const response = await fetch(`/api/attendance${query}`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Attendance failed to load.");

    attendanceState.data = [...(data.attendance || [])].sort(
      (a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0),
    );

    renderAttendanceTable();

    let rangeLabel = "the most recent";
    if (date) rangeLabel = `for ${date}`;
    else if (from && to) rangeLabel = `from ${from} to ${to}`;
    else if (from) rangeLabel = `from ${from} onward`;
    else if (to) rangeLabel = `through ${to}`;

    setAttendanceStatus(
      date || from || to
        ? `Showing ${formatNumber(attendanceState.data.length)} check-in(s) ${rangeLabel}.`
        : `Showing the ${formatNumber(attendanceState.data.length)} most recent check-in(s).`,
    );
  } catch (error) {
    setAttendanceStatus(error.message, "danger");
  } finally {
    attendanceState.loading = false;
  }
}

function downloadAttendanceCsv() {
  const rows = attendanceState.data;
  if (!rows.length) return;

  const headers = ["Date", "Time", "Name", "Class", "Source"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((record) =>
      [
        attendanceRecordDate(record),
        formatTime(record.receivedAt),
        record.fullName,
        attendanceRecordClass(record),
        record.source,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];

  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `coach-log-attendance-${attendanceFilenameSuffix()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// Shared by both attendance CSV downloads -- the exact date if one's picked, the From/To range
// if that's what's active, or just today's date for the unfiltered "most recent" view.
function attendanceFilenameSuffix() {
  const date = attendanceDateInput.value;
  const from = attendanceFromInput.value;
  const to = attendanceToInput.value;
  if (date) return date;
  if (from || to) return `${from || "start"}_to_${to || "now"}`;
  return todayIso();
}

function downloadAttendanceByPersonCsv() {
  const rows = attendanceByPersonFilterTable.getVisibleRows();
  if (!rows.length) return;

  const headers = ["Name", "Visits", "First Visit", "Last Visit"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((person) => [person.name, person.visits, person.firstVisit, person.lastVisit].map(csvEscape).join(",")),
  ];

  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `coach-log-attendance-by-person-${attendanceFilenameSuffix()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function setAttendanceImportStatus(message, type = "") {
  attendanceImportStatusEl.textContent = message || "";
  attendanceImportStatusEl.className = `import-status ${type}`.trim();
}

async function importAttendanceCsv(event) {
  event.preventDefault();

  const file = attendanceImportCsvInput.files?.[0];
  if (!file) {
    setAttendanceImportStatus("Choose a CSV file first.", "danger");
    return;
  }

  setAttendanceImportStatus("Importing attendance...");

  try {
    const csv = await readFileAsText(file);
    const response = await fetch("/api/attendance/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: file.name, csv }),
    });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Attendance import failed.");
    }

    const skippedText = data.skipped?.length ? ` ${formatNumber(data.skipped.length)} row(s) skipped.` : "";
    const flaggedText = data.flagged?.length
      ? ` ${formatNumber(data.flagged.length)} birth date(s) looked off and were left blank -- check the roster.`
      : "";
    const replacedText = data.deletedOverlap ? ` Replaced ${formatNumber(data.deletedOverlap)} overlapping check-in(s).` : "";

    setAttendanceImportStatus(
      `Imported ${formatNumber(data.inserted)} check-in(s) from ${formatNumber(data.rowCount)} row(s), covering ${formatNumber(
        data.peopleUpdated,
      )} people.${replacedText}${skippedText}${flaggedText}`,
    );
    attendanceImportForm.reset();
    loadAttendance();
    loadAttendanceRateReport();
    loadReport();
  } catch (error) {
    setAttendanceImportStatus(error.message, "danger");
  }
}

// ---- Attendance Rate Report -----------------------------------------------------------------
// Mirrors the club's hand-kept spreadsheet: for a chosen year, how each month's attendance rate
// and average attendance-per-day broke down by gender, age group, and membership tenure — plus a
// "Year Total" rollup row and a line chart per dimension so the 12 monthly numbers read as a
// trend at a glance. All the actual bucketing/math happens server-side (getAttendanceRateReport in
// server.js); this just flattens that response into table rows and chart datasets.

const GENDER_BUCKETS = ["Male", "Female", "Other", "Unknown"];
const AGE_GROUP_BUCKETS = ["Youth", "Adult", "Unknown"];
const TENURE_BUCKETS = ["Under 6 months", "6-12 months", "1-2 years", "2+ years", "Unknown"];

const MONTH_LABELS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatPercent(value) {
  return `${(numberValue(value) * 100).toFixed(1)}%`;
}

function formatAvgPerDay(value) {
  return numberValue(value).toFixed(1);
}

// Turns one month's (or the year-total's) bucket rows for a single dimension into a flat object
// the filterable table can render — `${bucket}::rate` / `${bucket}::avgPerDay` per bucket, so the
// same column-builder works for all three dimensions regardless of how many buckets each has.
function flattenAttendanceBucketRow(label, { programDates, memberCount, rows }, buckets, isTotal = false) {
  const byBucket = new Map((rows || []).map((row) => [row.bucket, row]));
  const flat = { label, programDates, memberCount, isTotal };
  buckets.forEach((bucket) => {
    const found = byBucket.get(bucket);
    flat[`${bucket}::rate`] = found ? found.attendanceRate : 0;
    flat[`${bucket}::avgPerDay`] = found ? found.avgAttendancePerDay : 0;
  });
  return flat;
}

function buildAttendanceRateRows(monthlyEntries, yearTotalEntry, dimensionKey, buckets, year) {
  const rows = monthlyEntries.map((entry) =>
    flattenAttendanceBucketRow(`${MONTH_LABELS[entry.month - 1]} ${year}`, {
      programDates: entry.programDates,
      memberCount: entry.memberCount,
      rows: entry[dimensionKey],
    }, buckets),
  );

  rows.push(
    flattenAttendanceBucketRow(
      "Year Total",
      { programDates: yearTotalEntry.programDates, memberCount: yearTotalEntry.memberCount, rows: yearTotalEntry[dimensionKey] },
      buckets,
      true,
    ),
  );

  return rows;
}

function attendanceRateColumns(buckets) {
  const columns = [
    { value: "label" },
    { value: (row) => formatNumber(row.programDates), className: "numeric", filterValue: (row) => numberValue(row.programDates) },
  ];

  buckets.forEach((bucket) => {
    columns.push({
      value: (row) => formatPercent(row[`${bucket}::rate`]),
      className: "numeric",
      filterValue: (row) => numberValue(row[`${bucket}::rate`]),
    });
    columns.push({
      value: (row) => formatAvgPerDay(row[`${bucket}::avgPerDay`]),
      className: "numeric",
      filterValue: (row) => numberValue(row[`${bucket}::avgPerDay`]),
    });
  });

  return columns;
}

const attendanceRateTables = {
  gender: createFilterableTable({
    table: tableFor("#attendance-rate-gender-body"),
    emptyMessage: "No attendance recorded for this year.",
    rowClassName: (row) => (row.isTotal ? "row-total" : ""),
    columns: attendanceRateColumns(GENDER_BUCKETS),
  }),
  ageGroup: createFilterableTable({
    table: tableFor("#attendance-rate-age-body"),
    emptyMessage: "No attendance recorded for this year.",
    rowClassName: (row) => (row.isTotal ? "row-total" : ""),
    columns: attendanceRateColumns(AGE_GROUP_BUCKETS),
  }),
  tenure: createFilterableTable({
    table: tableFor("#attendance-rate-tenure-body"),
    emptyMessage: "No attendance recorded for this year.",
    rowClassName: (row) => (row.isTotal ? "row-total" : ""),
    columns: attendanceRateColumns(TENURE_BUCKETS),
  }),
};

function attendanceRateChartConfig(monthlyEntries, dimensionKey, buckets) {
  return {
    type: "line",
    data: {
      labels: monthlyEntries.map((entry) => MONTH_LABELS[entry.month - 1].slice(0, 3)),
      datasets: buckets.map((bucket, index) => ({
        label: bucket,
        data: monthlyEntries.map((entry) => {
          const found = (entry[dimensionKey] || []).find((row) => row.bucket === bucket);
          return found ? Math.round(found.attendanceRate * 1000) / 10 : 0;
        }),
        borderColor: chartColor(index),
        backgroundColor: chartColor(index),
        tension: 0.3,
        pointRadius: 3,
      })),
    },
    options: baseChartOptions({
      plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { callback: (value) => `${value}%` } } },
    }),
  };
}

function setAttendanceRateStatus(message, type = "") {
  attendanceRateStatusEl.textContent = message || "";
  attendanceRateStatusEl.className = `attendance-rate-status ${type}`.trim();
}

function renderAttendanceRateReport(data) {
  const year = data.year;
  const monthlyEntries = data.monthly || [];
  const yearTotal = data.yearTotal || { programDates: 0, memberCount: 0, gender: [], ageGroup: [], tenure: [] };

  attendanceRateTables.gender.setRows(buildAttendanceRateRows(monthlyEntries, yearTotal, "gender", GENDER_BUCKETS, year));
  attendanceRateTables.ageGroup.setRows(buildAttendanceRateRows(monthlyEntries, yearTotal, "ageGroup", AGE_GROUP_BUCKETS, year));
  attendanceRateTables.tenure.setRows(buildAttendanceRateRows(monthlyEntries, yearTotal, "tenure", TENURE_BUCKETS, year));

  renderOrUpdateChart("#chart-attendance-rate-gender", attendanceRateChartConfig(monthlyEntries, "gender", GENDER_BUCKETS));
  renderOrUpdateChart("#chart-attendance-rate-age", attendanceRateChartConfig(monthlyEntries, "ageGroup", AGE_GROUP_BUCKETS));
  renderOrUpdateChart("#chart-attendance-rate-tenure", attendanceRateChartConfig(monthlyEntries, "tenure", TENURE_BUCKETS));
}

function populateAttendanceRateYearOptions() {
  const currentYear = new Date().getFullYear();
  attendanceRateYearSelect.replaceChildren();
  for (let year = currentYear; year >= currentYear - 5; year--) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    attendanceRateYearSelect.append(option);
  }
  attendanceRateYearSelect.value = String(currentYear);
}

async function loadAttendanceRateReport() {
  if (attendanceRateState.loading) return;
  attendanceRateState.loading = true;
  setAttendanceRateStatus("Loading...");

  try {
    const year = attendanceRateYearSelect.value || String(new Date().getFullYear());
    const response = await fetch(`/api/reports/attendance-rate?year=${encodeURIComponent(year)}`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "Attendance rate report failed to load.");

    attendanceRateState.data = data;
    renderAttendanceRateReport(data);
    setAttendanceRateStatus(
      data.monthly.length ? `Showing ${data.monthly.length} month(s) with attendance in ${data.year}.` : `No attendance recorded for ${data.year}.`,
    );
  } catch (error) {
    setAttendanceRateStatus(error.message, "danger");
  } finally {
    attendanceRateState.loading = false;
  }
}

// Same jsPDF branding/pagination approach as downloadReportPdf, kept self-contained rather than
// shared since each export's layout (columns, sections) is different enough that sharing would
// mean threading a lot of parameters through anyway.
async function downloadAttendanceRatePdf() {
  const data = attendanceRateState.data;
  if (!data) {
    setAttendanceRateStatus("Load the attendance rate report before downloading the PDF.", "danger");
    return;
  }
  if (typeof window.jspdf === "undefined") {
    setAttendanceRateStatus("PDF library failed to load. Check your connection and try again.", "danger");
    return;
  }

  const originalLabel = downloadAttendanceRatePdfButton.textContent;
  downloadAttendanceRatePdfButton.disabled = true;
  downloadAttendanceRatePdfButton.textContent = "Preparing PDF...";

  try {
    const { header, watermark } = await getPdfBranding();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    function paintWatermark() {
      if (!watermark) return;
      const size = 300;
      const x = (pageWidth - size) / 2;
      const y = (pageHeight - size) / 2;
      try {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.06 }));
        doc.addImage(watermark, "PNG", x, y, size, size);
        doc.restoreGraphicsState();
      } catch (error) {
        // Older jsPDF builds without opacity support: skip the watermark, keep the export working.
      }
    }

    function paintHeader() {
      let y = margin;
      if (header) {
        const height = contentWidth * (header.naturalHeight / header.naturalWidth);
        doc.addImage(header, "PNG", margin, y, contentWidth, height);
        y += height + 14;
      }
      return y;
    }

    function newPage() {
      doc.addPage();
      paintWatermark();
      return paintHeader();
    }

    paintWatermark();
    let cursorY = paintHeader();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 15, 15);
    doc.text("Attendance Rate Report", margin, cursorY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    doc.text(`Year: ${data.year}`, margin, cursorY + 22);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, cursorY + 36);

    cursorY += 54;

    function ensureSpace(needed) {
      if (cursorY + needed > pageHeight - margin) {
        cursorY = newPage();
      }
    }

    function sectionTitle(text) {
      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      doc.setTextColor(20, 20, 20);
      doc.text(text, margin, cursorY);
      doc.setDrawColor(11, 111, 106);
      doc.setLineWidth(1);
      doc.line(margin, cursorY + 5, pageWidth - margin, cursorY + 5);
      cursorY += 20;
    }

    function drawTable(columns, rows) {
      const rowHeight = 15;
      const headerHeight = 17;

      function drawHeaderRow() {
        doc.setFillColor(233, 239, 238);
        doc.rect(margin, cursorY, contentWidth, headerHeight, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(30, 30, 30);
        let x = margin + 4;
        columns.forEach((col) => {
          if (col.align === "right") {
            doc.text(col.header, x + col.width - 6, cursorY + 12, { align: "right" });
          } else {
            doc.text(col.header, x, cursorY + 12);
          }
          x += col.width;
        });
        cursorY += headerHeight;
      }

      ensureSpace(headerHeight + rowHeight * Math.min(rows.length, 3) + 10);
      drawHeaderRow();

      rows.forEach((row) => {
        if (cursorY + rowHeight > pageHeight - margin) {
          cursorY = newPage();
          drawHeaderRow();
        }

        if (row.isTotal) {
          doc.setFillColor(233, 239, 238);
          doc.rect(margin, cursorY, contentWidth, rowHeight, "F");
        }

        doc.setFont("helvetica", row.isTotal ? "bold" : "normal");
        doc.setFontSize(7);
        doc.setTextColor(45, 45, 45);
        let x = margin + 4;
        row.cells.forEach((value, colIndex) => {
          const col = columns[colIndex];
          const text = String(value ?? "");
          const truncated = text.length > 22 ? `${text.slice(0, 20)}…` : text;
          if (col.align === "right") {
            doc.text(truncated, x + col.width - 6, cursorY + 11, { align: "right" });
          } else {
            doc.text(truncated, x, cursorY + 11);
          }
          x += col.width;
        });
        cursorY += rowHeight;
      });

      cursorY += 16;
    }

    // Short forms so headers fit their columns instead of overlapping -- the on-screen tables can
    // afford the full "Under 6 months Avg/Day"-style headers, but the PDF's columns are narrower.
    const PDF_BUCKET_LABELS = {
      "Under 6 months": "<6mo",
      "6-12 months": "6-12mo",
      "1-2 years": "1-2yr",
      "2+ years": "2+yr",
    };
    const pdfBucketLabel = (bucket) => PDF_BUCKET_LABELS[bucket] || bucket;

    // Unknown clutters a print-out meant to summarize known members, so the PDF drops it from
    // every dimension's chart and table -- it's still visible on the dashboard itself.
    const pdfBuckets = (buckets) => buckets.filter((bucket) => bucket !== "Unknown");

    // Month + Open Days get a fixed slice; whatever's left is split evenly across each bucket's
    // %/Avg column pair, however many buckets that dimension has.
    function pdfColumnsForBuckets(buckets) {
      const monthWidth = contentWidth * 0.16;
      const openDaysWidth = contentWidth * 0.1;
      const bucketColumnWidth = (contentWidth - monthWidth - openDaysWidth) / (buckets.length * 2);

      const columns = [
        { header: "Month", width: monthWidth },
        { header: "Open Days", width: openDaysWidth, align: "right" },
      ];
      buckets.forEach((bucket) => {
        const label = pdfBucketLabel(bucket);
        columns.push({ header: `${label} %`, width: bucketColumnWidth, align: "right" });
        columns.push({ header: `${label} Avg`, width: bucketColumnWidth, align: "right" });
      });
      return columns;
    }

    function pdfRowsForBuckets(dimensionKey, buckets) {
      return buildAttendanceRateRows(data.monthly || [], data.yearTotal || {}, dimensionKey, buckets, data.year).map((row) => ({
        isTotal: row.isTotal,
        cells: [
          row.label,
          formatNumber(row.programDates),
          ...buckets.flatMap((bucket) => [formatPercent(row[`${bucket}::rate`]), formatAvgPerDay(row[`${bucket}::avgPerDay`])]),
        ],
      }));
    }

    // Grabs a chart's current image with its "Unknown" dataset hidden, then restores the chart to
    // however it looked on-screen -- so the PDF's chart matches its Unknown-free table without
    // permanently altering the live dashboard chart.
    function chartImageWithoutUnknown(selector) {
      const instance = chartInstances[selector];
      if (!instance) return null;

      const unknownIndex = instance.data.datasets.findIndex((dataset) => dataset.label === "Unknown");
      if (unknownIndex === -1) return chartImage(selector);

      const meta = instance.getDatasetMeta(unknownIndex);
      const wasHidden = meta.hidden;
      meta.hidden = true;
      instance.update("none");
      const image = chartImage(selector);
      meta.hidden = wasHidden;
      instance.update("none");
      return image;
    }

    function dimensionSection(title, chartSelector, dimensionKey, buckets) {
      sectionTitle(title);

      const chartImg = chartImageWithoutUnknown(chartSelector);
      if (chartImg) {
        const chartHeight = 130;
        ensureSpace(chartHeight + 14);
        doc.addImage(chartImg, "PNG", margin, cursorY, contentWidth, chartHeight);
        cursorY += chartHeight + 14;
      }

      const shownBuckets = pdfBuckets(buckets);
      drawTable(pdfColumnsForBuckets(shownBuckets), pdfRowsForBuckets(dimensionKey, shownBuckets));
    }

    dimensionSection("By Gender", "#chart-attendance-rate-gender", "gender", GENDER_BUCKETS);
    dimensionSection("By Age Group", "#chart-attendance-rate-age", "ageGroup", AGE_GROUP_BUCKETS);
    dimensionSection("By Tenure", "#chart-attendance-rate-tenure", "tenure", TENURE_BUCKETS);

    const totalPages = doc.internal.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      doc.setPage(pageNumber);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(`Chicago Youth Boxing Club — Page ${pageNumber} of ${totalPages}`, pageWidth / 2, pageHeight - 18, {
        align: "center",
      });
    }

    doc.save(`attendance-rate-report-${data.year}.pdf`);
  } catch (error) {
    console.error(error);
    setAttendanceRateStatus("Could not generate the PDF report.", "danger");
  } finally {
    downloadAttendanceRatePdfButton.disabled = false;
    downloadAttendanceRatePdfButton.textContent = originalLabel;
  }
}

// ---- Grants (Grant Management) -----------------------------------------------------------

function formatCurrency(value) {
  return `$${new Intl.NumberFormat().format(Math.round(numberValue(value)))}`;
}

function formatPercent(value) {
  return `${Math.round(numberValue(value) * 100)}%`;
}

function setActiveGrantsView(view) {
  const nextView = ["dashboard", "applications", "forecasting", "budget"].includes(view) ? view : "dashboard";

  grantsViewPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.grantsViewPanel !== nextView);
  });

  grantsSubtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.grantsView === nextView);
  });
}

function selectedGrantsYear() {
  return Number(grantsYearSelect.value) || new Date().getFullYear();
}

function setActiveResourcesView(view) {
  const nextView = ["pto", "mileage", "schedule", "staff"].includes(view) ? view : "pto";

  resourcesViewPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.resourcesViewPanel !== nextView);
  });

  resourcesSubtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.resourcesView === nextView);
  });
}

function setActiveAttendanceView(view) {
  const nextView = ["daily", "reports", "lookup"].includes(view) ? view : "daily";

  attendanceViewPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.attendanceViewPanel !== nextView);
  });

  attendanceSubtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.attendanceView === nextView);
  });

  // Chart.js measures its canvas's rendered size at creation time, so a chart built while this
  // tab is hidden (e.g. the initial page-load call, before the user ever clicks "Reports") comes
  // out blank -- reserving its full height as empty space above the table with nothing drawn in
  // it. Rebuilding the charts here, only once this panel is actually visible, avoids that.
  if (nextView === "reports") loadAttendanceRateReport();
}

function populateGrantsYearOptions() {
  const currentYear = new Date().getFullYear();
  const previousValue = grantsYearSelect.value;
  grantsYearSelect.replaceChildren();
  for (let year = currentYear + 1; year >= currentYear - 3; year--) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    grantsYearSelect.append(option);
  }
  grantsYearSelect.value = previousValue || String(currentYear);
}

// The Expenses tab has its own year selector -- it's a separate top-level tab now, not nested
// under Grants, so it doesn't share grantsYearSelect's state.
function selectedExpensesYear() {
  return Number(expensesYearSelect.value) || new Date().getFullYear();
}

function populateExpensesYearOptions() {
  const currentYear = new Date().getFullYear();
  const previousValue = expensesYearSelect.value;
  expensesYearSelect.replaceChildren();
  for (let year = currentYear + 1; year >= currentYear - 3; year--) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    expensesYearSelect.append(option);
  }
  expensesYearSelect.value = previousValue || String(currentYear);
}

function setGrantsDashboardStatus(message, type = "") {
  grantsDashboardStatusEl.textContent = message || "";
  grantsDashboardStatusEl.className = `dashboard-status ${type}`.trim();
}

function renderGrantsConfidenceBreakdown(breakdown = []) {
  grantsConfidenceBody.replaceChildren(
    ...breakdown.map((row) => {
      const tr = document.createElement("tr");
      const cells = [row.level, formatNumber(row.count), formatCurrency(row.amount)];
      cells.forEach((value, index) => {
        const td = document.createElement("td");
        if (index > 0) td.className = "numeric";
        td.textContent = value;
        tr.append(td);
      });
      return tr;
    }),
  );
}

async function loadGrantsDashboard() {
  if (grantsDashboardState.loading) return;
  grantsDashboardState.loading = true;
  setGrantsDashboardStatus("Loading...");

  try {
    const year = selectedGrantsYear();
    const response = await fetch(`/api/grants/dashboard?year=${year}`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Grants dashboard failed to load.");
    }

    grantsMetricEls.weighted.textContent = formatCurrency(data.weightedForecast);
    grantsMetricEls.awarded.textContent = formatCurrency(data.totalAwarded);
    grantsMetricEls.pipeline.textContent = formatCurrency(data.pipeline);
    grantsMetricEls.winRate.textContent = data.decided ? formatPercent(data.winRate) : "—";

    grantsGoalInput.value = data.goalAmount || "";
    const progressPct = data.goalAmount > 0 ? Math.min(100, Math.round(data.goalProgress * 100)) : 0;
    grantsGoalProgressFill.style.width = `${progressPct}%`;
    grantsGoalSummaryEl.textContent = data.goalAmount
      ? `${formatPercent(data.goalProgress)} of ${formatCurrency(data.goalAmount)} · ${formatCurrency(data.confirmedAmount)} confirmed, ${formatCurrency(data.weightedForecast)} weighted · Gap: ${formatCurrency(data.goalGap)}`
      : `${formatCurrency(data.confirmedAmount)} confirmed, ${formatCurrency(data.weightedForecast)} weighted · Set an annual goal to track progress.`;

    renderGrantsConfidenceBreakdown(data.confidenceBreakdown);
    setGrantsDashboardStatus(`Updated ${new Date().toLocaleString()}.`);
  } catch (error) {
    setGrantsDashboardStatus(error.message, "danger");
  } finally {
    grantsDashboardState.loading = false;
  }
}

async function saveGrantsGoal() {
  const year = selectedGrantsYear();
  const goalAmount = Number(grantsGoalInput.value) || 0;

  try {
    const response = await fetch("/api/grants/goal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ year, goalAmount }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save goal.");
    loadGrantsDashboard();
  } catch (error) {
    setGrantsDashboardStatus(error.message, "danger");
  }
}

function setGrantsApplicationsStatus(message, type = "") {
  grantsApplicationsStatusEl.textContent = message || "";
  grantsApplicationsStatusEl.className = `dashboard-status ${type}`.trim();
}

function grantRowActionsCell(grant) {
  const cell = document.createElement("td");
  cell.className = "row-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "row-action-button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => openGrantDialog(grant));

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "row-action-button danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteGrantRow(grant));

  cell.append(editButton, deleteButton);
  return cell;
}

function renderGrantsApplications(grants) {
  const groups = GRANT_STATUSES.map((status) => ({
    status,
    rows: grants.filter((grant) => grant.status === status),
  })).filter((group) => group.rows.length);

  if (!groups.length) {
    grantsApplicationsGroupsEl.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "dashboard-status";
    empty.textContent = "No grants yet. Click + Add Grant to get started.";
    grantsApplicationsGroupsEl.append(empty);
    return;
  }

  grantsApplicationsGroupsEl.replaceChildren(
    ...groups.map((group) => {
      const wrapper = document.createElement("div");
      wrapper.className = "grants-status-group";

      const heading = document.createElement("div");
      heading.className = "grants-status-group-heading";
      const total = group.rows.reduce((sum, grant) => sum + numberValue(grant.amount), 0);
      heading.innerHTML = `<span>${escapeHtml(group.status)}</span><span class="grants-status-count">${group.rows.length} grant${group.rows.length === 1 ? "" : "s"} · ${escapeHtml(formatCurrency(total))}</span>`;

      const tableWrap = document.createElement("div");
      tableWrap.className = "table-wrap";
      const table = document.createElement("table");
      table.innerHTML = `
        <thead>
          <tr>
            <th>Grant</th>
            <th>Org</th>
            <th>Confidence</th>
            <th>Year/Q</th>
            <th class="numeric">Amount</th>
            <th>App Closes</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector("tbody");
      tbody.replaceChildren(
        ...group.rows.map((grant) => {
          const tr = document.createElement("tr");
          const cells = [
            grant.name,
            grant.org,
            grant.confidence,
            grant.quarter ? `${grant.year} Q${grant.quarter}` : String(grant.year),
            formatCurrency(grant.amount),
            formatDate(grant.appCloses) || "—",
            formatDate(grant.submittedDate) || "—",
          ];
          cells.forEach((value, index) => {
            const td = document.createElement("td");
            if (index === 4) td.className = "numeric";
            td.textContent = value;
            tr.append(td);
          });
          tr.append(grantRowActionsCell(grant));
          return tr;
        }),
      );

      tableWrap.append(table);
      wrapper.append(heading, tableWrap);
      return wrapper;
    }),
  );
}

async function loadGrants() {
  if (grantsState.loading) return;
  grantsState.loading = true;
  setGrantsApplicationsStatus("Loading grants...");

  try {
    const year = selectedGrantsYear();
    const response = await fetch(`/api/grants?year=${year}`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Grants failed to load.");
    }

    if (data.configured === false) {
      setGrantsApplicationsStatus("Grant management requires DATABASE_URL to be set.", "danger");
      grantsState.grants = [];
      renderGrantsApplications([]);
      return;
    }

    grantsState.grants = data.grants || [];
    renderGrantsApplications(grantsState.grants);
    setGrantsApplicationsStatus(`Showing ${formatNumber(grantsState.grants.length)} grant(s) for ${year}.`);
  } catch (error) {
    setGrantsApplicationsStatus(error.message, "danger");
  } finally {
    grantsState.loading = false;
  }
}

function setGrantDialogStatus(message, type = "") {
  grantDialogStatus.textContent = message || "";
  grantDialogStatus.className = `import-status ${type}`.trim();
}

function openGrantDialog(grant = null) {
  grantForm.reset();
  setGrantDialogStatus("");
  grantDialogTitle.textContent = grant ? "Edit grant" : "Add grant";
  grantFields.id.value = grant?.id || "";
  grantFields.name.value = grant?.name || "";
  grantFields.org.value = grant?.org || "";
  grantFields.status.value = grant?.status || "Not Started";
  grantFields.confidence.value = grant?.confidence || "Reach";
  grantFields.year.value = grant?.year || selectedGrantsYear();
  grantFields.quarter.value = grant?.quarter || "";
  grantFields.amount.value = grant?.amount ?? "";
  grantFields.appOpens.value = grant?.appOpens || "";
  grantFields.appCloses.value = grant?.appCloses || "";
  grantFields.submittedDate.value = grant?.submittedDate || "";
  grantFields.notes.value = grant?.notes || "";
  grantDialog.showModal();
}

async function submitGrantForm(event) {
  event.preventDefault();
  setGrantDialogStatus("Saving...");

  const id = grantFields.id.value;
  const payload = {
    name: grantFields.name.value.trim(),
    org: grantFields.org.value.trim(),
    status: grantFields.status.value,
    confidence: grantFields.confidence.value,
    year: Number(grantFields.year.value),
    quarter: grantFields.quarter.value ? Number(grantFields.quarter.value) : null,
    amount: Number(grantFields.amount.value) || 0,
    appOpens: grantFields.appOpens.value || null,
    appCloses: grantFields.appCloses.value || null,
    submittedDate: grantFields.submittedDate.value || null,
    notes: grantFields.notes.value.trim(),
  };

  try {
    const response = await fetch(id ? `/api/grants/${encodeURIComponent(id)}` : "/api/grants", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save grant.");

    grantDialog.close();
    loadGrants();
    loadGrantsDashboard();
    loadGrantsForecast();
  } catch (error) {
    setGrantDialogStatus(error.message, "danger");
  }
}

async function deleteGrantRow(grant) {
  if (!window.confirm(`Delete "${grant.name}"?`)) return;

  try {
    const response = await fetch(`/api/grants/${encodeURIComponent(grant.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete grant.");
    loadGrants();
    loadGrantsDashboard();
    loadGrantsForecast();
  } catch (error) {
    setGrantsApplicationsStatus(error.message, "danger");
  }
}

function setGrantsForecastStatus(message, type = "") {
  grantsForecastStatusEl.textContent = message || "";
  grantsForecastStatusEl.className = `dashboard-status ${type}`.trim();
}

function renderGrantsForecast(data) {
  grantsForecastMetricEls.confirmedTotal.textContent = formatCurrency(data.confirmedTotal);
  grantsForecastMetricEls.anticipatedTotal.textContent = formatCurrency(data.anticipatedTotal);
  const combinedTotal = data.confirmedTotal + data.anticipatedTotal;
  grantsForecastMetricEls.combinedTotal.textContent = formatCurrency(combinedTotal);
  grantsForecastMetricEls.goalGap.textContent = data.goalAmount ? formatCurrency(Math.max(data.goalAmount - combinedTotal, 0)) : "—";

  const groupsWithRows = data.groups.filter((group) => group.rows.length);

  if (!groupsWithRows.length) {
    grantsForecastGroupsEl.replaceChildren();
    const empty = document.createElement("p");
    empty.className = "dashboard-status";
    empty.textContent = "No active grants for this year yet.";
    grantsForecastGroupsEl.append(empty);
    return;
  }

  grantsForecastGroupsEl.replaceChildren(
    ...groupsWithRows.map((group) => {
      const wrapper = document.createElement("div");
      wrapper.className = "grants-forecast-group";

      const heading = document.createElement("div");
      heading.className = "grants-forecast-group-heading";
      heading.innerHTML = `<span>${escapeHtml(group.confidence)} (${Math.round(group.weight * 100)}%)</span><span class="grants-forecast-group-total">${escapeHtml(formatCurrency(group.total))}</span>`;

      const tableWrap = document.createElement("div");
      tableWrap.className = "table-wrap";
      const table = document.createElement("table");
      table.innerHTML = `
        <thead>
          <tr>
            <th>Grant</th>
            <th class="numeric">Q1</th>
            <th class="numeric">Q2</th>
            <th class="numeric">Q3</th>
            <th class="numeric">Q4</th>
            <th class="numeric">Total</th>
          </tr>
        </thead>
        <tbody></tbody>
        <tfoot></tfoot>
      `;
      const tbody = table.querySelector("tbody");
      tbody.replaceChildren(
        ...group.rows.map((row) => {
          const tr = document.createElement("tr");
          const cells = [
            row.name,
            ...row.quarterAmounts.map((amt) => (amt ? formatCurrency(amt) : "—")),
            formatCurrency(row.amount),
          ];
          cells.forEach((value, index) => {
            const td = document.createElement("td");
            if (index > 0) td.className = "numeric";
            td.textContent = value;
            tr.append(td);
          });
          return tr;
        }),
      );

      const tfoot = table.querySelector("tfoot");
      const totalRow = document.createElement("tr");
      const totalCells = ["Total", ...group.quarterTotals.map((amt) => formatCurrency(amt)), formatCurrency(group.total)];
      totalCells.forEach((value, index) => {
        const td = document.createElement("td");
        td.style.fontWeight = "800";
        if (index > 0) td.className = "numeric";
        td.textContent = value;
        totalRow.append(td);
      });
      tfoot.append(totalRow);

      tableWrap.append(table);
      wrapper.append(heading, tableWrap);
      return wrapper;
    }),
  );
}

async function loadGrantsForecast() {
  if (grantsForecastState.loading) return;
  grantsForecastState.loading = true;
  setGrantsForecastStatus("Loading forecast...");

  try {
    const year = selectedGrantsYear();
    const response = await fetch(`/api/grants/forecast?year=${year}`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Forecast failed to load.");
    }

    grantsForecastState.data = data;
    renderGrantsForecast(data);
    setGrantsForecastStatus(`Updated ${new Date().toLocaleString()}.`);
  } catch (error) {
    setGrantsForecastStatus(error.message, "danger");
  } finally {
    grantsForecastState.loading = false;
  }
}

function setGrantsBudgetStatus(message, type = "") {
  grantsBudgetStatusEl.textContent = message || "";
  grantsBudgetStatusEl.className = `dashboard-status ${type}`.trim();
}

function grantExpenseActionsCell(expense) {
  const cell = document.createElement("td");
  cell.className = "row-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "row-action-button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => {
    expensesLedgerState.editingId = expense.id;
    renderExpensesLedger();
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "row-action-button danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteGrantExpenseRow(expense));

  cell.append(editButton, deleteButton);
  return cell;
}

// Save/Cancel actions shown in place of Edit/Delete while a row is being edited.
function grantExpenseEditActionsCell(expense, fields) {
  const cell = document.createElement("td");
  cell.className = "row-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "row-action-button";
  saveButton.textContent = "Save";
  saveButton.addEventListener("click", () =>
    saveGrantExpenseEditRow(expense, {
      category: fields.categoryInput.value.trim(),
      description: fields.descriptionInput.value.trim(),
      note: fields.noteInput.value.trim(),
      cardholder: fields.cardholderSelect.value,
      paymentMethod: fields.paymentMethodSelect.value,
      amount: fields.amountInput.value,
      grantId: fields.grantSelect.value || null,
    }),
  );

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "row-action-button";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () => {
    expensesLedgerState.editingId = null;
    renderExpensesLedger();
  });

  cell.append(saveButton, cancelButton);
  return cell;
}

function renderGrantsBudget() {
  const data = grantsBudgetState.data;
  if (!data) return;

  grantsBudgetMetricEls.revenue.textContent = formatCurrency(data.revenue);
  grantsBudgetMetricEls.expenses.textContent = formatCurrency(data.totalExpenses);
  grantsBudgetMetricEls.net.textContent = formatCurrency(data.net);

  const filter = grantsBudgetState.confidenceFilter;
  const rows = (data.forecast.groups || [])
    .filter((group) => !filter || group.confidence === filter)
    .flatMap((group) => group.rows.map((row) => ({ ...row, groupConfidence: group.confidence })));

  if (!rows.length) {
    grantsBudgetRevenueBody.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 4;
    td.className = "empty-table";
    td.textContent = "No grants match this filter.";
    tr.append(td);
    grantsBudgetRevenueBody.append(tr);
  } else {
    grantsBudgetRevenueBody.replaceChildren(
      ...rows.map((row) => {
        const tr = document.createElement("tr");
        const cells = [row.name, row.groupConfidence, row.quarter ? `Q${row.quarter}` : "—", formatCurrency(row.amount)];
        cells.forEach((value, index) => {
          const td = document.createElement("td");
          if (index === 3) td.className = "numeric";
          td.textContent = value;
          tr.append(td);
        });
        return tr;
      }),
    );
  }
}

// Renders the expense ledger table on the Expenses tab -- decoupled from Grants > Budget (which
// only needs the totals, not the row-by-row list) since Expenses is now its own top-level tab.
function renderExpensesLedger() {
  const expenses = expensesLedgerState.expenses;
  if (!expenses.length) {
    grantsExpensesBody.replaceChildren();
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 8;
    td.className = "empty-table";
    td.textContent = "No expenses logged yet.";
    tr.append(td);
    grantsExpensesBody.append(tr);
    return;
  }

  grantsExpensesBody.replaceChildren(
    ...expenses.map((expense) => {
      const tr = document.createElement("tr");

      if (expensesLedgerState.editingId === expense.id) {
        const categoryInput = document.createElement("input");
        categoryInput.type = "text";
        categoryInput.value = expense.category || "";

        const descriptionInput = document.createElement("input");
        descriptionInput.type = "text";
        descriptionInput.value = expense.description || "";

        const noteInput = document.createElement("input");
        noteInput.type = "text";
        noteInput.value = expense.note || "";

        const cardholderSelect = cardholderSelectElement(expense.cardholder || "");
        const paymentMethodSelect = paymentMethodSelectElement(expense.paymentMethod || "");

        const amountInput = document.createElement("input");
        amountInput.type = "number";
        amountInput.min = "0";
        amountInput.step = "0.01";
        amountInput.value = expense.amount || 0;

        [categoryInput, descriptionInput, noteInput, cardholderSelect, paymentMethodSelect, amountInput].forEach(
          (el, index) => {
            const td = document.createElement("td");
            if (index === 5) td.className = "numeric";
            td.append(el);
            tr.append(td);
          },
        );

        const grantTd = document.createElement("td");
        const grantSelect = grantSelectElement(expense.grantId);
        grantTd.append(grantSelect);
        tr.append(grantTd);

        tr.append(
          grantExpenseEditActionsCell(expense, {
            categoryInput,
            descriptionInput,
            noteInput,
            cardholderSelect,
            paymentMethodSelect,
            amountInput,
            grantSelect,
          }),
        );
        return tr;
      }

      const cells = [
        expense.category || "—",
        expense.description || "—",
        expense.note || "—",
        expense.cardholder || "—",
        expense.paymentMethod || "—",
        formatCurrency(expense.amount),
      ];
      cells.forEach((value, index) => {
        const td = document.createElement("td");
        if (index === 5) td.className = "numeric";
        td.textContent = value;
        tr.append(td);
      });

      // Grant is the one field the grant manager assigns after the fact -- it's a live
      // <select> that saves immediately on change, unlike everything else here, which is fixed
      // once the expense is created (from the manual form or by confirming a receipt line).
      const grantTd = document.createElement("td");
      const grantSelect = grantSelectElement(expense.grantId);
      grantSelect.addEventListener("change", () => updateGrantExpenseGrant(expense, grantSelect.value || null));
      grantTd.append(grantSelect);
      tr.append(grantTd);

      tr.append(grantExpenseActionsCell(expense));
      return tr;
    }),
  );
}

async function loadExpensesLedger() {
  if (expensesLedgerState.loading) return;
  expensesLedgerState.loading = true;

  try {
    const year = selectedExpensesYear();
    const response = await fetch(`/api/grants/expenses?year=${year}`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load expenses.");

    expensesLedgerState.expenses = data.expenses || [];
    if (Array.isArray(data.cardholders)) grantReceiptCardholders = data.cardholders;
    if (Array.isArray(data.paymentMethods)) grantReceiptPaymentMethods = data.paymentMethods;
    if (data.grants) grantsForPicker = data.grants;
    refreshFixedPickerSelects();
    renderExpensesLedger();
  } catch (error) {
    setGrantsBudgetStatus(error.message, "danger");
  } finally {
    expensesLedgerState.loading = false;
  }
}

// Shows every receipt ever uploaded for the year, pending or confirmed, with a photo link and
// (once confirmed) which expense it became -- so nothing disappears from view just because it
// was already reviewed. This is separate from "Receipts to Review" above, which only lists
// pending lines still waiting on a human.
// Builds the receipt-photo thumbnail/PDF badge shared by the "Receipts to Review" cards and the
// "All Receipts" table (both read-only rows and the expanded edit form).
function receiptPhotoElement(receipt) {
  const wrap = document.createElement("div");
  wrap.className = "receipt-card-photo";
  const fileUrl = `/api/grants/receipts/${encodeURIComponent(receipt.receiptId)}/image`;
  if (receipt.mimeType === "application/pdf") {
    const badge = document.createElement("div");
    badge.className = "receipt-file-badge";
    badge.textContent = "PDF";
    badge.title = "Open PDF";
    badge.addEventListener("click", () => window.open(fileUrl, "_blank"));
    wrap.append(badge);
  } else {
    const img = document.createElement("img");
    img.className = "receipt-thumbnail";
    img.src = fileUrl;
    img.alt = "Receipt photo";
    img.addEventListener("click", () => window.open(img.src, "_blank"));
    wrap.append(img);
  }
  return wrap;
}

// Renders the same labeled fields grid used by the "Receipts to Review" cards, prefilled from an
// already-confirmed (or still-pending) receipt row -- shared so editing a row from "All Receipts"
// looks and behaves the same as reviewing a brand-new one, and never requires scrolling to see a
// field. Returns the grid element plus the live field references the caller needs to read back.
function receiptEditFieldsGrid(receipt) {
  const vendorInput = document.createElement("input");
  vendorInput.type = "text";
  vendorInput.value = receipt.vendor || "";

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.value = receipt.receiptDate || "";

  const cardholderSelect = cardholderSelectElement(receipt.cardholder || "");
  const paymentMethodSelect = paymentMethodSelectElement(receipt.paymentMethod || "");
  const categorySelect = categorySelectElement(receipt.category || "Other");

  const descriptionInput = document.createElement("input");
  descriptionInput.type = "text";
  descriptionInput.value = receipt.description || "";

  const noteInput = document.createElement("input");
  noteInput.type = "text";
  noteInput.placeholder = "e.g. lunch for meeting";
  noteInput.value = receipt.note || "";

  const amountInput = document.createElement("input");
  amountInput.type = "number";
  amountInput.min = "0";
  amountInput.step = "0.01";
  amountInput.value = receipt.amount || 0;

  const grantSelect = grantSelectElement(receipt.grantId);

  const grid = document.createElement("div");
  grid.className = "receipt-card-fields";
  grid.append(
    labeledField("Vendor", vendorInput),
    labeledField("Date", dateInput),
    labeledField("Cardholder", cardholderSelect),
    labeledField("Payment Method", paymentMethodSelect),
    labeledField("Category", categorySelect),
    labeledField("Description", descriptionInput),
    labeledField("Note", noteInput),
    labeledField("Amount", amountInput),
    labeledField("Grant", grantSelect),
  );

  return {
    grid,
    fields: { vendorInput, dateInput, cardholderSelect, paymentMethodSelect, categorySelect, descriptionInput, noteInput, amountInput, grantSelect },
  };
}

// Which month a receipt belongs to, as a "YYYY-MM" sort/group key -- keyed off the receipt's own
// date when the AI (or a human edit) could read one, falling back to the upload date so a
// receipt with an illegible date still lands in a real month instead of vanishing into "No date".
function receiptMonthKey(receipt) {
  const dateStr = receipt.receiptDate || (receipt.uploadedAt ? String(receipt.uploadedAt).slice(0, 10) : "");
  return dateStr ? dateStr.slice(0, 7) : "";
}

function receiptMonthLabel(monthKey) {
  if (!monthKey) return "No date";
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

function renderAllReceiptsTable() {
  const receipts = allReceiptsState.receipts;
  allReceiptsEmptyEl.classList.toggle("hidden", receipts.length > 0);
  allReceiptsSection.querySelector(".table-wrap").classList.toggle("hidden", receipts.length === 0);

  // Group into monthly chunks with a header row ahead of each one, newest month first, so a
  // year's worth of receipts reads as manageable sections instead of one long flat table.
  const groups = new Map();
  receipts.forEach((receipt) => {
    const key = receiptMonthKey(receipt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(receipt);
  });

  const sortedKeys = [...groups.keys()].sort((a, b) => {
    if (!a) return 1; // "No date" always sorts last -- there's no real month to rank it by
    if (!b) return -1;
    return b.localeCompare(a);
  });

  const rows = [];
  sortedKeys.forEach((key) => {
    const headerRow = document.createElement("tr");
    const headerCell = document.createElement("td");
    headerCell.colSpan = 12;
    headerCell.className = "receipts-month-header";
    headerCell.textContent = receiptMonthLabel(key);
    headerRow.append(headerCell);
    rows.push(headerRow);
    rows.push(...groups.get(key).map(renderAllReceiptRow));
  });

  allReceiptsBody.replaceChildren(...rows);
}

function renderAllReceiptRow(receipt) {
  if (allReceiptsState.editingId === receipt.id) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 12;

    const card = document.createElement("div");
    card.className = "receipt-card";
    const { grid, fields } = receiptEditFieldsGrid(receipt);

    const actions = document.createElement("div");
    actions.className = "row-actions receipt-card-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "row-action-button";
    saveButton.textContent = "Save";
    saveButton.addEventListener("click", () =>
      saveAllReceiptEditRow(receipt, {
        vendor: fields.vendorInput.value.trim(),
        receiptDate: fields.dateInput.value,
        cardholder: fields.cardholderSelect.value,
        paymentMethod: fields.paymentMethodSelect.value,
        category: fields.categorySelect.value,
        description: fields.descriptionInput.value.trim(),
        note: fields.noteInput.value.trim(),
        amount: fields.amountInput.value,
        grantId: fields.grantSelect.value || null,
      }),
    );

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "row-action-button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      allReceiptsState.editingId = null;
      renderAllReceiptsTable();
    });

    actions.append(saveButton, cancelButton);
    card.append(receiptPhotoElement(receipt), grid, actions);
    td.append(card);
    tr.append(td);
    return tr;
  }

  const tr = document.createElement("tr");
  const photoCell = document.createElement("td");
  photoCell.append(receiptPhotoElement(receipt));
  tr.append(photoCell);

  const grantLabel = (() => {
    if (!receipt.grantId) return "Unassigned";
    const grant = grantsForPicker.find((g) => g.id === receipt.grantId);
    return grant ? (grant.org ? `${grant.name} (${grant.org})` : grant.name) : "(grant no longer listed)";
  })();

  const cells = [
    receipt.vendor || "—",
    receipt.receiptDate || "—",
    receipt.cardholder || "—",
    receipt.paymentMethod || "—",
    receipt.category || "—",
    receipt.description || "—",
    receipt.note || "—",
    formatCurrency(receipt.amount),
    grantLabel,
    receipt.status === "confirmed" ? "Confirmed" : "Pending review",
  ];
  cells.forEach((value, index) => {
    const td = document.createElement("td");
    if (index === 7) td.className = "numeric";
    td.textContent = value;
    tr.append(td);
  });

  const actionsCell = document.createElement("td");
  actionsCell.className = "row-actions";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "row-action-button";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => {
    allReceiptsState.editingId = receipt.id;
    renderAllReceiptsTable();
  });
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "row-action-button danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteAllReceiptRow(receipt));
  actionsCell.append(editButton, deleteButton);
  tr.append(actionsCell);

  if (receipt.aiError) tr.title = `AI read failed: ${receipt.aiError}`;
  else if (receipt.aiNotes) tr.title = receipt.aiNotes;

  return tr;
}

async function saveAllReceiptEditRow(receipt, edits) {
  try {
    const response = await fetch(`/api/grants/receipt-items/${encodeURIComponent(receipt.id)}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(edits),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save changes.");
    allReceiptsState.editingId = null;
    setGrantsReceiptUploadStatus("Receipt updated.");
    loadAllReceipts();
    loadGrantsReceipts();
    loadExpensesLedger();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

async function loadAllReceipts() {
  if (allReceiptsState.loading) return;
  allReceiptsState.loading = true;

  try {
    const year = selectedExpensesYear();
    const response = await fetch(`/api/grants/receipts?year=${year}`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load receipts.");

    allReceiptsState.receipts = data.receipts || [];
    if (data.grants) grantsForPicker = data.grants;
    renderAllReceiptsTable();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  } finally {
    allReceiptsState.loading = false;
  }
}

// One combined refresh for everything on the Expenses tab: the review queue, the all-receipts
// table, and the expense ledger -- mirrors refreshAllGrantsViews' role for the Grants tab.
async function refreshExpensesTab() {
  await Promise.all([loadGrantsReceipts(), loadAllReceipts(), loadExpensesLedger()]);
}

async function loadGrantsBudget() {
  if (grantsBudgetState.loading) return;
  grantsBudgetState.loading = true;
  setGrantsBudgetStatus("Loading budget...");

  try {
    const year = selectedGrantsYear();
    const response = await fetch(`/api/grants/budget?year=${year}`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Budget failed to load.");
    }

    grantsBudgetState.data = data;
    renderGrantsBudget();
    setGrantsBudgetStatus(`Updated ${new Date().toLocaleString()}.`);
  } catch (error) {
    setGrantsBudgetStatus(error.message, "danger");
  } finally {
    grantsBudgetState.loading = false;
  }
}

function setGrantsReceiptUploadStatus(message, type = "") {
  grantsReceiptUploadStatusEl.textContent = message || "";
  grantsReceiptUploadStatusEl.className = `import-status ${type}`.trim();
}

async function uploadGrantReceipt() {
  const file = grantsReceiptFileInput.files?.[0];
  if (!file) {
    setGrantsReceiptUploadStatus("Choose a receipt photo or PDF first.", "danger");
    return;
  }
  const cardholder = grantsReceiptCardholderSelect.value;
  const paymentMethod = grantsReceiptPaymentMethodSelect.value;
  if (!cardholder || !paymentMethod) {
    setGrantsReceiptUploadStatus("Choose who paid and how before reading a receipt.", "danger");
    return;
  }
  if (grantsReceiptsState.uploading) return;
  grantsReceiptsState.uploading = true;
  grantsReceiptUploadButton.disabled = true;
  setGrantsReceiptUploadStatus("Reading receipt...");

  try {
    const dataUrl = await readFileAsDataUrl(file);
    const [, mimeType, imageBase64] = dataUrl.match(/^data:([^;]+);base64,(.*)$/s) || [];
    if (!imageBase64) throw new Error("Could not read that file.");

    const response = await fetch("/api/grants/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ year: selectedExpensesYear(), mimeType, imageBase64, cardholder, paymentMethod }),
    });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not read receipt.");

    grantsReceiptFileInput.value = "";
    if (data.receipt?.aiError) {
      setGrantsReceiptUploadStatus(
        `Saved the file, but the AI read failed (${data.receipt.aiError}). Fill in the details by hand below.`,
        "danger",
      );
    } else {
      setGrantsReceiptUploadStatus("Receipt read. Review the details below before confirming.");
    }
    loadGrantsReceipts();
    loadAllReceipts();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  } finally {
    grantsReceiptsState.uploading = false;
    grantsReceiptUploadButton.disabled = false;
  }
}

function categorySelectElement(currentValue) {
  const select = document.createElement("select");
  const names = grantExpenseCategoryNames.includes(currentValue)
    ? grantExpenseCategoryNames
    : [...grantExpenseCategoryNames, currentValue].filter(Boolean);
  names.forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    option.selected = category === currentValue;
    select.append(option);
  });
  return select;
}

// Cardholder/payment method lists are editable, so a saved value may have since been renamed or
// removed -- like categorySelectElement, keep it selectable so editing a row doesn't silently
// blank it out.
function fixedListSelectElement(listOptions, currentValue, placeholder) {
  const options = !currentValue || listOptions.includes(currentValue) ? listOptions : [...listOptions, currentValue];
  const select = document.createElement("select");
  if (placeholder) {
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = placeholder;
    blank.selected = !currentValue;
    select.append(blank);
  }
  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = value === currentValue;
    select.append(option);
  });
  return select;
}

function cardholderSelectElement(currentValue) {
  return fixedListSelectElement(grantReceiptCardholders, currentValue, "Choose...");
}

function paymentMethodSelectElement(currentValue) {
  return fixedListSelectElement(grantReceiptPaymentMethods, currentValue, "Choose...");
}

// The grant field is always optional -- it doesn't need to be set at upload or confirm time, and
// stays editable afterward from the Expenses table for whenever the grant manager gets to it.
function grantSelectElement(currentGrantId) {
  const select = document.createElement("select");
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Unassigned";
  blank.selected = !currentGrantId;
  select.append(blank);
  grantsForPicker.forEach((grant) => {
    const option = document.createElement("option");
    option.value = grant.id;
    option.textContent = grant.org ? `${grant.name} (${grant.org})` : grant.name;
    option.selected = grant.id === currentGrantId;
    select.append(option);
  });
  if (currentGrantId && !grantsForPicker.some((grant) => grant.id === currentGrantId)) {
    const option = document.createElement("option");
    option.value = currentGrantId;
    option.textContent = "(grant no longer listed)";
    option.selected = true;
    select.append(option);
  }
  return select;
}

// Populates a live <select> in place with a blank/placeholder option plus one option per value,
// preserving whatever was previously chosen if it's still in the list. Building fresh <option>
// elements directly on the target (rather than constructing them on a detached <select> and
// moving them over) avoids a real bug we hit during testing: moving <option> nodes that already
// had their `.selected` IDL property set into a *different*, currently-empty <select> lets the
// browser's default-selection algorithm pick the last one, ignoring the flags we set.
function populateFixedListSelect(select, options, currentValue, placeholder) {
  select.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = placeholder;
  select.append(blank);
  options.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
  // Set .value last, once every option actually exists on this select -- the most reliable way
  // to get the right selection regardless of insertion-order quirks.
  select.value = options.includes(currentValue) ? currentValue : "";
}

// Refreshes the fixed cardholder/payment-method <select>s that live outside the dynamic tables
// (the upload form and the manual "+ Add Expense" form) -- called whenever a receipts/budget
// response reports the current lists, same pattern as grantExpenseCategoryNames.
function refreshFixedPickerSelects() {
  [grantsReceiptCardholderSelect, grantsExpenseCardholderSelect].forEach((select) => {
    if (!select) return;
    const placeholder = select === grantsExpenseCardholderSelect ? "--" : "Choose...";
    populateFixedListSelect(select, grantReceiptCardholders, select.value, placeholder);
  });
  [grantsReceiptPaymentMethodSelect, grantsExpensePaymentMethodSelect].forEach((select) => {
    if (!select) return;
    const placeholder = select === grantsExpensePaymentMethodSelect ? "--" : "Choose...";
    populateFixedListSelect(select, grantReceiptPaymentMethods, select.value, placeholder);
  });
}

// Wraps a form control in a labeled field, matching the look of the rest of the app's forms --
// used to lay out each receipt as a card of labeled fields (see renderGrantsReceiptsReview)
// instead of a wide table row, so every field is visible at once with no horizontal scrolling.
function labeledField(labelText, control) {
  const label = document.createElement("label");
  label.className = "field";
  const span = document.createElement("span");
  span.textContent = labelText;
  label.append(span, control);
  return label;
}

function renderGrantsReceiptsReview() {
  const receipts = grantsReceiptsState.receipts;
  grantsReceiptsReviewEmptyEl.classList.toggle("hidden", receipts.length > 0);
  grantsReceiptsReviewBody.classList.toggle("hidden", receipts.length === 0);

  // More than one row can share the same underlying receipt file when it's been split into
  // multiple expense-category lines -- used below to only offer "+ Split" once we know how many
  // siblings a given receipt already has, and it's harmless either way since every row still
  // works independently (see the confirm/discard handlers).
  const receiptLineCounts = receipts.reduce((counts, receipt) => {
    counts[receipt.receiptId] = (counts[receipt.receiptId] || 0) + 1;
    return counts;
  }, {});

  grantsReceiptsReviewBody.replaceChildren(
    ...receipts.map((receipt) => {
      const card = document.createElement("div");
      card.className = "receipt-card";

      const photoCell = document.createElement("div");
      photoCell.className = "receipt-card-photo";
      const fileUrl = `/api/grants/receipts/${encodeURIComponent(receipt.receiptId)}/image`;
      if (receipt.mimeType === "application/pdf") {
        const badge = document.createElement("div");
        badge.className = "receipt-file-badge";
        badge.textContent = "PDF";
        badge.title = "Open PDF";
        badge.addEventListener("click", () => window.open(fileUrl, "_blank"));
        photoCell.append(badge);
      } else {
        const img = document.createElement("img");
        img.className = "receipt-thumbnail";
        img.src = fileUrl;
        img.alt = "Receipt photo";
        img.addEventListener("click", () => window.open(img.src, "_blank"));
        photoCell.append(img);
      }
      if (receiptLineCounts[receipt.receiptId] > 1) {
        const splitNote = document.createElement("div");
        splitNote.className = "receipt-split-note";
        splitNote.textContent = "split";
        photoCell.append(splitNote);
      }

      const vendorInput = document.createElement("input");
      vendorInput.type = "text";
      vendorInput.value = receipt.vendor || "";

      const dateInput = document.createElement("input");
      dateInput.type = "date";
      dateInput.value = receipt.receiptDate || "";

      const cardholderSelect = cardholderSelectElement(receipt.cardholder || "");
      const paymentMethodSelect = paymentMethodSelectElement(receipt.paymentMethod || "");
      const categorySelect = categorySelectElement(receipt.category || "Other");

      const descriptionInput = document.createElement("input");
      descriptionInput.type = "text";
      descriptionInput.value = receipt.description || "";

      const noteInput = document.createElement("input");
      noteInput.type = "text";
      noteInput.placeholder = "e.g. lunch for meeting";
      noteInput.value = receipt.note || "";

      const amountInput = document.createElement("input");
      amountInput.type = "number";
      amountInput.min = "0";
      amountInput.step = "0.01";
      amountInput.value = receipt.amount || 0;

      const grantSelect = grantSelectElement(receipt.grantId);

      const fieldsGrid = document.createElement("div");
      fieldsGrid.className = "receipt-card-fields";
      fieldsGrid.append(
        labeledField("Vendor", vendorInput),
        labeledField("Date", dateInput),
        labeledField("Cardholder", cardholderSelect),
        labeledField("Payment Method", paymentMethodSelect),
        labeledField("Category", categorySelect),
        labeledField("Description", descriptionInput),
        labeledField("Note", noteInput),
        labeledField("Amount", amountInput),
        labeledField("Grant", grantSelect),
      );

      const actionsCell = document.createElement("div");
      actionsCell.className = "row-actions receipt-card-actions";

      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.className = "row-action-button";
      confirmButton.textContent = "Confirm";
      confirmButton.addEventListener("click", () =>
        confirmGrantReceiptRow(receipt, {
          vendor: vendorInput.value.trim(),
          receiptDate: dateInput.value,
          cardholder: cardholderSelect.value,
          paymentMethod: paymentMethodSelect.value,
          category: categorySelect.value,
          description: descriptionInput.value.trim(),
          note: noteInput.value.trim(),
          amount: Number(amountInput.value) || 0,
          grantId: grantSelect.value || null,
        }),
      );

      const splitButton = document.createElement("button");
      splitButton.type = "button";
      splitButton.className = "row-action-button";
      splitButton.textContent = "+ Split";
      splitButton.title = "Add another expense-category line from this same receipt";
      splitButton.addEventListener("click", () => addGrantReceiptSplitLine(receipt.receiptId));

      const discardButton = document.createElement("button");
      discardButton.type = "button";
      discardButton.className = "row-action-button danger";
      discardButton.textContent = "Discard";
      discardButton.addEventListener("click", () => discardGrantReceiptRow(receipt));

      actionsCell.append(confirmButton, splitButton, discardButton);

      card.append(photoCell, fieldsGrid, actionsCell);

      const titleParts = [];
      if (receipt.aiError) titleParts.push(`AI read failed: ${receipt.aiError}`);
      if (receipt.aiNotes) titleParts.push(receipt.aiNotes);
      if (titleParts.length) card.title = titleParts.join(" ");

      return card;
    }),
  );
}

async function loadGrantsReceipts() {
  if (grantsReceiptsState.loading) return;
  grantsReceiptsState.loading = true;

  try {
    const year = selectedExpensesYear();
    const response = await fetch(`/api/grants/receipts?year=${year}&status=pending`, { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load receipts.");

    grantsReceiptsState.receipts = data.receipts || [];
    if (data.categories?.length) grantExpenseCategoryNames = data.categories;
    if (Array.isArray(data.cardholders)) grantReceiptCardholders = data.cardholders;
    if (Array.isArray(data.paymentMethods)) grantReceiptPaymentMethods = data.paymentMethods;
    if (data.grants) grantsForPicker = data.grants;
    refreshFixedPickerSelects();
    renderGrantsReceiptsReview();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  } finally {
    grantsReceiptsState.loading = false;
  }
}

// `receipt` here is one line item (from grant_receipt_items, joined with its parent receipt file)
// -- receipt.id is the line item's id, receipt.receiptId is the shared uploaded file's id.
async function confirmGrantReceiptRow(receipt, edits) {
  try {
    const response = await fetch(`/api/grants/receipt-items/${encodeURIComponent(receipt.id)}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ year: selectedExpensesYear(), ...edits }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not confirm receipt.");

    setGrantsReceiptUploadStatus("Added to expenses.");
    loadGrantsReceipts();
    loadAllReceipts();
    loadExpensesLedger();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

async function discardGrantReceiptRow(receipt) {
  if (!window.confirm("Discard this receipt line? If it's the only line on this receipt, the photo will be deleted too.")) return;

  try {
    const response = await fetch(`/api/grants/receipt-items/${encodeURIComponent(receipt.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not discard receipt.");
    loadGrantsReceipts();
    loadAllReceipts();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

// Delete action on the "All Receipts" table -- unlike discardGrantReceiptRow above (which only
// ever runs on a still-pending line), this can hit an already-confirmed one, so the confirmation
// says so and the refresh also covers the Expenses ledger, since the server now deletes the
// matching grant_expenses row along with the receipt line (see deleteGrantReceiptItem).
async function deleteAllReceiptRow(receipt) {
  const message =
    receipt.status === "confirmed"
      ? "Delete this receipt? This also removes its matching entry from the Expenses ledger. If it's the only line on this receipt, the photo will be deleted too."
      : "Delete this receipt line? If it's the only line on this receipt, the photo will be deleted too.";
  if (!window.confirm(message)) return;

  try {
    const response = await fetch(`/api/grants/receipt-items/${encodeURIComponent(receipt.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete receipt.");
    loadGrantsReceipts();
    loadAllReceipts();
    loadExpensesLedger();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

// Adds a blank split line to an existing receipt -- for when the AI should have split a receipt
// into more than one expense category but didn't; lets a human add the missing line by hand
// instead of re-uploading the file.
async function addGrantReceiptSplitLine(receiptId) {
  try {
    const response = await fetch(`/api/grants/receipts/${encodeURIComponent(receiptId)}/items`, {
      method: "POST",
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not add a split line.");
    loadGrantsReceipts();
    loadAllReceipts();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

function setCategoriesDialogStatus(message, type = "") {
  categoriesDialogStatusEl.textContent = message || "";
  categoriesDialogStatusEl.className = `import-status ${type}`.trim();
}

function renderCategoriesList(categories) {
  categoriesListEl.replaceChildren(
    ...categories.map((category, index) => {
      const li = document.createElement("li");

      const upButton = document.createElement("button");
      upButton.type = "button";
      upButton.className = "row-action-button";
      upButton.textContent = "↑";
      upButton.title = "Move up";
      upButton.disabled = index === 0;
      upButton.addEventListener("click", () => moveGrantExpenseCategoryRow(category, "up"));

      const downButton = document.createElement("button");
      downButton.type = "button";
      downButton.className = "row-action-button";
      downButton.textContent = "↓";
      downButton.title = "Move down";
      downButton.disabled = index === categories.length - 1;
      downButton.addEventListener("click", () => moveGrantExpenseCategoryRow(category, "down"));

      const orderButtons = document.createElement("div");
      orderButtons.className = "category-order-buttons";
      orderButtons.append(upButton, downButton);

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = category.name;

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "row-action-button";
      saveButton.textContent = "Save";
      saveButton.addEventListener("click", () => renameGrantExpenseCategoryRow(category, nameInput.value.trim()));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "row-action-button danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteGrantExpenseCategoryRow(category));

      li.append(orderButtons, nameInput, saveButton, deleteButton);
      return li;
    }),
  );
}

async function loadCategoriesDialog() {
  setCategoriesDialogStatus("Loading...");

  try {
    const response = await fetch("/api/grants/categories", { credentials: "same-origin" });

    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load categories.");

    renderCategoriesList(data.categories);
    setCategoriesDialogStatus("");
  } catch (error) {
    setCategoriesDialogStatus(error.message, "danger");
  }
}

function openCategoriesDialog() {
  categoriesDialog.showModal();
  loadCategoriesDialog();
}

async function submitNewCategory(event) {
  event.preventDefault();
  const name = categoryNewNameInput.value.trim();
  if (!name) return;

  try {
    const response = await fetch("/api/grants/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not add category.");

    categoriesAddForm.reset();
    setCategoriesDialogStatus(`Added "${data.category.name}".`);
    loadCategoriesDialog();
    loadGrantsReceipts();
  } catch (error) {
    setCategoriesDialogStatus(error.message, "danger");
  }
}

async function moveGrantExpenseCategoryRow(category, direction) {
  try {
    const response = await fetch(`/api/grants/categories/${encodeURIComponent(category.id)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ direction }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not reorder category.");

    renderCategoriesList(data.categories);
    loadGrantsReceipts();
  } catch (error) {
    setCategoriesDialogStatus(error.message, "danger");
  }
}

async function renameGrantExpenseCategoryRow(category, name) {
  if (!name) {
    setCategoriesDialogStatus("Category name can't be empty.", "danger");
    return;
  }

  try {
    const response = await fetch(`/api/grants/categories/${encodeURIComponent(category.id)}/rename`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ name }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not rename category.");

    setCategoriesDialogStatus("Saved.");
    loadCategoriesDialog();
    loadGrantsReceipts();
  } catch (error) {
    setCategoriesDialogStatus(error.message, "danger");
  }
}

async function deleteGrantExpenseCategoryRow(category) {
  if (!window.confirm(`Delete category "${category.name}"? Expenses already recorded with it are unaffected.`)) return;

  try {
    const response = await fetch(`/api/grants/categories/${encodeURIComponent(category.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete category.");

    loadCategoriesDialog();
    loadGrantsReceipts();
  } catch (error) {
    setCategoriesDialogStatus(error.message, "danger");
  }
}

function setReceiptOptionsDialogStatus(message, type = "") {
  receiptOptionsDialogStatusEl.textContent = message || "";
  receiptOptionsDialogStatusEl.className = `import-status ${type}`.trim();
}

// Cardholder/payment-method changes show up in every dropdown on the Budget tab, so reload both
// views that carry the lists.
function refreshReceiptOptionConsumers() {
  loadGrantsReceipts();
  loadExpensesLedger();
}

async function receiptOptionsRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
  });
  if (response.status === 401) {
    window.location.href = "/login.html";
    throw new Error("Please log in again.");
  }
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function renderReceiptOptionList(kind, items) {
  const listEl = document.querySelector(`#receipt-options-${kind}-list`);
  listEl.replaceChildren(
    ...items.map((item, index) => {
      const li = document.createElement("li");

      const upButton = document.createElement("button");
      upButton.type = "button";
      upButton.className = "row-action-button";
      upButton.textContent = "↑";
      upButton.title = "Move up";
      upButton.disabled = index === 0;
      upButton.addEventListener("click", () => moveReceiptOptionRow(item, "up"));

      const downButton = document.createElement("button");
      downButton.type = "button";
      downButton.className = "row-action-button";
      downButton.textContent = "↓";
      downButton.title = "Move down";
      downButton.disabled = index === items.length - 1;
      downButton.addEventListener("click", () => moveReceiptOptionRow(item, "down"));

      const orderButtons = document.createElement("div");
      orderButtons.className = "category-order-buttons";
      orderButtons.append(upButton, downButton);

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = item.name;

      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "row-action-button";
      saveButton.textContent = "Save";
      saveButton.addEventListener("click", () => renameReceiptOptionRow(item, nameInput.value.trim()));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "row-action-button danger";
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", () => deleteReceiptOptionRow(item));

      li.append(orderButtons, nameInput, saveButton, deleteButton);
      return li;
    }),
  );
}

async function loadReceiptOptionsDialog() {
  try {
    const data = await receiptOptionsRequest("/api/grants/receipt-options");
    renderReceiptOptionList("cardholder", data.cardholders || []);
    renderReceiptOptionList("payment_method", data.paymentMethods || []);
  } catch (error) {
    setReceiptOptionsDialogStatus(error.message, "danger");
  }
}

function openReceiptOptionsDialog() {
  setReceiptOptionsDialogStatus("Loading...");
  receiptOptionsDialog.showModal();
  loadReceiptOptionsDialog().then(() => {
    if (receiptOptionsDialogStatusEl.textContent === "Loading...") setReceiptOptionsDialogStatus("");
  });
}

async function submitNewReceiptOption(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const kind = form.dataset.kind;
  const input = form.querySelector("input");
  const name = input.value.trim();
  if (!name) return;

  try {
    const data = await receiptOptionsRequest("/api/grants/receipt-options", {
      method: "POST",
      body: JSON.stringify({ kind, name }),
    });
    form.reset();
    setReceiptOptionsDialogStatus(`Added "${data.option.name}".`);
    await loadReceiptOptionsDialog();
    refreshReceiptOptionConsumers();
  } catch (error) {
    setReceiptOptionsDialogStatus(error.message, "danger");
  }
}

async function moveReceiptOptionRow(item, direction) {
  try {
    await receiptOptionsRequest(`/api/grants/receipt-options/${encodeURIComponent(item.id)}/move`, {
      method: "POST",
      body: JSON.stringify({ direction }),
    });
    await loadReceiptOptionsDialog();
    refreshReceiptOptionConsumers();
  } catch (error) {
    setReceiptOptionsDialogStatus(error.message, "danger");
  }
}

async function renameReceiptOptionRow(item, name) {
  if (!name) {
    setReceiptOptionsDialogStatus("Name can't be empty.", "danger");
    return;
  }

  try {
    await receiptOptionsRequest(`/api/grants/receipt-options/${encodeURIComponent(item.id)}/rename`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setReceiptOptionsDialogStatus("Saved.");
    await loadReceiptOptionsDialog();
    refreshReceiptOptionConsumers();
  } catch (error) {
    setReceiptOptionsDialogStatus(error.message, "danger");
  }
}

async function deleteReceiptOptionRow(item) {
  if (!window.confirm(`Remove "${item.name}" from the list? Expenses already recorded with it are unaffected.`)) return;

  try {
    await receiptOptionsRequest(`/api/grants/receipt-options/${encodeURIComponent(item.id)}`, { method: "DELETE" });
    setReceiptOptionsDialogStatus(`Removed "${item.name}".`);
    await loadReceiptOptionsDialog();
    refreshReceiptOptionConsumers();
  } catch (error) {
    setReceiptOptionsDialogStatus(error.message, "danger");
  }
}

async function submitGrantExpenseForm(event) {
  event.preventDefault();
  const year = selectedExpensesYear();
  const payload = {
    year,
    category: grantsExpenseCategoryInput.value.trim(),
    description: grantsExpenseDescriptionInput.value.trim(),
    note: grantsExpenseNoteInput.value.trim(),
    cardholder: grantsExpenseCardholderSelect.value,
    paymentMethod: grantsExpensePaymentMethodSelect.value,
    amount: Number(grantsExpenseAmountInput.value) || 0,
  };

  if (!payload.category && !payload.description) {
    setGrantsReceiptUploadStatus("Enter a category or description for the expense.", "danger");
    return;
  }

  try {
    const response = await fetch("/api/grants/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not add expense.");

    grantsExpenseForm.reset();
    loadExpensesLedger();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

async function deleteGrantExpenseRow(expense) {
  if (!window.confirm(`Delete expense "${expense.description || expense.category}"?`)) return;

  try {
    const response = await fetch(`/api/grants/expenses/${encodeURIComponent(expense.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete expense.");
    loadExpensesLedger();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

// The one field on an already-created expense that's meant to be edited later -- the grant
// manager assigns/reassigns it whenever they get to it, independent of when the expense was
// logged. Everything else about an expense is fixed once it's created.
async function updateGrantExpenseGrant(expense, grantId) {
  try {
    const response = await fetch(`/api/grants/expenses/${encodeURIComponent(expense.id)}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ grantId }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not update the grant assignment.");
    setGrantsReceiptUploadStatus("Grant assignment saved.");
    loadExpensesLedger();
    loadAllReceipts();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

// Saves every editable field on an expense row at once (category, description, note,
// cardholder, payment method, amount, grant) -- used by the Edit/Save flow in the Expenses
// ledger table, as opposed to updateGrantExpenseGrant above which only ever patches grantId.
async function saveGrantExpenseEditRow(expense, edits) {
  try {
    const response = await fetch(`/api/grants/expenses/${encodeURIComponent(expense.id)}/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(edits),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save changes.");
    expensesLedgerState.editingId = null;
    setGrantsReceiptUploadStatus("Expense updated.");
    loadExpensesLedger();
    loadAllReceipts();
  } catch (error) {
    setGrantsReceiptUploadStatus(error.message, "danger");
  }
}

function refreshAllGrantsViews() {
  loadGrantsDashboard();
  loadGrants();
  loadGrantsForecast();
  loadGrantsBudget();
}

function setActiveTab(tab) {
  const nextTab = validTabs.includes(tab) ? tab : "overview";

  tabTargets.forEach((el) => {
    const tabs = el.dataset.tabs.split(",").map((value) => value.trim());
    el.classList.toggle("hidden", !tabs.includes(nextTab));
  });

  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === nextTab);
  });

  if (window.location.hash.slice(1) !== nextTab) {
    history.replaceState(null, "", `#${nextTab}`);
  }
}

function setActiveRosterView(view) {
  const nextView = view === "school-groups" ? "school-groups" : "people";

  rosterViewPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.rosterViewPanel !== nextView);
  });

  rosterSubtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.rosterView === nextView);
  });
}

function downloadCurrentActivityCsv() {
  const rows = reportState.data?.recentActivities || [];
  if (!rows.length) return;

  const headers = ["Date", "Coach", "Participant", "Activity", "Focus", "Hours", "Source text"];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) =>
      [
        formatDate(row.session_date),
        row.coach,
        row.youth_name,
        row.activity,
        row.activity_modifier,
        csvHours(row.minutes),
        row.source_clause,
      ]
        .map(csvEscape)
        .join(","),
    ),
  ];

  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `coach-log-activity-${todayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---- AI pattern-gap suggestions (Logs tab): review queue for new activity/focus/category -------
// ---- trigger phrases Claude suggests after checking logs the built-in matcher flagged. ----------

const patternSuggestionsState = { suggestions: [], loading: false };
const patternPhrasesState = { phrases: [], loading: false };

function setPatternCheckStatus(message, type = "") {
  patternCheckStatusEl.textContent = message || "";
  patternCheckStatusEl.className = `import-status ${type}`.trim();
}

function renderPatternSuggestions() {
  const suggestions = patternSuggestionsState.suggestions;
  patternSuggestionsEmptyEl.classList.toggle("hidden", suggestions.length > 0);
  patternSuggestionsBody.closest(".table-wrap").classList.toggle("hidden", suggestions.length === 0);

  patternSuggestionsBody.replaceChildren(
    ...suggestions.map((suggestion) => {
      const tr = document.createElement("tr");

      const typeTd = document.createElement("td");
      typeTd.textContent = suggestion.patternType;
      tr.append(typeTd);

      const labelTd = document.createElement("td");
      labelTd.textContent = suggestion.label;
      tr.append(labelTd);

      const phraseTd = document.createElement("td");
      phraseTd.textContent = suggestion.phrase;
      tr.append(phraseTd);

      const exampleTd = document.createElement("td");
      const quote = document.createElement("span");
      quote.className = "example-quote";
      quote.textContent = suggestion.exampleQuote ? `"${suggestion.exampleQuote}"` : "—";
      exampleTd.append(quote);
      tr.append(exampleTd);

      const reasonTd = document.createElement("td");
      reasonTd.textContent = suggestion.reason || "—";
      tr.append(reasonTd);

      const actionsTd = document.createElement("td");
      actionsTd.className = "row-actions";

      const approveButton = document.createElement("button");
      approveButton.type = "button";
      approveButton.className = "row-action-button";
      approveButton.textContent = "Approve";
      approveButton.addEventListener("click", () => approvePatternSuggestionRow(suggestion));
      actionsTd.append(approveButton);

      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "row-action-button danger";
      dismissButton.textContent = "Dismiss";
      dismissButton.addEventListener("click", () => dismissPatternSuggestionRow(suggestion));
      actionsTd.append(dismissButton);

      tr.append(actionsTd);
      return tr;
    }),
  );
}

function renderPatternPhrases() {
  const phrases = patternPhrasesState.phrases;
  patternPhrasesEmptyEl.classList.toggle("hidden", phrases.length > 0);
  patternPhrasesBody.closest(".table-wrap").classList.toggle("hidden", phrases.length === 0);

  patternPhrasesBody.replaceChildren(
    ...phrases.map((phrase) => {
      const tr = document.createElement("tr");

      [phrase.patternType, phrase.label, phrase.phrase, formatDate(phrase.createdAt)].forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });

      const actionsTd = document.createElement("td");
      actionsTd.className = "row-actions";

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "row-action-button danger";
      deleteButton.textContent = "Remove";
      deleteButton.addEventListener("click", () => deletePatternPhraseRow(phrase));
      actionsTd.append(deleteButton);

      tr.append(actionsTd);
      return tr;
    }),
  );
}

async function loadPatternSuggestions() {
  if (patternSuggestionsState.loading) return;
  patternSuggestionsState.loading = true;

  try {
    const response = await fetch("/api/logs/pattern-suggestions?status=pending", { credentials: "same-origin" });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load pattern suggestions.");

    patternSuggestionsState.suggestions = data.suggestions || [];
    renderPatternSuggestions();
  } catch (error) {
    setPatternCheckStatus(error.message, "danger");
  } finally {
    patternSuggestionsState.loading = false;
  }
}

async function loadPatternPhrases() {
  if (patternPhrasesState.loading) return;
  patternPhrasesState.loading = true;

  try {
    const response = await fetch("/api/logs/pattern-phrases", { credentials: "same-origin" });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load custom phrases.");

    patternPhrasesState.phrases = data.phrases || [];
    renderPatternPhrases();
  } catch (error) {
    setPatternCheckStatus(error.message, "danger");
  } finally {
    patternPhrasesState.loading = false;
  }
}

async function checkForPatternGaps() {
  checkPatternGapsButton.disabled = true;
  const originalLabel = checkPatternGapsButton.textContent;
  checkPatternGapsButton.textContent = "Checking…";
  setPatternCheckStatus("Looking for logs the auto-tagger flagged since the last check…");

  try {
    const response = await fetch("/api/logs/pattern-check", { method: "POST", credentials: "same-origin" });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Pattern check failed.");

    if (!data.logsChecked) {
      setPatternCheckStatus("No flagged logs since the last check -- nothing to review.", "success");
    } else {
      setPatternCheckStatus(
        `Reviewed ${data.logsChecked} flagged log${data.logsChecked === 1 ? "" : "s"}, found ${data.newSuggestions} new suggestion${data.newSuggestions === 1 ? "" : "s"}.`,
        "success",
      );
    }

    await loadPatternSuggestions();
  } catch (error) {
    setPatternCheckStatus(error.message, "danger");
  } finally {
    checkPatternGapsButton.disabled = false;
    checkPatternGapsButton.textContent = originalLabel;
  }
}

async function approvePatternSuggestionRow(suggestion) {
  try {
    const response = await fetch(`/api/logs/pattern-suggestions/${encodeURIComponent(suggestion.id)}/approve`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not approve suggestion.");

    setPatternCheckStatus(`Added "${suggestion.phrase}" to ${suggestion.label}.`, "success");
    await Promise.all([loadPatternSuggestions(), loadPatternPhrases()]);
  } catch (error) {
    setPatternCheckStatus(error.message, "danger");
  }
}

async function dismissPatternSuggestionRow(suggestion) {
  try {
    const response = await fetch(`/api/logs/pattern-suggestions/${encodeURIComponent(suggestion.id)}/dismiss`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not dismiss suggestion.");

    await loadPatternSuggestions();
  } catch (error) {
    setPatternCheckStatus(error.message, "danger");
  }
}

async function deletePatternPhraseRow(phrase) {
  try {
    const response = await fetch(`/api/logs/pattern-phrases/${encodeURIComponent(phrase.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not remove phrase.");

    await loadPatternPhrases();
  } catch (error) {
    setPatternCheckStatus(error.message, "danger");
  }
}

// ---- Resources tab: PTO Requests -----------------------------------------------------------

const ptoRequestsState = { requests: [], staffNames: [], leaveTypes: [], loading: false, optionsLoaded: false };

function setPtoStatus(message, type = "") {
  ptoStatusEl.textContent = message || "";
  ptoStatusEl.className = `import-status ${type}`.trim();
}

function populatePtoFormOptions() {
  if (ptoRequestsState.optionsLoaded) return;

  ptoStaffSelect.replaceChildren(
    ...ptoRequestsState.staffNames.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }),
  );

  ptoLeaveTypeSelect.replaceChildren(
    ...ptoRequestsState.leaveTypes.map((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      return option;
    }),
  );

  ptoRequestsState.optionsLoaded = Boolean(ptoRequestsState.staffNames.length);
}

function ptoActionsCell(request) {
  const cell = document.createElement("td");
  cell.className = "row-actions";

  if (request.status === "pending") {
    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.className = "row-action-button";
    approveButton.textContent = "Approve";
    approveButton.addEventListener("click", () => setPtoRequestStatusRow(request, "approve"));
    cell.append(approveButton);

    const denyButton = document.createElement("button");
    denyButton.type = "button";
    denyButton.className = "row-action-button danger";
    denyButton.textContent = "Deny";
    denyButton.addEventListener("click", () => setPtoRequestStatusRow(request, "deny"));
    cell.append(denyButton);
  } else {
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "row-action-button";
    resetButton.textContent = "Reset to pending";
    resetButton.addEventListener("click", () => setPtoRequestStatusRow(request, "reset"));
    cell.append(resetButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "row-action-button danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deletePtoRequestRow(request));
  cell.append(deleteButton);

  return cell;
}

function renderPtoRequests() {
  const requests = ptoRequestsState.requests;
  ptoRequestsEmptyEl.classList.toggle("hidden", requests.length > 0);
  ptoRequestsBody.closest(".table-wrap").classList.toggle("hidden", requests.length === 0);

  ptoRequestsBody.replaceChildren(
    ...requests.map((request) => {
      const tr = document.createElement("tr");

      [request.staffName, formatDate(request.startDate), formatDate(request.endDate), request.leaveType, request.note || "—"].forEach(
        (value) => {
          const td = document.createElement("td");
          td.textContent = value;
          tr.append(td);
        },
      );

      const statusTd = document.createElement("td");
      const statusSpan = document.createElement("span");
      statusSpan.className = `pto-status-text ${request.status}`;
      statusSpan.textContent = request.status.charAt(0).toUpperCase() + request.status.slice(1);
      statusTd.append(statusSpan);
      tr.append(statusTd);

      const submittedTd = document.createElement("td");
      submittedTd.textContent = formatDate(request.createdAt);
      tr.append(submittedTd);

      tr.append(ptoActionsCell(request));
      return tr;
    }),
  );
}

async function loadPtoRequests() {
  if (ptoRequestsState.loading) return;
  ptoRequestsState.loading = true;

  try {
    const status = ptoStatusFilterSelect.value;
    const response = await fetch(`/api/pto-requests${status ? `?status=${encodeURIComponent(status)}` : ""}`, {
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load PTO requests.");

    ptoRequestsState.requests = data.requests || [];
    ptoRequestsState.staffNames = data.staffNames || [];
    ptoRequestsState.leaveTypes = data.leaveTypes || [];
    populatePtoFormOptions();
    renderPtoRequests();
  } catch (error) {
    setPtoStatus(error.message, "danger");
  } finally {
    ptoRequestsState.loading = false;
  }
}

async function submitPtoRequestForm(event) {
  event.preventDefault();

  const payload = {
    staffName: ptoStaffSelect.value,
    startDate: ptoStartDateInput.value,
    endDate: ptoEndDateInput.value || ptoStartDateInput.value,
    leaveType: ptoLeaveTypeSelect.value,
    note: ptoNoteInput.value.trim(),
  };

  if (!payload.staffName || !payload.startDate) {
    setPtoStatus("Choose a staff member and a start date.", "danger");
    return;
  }
  if (payload.endDate < payload.startDate) {
    setPtoStatus("End date can't be before the start date.", "danger");
    return;
  }

  ptoRequestButton.disabled = true;
  const originalLabel = ptoRequestButton.textContent;
  ptoRequestButton.textContent = "Submitting…";

  try {
    const response = await fetch("/api/pto-requests", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not submit request.");

    setPtoStatus(`Submitted ${payload.leaveType.toLowerCase()} request for ${payload.staffName}.`, "success");
    ptoRequestForm.reset();
    await loadPtoRequests();
  } catch (error) {
    setPtoStatus(error.message, "danger");
  } finally {
    ptoRequestButton.disabled = false;
    ptoRequestButton.textContent = originalLabel;
  }
}

async function setPtoRequestStatusRow(request, action) {
  try {
    const response = await fetch(`/api/pto-requests/${encodeURIComponent(request.id)}/${action}`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not update request.");

    await loadPtoRequests();
  } catch (error) {
    setPtoStatus(error.message, "danger");
  }
}

async function deletePtoRequestRow(request) {
  try {
    const response = await fetch(`/api/pto-requests/${encodeURIComponent(request.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete request.");

    await loadPtoRequests();
  } catch (error) {
    setPtoStatus(error.message, "danger");
  }
}

// ---- Resources tab: Mileage --------------------------------------------------------------

const mileageRequestsState = { requests: [], staffNames: [], loading: false, optionsLoaded: false };

function setMileageStatus(message, type = "") {
  mileageStatusEl.textContent = message || "";
  mileageStatusEl.className = `import-status ${type}`.trim();
}

function populateMileageFormOptions() {
  if (mileageRequestsState.optionsLoaded) return;

  mileageStaffSelect.replaceChildren(
    ...mileageRequestsState.staffNames.map((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      return option;
    }),
  );

  mileageRequestsState.optionsLoaded = Boolean(mileageRequestsState.staffNames.length);
}

function mileageActionsCell(request) {
  const cell = document.createElement("td");
  cell.className = "row-actions";

  if (request.status === "pending") {
    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.className = "row-action-button";
    approveButton.textContent = "Approve";
    approveButton.addEventListener("click", () => setMileageRequestStatusRow(request, "approve"));
    cell.append(approveButton);

    const denyButton = document.createElement("button");
    denyButton.type = "button";
    denyButton.className = "row-action-button danger";
    denyButton.textContent = "Deny";
    denyButton.addEventListener("click", () => setMileageRequestStatusRow(request, "deny"));
    cell.append(denyButton);
  } else {
    const resetButton = document.createElement("button");
    resetButton.type = "button";
    resetButton.className = "row-action-button";
    resetButton.textContent = "Reset to pending";
    resetButton.addEventListener("click", () => setMileageRequestStatusRow(request, "reset"));
    cell.append(resetButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "row-action-button danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteMileageRequestRow(request));
  cell.append(deleteButton);

  return cell;
}

// Same thumbnail-strip idea as receiptPhotoElement/.receipt-thumbnail (grant receipts), but a
// mileage request can have more than one photo, and -- unlike a receipt photo -- admin can delete
// a single bad one without having to delete and recreate the whole mileage request.
function mileagePhotosCell(request) {
  const td = document.createElement("td");
  if (!request.photos?.length) {
    td.textContent = "—";
    return td;
  }

  td.className = "mileage-photos-cell";
  request.photos.forEach((photo) => {
    const wrap = document.createElement("div");
    wrap.className = "mileage-photo-thumb-wrap";

    const img = document.createElement("img");
    img.className = "receipt-thumbnail";
    img.src = `/api/mileage-requests/photos/${encodeURIComponent(photo.id)}/image`;
    img.alt = "Mileage photo";
    img.addEventListener("click", () => window.open(img.src, "_blank"));
    wrap.append(img);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "mileage-photo-delete";
    deleteButton.textContent = "×";
    deleteButton.title = "Delete this photo";
    deleteButton.addEventListener("click", () => deleteMileageRequestPhotoRow(photo));
    wrap.append(deleteButton);

    td.append(wrap);
  });
  return td;
}

async function deleteMileageRequestPhotoRow(photo) {
  if (!window.confirm("Delete this photo? This can't be undone.")) return;

  try {
    const response = await fetch(`/api/mileage-requests/photos/${encodeURIComponent(photo.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete photo.");

    await loadMileageRequests();
  } catch (error) {
    setMileageStatus(error.message, "danger");
  }
}

function renderMileageRequests() {
  const requests = mileageRequestsState.requests;
  mileageRequestsEmptyEl.classList.toggle("hidden", requests.length > 0);
  mileageRequestsBody.closest(".table-wrap").classList.toggle("hidden", requests.length === 0);

  mileageRequestsBody.replaceChildren(
    ...requests.map((request) => {
      const tr = document.createElement("tr");

      const textCells = [
        request.staffName,
        formatDate(request.tripDate),
        request.startAddress || "—",
        request.endAddress || "—",
        request.purpose || "—",
      ];
      textCells.forEach((value) => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      });

      const milesTd = document.createElement("td");
      milesTd.className = "numeric";
      milesTd.textContent = request.miles;
      tr.append(milesTd);

      const noteTd = document.createElement("td");
      noteTd.textContent = request.note || "—";
      tr.append(noteTd);

      tr.append(mileagePhotosCell(request));

      const statusTd = document.createElement("td");
      const statusSpan = document.createElement("span");
      statusSpan.className = `pto-status-text ${request.status}`;
      statusSpan.textContent = request.status.charAt(0).toUpperCase() + request.status.slice(1);
      statusTd.append(statusSpan);
      tr.append(statusTd);

      const submittedTd = document.createElement("td");
      submittedTd.textContent = formatDate(request.createdAt);
      tr.append(submittedTd);

      tr.append(mileageActionsCell(request));
      return tr;
    }),
  );
}

async function loadMileageRequests() {
  if (mileageRequestsState.loading) return;
  mileageRequestsState.loading = true;

  try {
    const status = mileageStatusFilterSelect.value;
    const response = await fetch(`/api/mileage-requests${status ? `?status=${encodeURIComponent(status)}` : ""}`, {
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load mileage.");

    mileageRequestsState.requests = data.requests || [];
    mileageRequestsState.staffNames = data.staffNames || [];
    populateMileageFormOptions();
    renderMileageRequests();
  } catch (error) {
    setMileageStatus(error.message, "danger");
  } finally {
    mileageRequestsState.loading = false;
  }
}

const MAX_MILEAGE_PHOTOS_PER_REQUEST = 4;

async function submitMileageRequestForm(event) {
  event.preventDefault();

  const photoFiles = Array.from(mileagePhotosInput.files || []);
  if (photoFiles.length > MAX_MILEAGE_PHOTOS_PER_REQUEST) {
    setMileageStatus(`Attach at most ${MAX_MILEAGE_PHOTOS_PER_REQUEST} photos.`, "danger");
    return;
  }

  const payload = {
    staffName: mileageStaffSelect.value,
    tripDate: mileageTripDateInput.value,
    startAddress: mileageStartAddressInput.value.trim(),
    endAddress: mileageEndAddressInput.value.trim(),
    purpose: mileagePurposeInput.value.trim(),
    miles: mileageMilesInput.value,
    note: mileageNoteInput.value.trim(),
  };

  if (!payload.staffName || !payload.tripDate) {
    setMileageStatus("Choose a staff member and a date.", "danger");
    return;
  }
  if (!payload.miles || Number(payload.miles) <= 0) {
    setMileageStatus("Enter miles driven.", "danger");
    return;
  }

  mileageRequestButton.disabled = true;
  const originalLabel = mileageRequestButton.textContent;

  try {
    if (photoFiles.length) {
      mileageRequestButton.textContent = "Reading photos…";
      payload.photos = await Promise.all(
        photoFiles.map(async (file) => {
          const dataUrl = await readFileAsDataUrl(file);
          const [, mimeType, imageBase64] = dataUrl.match(/^data:([^;]+);base64,(.*)$/s) || [];
          if (!imageBase64) throw new Error(`Could not read "${file.name}".`);
          return { mimeType, imageBase64 };
        }),
      );
    }

    mileageRequestButton.textContent = "Submitting…";
    const response = await fetch("/api/mileage-requests", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 401) {
      window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not submit mileage.");

    setMileageStatus(`Logged ${payload.miles} miles for ${payload.staffName}.`, "success");
    mileageRequestForm.reset();
    await loadMileageRequests();
  } catch (error) {
    setMileageStatus(error.message, "danger");
  } finally {
    mileageRequestButton.disabled = false;
    mileageRequestButton.textContent = originalLabel;
  }
}

async function setMileageRequestStatusRow(request, action) {
  try {
    const response = await fetch(`/api/mileage-requests/${encodeURIComponent(request.id)}/${action}`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not update request.");

    await loadMileageRequests();
  } catch (error) {
    setMileageStatus(error.message, "danger");
  }
}

async function deleteMileageRequestRow(request) {
  try {
    const response = await fetch(`/api/mileage-requests/${encodeURIComponent(request.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete request.");

    await loadMileageRequests();
  } catch (error) {
    setMileageStatus(error.message, "danger");
  }
}

// ---- Resources tab: Schedule --------------------------------------------------------------

const SCHEDULE_WEEK_DAYS = 7;
const scheduleTableWrap = document.querySelector(".schedule-grid-table").closest(".table-wrap");
const scheduleState = { weeks: [], staffNames: [], activeWeekId: "", shifts: [] };

function setScheduleStatus(message, type = "") {
  scheduleStatusEl.textContent = message || "";
  scheduleStatusEl.className = `import-status ${type}`.trim();
}

// Manual y/m/d math (no Date.parse / toISOString round-trip) so this never shifts a day across
// timezones -- same rationale as the pg `date` column slicing used throughout the server.
function addDaysToIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatScheduleDayHeader(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${month}/${day}`;
}

function scheduleWeekDates(week) {
  return Array.from({ length: SCHEDULE_WEEK_DAYS }, (_, i) => addDaysToIsoDate(week.startDate, i));
}

function computeShiftMinutes(startTime, endTime) {
  if (!startTime || !endTime) return 0;
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  return endHour * 60 + endMinute - (startHour * 60 + startMinute);
}

function formatMinutesAsHours(totalMinutes) {
  if (!totalMinutes) return "0:00";
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

// 15-minute increments, 12:00 AM through 11:45 PM -- a dropdown of these is faster to use
// correctly than typing/scrubbing a native time input, and a selection is always a complete,
// valid value (no half-typed "2:0_" states to accidentally save).
const SCHEDULE_TIME_OPTIONS = (() => {
  const options = [{ value: "", label: "—" }];
  for (let totalMinutes = 0; totalMinutes < 24 * 60; totalMinutes += 15) {
    const hour24 = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const value = `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    const period = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    options.push({ value, label: `${hour12}:${String(minute).padStart(2, "0")} ${period}` });
  }
  return options;
})();

function buildScheduleTimeSelect(currentValue, ariaLabel) {
  const select = document.createElement("select");
  select.className = "schedule-time-select";
  select.setAttribute("aria-label", ariaLabel);
  select.replaceChildren(
    ...SCHEDULE_TIME_OPTIONS.map(({ value, label }) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
  select.value = currentValue;
  return select;
}

function populateScheduleWeekSelect() {
  scheduleWeekSelect.replaceChildren(
    ...scheduleState.weeks.map((week) => {
      const option = document.createElement("option");
      option.value = week.id;
      option.textContent = `${formatScheduleDayHeader(week.startDate)} – ${formatScheduleDayHeader(week.endDate)}`;
      return option;
    }),
  );
  if (scheduleState.activeWeekId) scheduleWeekSelect.value = scheduleState.activeWeekId;
}

async function loadScheduleWeeks() {
  try {
    const response = await fetch("/api/schedule-weeks", { credentials: "same-origin" });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load schedule.");

    scheduleState.weeks = data.weeks || [];
    scheduleState.staffNames = data.staffNames || [];

    if (!scheduleState.weeks.some((week) => week.id === scheduleState.activeWeekId)) {
      scheduleState.activeWeekId = scheduleState.weeks[0]?.id || "";
    }

    populateScheduleWeekSelect();
    await loadScheduleShiftsForActiveWeek();
  } catch (error) {
    setScheduleStatus(error.message, "danger");
  }
}

async function loadScheduleShiftsForActiveWeek() {
  if (!scheduleState.activeWeekId) {
    scheduleState.shifts = [];
    renderScheduleGrid();
    return;
  }

  try {
    const response = await fetch(`/api/schedule-weeks/${encodeURIComponent(scheduleState.activeWeekId)}/shifts`, {
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load shifts.");

    scheduleState.shifts = data.shifts || [];
    renderScheduleGrid();
  } catch (error) {
    setScheduleStatus(error.message, "danger");
  }
}

function renderScheduleGrid() {
  const week = scheduleState.weeks.find((w) => w.id === scheduleState.activeWeekId);

  scheduleEmptyEl.classList.toggle("hidden", Boolean(week));
  scheduleWeekSelect.classList.toggle("hidden", !scheduleState.weeks.length);
  deleteScheduleWeekButton.classList.toggle("hidden", !week);
  scheduleTableWrap.classList.toggle("hidden", !week);

  scheduleGridHeaderRow.replaceChildren();
  scheduleGridBody.replaceChildren();
  if (!week) return;

  const days = scheduleWeekDates(week);

  const staffTh = document.createElement("th");
  staffTh.textContent = "Staff";
  const totalTh = document.createElement("th");
  totalTh.textContent = "Total";
  scheduleGridHeaderRow.append(
    staffTh,
    ...days.map((day) => {
      const th = document.createElement("th");
      th.className = "schedule-day-header";
      th.textContent = formatScheduleDayHeader(day);
      return th;
    }),
    totalTh,
  );

  // Active staff (so new shifts can be assigned to anyone current) plus anyone -- active or not --
  // who already has a shift recorded this week, so a deactivated person's past hours don't just
  // vanish from a week where they're already on the books.
  const rowStaffNames = [...scheduleState.staffNames];
  scheduleState.shifts.forEach((shift) => {
    if (!rowStaffNames.includes(shift.staffName)) rowStaffNames.push(shift.staffName);
  });

  scheduleGridBody.replaceChildren(
    ...rowStaffNames.map((staffName) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = staffName;
      tr.append(nameTd);

      let totalMinutes = 0;

      days.forEach((day) => {
        const shift = scheduleState.shifts.find((s) => s.staffName === staffName && s.shiftDate === day);
        totalMinutes += computeShiftMinutes(shift?.startTime, shift?.endTime);

        const td = document.createElement("td");
        const cell = document.createElement("div");
        cell.className = "schedule-shift-cell";

        const startInput = buildScheduleTimeSelect(shift?.startTime || "", `${staffName} ${day} start time`);
        const endInput = buildScheduleTimeSelect(shift?.endTime || "", `${staffName} ${day} end time`);

        // Only persist once the cell has both times (a real shift) or neither (cleared) --
        // selecting just the start time used to fire a save immediately with the end time still
        // blank, which the server rejected and then reloading wiped the start time back out
        // before there was a chance to pick the end time too.
        const saveCell = () => {
          const hasStart = Boolean(startInput.value);
          const hasEnd = Boolean(endInput.value);
          if (hasStart !== hasEnd) return;
          saveScheduleShift(staffName, day, startInput, endInput);
        };
        startInput.addEventListener("change", saveCell);
        endInput.addEventListener("change", saveCell);

        cell.append(startInput, endInput);
        td.append(cell);
        tr.append(td);
      });

      const totalTd = document.createElement("td");
      totalTd.className = "schedule-total-cell";
      totalTd.textContent = formatMinutesAsHours(totalMinutes);
      tr.append(totalTd);

      return tr;
    }),
  );
}

async function saveScheduleShift(staffName, shiftDate, startInput, endInput) {
  const startTime = startInput.value;
  const endTime = endInput.value;

  try {
    const response = await fetch(`/api/schedule-weeks/${encodeURIComponent(scheduleState.activeWeekId)}/shifts`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffName, shiftDate, startTime, endTime }),
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not save shift.");

    const existingIndex = scheduleState.shifts.findIndex((s) => s.staffName === staffName && s.shiftDate === shiftDate);
    if (existingIndex >= 0) scheduleState.shifts.splice(existingIndex, 1);
    if (data.shift) scheduleState.shifts.push(data.shift);

    renderScheduleGrid();
    setScheduleStatus("Saved.", "success");
  } catch (error) {
    setScheduleStatus(error.message, "danger");
    await loadScheduleShiftsForActiveWeek();
  }
}

function openScheduleWeekDialog() {
  scheduleWeekForm.reset();
  scheduleWeekDialogStatus.textContent = "";
  const mostRecentWeek = scheduleState.weeks[0];
  scheduleWeekStartInput.value = mostRecentWeek ? addDaysToIsoDate(mostRecentWeek.startDate, SCHEDULE_WEEK_DAYS) : todayIso();

  scheduleWeekCopyField.classList.toggle("hidden", !mostRecentWeek);
  scheduleWeekCopyPreviousCheckbox.checked = Boolean(mostRecentWeek);
  if (mostRecentWeek) {
    scheduleWeekCopyPreviousLabel.textContent = `Copy shifts from ${formatScheduleDayHeader(mostRecentWeek.startDate)} – ${formatScheduleDayHeader(mostRecentWeek.endDate)}`;
  }

  scheduleWeekDialog.showModal();
}

async function submitScheduleWeekForm(event) {
  event.preventDefault();
  scheduleWeekDialogStatus.textContent = "";

  const mostRecentWeek = scheduleState.weeks[0];
  const copyFromWeekId = mostRecentWeek && scheduleWeekCopyPreviousCheckbox.checked ? mostRecentWeek.id : "";

  try {
    const response = await fetch("/api/schedule-weeks", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: scheduleWeekStartInput.value, copyFromWeekId }),
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not create week.");

    scheduleWeekDialog.close();
    scheduleState.activeWeekId = data.week.id;
    await loadScheduleWeeks();
  } catch (error) {
    scheduleWeekDialogStatus.textContent = error.message;
    scheduleWeekDialogStatus.className = "import-status danger";
  }
}

async function deleteActiveScheduleWeek() {
  const week = scheduleState.weeks.find((w) => w.id === scheduleState.activeWeekId);
  if (!week) return;

  const label = `${formatScheduleDayHeader(week.startDate)} – ${formatScheduleDayHeader(week.endDate)}`;
  if (!window.confirm(`Delete the week of ${label}? This removes all shifts in it and cannot be undone.`)) return;

  try {
    const response = await fetch(`/api/schedule-weeks/${encodeURIComponent(week.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete week.");

    scheduleState.activeWeekId = "";
    await loadScheduleWeeks();
  } catch (error) {
    setScheduleStatus(error.message, "danger");
  }
}

// ---- Resources tab: Staff -------------------------------------------------------------------

const staffState = { staff: [], loading: false };

function setStaffStatus(message, type = "") {
  staffStatusEl.textContent = message || "";
  staffStatusEl.className = `import-status ${type}`.trim();
}

// The PTO/Mileage staff dropdowns and the Schedule tab's staff list are all cached after their
// first load (see optionsLoaded), so a staff change here would otherwise sit stale on those tabs
// until a manual refresh. Force them to re-fetch and re-populate right away instead.
async function refreshStaffDependentViews() {
  ptoRequestsState.optionsLoaded = false;
  mileageRequestsState.optionsLoaded = false;
  await Promise.all([loadPtoRequests(), loadMileageRequests(), loadScheduleWeeks()]);
}

function staffActionsCell(staff) {
  const cell = document.createElement("td");
  cell.className = "row-actions";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "row-action-button";
  toggleButton.textContent = staff.active ? "Deactivate" : "Reactivate";
  toggleButton.addEventListener("click", () => setStaffActiveRow(staff, !staff.active));
  cell.append(toggleButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "row-action-button danger";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => deleteStaffRow(staff));
  cell.append(deleteButton);

  return cell;
}

function renderStaff() {
  const staff = staffState.staff;
  staffEmptyEl.classList.toggle("hidden", staff.length > 0);
  staffBody.closest(".table-wrap").classList.toggle("hidden", staff.length === 0);

  staffBody.replaceChildren(
    ...staff.map((person) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.value = person.name;
      nameInput.className = "staff-name-input";
      nameInput.setAttribute("aria-label", `Rename ${person.name}`);
      nameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") nameInput.blur();
        if (event.key === "Escape") {
          nameInput.value = person.name;
          nameInput.blur();
        }
      });
      nameInput.addEventListener("blur", () => {
        const nextName = nameInput.value.trim();
        if (!nextName || nextName === person.name) {
          nameInput.value = person.name;
          return;
        }
        renameStaffRow(person, nextName, nameInput);
      });
      nameTd.append(nameInput);
      tr.append(nameTd);

      const statusTd = document.createElement("td");
      const statusSpan = document.createElement("span");
      statusSpan.className = `pto-status-text ${person.active ? "approved" : "denied"}`;
      statusSpan.textContent = person.active ? "Active" : "Inactive";
      statusTd.append(statusSpan);
      tr.append(statusTd);

      tr.append(staffActionsCell(person));
      return tr;
    }),
  );
}

async function loadStaff() {
  if (staffState.loading) return;
  staffState.loading = true;

  try {
    const response = await fetch("/api/staff", { credentials: "same-origin" });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load staff.");

    staffState.staff = data.staff || [];
    renderStaff();
  } catch (error) {
    setStaffStatus(error.message, "danger");
  } finally {
    staffState.loading = false;
  }
}

async function submitStaffAddForm(event) {
  event.preventDefault();

  const name = staffAddNameInput.value.trim();
  if (!name) {
    setStaffStatus("Enter a name.", "danger");
    return;
  }

  staffAddButton.disabled = true;
  try {
    const response = await fetch("/api/staff", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not add staff.");

    setStaffStatus(`Added ${name}.`, "success");
    staffAddForm.reset();
    await loadStaff();
    await refreshStaffDependentViews();
  } catch (error) {
    setStaffStatus(error.message, "danger");
  } finally {
    staffAddButton.disabled = false;
  }
}

async function renameStaffRow(staff, nextName, nameInput) {
  try {
    const response = await fetch(`/api/staff/${encodeURIComponent(staff.id)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not rename staff.");

    setStaffStatus(`Renamed ${staff.name} to ${nextName}.`, "success");
    await loadStaff();
    await refreshStaffDependentViews();
  } catch (error) {
    nameInput.value = staff.name;
    setStaffStatus(error.message, "danger");
  }
}

async function setStaffActiveRow(staff, active) {
  try {
    const response = await fetch(`/api/staff/${encodeURIComponent(staff.id)}/${active ? "activate" : "deactivate"}`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not update staff.");

    await loadStaff();
    await refreshStaffDependentViews();
  } catch (error) {
    setStaffStatus(error.message, "danger");
  }
}

async function deleteStaffRow(staff) {
  if (!window.confirm(`Delete ${staff.name}? This only works if they have no PTO, mileage, schedule, or log history -- deactivate instead if they do.`)) return;

  try {
    const response = await fetch(`/api/staff/${encodeURIComponent(staff.id)}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not delete staff.");

    await loadStaff();
    await refreshStaffDependentViews();
  } catch (error) {
    setStaffStatus(error.message, "danger");
  }
}

function rowsToCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

function downloadReportCsv() {
  const data = reportState.data;
  if (!data) return;

  const lines = [];
  lines.push("Summary");
  lines.push(
    rowsToCsv(
      ["Logs", "Interactions", "Total hours", "Participants"],
      [[data.summary?.log_count, data.summary?.activity_count, csvHours(data.summary?.total_minutes), data.summary?.youth_count]],
    ),
  );
  lines.push("");
  lines.push("Period Trend");
  lines.push(
    rowsToCsv(
      ["Period", "Logs", "Interactions", "Hours", "Participants"],
      (data.periodTrend || []).map((row) => [
        row.period_start,
        row.log_count,
        row.activity_count,
        csvHours(row.total_minutes),
        row.youth_count,
      ]),
    ),
  );
  lines.push("");
  lines.push("By Participant");
  lines.push(
    rowsToCsv(
      ["Participant", "Interactions", "Hours", "Last session"],
      (data.byYouth || []).map((row) => [row.youth_name, row.activity_count, csvHours(row.total_minutes), row.last_session_date]),
    ),
  );
  lines.push("");
  lines.push("By Activity");
  lines.push(
    rowsToCsv(
      ["Activity", "Interactions", "Hours"],
      (data.byActivity || []).map((row) => [row.activity, row.activity_count, csvHours(row.total_minutes)]),
    ),
  );
  lines.push("");
  lines.push("By Focus");
  lines.push(
    rowsToCsv(
      ["Focus", "Interactions", "Hours"],
      (data.byFocus || []).map((row) => [row.focus, row.activity_count, csvHours(row.total_minutes)]),
    ),
  );
  lines.push("");
  lines.push("By Gender");
  lines.push(
    rowsToCsv(
      ["Gender", "Interactions", "Hours", "Participants"],
      (data.byGender || []).map((row) => [row.gender, row.activity_count, csvHours(row.total_minutes), row.youth_count]),
    ),
  );
  lines.push("");
  lines.push("By Race/Ethnicity");
  lines.push(
    rowsToCsv(
      ["Race/Ethnicity", "Interactions", "Hours", "Participants"],
      (data.byEthnicity || []).map((row) => [row.ethnicity, row.activity_count, csvHours(row.total_minutes), row.youth_count]),
    ),
  );
  lines.push("");
  lines.push("By School");
  lines.push(
    rowsToCsv(
      ["School", "Interactions", "Hours", "Participants"],
      (data.bySchool || []).map((row) => [row.school, row.activity_count, csvHours(row.total_minutes), row.youth_count]),
    ),
  );
  lines.push("");
  lines.push("By Competency");
  lines.push(
    rowsToCsv(
      ["Competency", "Logs", "Interactions", "Hours", "Participants"],
      (data.byCompetency || []).map((row) => [
        row.competency,
        row.log_count,
        row.activity_count,
        csvHours(row.total_minutes),
        row.youth_count,
      ]),
    ),
  );

  const blob = new Blob([`${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `coach-log-report-${todayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---- Branded PDF report export (Chart.js canvases + jsPDF, no server round trip) ----------

function loadImageAsset(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let pdfBrandingPromise = null;
function getPdfBranding() {
  if (!pdfBrandingPromise) {
    pdfBrandingPromise = Promise.all([
      loadImageAsset("assets/cybc-header.png"),
      loadImageAsset("assets/cybc-watermark.png"),
    ]).then(([header, watermark]) => ({ header, watermark }));
  }
  return pdfBrandingPromise;
}

function chartImage(selector) {
  const instance = chartInstances[selector];
  if (!instance) return null;
  try {
    return instance.canvas.toDataURL("image/png", 1.0);
  } catch (error) {
    return null;
  }
}

async function downloadReportPdf() {
  const data = reportState.data;
  if (!data) {
    setStatus("Load a report before downloading the PDF.", "error");
    return;
  }
  if (typeof window.jspdf === "undefined") {
    setStatus("PDF library failed to load. Check your connection and try again.", "error");
    return;
  }

  const originalLabel = downloadReportPdfButton.textContent;
  downloadReportPdfButton.disabled = true;
  downloadReportPdfButton.textContent = "Preparing PDF...";

  try {
    const { header, watermark } = await getPdfBranding();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;

    function paintWatermark() {
      if (!watermark) return;
      const size = 300;
      const x = (pageWidth - size) / 2;
      const y = (pageHeight - size) / 2;
      try {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.06 }));
        doc.addImage(watermark, "PNG", x, y, size, size);
        doc.restoreGraphicsState();
      } catch (error) {
        // Older jsPDF builds without opacity support: skip the watermark, keep the export working.
      }
    }

    function paintHeader() {
      let y = margin;
      if (header) {
        const height = contentWidth * (header.naturalHeight / header.naturalWidth);
        doc.addImage(header, "PNG", margin, y, contentWidth, height);
        y += height + 14;
      }
      return y;
    }

    function newPage() {
      doc.addPage();
      paintWatermark();
      return paintHeader();
    }

    paintWatermark();
    let cursorY = paintHeader();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 15, 15);
    doc.text("Coach Activity Report", margin, cursorY + 6);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);
    const rangeFrom = document.querySelector("#date-from").value || "Start";
    const rangeTo = document.querySelector("#date-to").value || "Today";
    doc.text(`Range: ${rangeFrom} to ${rangeTo}`, margin, cursorY + 22);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, cursorY + 36);

    cursorY += 54;

    const summary = data.summary || {};
    const metrics = [
      ["Logs", formatNumber(summary.log_count)],
      ["Interactions", formatNumber(summary.activity_count)],
      ["Total Hours", formatHours(summary.total_minutes)],
      ["Participants", formatNumber(summary.youth_count)],
    ];
    const boxGap = 10;
    const boxWidth = (contentWidth - boxGap * (metrics.length - 1)) / metrics.length;
    const boxHeight = 46;
    metrics.forEach(([label, value], index) => {
      const x = margin + index * (boxWidth + boxGap);
      doc.setFillColor(244, 247, 246);
      doc.roundedRect(x, cursorY, boxWidth, boxHeight, 4, 4, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.setTextColor(11, 111, 106);
      doc.text(String(value), x + 10, cursorY + 22);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 100, 100);
      doc.text(label, x + 10, cursorY + 36);
    });
    cursorY += boxHeight + 24;

    function ensureSpace(needed) {
      if (cursorY + needed > pageHeight - margin) {
        cursorY = newPage();
      }
    }

    function sectionTitle(text) {
      ensureSpace(30);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12.5);
      doc.setTextColor(20, 20, 20);
      doc.text(text, margin, cursorY);
      doc.setDrawColor(11, 111, 106);
      doc.setLineWidth(1);
      doc.line(margin, cursorY + 5, pageWidth - margin, cursorY + 5);
      cursorY += 20;
    }

    const trendImage = chartImage("#chart-trend");
    if (trendImage) {
      sectionTitle("Hours Trend");
      const chartHeight = 140;
      ensureSpace(chartHeight + 10);
      doc.addImage(trendImage, "PNG", margin, cursorY, contentWidth, chartHeight);
      cursorY += chartHeight + 20;
    }

    const gridCharts = [
      ["#chart-by-coach", "By Coach"],
      ["#chart-by-activity", "By Activity"],
      ["#chart-by-gender", "By Gender"],
      ["#chart-by-ethnicity", "By Race/Ethnicity"],
      ["#chart-by-school", "By School"],
      ["#chart-by-competency", "By Competency"],
    ]
      .map(([selector, label]) => [chartImage(selector), label])
      .filter(([image]) => Boolean(image));

    if (gridCharts.length) {
      sectionTitle("Visual Summary");
      const cols = 2;
      const gap = 14;
      const cellWidth = (contentWidth - gap * (cols - 1)) / cols;
      const cellHeight = 130;
      const labelHeight = 14;

      gridCharts.forEach(([image, label], index) => {
        const col = index % cols;
        if (col === 0) ensureSpace(cellHeight + labelHeight + gap);
        const x = margin + col * (cellWidth + gap);
        const y = cursorY;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(60, 60, 60);
        doc.text(label, x, y);
        doc.addImage(image, "PNG", x, y + 4, cellWidth, cellHeight);
        if (col === cols - 1 || index === gridCharts.length - 1) {
          cursorY += cellHeight + labelHeight + gap;
        }
      });
    }

    function drawTable(columns, rows) {
      const rowHeight = 15;
      const headerHeight = 17;

      function drawHeaderRow() {
        doc.setFillColor(233, 239, 238);
        doc.rect(margin, cursorY, contentWidth, headerHeight, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(30, 30, 30);
        let x = margin + 6;
        columns.forEach((col) => {
          if (col.align === "right") {
            doc.text(col.header, x + col.width - 12, cursorY + 12, { align: "right" });
          } else {
            doc.text(col.header, x, cursorY + 12);
          }
          x += col.width;
        });
        cursorY += headerHeight;
      }

      ensureSpace(headerHeight + rowHeight * Math.min(rows.length, 3) + 10);
      drawHeaderRow();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);

      rows.forEach((row, rowIndex) => {
        if (cursorY + rowHeight > pageHeight - margin) {
          cursorY = newPage();
          drawHeaderRow();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8.5);
        }

        if (rowIndex % 2 === 1) {
          doc.setFillColor(249, 250, 250);
          doc.rect(margin, cursorY, contentWidth, rowHeight, "F");
        }

        doc.setTextColor(45, 45, 45);
        let x = margin + 6;
        row.forEach((value, colIndex) => {
          const col = columns[colIndex];
          const text = String(value ?? "");
          const truncated = text.length > 40 ? `${text.slice(0, 38)}…` : text;
          if (col.align === "right") {
            doc.text(truncated, x + col.width - 12, cursorY + 11, { align: "right" });
          } else {
            doc.text(truncated, x, cursorY + 11);
          }
          x += col.width;
        });
        cursorY += rowHeight;
      });

      cursorY += 16;
    }

    function tableSection(title, columns, rows) {
      if (!rows.length) return;
      sectionTitle(title);
      drawTable(columns, rows);
    }

    tableSection(
      "By Coach",
      [
        { header: "Coach", width: contentWidth * 0.4 },
        { header: "Logs", width: contentWidth * 0.2, align: "right" },
        { header: "Interactions", width: contentWidth * 0.2, align: "right" },
        { header: "Hours", width: contentWidth * 0.2, align: "right" },
      ],
      (data.byCoach || []).map((row) => [
        row.coach || "Unknown",
        formatNumber(row.log_count),
        formatNumber(row.activity_count),
        formatHours(row.total_minutes),
      ]),
    );

    tableSection(
      "By Activity",
      [
        { header: "Activity", width: contentWidth * 0.5 },
        { header: "Interactions", width: contentWidth * 0.25, align: "right" },
        { header: "Hours", width: contentWidth * 0.25, align: "right" },
      ],
      (data.byActivity || []).map((row) => [row.activity || "Unknown", formatNumber(row.activity_count), formatHours(row.total_minutes)]),
    );

    tableSection(
      "By Gender",
      [
        { header: "Gender", width: contentWidth * 0.35 },
        { header: "Participants", width: contentWidth * 0.2, align: "right" },
        { header: "Interactions", width: contentWidth * 0.2, align: "right" },
        { header: "Hours", width: contentWidth * 0.25, align: "right" },
      ],
      (data.byGender || []).map((row) => [
        row.gender || "Unknown",
        formatNumber(row.youth_count),
        formatNumber(row.activity_count),
        formatHours(row.total_minutes),
      ]),
    );

    tableSection(
      "By Race/Ethnicity",
      [
        { header: "Race/Ethnicity", width: contentWidth * 0.35 },
        { header: "Participants", width: contentWidth * 0.2, align: "right" },
        { header: "Interactions", width: contentWidth * 0.2, align: "right" },
        { header: "Hours", width: contentWidth * 0.25, align: "right" },
      ],
      (data.byEthnicity || []).map((row) => [
        row.ethnicity || "Unknown",
        formatNumber(row.youth_count),
        formatNumber(row.activity_count),
        formatHours(row.total_minutes),
      ]),
    );

    tableSection(
      "By School",
      [
        { header: "School", width: contentWidth * 0.4 },
        { header: "Participants", width: contentWidth * 0.2, align: "right" },
        { header: "Interactions", width: contentWidth * 0.2, align: "right" },
        { header: "Hours", width: contentWidth * 0.2, align: "right" },
      ],
      (data.bySchool || []).map((row) => [
        row.school || "Unknown",
        formatNumber(row.youth_count),
        formatNumber(row.activity_count),
        formatHours(row.total_minutes),
      ]),
    );

    tableSection(
      "By Competency",
      [
        { header: "Competency", width: contentWidth * 0.35 },
        { header: "Logs", width: contentWidth * 0.15, align: "right" },
        { header: "Interactions", width: contentWidth * 0.2, align: "right" },
        { header: "Hours", width: contentWidth * 0.15, align: "right" },
        { header: "Participants", width: contentWidth * 0.15, align: "right" },
      ],
      (data.byCompetency || []).map((row) => [
        row.competency || "Unknown",
        formatNumber(row.log_count),
        formatNumber(row.activity_count),
        formatHours(row.total_minutes),
        formatNumber(row.youth_count),
      ]),
    );

    tableSection(
      "Top Participants",
      [
        { header: "Participant", width: contentWidth * 0.4 },
        { header: "Interactions", width: contentWidth * 0.2, align: "right" },
        { header: "Hours", width: contentWidth * 0.2, align: "right" },
        { header: "Last Session", width: contentWidth * 0.2 },
      ],
      (data.byYouth || []).slice(0, 20).map((row) => [
        row.youth_name || "Unknown",
        formatNumber(row.activity_count),
        formatHours(row.total_minutes),
        row.last_session_date || "-",
      ]),
    );

    const totalPages = doc.internal.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      doc.setPage(pageNumber);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(140, 140, 140);
      doc.text(`Chicago Youth Boxing Club — Page ${pageNumber} of ${totalPages}`, pageWidth / 2, pageHeight - 18, {
        align: "center",
      });
    }

    doc.save(`coach-log-report-${todayIso()}.pdf`);
  } catch (error) {
    console.error(error);
    setStatus("Could not generate the PDF report.", "error");
  } finally {
    downloadReportPdfButton.disabled = false;
    downloadReportPdfButton.textContent = originalLabel;
  }
}

filtersForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loadReport();
});

refreshButton.addEventListener("click", loadReport);

clearButton.addEventListener("click", () => {
  filtersForm.reset();
  document.querySelector("#date-from").value = dateDaysAgo(30);
  document.querySelector("#date-to").value = todayIso();
  loadReport();
});

downloadActivityCsvButton.addEventListener("click", downloadCurrentActivityCsv);
downloadReportCsvButton.addEventListener("click", downloadReportCsv);
downloadReportPdfButton.addEventListener("click", downloadReportPdf);
rosterImportForm.addEventListener("submit", importRosterCsv);
document.querySelectorAll("[data-report-range]").forEach((button) => {
  button.addEventListener("click", () => {
    setDateRange(button.dataset.reportRange);
    loadReport();
  });
});

refreshOverviewButton.addEventListener("click", loadOverview);

refreshRosterButton.addEventListener("click", loadRosterTable);
downloadRosterCsvButton.addEventListener("click", downloadRosterCsv);
rosterSearchInput.addEventListener("input", renderRosterTable);
addRosterPersonButton.addEventListener("click", () => openRosterPersonDialog());
rosterPersonForm.addEventListener("submit", submitRosterPersonForm);
rosterPersonCancelButton.addEventListener("click", () => rosterPersonDialog.close());

rosterSubtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveRosterView(button.dataset.rosterView));
});
addSchoolGroupButton.addEventListener("click", addEmptySchoolGroup);
refreshSchoolGroupsButton.addEventListener("click", loadSchoolAliases);

// The exact-date picker and the From/To range are two ways of asking the same question, so
// using one clears the other rather than leaving a stale value that silently gets ignored (see
// the "an exact date wins if both are set" note in loadAttendance).
attendanceDateInput.addEventListener("change", () => {
  attendanceFromInput.value = "";
  attendanceToInput.value = "";
  loadAttendance();
});
attendanceFromInput.addEventListener("change", () => {
  attendanceDateInput.value = "";
  loadAttendance();
});
attendanceToInput.addEventListener("change", () => {
  attendanceDateInput.value = "";
  loadAttendance();
});
attendanceTodayButton.addEventListener("click", () => {
  attendanceDateInput.value = todayIso();
  attendanceFromInput.value = "";
  attendanceToInput.value = "";
  loadAttendance();
});
attendanceThisMonthButton.addEventListener("click", () => {
  const now = new Date();
  attendanceDateInput.value = "";
  attendanceFromInput.value = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  attendanceToInput.value = localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  loadAttendance();
});
attendanceLastMonthButton.addEventListener("click", () => {
  const now = new Date();
  attendanceDateInput.value = "";
  attendanceFromInput.value = localIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  attendanceToInput.value = localIsoDate(new Date(now.getFullYear(), now.getMonth(), 0));
  loadAttendance();
});
attendanceClearDateButton.addEventListener("click", () => {
  attendanceDateInput.value = "";
  attendanceFromInput.value = "";
  attendanceToInput.value = "";
  loadAttendance();
});
refreshAttendanceButton.addEventListener("click", loadAttendance);
downloadAttendanceCsvButton.addEventListener("click", downloadAttendanceCsv);
downloadAttendanceByPersonCsvButton.addEventListener("click", downloadAttendanceByPersonCsv);
attendanceImportForm.addEventListener("submit", importAttendanceCsv);
attendanceRateYearSelect.addEventListener("change", loadAttendanceRateReport);
refreshAttendanceRateButton.addEventListener("click", loadAttendanceRateReport);
downloadAttendanceRatePdfButton.addEventListener("click", downloadAttendanceRatePdf);
addAttendanceRecordButton.addEventListener("click", () => openAttendanceRecordDialog());
attendanceRecordForm.addEventListener("submit", submitAttendanceRecordForm);
attendanceRecordCancelButton.addEventListener("click", () => attendanceRecordDialog.close());

grantsSubtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveGrantsView(button.dataset.grantsView));
});

grantsYearSelect.addEventListener("change", refreshAllGrantsViews);
refreshGrantsDashboardButton.addEventListener("click", loadGrantsDashboard);
saveGrantsGoalButton.addEventListener("click", saveGrantsGoal);

refreshGrantsButton.addEventListener("click", loadGrants);
addGrantButton.addEventListener("click", () => openGrantDialog());
grantForm.addEventListener("submit", submitGrantForm);
grantCancelButton.addEventListener("click", () => grantDialog.close());

refreshGrantsForecastButton.addEventListener("click", loadGrantsForecast);

refreshGrantsBudgetButton.addEventListener("click", loadGrantsBudget);
grantsExpenseForm.addEventListener("submit", submitGrantExpenseForm);
grantsReceiptUploadButton.addEventListener("click", uploadGrantReceipt);
manageCategoriesButton.addEventListener("click", openCategoriesDialog);
categoriesDialogCloseButton.addEventListener("click", () => categoriesDialog.close());
categoriesAddForm.addEventListener("submit", submitNewCategory);
manageReceiptOptionsButton.addEventListener("click", openReceiptOptionsDialog);
receiptOptionsDialogCloseButton.addEventListener("click", () => receiptOptionsDialog.close());
RECEIPT_OPTION_KINDS.forEach((kind) => {
  document.querySelector(`#receipt-options-${kind}-form`).addEventListener("submit", submitNewReceiptOption);
});
grantsBudgetConfidenceFilters.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    grantsBudgetState.confidenceFilter = button.dataset.budgetConfidence || "";
    grantsBudgetConfidenceFilters.querySelectorAll("button").forEach((btn) => btn.classList.toggle("active", btn === button));
    renderGrantsBudget();
  });
});

expensesYearSelect.addEventListener("change", refreshExpensesTab);
refreshExpensesButton.addEventListener("click", refreshExpensesTab);
checkPatternGapsButton.addEventListener("click", checkForPatternGaps);

ptoRequestForm.addEventListener("submit", submitPtoRequestForm);
ptoStatusFilterSelect.addEventListener("change", loadPtoRequests);
refreshPtoButton.addEventListener("click", loadPtoRequests);

mileageRequestForm.addEventListener("submit", submitMileageRequestForm);
mileageStatusFilterSelect.addEventListener("change", loadMileageRequests);
refreshMileageButton.addEventListener("click", loadMileageRequests);

scheduleWeekSelect.addEventListener("change", () => {
  scheduleState.activeWeekId = scheduleWeekSelect.value;
  loadScheduleShiftsForActiveWeek();
});
newScheduleWeekButton.addEventListener("click", openScheduleWeekDialog);
scheduleWeekCancelButton.addEventListener("click", () => scheduleWeekDialog.close());
scheduleWeekForm.addEventListener("submit", submitScheduleWeekForm);
deleteScheduleWeekButton.addEventListener("click", deleteActiveScheduleWeek);

staffAddForm.addEventListener("submit", submitStaffAddForm);

resourcesSubtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveResourcesView(button.dataset.resourcesView));
});

attendanceSubtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveAttendanceView(button.dataset.attendanceView));
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

document.querySelector("#date-from").value = dateDaysAgo(30);
document.querySelector("#date-to").value = todayIso();
attendanceDateInput.value = todayIso();

setActiveTab(window.location.hash.slice(1));
loadReport();
loadOverview();
loadRosterTable();
loadSchoolAliases();
loadAttendance();
populateAttendanceRateYearOptions();
loadAttendanceRateReport();
populateGrantsYearOptions();
refreshAllGrantsViews();
populateExpensesYearOptions();
refreshExpensesTab();
loadPatternSuggestions();
loadPatternPhrases();
loadPtoRequests();
loadMileageRequests();
loadScheduleWeeks();
loadStaff();
