/* Tracking feed — loads data/tracking.json, renders + filters. */
const CATS = {
  "all": "All",
  "money-flow": "Money flow",
  "ai-governance": "AI governance",
  "animal-welfare": "Animal welfare",
  "abundance-progress": "Abundance / progress",
  "biosecurity": "Biosecurity",
  "org-network": "Org & network",
  "critique": "Critique"
};
const CAT_LABEL = { ...CATS };
let ITEMS = [];
let active = "all";

function fmtDate(iso) {
  try {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}
function esc(s) { return (s || "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "source"; } }

function render() {
  const feed = document.getElementById("feed");
  const list = ITEMS.filter(it => active === "all" || it.category === active);
  if (!list.length) { feed.innerHTML = `<p class="mono" style="color:var(--ink-faint)">No items in this category yet.</p>`; return; }
  feed.innerHTML = list.map(it => `
    <article class="item" data-cat="${esc(it.category)}">
      <div>
        <div class="when">${fmtDate(it.date)}</div>
        <span class="cat">${esc(CAT_LABEL[it.category] || it.category)}</span>
      </div>
      <div>
        <h4>${esc(it.title)}</h4>
        <p>${esc(it.summary)}</p>
        <div class="meta"><span class="rg">${esc(it.region || "")}</span> · ${esc(it.org || "")} · <a href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.source || host(it.url))} ↗</a></div>
      </div>
    </article>`).join("");
}

function buildFilters() {
  const wrap = document.getElementById("filters");
  const counts = {};
  ITEMS.forEach(it => { counts[it.category] = (counts[it.category] || 0) + 1; });
  wrap.innerHTML = Object.entries(CATS).map(([k, label]) => {
    const n = k === "all" ? ITEMS.length : (counts[k] || 0);
    if (k !== "all" && !n) return "";
    return `<button class="chipbtn ${k === "all" ? "on" : ""}" data-cat="${k}">${label} <span style="opacity:.55">${n}</span></button>`;
  }).join("");
  wrap.querySelectorAll(".chipbtn").forEach(b => b.addEventListener("click", () => {
    active = b.dataset.cat;
    wrap.querySelectorAll(".chipbtn").forEach(x => x.classList.remove("on"));
    b.classList.add("on");
    render();
  }));
}

async function boot() {
  try {
    const res = await fetch("./data/tracking.json?v=" + Date.now());
    const data = await res.json();
    ITEMS = (data.items || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    document.getElementById("feed-count").textContent = ITEMS.length;
    document.getElementById("feed-date").textContent = fmtDate(data.generated || ITEMS[0]?.date || "");
    buildFilters();
    render();
  } catch (e) {
    document.getElementById("feed").innerHTML = `<p class="mono" style="color:var(--ink-faint)">Could not load the feed. ${esc(String(e))}</p>`;
  }
}
document.addEventListener("DOMContentLoaded", boot);
