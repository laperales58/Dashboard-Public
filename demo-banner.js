// Demo edition only. Adds:
//   1. a banner at the top of every page saying the data is made up, with the demo password
//   2. a short "what this page does" guide at the top of every tab and sub-tab
//   3. a "Fill in an example" button on the coach log form
// Everything demo-specific lives in this one file. Loaded by index.html, admin.html and
// login.html -- remove those <script src="demo-banner.js"> tags to turn it all off.
(function () {
  const DEMO_PASSWORD = "DEMO";
  const HIDE_KEY = "demoGuideHidden";

  // -------------------------------------------------------------------------------------------
  // Guide text. Keys are CSS selectors for the tab/sub-tab container the guide goes into; the
  // guide is inserted as that container's first child, so it shows and hides with the tab.
  // -------------------------------------------------------------------------------------------

  const ADMIN_GUIDES = {
    '[data-tabs="overview"]': {
      title: "Overview",
      text: "A one-screen snapshot of the whole program. Each number rolls up automatically from the other tabs: active members and attendance from check-ins, logs and mentoring hours from coach logs, and the forecast from Grants.",
    },
    '[data-tabs="roster"]': {
      title: "Roster",
      text: "Everyone who takes part in the program, plus the demographic details (age, school, gender, race/ethnicity, zip code) that every report can be broken down by.",
    },
    '[data-roster-view-panel="people"]': {
      title: "People",
      items: [
        "Import a roster export (CSV or tab-separated) from a membership system. It matches people by name and fills in their details.",
        "Add or edit people by hand, search the table, and download it as a CSV.",
        "Rows that look mis-imported, like a date sitting in the School column, get flagged so they're easy to fix.",
      ],
    },
    '[data-roster-view-panel="school-groups"]': {
      title: "School Groups",
      text: "Participants write their school in different ways. Drag one school onto another box to count them as the same school in every report, or click a group's name to rename it.",
      tryIt: "This demo already groups \"Riverside HS\" and \"Riverside High\" under Riverside High School.",
    },
    '[data-tabs="logs"]': {
      title: "Logs",
      text: "Coaches write a few plain sentences after each session on the Log page. The dashboard pulls out who they worked with, the activity, minutes, focus, and which program goal it supports, then turns it all into reports.",
      items: [
        "Filter by date, coach, participant, activity, focus, gender, race/ethnicity, school, or program competency. The This week and Last month buttons are shortcuts.",
        "<strong>Download PDF Report</strong> makes a formatted report with charts, ready for a board meeting or grant report. <strong>Download report CSV</strong> gives the raw numbers.",
        "Scroll down for every individual interaction and log, plus AI-suggested keywords that help the log form recognize new activities.",
      ],
      tryIt: "Set Coach to one person and click Last month, then download the PDF.",
    },
    '[data-tabs="attendance"]': {
      title: "Attendance",
      text: "Check-ins arrive automatically from the gym's check-in system. Past attendance can also be imported from a spreadsheet, or single check-ins added by hand.",
    },
    '[data-attendance-view-panel="daily"]': {
      title: "Daily",
      text: "See who checked in on any day. Add or fix a check-in, or download the list as a CSV.",
    },
    '[data-attendance-view-panel="reports"]': {
      title: "Reports",
      text: "Monthly attendance rate: of the days the gym was open, how often members came. It's broken out by gender, age group (youth vs. adult), and how long people have been members.",
      tryIt: "Click Download PDF Report for a print-ready version.",
    },
    '[data-attendance-view-panel="lookup"]': {
      title: "Data Lookup",
      text: "Pick any date range to get total check-ins, unique participants, and how many days each person came. Useful for questions like \"how many kids did we serve this summer?\" The per-person list downloads as a CSV.",
    },
    '[data-tabs="grants"]': {
      title: "Grants",
      text: "Track every grant from first idea to award, and see how the year's funding is shaping up against the goal.",
    },
    '[data-grants-view-panel="dashboard"]': {
      title: "Dashboard",
      text: "The selected year at a glance: total awarded, what's still pending, win rate, and a weighted forecast. Each grant counts by how likely it is: Confirmed 100%, Optimistic 75%, Hopeful 50%, Reach 25%, Unlikely 0%.",
      tryIt: "Change the Revenue Goal and save it to watch the progress bar and gap update.",
    },
    '[data-grants-view-panel="applications"]': {
      title: "Applications",
      text: "The full grant list with funder, status, confidence, amount, and application dates.",
      tryIt: "Click + Add Grant to add one, or edit a row to move it from Submitted to Awarded.",
    },
    '[data-grants-view-panel="forecasting"]': {
      title: "Forecasting",
      text: "Splits the year's grant money into what's confirmed and what's still anticipated, and shows how far the combined total is from the goal.",
    },
    '[data-grants-view-panel="budget"]': {
      title: "Budget",
      text: "Grant revenue minus logged expenses, so you can see the net position for the year. Filter revenue by confidence level to compare the best case with only what's confirmed.",
    },
    '[data-tabs="expenses"]': {
      title: "Expenses",
      items: [
        "Upload a photo or PDF of a receipt and click <strong>Read Receipt</strong>. AI reads the vendor, date, amount, and category for you to check and confirm. If AI is turned off in this demo, you can fill the fields in by hand.",
        "Add an expense by hand, split one receipt across categories, and link spending to the grant that pays for it.",
        "Manage the category list and who paid or how (cardholders and payment methods).",
      ],
    },
    '[data-tabs="resources"]': {
      title: "Resources",
      text: "Staff tools in one place: time-off requests, mileage, the weekly schedule, and the staff list. Staff can also submit PTO and mileage from the public Log page without the admin password.",
    },
    '[data-resources-view-panel="pto"]': {
      title: "PTO Requests",
      text: "Staff request time off, and admins approve or deny it here.",
    },
    '[data-resources-view-panel="mileage"]': {
      title: "Mileage",
      text: "Staff log work trips with miles, start and end locations, and optional odometer or map photos. Admins approve or deny them here.",
    },
    '[data-resources-view-panel="schedule"]': {
      title: "Schedule",
      text: "Build the weekly staff schedule: pick a week, set each person's hours, or start a new week by copying an existing one. Staff see it read-only on the Log page.",
    },
    '[data-resources-view-panel="staff"]': {
      title: "Staff",
      text: "Add, rename, or deactivate staff. This list fills the Coach dropdown on the log form and the name choices on the Resources forms.",
    },
  };

  const LOG_PAGE_GUIDES = {
    '[data-tabs="logs"]': {
      title: "Coach Log",
      text: "This is what coaches see after a session. Pick a coach, write what happened in plain sentences, and the page finds each participant's name, the activity, and the focus on its own. Then add minutes and submit, and it shows up in the Dashboard's reports.",
      tryIt: "Click the button to fill in a sample log, then enter minutes for each person under Confirm activity.",
      exampleButton: true,
    },
    '[data-tabs="pto-mileage"]': {
      title: "PTO / Mileage",
      text: "Staff can request time off and log work mileage here without the admin password. Requests go to the Dashboard (Resources tab) for approval.",
    },
    '[data-tabs="schedule"]': {
      title: "Schedule",
      text: "Staff see the weekly schedule here, read-only. It's built on the Dashboard under Resources → Schedule.",
    },
  };

  // -------------------------------------------------------------------------------------------
  // Styles
  // -------------------------------------------------------------------------------------------

  const style = document.createElement("style");
  style.textContent = `
    .demo-banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 6px 14px;
      padding: 10px 16px;
      background: var(--warn-bg, #fff4df);
      border-bottom: 1px solid rgba(161, 92, 0, 0.25);
      color: var(--ink, #172027);
      font-size: 0.92rem;
      line-height: 1.4;
      text-align: center;
    }
    .demo-banner-tag {
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--warn, #a15c00);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .demo-banner code {
      padding: 1px 6px;
      border-radius: 4px;
      background: #fff;
      border: 1px solid rgba(161, 92, 0, 0.3);
      font-weight: 800;
    }
    .demo-banner-toggle {
      padding: 3px 10px;
      border: 1px solid rgba(161, 92, 0, 0.35);
      border-radius: 999px;
      background: transparent;
      color: var(--warn, #a15c00);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 700;
      cursor: pointer;
    }
    .demo-banner-toggle:hover { background: #fff; }

    .demo-guide {
      margin: 4px 0 18px;
      padding: 12px 16px;
      border: 1px solid var(--line, #d9e1e7);
      border-left: 4px solid var(--accent, #0b6f6a);
      border-radius: 8px;
      background: var(--soft, #f7fafb);
      color: var(--ink, #172027);
      font-size: 0.93rem;
      line-height: 1.5;
    }
    .demo-guide-title {
      display: block;
      margin-bottom: 4px;
      color: var(--accent, #0b6f6a);
      font-size: 0.74rem;
      font-weight: 800;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .demo-guide p { margin: 0; }
    .demo-guide ul { margin: 6px 0 0; padding-left: 20px; }
    .demo-guide li + li { margin-top: 3px; }
    .demo-guide-try {
      margin-top: 8px !important;
      color: var(--muted, #66727e);
    }
    .demo-guide-try strong { color: var(--ink, #172027); }
    .demo-guide-example {
      margin-top: 10px;
    }
    body.demo-guide-hidden .demo-guide { display: none; }
  `;
  document.head.append(style);

  // -------------------------------------------------------------------------------------------
  // Banner
  // -------------------------------------------------------------------------------------------

  const isLoginPage = Boolean(document.querySelector("#login-form"));
  const guides = document.body.classList.contains("dashboard-page")
    ? ADMIN_GUIDES
    : document.querySelector("#log-form")
      ? LOG_PAGE_GUIDES
      : null;

  const banner = document.createElement("div");
  banner.className = "demo-banner";
  banner.setAttribute("role", "note");
  banner.innerHTML = `
    <span class="demo-banner-tag">Demo</span>
    <span>This is a demo. Every name, check-in, coach log and grant here is made up to show what the dashboard can do.</span>
    <span>Admin password: <code>${DEMO_PASSWORD}</code></span>
    ${guides && !isLoginPage ? '<button type="button" class="demo-banner-toggle" id="demo-guide-toggle"></button>' : ""}
  `;
  document.body.prepend(banner);

  if (!guides) return;

  // -------------------------------------------------------------------------------------------
  // Page guides
  // -------------------------------------------------------------------------------------------

  function renderGuide(guide) {
    const box = document.createElement("aside");
    box.className = "demo-guide";
    let html = `<span class="demo-guide-title">${guide.title}</span>`;
    if (guide.text) html += `<p>${guide.text}</p>`;
    if (guide.items) html += `<ul>${guide.items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
    if (guide.tryIt) html += `<p class="demo-guide-try"><strong>Try it:</strong> ${guide.tryIt}</p>`;
    if (guide.exampleButton) {
      html += '<button type="button" class="secondary demo-guide-example" id="demo-fill-example">Fill in an example</button>';
    }
    box.innerHTML = html;
    return box;
  }

  Object.entries(guides).forEach(([selector, guide]) => {
    const target = document.querySelector(selector);
    if (target) target.prepend(renderGuide(guide));
  });

  // Hide/show all guides, remembered per browser.
  const toggle = document.querySelector("#demo-guide-toggle");
  function readHidden() {
    try {
      return window.localStorage.getItem(HIDE_KEY) === "1";
    } catch (error) {
      return false;
    }
  }
  function setHidden(hidden) {
    document.body.classList.toggle("demo-guide-hidden", hidden);
    if (toggle) toggle.textContent = hidden ? "Show page tips" : "Hide page tips";
    try {
      window.localStorage.setItem(HIDE_KEY, hidden ? "1" : "0");
    } catch (error) {
      // Storage blocked (private window etc.) -- the toggle still works for this visit.
    }
  }
  setHidden(readHidden());
  if (toggle) toggle.addEventListener("click", () => setHidden(!document.body.classList.contains("demo-guide-hidden")));

  // -------------------------------------------------------------------------------------------
  // "Fill in an example" on the coach log form -- uses real names from the demo roster so the
  // name matching actually finds them.
  // -------------------------------------------------------------------------------------------

  const exampleButton = document.querySelector("#demo-fill-example");
  const responseInput = document.querySelector("#coach-response");
  const coachSelect = document.querySelector("#coach");
  let rosterNames = [];

  fetch("/api/roster", { credentials: "same-origin" })
    .then((response) => (response.ok ? response.json() : { roster: [] }))
    .then((data) => {
      rosterNames = (data.roster || []).map((person) => person.fullName || person.name).filter(Boolean);
      // Swap the placeholder's example names for two people who are actually on the demo roster.
      if (responseInput && rosterNames.length >= 2) {
        const [first, second] = rosterNames.slice(0, 2);
        responseInput.placeholder = `Example: Worked with ${first} for 15 minutes on footwork drills and ${second} for 30 minutes on blocking and counter drills.`;
      }
    })
    .catch(() => {});

  function fire(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  if (exampleButton && responseInput) {
    exampleButton.addEventListener("click", () => {
      const pool = [...rosterNames];
      const pickName = () => (pool.length ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0] : "a participant");
      const a = pickName();
      const b = pickName();
      const c = pickName();

      if (coachSelect && !coachSelect.value) {
        const firstCoach = [...coachSelect.options].find((option) => option.value);
        if (firstCoach) {
          coachSelect.value = firstCoach.value;
          fire(coachSelect);
        }
      }

      responseInput.value =
        `${a} did pad work with me, focusing on counters and timing. ` +
        `${b} and ${c} sparred a few rounds, focusing on distance and defense. ` +
        `Afterward I helped ${a} with math homework and talked with ${b} about college applications.`;
      fire(responseInput);
      responseInput.focus();
      document.querySelector("#confirm-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
})();
