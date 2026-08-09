// Builds a soft iOS-style contribution area chart as SVG (light + dark).
// Data: GitHub GraphQL contribution calendar, last N days.

import { writeFileSync, mkdirSync } from "node:fs";

const LOGIN = process.env.LOGIN;
const TOKEN = process.env.GITHUB_TOKEN;
const DAYS = 56;
const ACCENT = "#0A84FF";

const QUERY = `query($login:String!){
  user(login:$login){ contributionsCollection{ contributionCalendar{
    weeks{ contributionDays{ date contributionCount } } } } } }`;

async function fetchDays() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;
  const days = weeks.flatMap((w) => w.contributionDays);
  return days.slice(-DAYS);
}

function stats(days) {
  const total = days.reduce((s, d) => s + d.contributionCount, 0);
  let streak = 0, best = 0;
  for (const d of days) {
    if (d.contributionCount > 0) { streak++; best = Math.max(best, streak); }
    else streak = 0;
  }
  const busiest = days.reduce((a, b) => (b.contributionCount > a.contributionCount ? b : a), days[0]);
  return { total, best, busiest };
}

function monthTicks(days, x) {
  const ticks = [];
  let last = null;
  days.forEach((d, i) => {
    const month = d.date.slice(0, 7);
    if (month !== last) {
      last = month;
      const label = new Date(d.date + "T00:00:00Z").toLocaleString("en", { month: "short", timeZone: "UTC" });
      ticks.push({ label, x: x(i) });
    }
  });
  return ticks;
}

function render(days, theme) {
  const W = 860, H = 232;
  const padL = 32, padR = 32, top = 92, bottom = 40;
  const plotH = H - top - bottom;
  const { total, best, busiest } = stats(days);
  // 12% headroom so the tallest bar never touches the header line.
  const max = Math.max(...days.map((d) => d.contributionCount), 1) * 1.12;

  const slot = (W - padL - padR) / days.length;
  const barW = Math.min(slot * 0.56, 11);
  const x = (i) => padL + i * slot + (slot - barW) / 2;
  const centre = (i) => x(i) + barW / 2;
  const baseline = top + plotH;
  // Every day gets a visible mark: zero-days render as a faint dot on the axis
  // so the row reads as a continuous rhythm instead of a broken line.
  const minH = barW;

  const c = theme === "dark"
    ? { bg: "#0D1117", title: "#8b949e", value: "#e6edf3", muted: "#6e7681", empty: "#21262d" }
    : { bg: "#ffffff", title: "#57606a", value: "#1f2328", muted: "#8c959f", empty: "#eaeef2" };

  const ticks = monthTicks(days, centre);

  const bars = days.map((d, i) => {
    const v = d.contributionCount;
    const h = v === 0 ? minH : Math.max(minH, (v / max) * plotH);
    const yPos = baseline - h;
    const fill = v === 0 ? c.empty : ACCENT;
    const op = v === 0 ? 1 : 0.35 + 0.65 * (v / max);
    const delay = (i * 14).toFixed(0);
    return `<rect class="bar" x="${x(i).toFixed(2)}" y="${yPos.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" rx="${(barW / 2).toFixed(2)}" fill="${fill}" fill-opacity="${op.toFixed(2)}" style="transform-origin:${centre(i).toFixed(2)}px ${baseline}px;animation-delay:${delay}ms"><title>${d.date}: ${v}</title></rect>`;
  }).join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily contributions over the last ${DAYS} days">
  <defs>
    <style>
      .f { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; }
      .bar { transform: scaleY(0); animation: grow .7s cubic-bezier(.22,.68,.36,1) forwards; }
      .meta { opacity: 0; animation: fade .8s ease-out .15s forwards; }
      .tick { opacity: 0; animation: fade .8s ease-out .9s forwards; }
      @keyframes grow { to { transform: scaleY(1); } }
      @keyframes fade { to { opacity: 1; } }
      @media (prefers-reduced-motion: reduce) {
        .bar { animation: none; transform: scaleY(1); }
        .meta, .tick { animation: none; opacity: 1; }
      }
    </style>
  </defs>

  <rect width="${W}" height="${H}" rx="18" fill="${c.bg}"/>

  <g class="f meta">
    <text x="${padL}" y="38" fill="${c.title}" font-size="12.5" font-weight="500" letter-spacing="1.1">CONTRIBUTIONS · LAST ${DAYS / 7} WEEKS</text>
    <text x="${padL}" y="76" fill="${c.value}" font-size="32" font-weight="600">${total}</text>
    <text x="${W - padR}" y="44" fill="${c.title}" font-size="13" text-anchor="end">${best}-day streak</text>
    <text x="${W - padR}" y="66" fill="${c.muted}" font-size="13" text-anchor="end">busiest ${busiest.contributionCount} on ${new Date(busiest.date + "T00:00:00Z").toLocaleString("en", { month: "short", day: "numeric", timeZone: "UTC" })}</text>
  </g>

  <g>
    ${bars}
  </g>

  <g class="f tick">
    ${ticks.map((t) => `<text x="${t.x.toFixed(1)}" y="${baseline + 26}" fill="${c.muted}" font-size="12" text-anchor="middle">${t.label}</text>`).join("\n    ")}
  </g>
</svg>`;
}

const days = await fetchDays();
mkdirSync("dist", { recursive: true });
writeFileSync("dist/contributions.svg", render(days, "light"));
writeFileSync("dist/contributions-dark.svg", render(days, "dark"));
console.log(`built ${days.length} days · total ${stats(days).total}`);
