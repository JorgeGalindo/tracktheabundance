/* ============================================================
   Track the Abundance — interactive map (home)
   Two modes: FLOW (money into Europe) · MAP (geographic)
   Vanilla SVG, no dependencies.
   ============================================================ */
const SVGNS = "http://www.w3.org/2000/svg";
const W = 1280, H = 720;

const state = {
  mode: "flow",
  data: null,
  domainColors: {},
  nodesById: {},
  selected: null,
  hidden: new Set(),      // hidden domains
  tf: { x: 0, y: 0, k: 1 } // pan/zoom transform
};

const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const log10 = (x) => Math.log(x) / Math.LN10;

/* ---------- load ---------- */
async function boot() {
  const res = await fetch("./data/graph.json?v=" + Date.now());
  const data = await res.json();
  state.data = data;
  state.domainColors = Object.fromEntries(Object.entries(data.domains).map(([k, v]) => [k, v.color]));
  data.nodes.forEach(n => (state.nodesById[n.id] = n));
  buildLegend();
  wireControls();
  if (location.hash === "#geo" || location.hash === "#map") {
    state.mode = "map";
    document.querySelectorAll(".toggle button").forEach(b => b.classList.toggle("on", b.dataset.mode === "map"));
    const sub = document.getElementById("viz-sub");
    if (sub) sub.textContent = "Geography · US capital (left) flowing into European grantees & EU policy arenas";
  }
  layout();
  render();
}

/* ---------- sizing ---------- */
function nodeRadius(n) {
  const base = { source: 16, engine: 18, fund: 14, infra: 12, grantee: 10, target: 11 }[n.kind] || 11;
  let bump = 0;
  if (n.magnitude) bump = clamp(2.4 * log10(n.magnitude / 1e6 + 1), 0, 6);
  return base + bump;
}
function edgeWidth(e) {
  if (!e.value) return e.kind === "watch" ? 1.1 : 1.5;
  return clamp(1 + 1.7 * log10(e.value / 1e6 + 1), 1.4, 9);
}
function edgeColor(e) {
  const t = state.nodesById[e.target];
  const s = state.nodesById[e.source];
  if (e.kind === "interlock") return "#b98ce0";
  if (e.kind === "watch") return "#6a7085";
  if (e.kind === "influence") return "#4d8bf0";
  const dom = (t && t.domain) || (s && s.domain);
  return state.domainColors[dom] || "#3a4256";
}

/* ---------- layout ---------- */
function layout() {
  return state.mode === "flow" ? layoutFlow() : layoutMap();
}

const FLOW_BANDS = [
  { kinds: ["source"],  x: 112 },
  { kinds: ["engine"],  x: 300 },
  { kinds: ["fund"],    x: 496 },
  { kinds: ["infra"],   x: 648 },
  { kinds: ["grantee"], x: 872, right: true }, // dense column: labels go to the right
  { kinds: ["target"],  x: 1188 }
];
function layoutFlow() {
  const top = 92, gap = 16;
  let maxH = 0;
  const columns = FLOW_BANDS.map(b => {
    const list = state.data.nodes
      .filter(n => b.kinds.includes(n.kind))
      .sort((a, c) => a.domain.localeCompare(c.domain) || (c.magnitude || 0) - (a.magnitude || 0));
    let cursor = 0;
    const placed = list.map(n => {
      const r = nodeRadius(n);
      const showMag = !b.right && (n.kind === "source" || n.kind === "engine" || n.kind === "fund") && n.magnitudeLabel;
      const labelH = b.right ? 0 : 15 + (showMag ? 13 : 0); // vertical room for label(s) below
      const foot = 2 * r + labelH;
      const cy = cursor + r;
      cursor += foot + gap;
      return { n, cy };
    });
    const h = Math.max(0, cursor - gap);
    maxH = Math.max(maxH, h);
    return { b, placed, h };
  });
  state.contentH = Math.round(top + maxH + 58);
  columns.forEach(col => {
    const offset = top + (maxH - col.h) / 2;
    col.placed.forEach(p => {
      p.n._x = col.b.x;
      p.n._y = offset + p.cy;
      p.n._labelRight = !!col.b.right;
    });
  });
}

