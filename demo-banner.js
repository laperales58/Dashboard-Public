// Demo edition only: a banner at the top of every page saying the data is made up, plus the
// shared demo password so visitors can get into the admin dashboard. Loaded by index.html,
// admin.html and login.html. To turn it off, remove those <script src="demo-banner.js"> tags.
(function () {
  const DEMO_PASSWORD = "DEMO";

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
  `;
  document.head.append(style);

  const banner = document.createElement("div");
  banner.className = "demo-banner";
  banner.setAttribute("role", "note");
  banner.innerHTML = `
    <span class="demo-banner-tag">Demo</span>
    <span>This is a demo. Every name, check-in, coach log and grant here is made up to show what the dashboard can do.</span>
    <span>Admin password: <code>${DEMO_PASSWORD}</code></span>
  `;
  document.body.prepend(banner);
})();
