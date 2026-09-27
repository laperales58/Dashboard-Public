// Public log-form page for coaches (index.html): submit PTO / mileage requests and view the
// schedule, all as tabs alongside the daily log form. No login required (see
// isPublicPath/isPublicApiRoute in server.js). Deliberately has no approve/deny/reset/delete
// actions or schedule-editing controls -- those "edit powers" only exist on the admin dashboard
// (admin.html), which still requires the shared password.
//
// The Schedule view is its own top-level page tab (see the "Logs / PTO & Mileage / Schedule" tab
// bar wired up in app.js) rather than a resources-view-panel -- only PTO and Mileage are nested
// sub-tabs here, under the "PTO / Mileage" top-level tab.

const resourcesSubtabButtons = document.querySelectorAll(".resources-subtab-button");
const resourcesViewPanels = document.querySelectorAll("[data-resources-view-panel]");

function setActiveResourcesView(view) {
  const nextView = ["pto", "mileage"].includes(view) ? view : "pto";

  resourcesViewPanels.forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.resourcesViewPanel !== nextView);
  });

  resourcesSubtabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.resourcesView === nextView);
  });
}

resourcesSubtabButtons.forEach((button) => {
  button.addEventListener("click", () => setActiveResourcesView(button.dataset.resourcesView));
});

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

// ---- PTO Requests ----------------------------------------------------------------------------

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
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not submit request.");

    setPtoStatus(`Request submitted for ${payload.staffName}.`, "success");
    ptoRequestForm.reset();
    await loadPtoRequests();
  } catch (error) {
    setPtoStatus(error.message, "danger");
  } finally {
    ptoRequestButton.disabled = false;
    ptoRequestButton.textContent = originalLabel;
  }
}

ptoRequestForm.addEventListener("submit", submitPtoRequestForm);
ptoStatusFilterSelect.addEventListener("change", loadPtoRequests);
refreshPtoButton.addEventListener("click", loadPtoRequests);

// ---- Mileage ------------------------------------------------------------------------------

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

const mileageRequestsState = { requests: [], staffNames: [], loading: false, optionsLoaded: false };

function setMileageStatus(message, type = "") {
  mileageStatusEl.textContent = message || "";
  mileageStatusEl.className = `import-status ${type}`.trim();
}

// Same pattern as the admin dashboard's receipt upload (readFileAsDataUrl in admin.js) -- reads a
// File into a base64 data URL so it can go straight into a JSON POST body.
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error || new Error("Could not read file.")));
    reader.readAsDataURL(file);
  });
}

// Builds the small thumbnail strip shown in the "Photos" column -- one 48px clickable thumbnail
// per uploaded photo (odometer shot, maps screenshot), opening the full-size image in a new tab.
// Mirrors admin.js's receiptPhotoElement/.receipt-thumbnail pattern used for grant receipts.
function mileagePhotosCell(request) {
  const td = document.createElement("td");
  if (!request.photos?.length) {
    td.textContent = "—";
    return td;
  }

  td.className = "mileage-photos-cell";
  request.photos.forEach((photo) => {
    const img = document.createElement("img");
    img.className = "receipt-thumbnail";
    img.src = `/api/mileage-requests/photos/${encodeURIComponent(photo.id)}/image`;
    img.alt = "Mileage photo";
    img.addEventListener("click", () => window.open(img.src, "_blank"));
    td.append(img);
  });
  return td;
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

function renderMileageRequests() {
  const requests = mileageRequestsState.requests;
  mileageRequestsEmptyEl.classList.toggle("hidden", requests.length > 0);
  mileageRequestsBody.closest(".table-wrap").classList.toggle("hidden", requests.length === 0);

  mileageRequestsBody.replaceChildren(
    ...requests.map((request) => {
      const tr = document.createElement("tr");

      [
        request.staffName,
        formatDate(request.tripDate),
        request.startAddress || "—",
        request.endAddress || "—",
        request.purpose || "—",
      ].forEach((value) => {
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

mileageRequestForm.addEventListener("submit", submitMileageRequestForm);
mileageStatusFilterSelect.addEventListener("change", loadMileageRequests);
refreshMileageButton.addEventListener("click", loadMileageRequests);

// ---- Schedule (read-only) -------------------------------------------------------------------

const SCHEDULE_WEEK_DAYS = 7;

const scheduleWeekSelect = document.querySelector("#schedule-view-week-select");
const scheduleStatusEl = document.querySelector("#schedule-view-status");
const scheduleHeaderRow = document.querySelector("#schedule-view-header-row");
const scheduleGridBody = document.querySelector("#schedule-view-body");
const scheduleEmptyEl = document.querySelector("#schedule-view-empty");
const scheduleTableWrap = document.querySelector(".schedule-grid-table").closest(".table-wrap");

const scheduleState = { weeks: [], staffNames: [], activeWeekId: "", shifts: [] };

function setScheduleStatus(message, type = "") {
  scheduleStatusEl.textContent = message || "";
  scheduleStatusEl.className = `import-status ${type}`.trim();
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

function formatScheduleDayHeader(isoDate) {
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
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "Could not load schedule.");

    scheduleState.weeks = data.weeks || [];
    scheduleState.staffNames = data.staffNames || [];

    if (!scheduleState.weeks.some((week) => week.id === scheduleState.activeWeekId)) {
      const today = todayIso();
      const currentWeek = scheduleState.weeks.find((week) => today >= week.startDate && today <= week.endDate);
      scheduleState.activeWeekId = currentWeek?.id || scheduleState.weeks[0]?.id || "";
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
  scheduleTableWrap.classList.toggle("hidden", !week);

  scheduleHeaderRow.replaceChildren();
  scheduleGridBody.replaceChildren();
  if (!week) return;

  const days = scheduleWeekDates(week);

  const staffTh = document.createElement("th");
  staffTh.textContent = "Staff";
  const totalTh = document.createElement("th");
  totalTh.textContent = "Total";
  scheduleHeaderRow.append(
    staffTh,
    ...days.map((day) => {
      const th = document.createElement("th");
      th.className = "schedule-day-header";
      th.textContent = formatScheduleDayHeader(day);
      return th;
    }),
    totalTh,
  );

  // Active staff plus anyone -- active or not -- who already has a shift this week, so a
  // deactivated person's past hours don't vanish from a week where they're already on the books.
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

scheduleWeekSelect.addEventListener("change", () => {
  scheduleState.activeWeekId = scheduleWeekSelect.value;
  loadScheduleShiftsForActiveWeek();
});

// ---- Init -----------------------------------------------------------------------------------

loadPtoRequests();
loadMileageRequests();
loadScheduleWeeks();