function projectEU(lon, lat) {
  const lonMin = -11, lonMax = 16, latMin = 39.5, latMax = 59;
  const px = (lon - lonMin) / (lonMax - lonMin);
  const py = (latMax - lat) / (latMax - latMin);
  return { x: 348 + px * (1198 - 348), y: 92 + py * (662 - 92) };
}
function layoutMap() {
  state.contentH = 752;
  state.data.nodes.forEach(n => (n._labelRight = false));
  // US / capital nodes stack in a left "Atlantic" gutter
  const usNodes = state.data.nodes.filter(n => n.region === "us");
  const order = { source: 0, engine: 1, fund: 2, infra: 3 };
  usNodes.sort((a, b) => (order[a.kind] - order[b.kind]) || a.domain.localeCompare(b.domain));
  const gTop = 96, gBot = 668, gx = 158;
  usNodes.forEach((n, i) => {
    n._x = gx + (i % 2 ? 34 : -34);
    n._y = gTop + (gBot - gTop) * (i / (usNodes.length - 1));
  });
  // European nodes by projection
  const eu = state.data.nodes.filter(n => n.region === "europe");
  eu.forEach(n => { const p = projectEU(n.lon, n.lat); n._x = p.x; n._y = p.y; });
  // de-overlap dense clusters (London, Brussels): min distance leaves room for labels
  for (let pass = 0; pass < 120; pass++) {
    let moved = false;
    for (let i = 0; i < eu.length; i++) for (let j = i + 1; j < eu.length; j++) {
      const a = eu[i], b = eu[j];
      let dx = b._x - a._x, dy = b._y - a._y;
      let d = Math.hypot(dx, dy) || 0.01;
      const min = nodeRadius(a) + nodeRadius(b) + 46;
      if (d < min) {
        const push = (min - d) / 2;
        dx /= d; dy /= d;
        a._x -= dx * push; a._y -= dy * push;
        b._x += dx * push; b._y += dy * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  eu.forEach(n => { n._x = clamp(n._x, 296, 1236); n._y = clamp(n._y, 84, 700); });
}

/* ---------- render ---------- */
function render() {
  const svg = document.getElementById("viz-svg");
  svg.innerHTML = "";
  const CH = state.contentH || H;
  // Explicit width/height attributes give the SVG an intrinsic aspect ratio —
  // without them Safari can render the board at height 0 (blank map).
  svg.setAttribute("viewBox", `0 0 ${W} ${CH}`);
  svg.setAttribute("width", W);
  svg.setAttribute("height", CH);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const stage = el("g", { id: "stage" }, svg);
  applyTransform();

  const gBack = el("g", { class: "backlayer" }, stage);
  const gEdges = el("g", { class: "edgelayer" }, stage);
  const gNodes = el("g", { class: "nodelayer" }, stage);

  if (state.mode === "map") drawMapBackdrop(gBack);
  else drawFlowBackdrop(gBack);

  // edges
  state.data.edgeEls = {};
  state.data.links.forEach((e, idx) => {
    const s = state.nodesById[e.source], t = state.nodesById[e.target];
    if (!s || !t) return;
    if (isHidden(s) || isHidden(t)) return;
    const path = el("path", {
      class: "edge" + (e.kind === "watch" ? " watch" : "") + (state.mode === "flow" && e.kind !== "watch" ? " edge-flow" : ""),
      d: edgePath(s, t),
      stroke: edgeColor(e),
      "stroke-width": edgeWidth(e),
      "stroke-opacity": e.kind === "watch" ? 0.5 : 0.4
    }, gEdges);
    e._el = path; e._s = s; e._t = t;
  });

  // nodes
  state.data.nodes.forEach(n => {
    if (isHidden(n)) return;
    const g = el("g", { class: "node", "data-id": n.id, transform: `translate(${n._x},${n._y})` }, gNodes);
    const r = nodeRadius(n);
    const col = state.domainColors[n.domain];
    el("circle", { class: "halo", r: r + 9, fill: "none", stroke: col, "stroke-width": 2, "stroke-opacity": 0.5 }, g);
    // pulse for europe beachheads & targets
    if (n.region === "europe") {
      const p = el("circle", { class: "pulse", r: 4, fill: "none", stroke: col, "stroke-width": 1.5 }, g);
      p.style.animationDelay = (Math.abs(hashStr(n.id)) % 2400) + "ms";
    }
    const fill = n.kind === "target" ? "none" : col;
    const dot = el("circle", {
      class: "dot", r,
      fill: fill, "fill-opacity": n.kind === "grantee" ? 0.9 : (n.kind === "source" || n.kind === "engine" ? 1 : 0.85),
      stroke: col, "stroke-width": n.kind === "target" ? 2.5 : 1.5,
      "stroke-dasharray": n.kind === "target" ? "3 3" : (n.adjacent ? "2 3" : "none")
    }, g);
    if (n.kind === "source" || n.kind === "engine") dot.setAttribute("stroke", "#fff"), dot.setAttribute("stroke-opacity", "0.25");

    // labels
    if (n._labelRight) {
      const lbl = el("text", { class: "lbl", x: r + 8, y: 0, "text-anchor": "start", "dominant-baseline": "middle" }, g);
      lbl.textContent = n.label;
    } else {
      const showMag = (n.kind === "source" || n.kind === "engine" || n.kind === "fund");
      const ly = r + 14;
      const lbl = el("text", { class: "lbl", x: 0, y: ly, "text-anchor": "middle" }, g);
      lbl.textContent = n.label;
      if (state.mode === "flow" && showMag && n.magnitudeLabel) {
        const m = el("text", { class: "mag", x: 0, y: ly + 13, "text-anchor": "middle" }, g);
        m.textContent = n.magnitudeLabel;
      }
    }
    g.addEventListener("click", (ev) => { ev.stopPropagation(); selectNode(n.id); });
    g.addEventListener("mouseenter", () => { if (!state.selected) highlight(n.id, true); });
    g.addEventListener("mouseleave", () => { if (!state.selected) clearHighlight(); });
    n._g = g;
  });

  svg.addEventListener("click", () => { closeDetail(); });
  if (state.selected) selectNode(state.selected, true);
}

function hashStr(s){let h=0;for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i)|0;}return h;}

function edgePath(s, t) {
  if (state.mode === "flow") {
    const mx = (s._x + t._x) / 2;
    return `M ${s._x} ${s._y} C ${mx} ${s._y}, ${mx} ${t._y}, ${t._x} ${t._y}`;
  }
  const mx = (s._x + t._x) / 2, my = (s._y + t._y) / 2;
  const dx = t._x - s._x, dy = t._y - s._y;
  const nx = -dy, ny = dx, len = Math.hypot(nx, ny) || 1;
  const bow = clamp(len * 0.12, 8, 60);
  const cx = mx + (nx / len) * bow, cy = my + (ny / len) * bow;
  return `M ${s._x} ${s._y} Q ${cx} ${cy} ${t._x} ${t._y}`;
}

/* ---------- backdrops ---------- */
function drawFlowBackdrop(g) {
  const CH = state.contentH || H;
  const caps = [
    { x: 112, t: "US capital" }, { x: 300, t: "Engine" }, { x: 496, t: "Funds" },
    { x: 648, t: "US network" }, { x: 872, t: "European grantees" }, { x: 1188, t: "EU policy" }
  ];
  caps.forEach(c => {
    const t = el("text", { class: "col-cap", x: c.x, y: 46, "text-anchor": "middle" }, g);
    t.textContent = c.t;
  });
  // "entering Europe" divider between the US network and the European beachheads
  const dx = 762;
  el("line", { class: "col-rule", x1: dx, y1: 62, x2: dx, y2: CH - 34 }, g);
  const cap = el("text", { class: "atlantic-label", x: dx, y: CH - 14, "text-anchor": "middle" }, g);
  cap.textContent = "▶  ENTERING EUROPE";
}

const GEO = [
  { t: "IRELAND", lon: -8, lat: 53.3 }, { t: "UK", lon: -1.8, lat: 53.2 },
  { t: "FRANCE", lon: 2.2, lat: 47 }, { t: "SPAIN", lon: -3.7, lat: 40.2 },
  { t: "BELGIUM", lon: 4.6, lat: 51.3 }, { t: "GERMANY", lon: 10.4, lat: 51.4 },
  { t: "SWITZ.", lon: 8.2, lat: 46.6 }
];
function drawMapBackdrop(g) {
  // atlantic gutter caption
  const a = el("text", { class: "atlantic-label", x: 132, y: 60, "text-anchor": "middle" }, g);
  a.textContent = "◀ US CAPITAL";
  const sep = el("line", { class: "col-rule", x1: 250, y1: 74, x2: 250, y2: 684 }, g);
  // faint country anchor labels
  GEO.forEach(c => {
    const p = projectEU(c.lon, c.lat);
    const t = el("text", { class: "geo-label", x: p.x, y: p.y, "text-anchor": "middle" }, g);
    t.textContent = c.t;
  });
  const eu = el("text", { class: "geo-label", x: 1100, y: 700, "text-anchor": "end" }, g);
  eu.textContent = "GEOGRAPHIC · EUROPEAN GRANTEES & POLICY ARENAS";
}

/* ---------- selection / highlight ---------- */
function neighbors(id) {
  const near = new Set([id]); const edges = new Set();
  state.data.links.forEach((e, i) => {
    if (e.source === id || e.target === id) { near.add(e.source); near.add(e.target); edges.add(i); }
  });
  return { near, edges };
}
function highlight(id) {
  const { near, edges } = neighbors(id);
  state.data.nodes.forEach(n => { if (n._g) n._g.classList.toggle("dim", !near.has(n.id)); });
  document.querySelectorAll(".node").forEach(g => {
    const gid = g.getAttribute("data-id");
    g.classList.toggle("hot", gid === id);
  });
  state.data.links.forEach((e, i) => { if (e._el) e._el.classList.toggle("dim", !edges.has(i)); });
}
function clearHighlight() {
  state.data.nodes.forEach(n => n._g && n._g.classList.remove("dim", "hot"));
  state.data.links.forEach(e => e._el && e._el.classList.remove("dim"));
}
function selectNode(id, keep) {
  state.selected = id;
  highlight(id);
  // bring selected group to front
  const n = state.nodesById[id];
  if (n && n._g) n._g.parentNode.appendChild(n._g);
  openDetail(n);
}

/* ---------- detail panel ---------- */
function openDetail(n) {
  const box = document.getElementById("detail");
  const kindLabel = state.data.kinds[n.kind] || n.kind;
  const dom = state.data.domains[n.domain];
  const geo = n.region === "europe" && n.city ? `<div class="geo">◎ ${n.city}${n.country ? ", " + n.country : ""}</div>` : "";
  const mag = n.magnitudeLabel ? `<div class="mag-badge">${n.magnitudeLabel}</div>` : "";
  const chips = (n.tags || []).map(t => `<span class="chip">${t}</span>`).join("");
  box.innerHTML = `
    <button class="close" aria-label="close">×</button>
    <div class="tag-kind" style="color:${dom.color}">● ${kindLabel} · ${dom.label}</div>
    <h3>${n.label}</h3>
    ${n.people ? `<div class="who">${n.people}</div>` : ""}
    ${geo}${mag}
    <p class="blurb">${n.blurb}</p>
    <div class="chips">${chips}</div>`;
  box.classList.add("show");
  box.querySelector(".close").addEventListener("click", (e) => { e.stopPropagation(); closeDetail(); });
}
function closeDetail() {
  state.selected = null;
  clearHighlight();
  document.getElementById("detail").classList.remove("show");
}

/* ---------- legend / domain filter ---------- */
function isHidden(n) { return state.hidden.has(n.domain); }
function buildLegend() {
  const wrap = document.getElementById("legend");
  wrap.innerHTML = "";
  Object.entries(state.data.domains).forEach(([k, v]) => {
    const b = document.createElement("span");
    b.className = "lg"; b.dataset.dom = k;
    b.innerHTML = `<span class="sw" style="background:${v.color}"></span>${v.label}`;
    b.addEventListener("click", () => {
      if (state.hidden.has(k)) state.hidden.delete(k); else state.hidden.add(k);
      b.classList.toggle("off");
      closeDetail(); render();
    });
    wrap.appendChild(b);
  });
  const hint = document.createElement("span");
  hint.className = "hint"; hint.textContent = "click a node · scroll to zoom · drag to pan";
  wrap.appendChild(hint);
}

/* ---------- controls: mode, pan/zoom ---------- */
function wireControls() {
  document.querySelectorAll(".toggle button").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".toggle button").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      state.mode = btn.dataset.mode;
      state.tf = { x: 0, y: 0, k: 1 };
      const sub = document.getElementById("viz-sub");
      if (sub) sub.textContent = state.mode === "flow"
        ? "Money flow · US capital → engine → funds → European grantees → EU policy"
        : "Geography · US capital (left) flowing into European grantees & EU policy arenas";
      closeDetail(); layout(); render();
    });
  });
  const svg = document.getElementById("viz-svg");
  let drag = null;
  svg.addEventListener("mousedown", (e) => { drag = { x: e.clientX, y: e.clientY, ox: state.tf.x, oy: state.tf.y }; svg.classList.add("grabbing"); });
  window.addEventListener("mouseup", () => { drag = null; svg.classList.remove("grabbing"); });
  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const rect = svg.getBoundingClientRect();
    const scale = W / rect.width;
    state.tf.x = drag.ox + (e.clientX - drag.x) * scale;
    state.tf.y = drag.oy + (e.clientY - drag.y) * scale;
    applyTransform();
  });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = svg.getBoundingClientRect();
    const scale = W / rect.width;
    const mx = (e.clientX - rect.left) * scale, my = (e.clientY - rect.top) * scale;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nk = clamp(state.tf.k * factor, 0.55, 3.5);
    const f = nk / state.tf.k;
    state.tf.x = mx - (mx - state.tf.x) * f;
    state.tf.y = my - (my - state.tf.y) * f;
    state.tf.k = nk;
    applyTransform();
  }, { passive: false });
  // touch (basic single-finger pan)
  let tdrag = null;
  svg.addEventListener("touchstart", (e) => { if (e.touches.length === 1) { const t = e.touches[0]; tdrag = { x: t.clientX, y: t.clientY, ox: state.tf.x, oy: state.tf.y }; } }, { passive: true });
  svg.addEventListener("touchmove", (e) => {
    if (!tdrag || e.touches.length !== 1) return;
    const t = e.touches[0]; const rect = svg.getBoundingClientRect(); const scale = W / rect.width;
    state.tf.x = tdrag.ox + (t.clientX - tdrag.x) * scale;
    state.tf.y = tdrag.oy + (t.clientY - tdrag.y) * scale;
    applyTransform();
  }, { passive: true });
  window.addEventListener("touchend", () => { tdrag = null; });
  const rz = document.getElementById("reset-view");
  if (rz) rz.addEventListener("click", () => { state.tf = { x: 0, y: 0, k: 1 }; applyTransform(); });
}
function applyTransform() {
  const st = document.getElementById("stage");
  if (st) st.setAttribute("transform", `translate(${state.tf.x},${state.tf.y}) scale(${state.tf.k})`);
}

document.addEventListener("DOMContentLoaded", boot);
