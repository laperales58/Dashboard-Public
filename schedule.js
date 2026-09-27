// Read-only view of the staff schedule for coaches -- same data as the editable grid in
// admin.html's Resources > Schedule tab, just without any of the edit/create/delete controls.

const SCHEDULE_WEEK_DAYS = 7;

const weekSelect = document.querySelector("#schedule-view-week-select");
const statusEl = document.querySelector("#schedule-view-status");
const headerRow = document.querySelector("#schedule-view-header-row");
const gridBody = document.querySelector("#schedule-view-body");
const emptyEl = document.querySelector("#schedule-view-empty");
const tableWrap = document.querySelector(".schedule-grid-table").closest(".table-wrap");

const state = { weeks: [], staffNames: [], activeWeekId: "", shifts: [] };

function setStatus(message, type = "") {
  statusEl.textContent = message || "";
  statusEl.className = `import-status ${type}`.trim();
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Manual y/m/d math (no Date.parse / toISOString round-trip) so this never shifts a day across
// timezones -- same rationale as the pg `date` column slicing used throughout the server.
function addDaysToIsoDate(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDayHeader(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return `${date.toLocaleDateString(undefined, { weekday: "short" })} ${month}/${day}`;
}

function formatTime12h(time24) {
  if (!time24) return "";
  const [hour, minute] = time24.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

function weekDates(week) {
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

function populateWeekSelect() {
  weekSelect.replaceChildren(
    ...state.weeks.map((week) => {
      const option = document.createElement("option");
      option.value = week.id;
      option.textContent = `${formatDayHeader(week.startDate)} – ${formatDayHeader(week.endDate)}`;
      return option;
    }),
  );
  if (state.activeWeekId) weekSelect.value = state.activeWeekId;
}

async function loadWeeks() {
  try {
    const response = await fetch("/api/schedule-weeks", { credentials: "same-origin" });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load schedule.");

    state.weeks = data.weeks || [];
    state.staffNames = data.staffNames || [];

    if (!state.weeks.some((week) => week.id === state.activeWeekId)) {
      // Default to whichever week contains today, falling back to the most recent one.
      const today = todayIso();
      const currentWeek = state.weeks.find((week) => today >= week.startDate && today <= week.endDate);
      state.activeWeekId = currentWeek?.id || state.weeks[0]?.id || "";
    }

    populateWeekSelect();
    await loadShiftsForActiveWeek();
  } catch (error) {
    setStatus(error.message, "danger");
  }
}

async function loadShiftsForActiveWeek() {
  if (!state.activeWeekId) {
    state.shifts = [];
    renderGrid();
    return;
  }

  try {
    const response = await fetch(`/api/schedule-weeks/${encodeURIComponent(state.activeWeekId)}/shifts`, {
      credentials: "same-origin",
    });
    if (response.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load shifts.");

    state.shifts = data.shifts || [];
    renderGrid();
  } catch (error) {
    setStatus(error.message, "danger");
  }
}

function renderGrid() {
  const week = state.weeks.find((w) => w.id === state.activeWeekId);

  emptyEl.classList.toggle("hidden", Boolean(week));
  weekSelect.classList.toggle("hidden", !state.weeks.length);
  tableWrap.classList.toggle("hidden", !week);

  headerRow.replaceChildren();
  gridBody.replaceChildren();
  if (!week) return;

  const days = weekDates(week);

  const staffTh = document.createElement("th");
  staffTh.textContent = "Staff";
  const totalTh = document.createElement("th");
  totalTh.textContent = "Total";
  headerRow.append(
    staffTh,
    ...days.map((day) => {
      const th = document.createElement("th");
      th.className = "schedule-day-header";
      th.textContent = formatDayHeader(day);
      return th;
    }),
    totalTh,
  );

  gridBody.replaceChildren(
    ...state.staffNames.map((staffName) => {
      const tr = document.createElement("tr");

      const nameTd = document.createElement("td");
      nameTd.textContent = staffName;
      tr.append(nameTd);

      let totalMinutes = 0;

      days.forEach((day) => {
        const shift = state.shifts.find((s) => s.staffName === staffName && s.shiftDate === day);
        totalMinutes += computeShiftMinutes(shift?.startTime, shift?.endTime);

        const td = document.createElement("td");
        td.textContent = shift ? `${formatTime12h(shift.startTime)} – ${formatTime12h(shift.endTime)}` : "—";
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

weekSelect.addEventListener("change", () => {
  state.activeWeekId = weekSelect.value;
  loadShiftsForActiveWeek();
});

loadWeeks();
