// PG Stat Tracker — screens and behavior.
import {
  auth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail,
  setErrorHandler, newId, put, merge, remove, putMany, watch,
} from "./firebase.js";
import {
  ZONES, ZM, W, H, BX, BY, R3, classify, shotTypes, TURNOVERS, SIMPLE, CATS, SEED_SCHEDULE,
  ptsOf, pfOf, playText, statsFromPlays, boxCells, seasonSnapshot,
  fmtLong, fmtShort, timeLabel, to24, to12, todayStr,
} from "./data.js";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const S = {
  user: null, profile: null, settings: {}, games: [], plays: [],
  loaded: { games: false, plays: false, profile: false, settings: false },
  pending: {}, seeded: false, routed: false, unsubs: [],
};
let sel = null;          // highlighted court zone
let seq = 0;
const stamp = () => Date.now() * 100 + (seq++ % 100);
const clean = (o) => JSON.parse(JSON.stringify(o));

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function btn(cls, html, fn) { const b = el("button", cls, html); b.type = "button"; b.onclick = fn; return b; }
function cur(b, on) { if (on) b.classList.add("cur"); return b; }
function armed(b, firstText, fn) {
  b.onclick = () => { if (!b.classList.contains("arm")) { b.classList.add("arm"); b.textContent = firstText; return; } fn(); };
  return b;
}

let toastTimer;
function toast(msg, withUndo) {
  $("tx").textContent = msg; $("t-undo").hidden = !withUndo; $("toast").hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => ($("toast").hidden = true), 3200);
}
$("t-undo").onclick = () => { $("toast").hidden = true; undo(); };

setErrorHandler((e) => {
  const msg = e && e.code === "permission-denied"
    ? "Not allowed to save. Check that you're signed in with the right account."
    : "Couldn't save: " + (e && e.message ? e.message : "unknown error");
  toast(msg, false);
});

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------
const VIEWS = ["v-loading", "v-login", "v-home", "v-live"];
let view = "v-loading";
function show(v) {
  view = v;
  VIEWS.forEach((id) => ($(id).hidden = id !== v));
  window.scrollTo(0, 0);
  if (v === "v-live") { requestAnimationFrame(draw); keepAwake(true); } else keepAwake(false);
  render();
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
$("v-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const go = $("li-go"); go.disabled = true; $("li-err").textContent = "";
  try {
    await signInWithEmailAndPassword(auth, $("li-email").value.trim(), $("li-pass").value);
  } catch (err) {
    const c = err.code || "";
    $("li-err").textContent =
      c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") ? "Email or password is wrong."
      : c.includes("network") ? "No internet connection. Signing in the first time needs a signal."
      : c.includes("too-many-requests") ? "Too many tries. Wait a few minutes and try again."
      : "Couldn't sign in: " + (err.message || c);
  } finally { go.disabled = false; }
});
$("li-forgot").onclick = async () => {
  const email = $("li-email").value.trim();
  if (!email) { $("li-err").textContent = "Type your email above first, then tap Forgot password."; return; }
  try { await sendPasswordResetEmail(auth, email); $("li-err").textContent = "Password reset email sent. Check your inbox."; }
  catch (err) { $("li-err").textContent = "Couldn't send the reset email: " + (err.message || err.code); }
};

onAuthStateChanged(auth, (user) => {
  S.unsubs.forEach((u) => u()); S.unsubs = [];
  S.user = user;
  if (!user) { S.routed = false; show("v-login"); return; }
  show("v-loading");
  startListening();
});

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
function startListening() {
  Object.keys(S.loaded).forEach((k) => (S.loaded[k] = false));
  S.unsubs.push(watch("games", (rows, pend, fromCache) => {
    S.games = rows; S.pending.games = pend; S.loaded.games = true;
    if (!fromCache && rows.length === 0 && !S.seeded) seedSchedule();
    afterData();
  }));
  S.unsubs.push(watch("plays", (rows, pend) => { S.plays = rows; S.pending.plays = pend; S.loaded.plays = true; afterData(); }));
  S.unsubs.push(watch("profile", (rows, pend, fromCache) => {
    S.profile = rows.find((r) => r.id === "main") || null; S.pending.profile = pend; S.loaded.profile = true;
    if (!S.profile && !fromCache) {
      S.profile = { name: "Mark Ward Jr.", number: "", position: "Point Guard", photo: "" };
      merge("profile", "main", S.profile);
    }
    afterData();
  }));
  S.unsubs.push(watch("settings", (rows, pend) => {
    S.settings = rows.find((r) => r.id === "main") || {}; S.pending.settings = pend; S.loaded.settings = true; afterData();
  }));
}

function seedSchedule() {
  S.seeded = true;
  const rows = SEED_SCHEDULE.map(([date, time, ha, opp, type, fac], i) => [
    `g-${date}-${i}`, { date, time, ha, opp, type, fac, cancelled: false, status: "scheduled", partial: false, sb: false },
  ]);
  putMany("games", rows);
}

function afterData() {
  if (!S.loaded.games || !S.loaded.plays) return;
  if (!S.routed) {
    S.routed = true;
    show(liveGame() ? "v-live" : "v-home");
    return;
  }
  render();
}

window.addEventListener("online", render);
window.addEventListener("offline", render);

// Derived data
const byDate = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);
const liveGame = () => S.games.find((g) => g.status === "live") || null;
const gamePlays = (gid) => S.plays.filter((p) => p.gameId === gid).sort((a, b) => a.ts - b.ts);
const statPlays = (gid) => gamePlays(gid).filter((p) => p.type !== "period");
const livePlays = () => { const g = liveGame(); return g ? gamePlays(g.id) : []; };
const periodN = () => livePlays().filter((p) => p.type === "period").length + 1;
const periodL = () => { const n = periodN(); return n <= 4 ? "Q" + n : "OT" + (n - 4); };
const upcoming = () => S.games.filter((g) => !g.cancelled && g.status === "scheduled" && g.date >= todayStr()).sort(byDate);
const doneGames = () => S.games.filter((g) => g.status === "done").sort((a, b) => byDate(b, a));
const gameStats = (g) => (g.sb ? { ...g.sbStats, defl: null } : statsFromPlays(statPlays(g.id), g.trk));

// Writes (update the screen right away, Firebase syncs in the background)
function savePlay(p) { S.plays.push(p); const { id, ...d } = p; put("plays", id, clean(d)); render(); }
function updPlay(p, changes) { Object.assign(p, changes); const { id, ...d } = p; put("plays", id, clean(d)); render(); }
function delPlay(p) { S.plays = S.plays.filter((x) => x.id !== p.id); remove("plays", p.id); render(); }
function saveGame(g) {
  const i = S.games.findIndex((x) => x.id === g.id);
  if (i >= 0) S.games[i] = g; else S.games.push(g);
  const { id, ...d } = g; put("games", id, clean(d)); render();
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function render() {
  if (view === "v-home") renderHome();
  if (view === "v-live") renderLive();
}

function syncBadge() {
  const b = $("h-sync"), pend = Object.values(S.pending).some(Boolean);
  b.textContent = pend ? "Saved on phone" : navigator.onLine ? "Synced" : "Offline";
  b.classList.toggle("pend", pend || !navigator.onLine);
}

function avatarHTML(p) {
  if (p && p.photo) return `<img src="${esc(p.photo)}" alt="">`;
  return "#" + esc((p && p.number) || "—");
}

function renderHome() {
  const p = S.profile || {};
  $("h-av").innerHTML = avatarHTML(p);
  $("h-name").textContent = p.name || "Player";
  $("h-sub").textContent = [p.position || "Point Guard", "David Brearley", "2026–27"].join(" · ");
  syncBadge();

  // Next game card
  const live = liveGame(), up = upcoming(), next = live || up[0];
  const startB = $("ng-start");
  if (next) {
    if (live) $("ng-when").textContent = "Game in progress";
    else {
      const days = Math.round((new Date(next.date + "T00:00") - new Date(todayStr() + "T00:00")) / 864e5);
      $("ng-when").textContent = "Next game · " + (days <= 0 ? "Today" : days === 1 ? "Tomorrow" : `in ${days} days`);
    }
    $("ng-opp").textContent = next.opp;
    $("ng-meta").textContent = `${fmtLong(next.date)} · ${timeLabel(next.time)} · ${next.ha === "H" ? "Home" : "Away"}${next.fac ? " · " + next.fac : ""}`;
    $("ng-type").textContent = next.type === "Scrimmage" ? "Scrimmage · not counted in season averages" : next.type;
    startB.textContent = live ? "Resume Game" : "Start Game";
    startB.onclick = () => (live ? show("v-live") : startGame(next));
  } else {
    $("ng-when").textContent = "Next game";
    $("ng-opp").textContent = "No upcoming games";
    $("ng-meta").textContent = "Add one from the schedule.";
    $("ng-type").textContent = "";
    startB.textContent = "Open schedule";
    startB.onclick = openSchedule;
  }

  const rest = up.filter((g) => g !== next).slice(0, 2), upEl = $("h-up");
  upEl.innerHTML = "";
  if (!rest.length) upEl.append(el("div", "row", `<div class="o" style="grid-column:1/-1;color:var(--muted);font-weight:400">Nothing else scheduled.</div>`));
  rest.forEach((g) => {
    const r = el("div", "row");
    r.append(el("div", "d", fmtShort(g.date)), el("div", "o", esc(g.opp)), el("div", "m", `${timeLabel(g.time)} · ${g.ha === "H" ? "Home" : "Away"} · ${g.type}`));
    upEl.append(r);
  });
  $("h-sched").textContent = `Full schedule (${S.games.length}) →`;

  // Season snapshot
  const counted = doneGames().filter((g) => g.type !== "Scrimmage" || S.settings.includeScrim);
  const snap = seasonSnapshot(counted.map(gameStats));
  $("h-snapnote").textContent = counted.length ? `${counted.length} game${counted.length > 1 ? "s" : ""}` : "";
  $("h-snap").innerHTML = [["PPG", snap.ppg], ["APG", snap.apg], ["3PT%", snap.tp], ["AST/TO", snap.ato]]
    .map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join("");

  // Recent activity
  const done = doneGames(), act = $("h-act");
  let html = "";
  if (done.length >= 2) {
    const withPts = done.map((g) => [g, gameStats(g).pts]).filter(([, v]) => v != null);
    if (withPts.length) {
      const [hg, hv] = withPts.reduce((a, b) => (b[1] > a[1] ? b : a));
      if (hv > 0) html += `<div>Career high: ${hv} points<small>${fmtShort(hg.date)} · ${esc(hg.opp)}</small></div>`;
    }
  }
  done.slice(0, 3).forEach((g) => {
    const s = gameStats(g);
    const bits = [s.pts != null && s.pts + " pts", s.ast != null && s.ast + " ast", s.to != null && s.to + " to"].filter(Boolean).join(" · ");
    html += `<div>${esc(g.opp)}${bits ? " · " + bits : ""}<small>${fmtShort(g.date)} · ${g.partial ? "⚠ Partial Stats" : "Complete"}${g.sb ? " · scorebook" : ""}</small></div>`;
  });
  if (!html) html = `<div class="none">Nothing yet.${up[0] ? ` The first game is ${fmtShort(up[0].date)} ${esc(up[0].opp)}.` : ""}</div>`;
  act.innerHTML = html;
}

function renderLive() {
  const g = liveGame();
  if (!g) { show("v-home"); return; }
  const lp = livePlays().filter((p) => p.type !== "period");
  $("l-per").textContent = periodL();
  $("l-pts").textContent = lp.reduce((s, p) => s + ptsOf(p), 0);
  const pf = lp.reduce((s, p) => s + pfOf(p), 0);
  $("l-pf").textContent = pf; $("l-pfw").classList.toggle("hot", pf >= 4);
  $("l-log").textContent = `Game log (${lp.length})`;
  $("l-note").textContent = `${g.opp} · tap where he shot (● make ✕ miss)`;
  draw();
}

// ---------------------------------------------------------------------------
// Court
// ---------------------------------------------------------------------------
const cv = $("court");
function draw() {
  if (view !== "v-live") return;
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (!w || !h) return;
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d"), sx = w / W, sy = h / H;
  const px = (x) => (x * sx) / dpr, py = (y) => (y * sy) / dpr;
  const css = getComputedStyle(document.documentElement), v = (n) => css.getPropertyValue(n).trim();
  const tint = { lay: [v("--z-lay-a"), v("--z-lay-b")], mid: [v("--z-mid-a"), v("--z-mid-b")], three: [v("--z3-a"), v("--z3-b")] };
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  const st = 1.5, acc = {};
  for (let y = 0; y < H; y += st) for (let x = 0; x < W; x += st) {
    const id = classify(x + st / 2, y + st / 2), z = ZM[id];
    ctx.fillStyle = tint[z.c][z.alt]; ctx.fillRect(x, y, st + 0.06, st + 0.06);
    if (id === sel) { ctx.globalAlpha = 0.55; ctx.fillStyle = v("--zsel"); ctx.fillRect(x, y, st + 0.06, st + 0.06); ctx.globalAlpha = 1; }
    const a = acc[id] || (acc[id] = { x: 0, y: 0, n: 0 }); a.x += x; a.y += y; a.n++;
  }
  ctx.strokeStyle = v("--cline"); ctx.lineWidth = 1.3;
  ctx.strokeRect(0.7, 0.7, W - 1.4, H - 1.4); ctx.strokeRect(114, 0, 72, 114);
  ctx.beginPath(); ctx.arc(150, 114, 36, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(BX - R3, 0); ctx.lineTo(BX - R3, BY); ctx.arc(BX, BY, R3, Math.PI, 0, true); ctx.lineTo(BX + R3, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(132, 22); ctx.lineTo(168, 22); ctx.lineWidth = 2; ctx.stroke();
  ctx.beginPath(); ctx.lineWidth = 1.3; ctx.arc(BX, BY, 5, 0, Math.PI * 2); ctx.stroke();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = v("--zlabel"); ctx.font = '700 11px "Source Sans 3",-apple-system,Arial,sans-serif';
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const nudge = { PA: [0, 12], LC: [0, -4], RC: [0, -4], LB: [0, -6], RB: [0, -6] };
  for (const id in acc) { const a = acc[id], nd = nudge[id] || [0, 0]; ctx.fillText(ZM[id].s, px(a.x / a.n + nd[0]), py(a.y / a.n + nd[1])); }
  livePlays().filter((p) => p.type === "shot" && p.x != null).forEach((p) => {
    const x = px(p.x), y = py(p.y);
    if (p.f.res === "make") {
      ctx.fillStyle = v("--make"); ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = v("--surface"); ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.strokeStyle = v("--miss"); ctx.lineWidth = 2.5; ctx.beginPath();
      ctx.moveTo(x - 4.5, y - 4.5); ctx.lineTo(x + 4.5, y + 4.5); ctx.moveTo(x + 4.5, y - 4.5); ctx.lineTo(x - 4.5, y + 4.5); ctx.stroke();
    }
  });
}
new ResizeObserver(draw).observe(cv);
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw); } catch { /* older Safari */ }

cv.addEventListener("click", (e) => {
  const r = cv.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
  const z = ZM[classify(x, y)];
  sel = z.id; draw();
  const open = (pre) => shotSheet(pre, (f) => {
    const shot = mk("shot", f, { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 });
    if (f.fo) ftPrompt(f.res === "make" ? 1 : ZM[f.zone].p, shot, () => open(f));
    else { closeSheet(); add([shot], playText(shot)); }
  }, null, `${ZM[pre.zone].p}-pointer · ${periodL()}`);
  open({ zone: z.id });
});

// ---------------------------------------------------------------------------
// Logging plays
// ---------------------------------------------------------------------------
const mk = (type, f, extra = {}) => ({ type, f, q: periodL(), ...extra });
function add(list, msg) {
  const g = liveGame(); if (!g) return;
  const grp = stamp();
  list.forEach((p) => savePlay({ ...p, id: newId("plays"), gameId: g.id, ts: stamp(), g: grp }));
  if (msg) toast(msg, true);
}
function undo() {
  const lp = livePlays();
  if (!lp.length) { toast("Nothing to undo", false); return; }
  const last = lp[lp.length - 1], grp = lp.filter((p) => p.g === last.g);
  grp.forEach(delPlay);
  toast("Undone: " + (last.type === "period" ? "period change" : playText(grp[0])), false);
}
$("l-undo").onclick = undo;
$("l-nextq").onclick = () => {
  const from = periodL();
  add([{ type: "period", f: {}, q: from }]);
  toast(`${from} ended · now ${periodL()}`, true);
};

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------
function openSheet(title, sub, build, { back = null, backLabel = null } = {}) {
  const s = $("sin"); s.innerHTML = "";
  s.append(btn("backb", "← " + esc(backLabel || (back ? "Back" : "Back to game")), () => (back ? back() : closeSheet(true))));
  s.append(el("div", "sh", `<h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ""}`));
  build(s);
  $("sheet").hidden = false; $("sheet").scrollTop = 0; $("toast").hidden = true;
}
function closeSheet(cancelled) {
  $("sheet").hidden = true; sel = null; draw();
  if (cancelled) toast("Cancelled · nothing logged", false);
}
const home = () => { closeSheet(false); show("v-home"); };

function chips(defs, st, cls = "") {
  const w = el("div", "chips");
  defs.forEach((d) => {
    const c = btn("chip " + cls, esc(d.label), () => {
      const on = !st[d.id];
      if (d.ex && on) defs.filter((o) => o.ex === d.ex).forEach((o) => { st[o.id] = false; w.querySelector(`[data-id="${o.id}"]`).setAttribute("aria-pressed", "false"); });
      st[d.id] = on; c.setAttribute("aria-pressed", on);
    });
    c.dataset.id = d.id; c.setAttribute("aria-pressed", !!st[d.id]); w.append(c);
  });
  return w;
}
const optLabel = () => el("div", "opt", "Optional details");
const editHelp = (edit) => (edit ? el("p", "help", "Change anything, then tap the result to save. The current result is outlined.") : null);
function deleteBtn(s, edit) {
  if (!edit) return;
  s.append(armed(btn("ghost danger", "Delete this play"), "Tap again to delete", edit.del));
}
const sheetOpts = (edit) => (edit ? { back: edit.close, backLabel: "Back" } : {});

// ---------------------------------------------------------------------------
// Entry flows (also used for editing)
// ---------------------------------------------------------------------------
function shotSheet(pre, save, edit, sub) {
  const st = { zone: pre.zone, fb: !!pre.fb, t0: pre.st === 0, t1: pre.st === 1, as: !!pre.as, fo: !!pre.fo, res: pre.res };
  function paint() {
    const z = ZM[st.zone], ty = shotTypes(z);
    openSheet(edit ? "Edit shot" : z.name, sub, (s) => {
      if (edit) {
        s.append(el("div", "opt", "Zone"));
        const zw = el("div", "chips");
        ZONES.forEach((zz) => {
          const c = btn("chip sm", zz.s + (zz.p === 3 ? " 3" : ""), () => { if (ZM[st.zone].c !== zz.c) st.t0 = st.t1 = false; st.zone = zz.id; paint(); });
          c.setAttribute("aria-pressed", zz.id === st.zone); zw.append(c);
        });
        s.append(zw);
      }
      s.append(optLabel(), chips([{ id: "fb", label: "Fast Break" }, { id: "t0", label: ty[0], ex: "t" }, { id: "t1", label: ty[1], ex: "t" }, { id: "as", label: "Assisted" }, { id: "fo", label: "Fouled" }], st));
      const h = editHelp(edit); if (h) s.append(h);
      const go = (r) => save({ zone: st.zone, res: r, fb: st.fb, st: st.t0 ? 0 : st.t1 ? 1 : null, as: st.as, fo: st.fo });
      const bg = el("div", "bigs two");
      bg.append(cur(btn("big mk", "MAKE", () => go("make")), edit && st.res === "make"), cur(btn("big ms", "MISS", () => go("miss")), edit && st.res === "miss"));
      bg.append(cur(btn("big sm nt full", "Air ball", () => go("air")), edit && st.res === "air"));
      s.append(bg); deleteBtn(s, edit);
    }, sheetOpts(edit));
  }
  paint();
}

function ftPrompt(n, shot, back) {
  const res = Array(n).fill(null), and1 = shot.f.res === "make";
  openSheet("Free throws", `${and1 ? "And-1" : "Shooting foul"} · ${n} shot${n > 1 ? "s" : ""}`, (s) => {
    for (let i = 0; i < n; i++) {
      const row = el("div", "ftrow"); row.append(el("div", "lab", `FT ${i + 1}`));
      const m = btn("big mk", "Made", () => pick(i, true, m, x)), x = btn("big ms", "Missed", () => pick(i, false, m, x));
      row.append(m, x); s.append(row);
    }
    const skip = btn("big sm nt", "Skip free throws", () => { closeSheet(); add([shot], playText(shot)); });
    skip.style.marginTop = "auto"; s.append(skip);
  }, { back, backLabel: "Back to shot" });
  function pick(i, made, m, x) {
    res[i] = made; m.setAttribute("aria-pressed", made); x.setAttribute("aria-pressed", !made);
    if (res.every((r) => r !== null)) setTimeout(() => {
      const fts = res.map((r, j) => mk("ft", { made: r, i: j + 1, n }));
      closeSheet(); add([shot, ...fts], `${playText(shot)} + FTs ${res.filter(Boolean).length}/${n}`);
    }, 250);
  }
}

function astSheet(pre, save, edit, sub) {
  const st = { hk: !!pre.hk, bp: !!pre.bp, fb: !!pre.fb };
  openSheet(edit ? "Edit assist" : "Assist", sub, (s) => {
    s.append(optLabel(), chips([{ id: "hk", label: "Hockey" }, { id: "bp", label: "Bounce Pass" }, { id: "fb", label: "Fast Break" }], st));
    const h = editHelp(edit); if (h) s.append(h);
    const go = (r) => save({ res: r, hk: st.hk, bp: st.bp, fb: st.fb });
    const bg = el("div", "bigs two");
    bg.append(cur(btn("big mk", "SCORED 2", () => go(2)), edit && pre.res === 2), cur(btn("big mk", "SCORED 3", () => go(3)), edit && pre.res === 3));
    bg.append(cur(btn("big sm nt full", "Teammate missed", () => go(0)), edit && pre.res === 0));
    s.append(bg); deleteBtn(s, edit);
  }, sheetOpts(edit));
}

function toSheet(pre, save, edit, sub) {
  const st = { forced: !!pre.forced, fb: !!pre.fb };
  openSheet(edit ? "Edit turnover" : "Turnover", sub, (s) => {
    s.append(optLabel(), chips([{ id: "forced", label: "Forced" }, { id: "fb", label: "Fast Break" }], st));
    const h = editHelp(edit); if (h) s.append(h);
    const g = el("div", "tgrid");
    TURNOVERS.forEach((k) => g.append(cur(btn("big " + (k === "Offensive Foul" ? "of" : "nt"), k, () => save({ kind: k, forced: st.forced, fb: st.fb })), edit && pre.kind === k)));
    s.append(g); deleteBtn(s, edit);
  }, sheetOpts(edit));
}

function fdSheet(pre, save, edit, sub) {
  const st = { fb: !!pre.fb };
  openSheet(edit ? "Edit foul drawn" : "Foul drawn", sub, (s) => {
    s.append(optLabel(), chips([{ id: "fb", label: "Fast Break" }], st));
    const h = editHelp(edit); if (h) s.append(h);
    const bg = el("div", "bigs");
    bg.append(cur(btn("big of", "OFF THE DRIBBLE", () => save({ how: "dribble", fb: st.fb })), edit && pre.how === "dribble"),
      cur(btn("big of", "OFF THE BALL", () => save({ how: "ball", fb: st.fb })), edit && pre.how === "ball"));
    s.append(bg); deleteBtn(s, edit);
  }, sheetOpts(edit));
}

function fcSheet(pre, save, edit, sub) {
  const st = { sh: !!pre.sh, fb: !!pre.fb };
  openSheet(edit ? "Edit foul" : "Foul committed", sub, (s) => {
    s.append(optLabel(), chips([{ id: "sh", label: "Shooting Foul" }, { id: "fb", label: "Fast Break" }], st));
    const h = editHelp(edit); if (h) s.append(h);
    const bg = el("div", "bigs");
    bg.append(cur(btn("big df", "SMART FOUL<small>Stopped an easy basket</small>", () => save({ smart: true, sh: st.sh, fb: st.fb })), edit && pre.smart === true),
      cur(btn("big ms", "NOT SMART<small>Reach, gamble, lazy</small>", () => save({ smart: false, sh: st.sh, fb: st.fb })), edit && pre.smart === false));
    s.append(bg); deleteBtn(s, edit);
  }, sheetOpts(edit));
}

function oppSheet(pre, save, edit, sub) {
  openSheet(edit ? "Edit opponent shot" : "Opponent shot", sub, (s) => {
    const h = editHelp(edit); if (h) s.append(h);
    const g = el("div", "oppg");
    g.append(el("div", ""), el("div", "colh", "Layup"), el("div", "colh", "Mid"), el("div", "colh", "Three"));
    [["Scored on", "ms", false], ["Stopped", "mk", true]].forEach(([lab, c, stop]) => {
      g.append(el("div", "lab", lab));
      ["Layup", "Mid", "Three"].forEach((k) => g.append(cur(btn("big " + c, stop ? "Stop" : "Scored", () => save({ cat: k, stop })), edit && pre.cat === k && pre.stop === stop)));
    });
    s.append(g); deleteBtn(s, edit);
  }, sheetOpts(edit));
}

const newSave = (type) => (f) => { closeSheet(); const p = mk(type, f); add([p], playText(p)); };
const FLOWS = {
  ftm: () => { const p = mk("ft", { made: true }); add([p], playText(p)); },
  ftx: () => { const p = mk("ft", { made: false }); add([p], playText(p)); },
  ast: () => astSheet({}, newSave("ast"), null, periodL()),
  to: () => toSheet({}, newSave("to"), null, periodL()),
  fd: () => fdSheet({}, newSave("fd"), null, `On the floor · ${periodL()}`),
  fc: () => fcSheet({}, newSave("fc"), null, periodL()),
  opp: () => oppSheet({}, newSave("opp"), null, `He was guarding the shooter · ${periodL()}`),
};
Object.keys(SIMPLE).forEach((k) => (FLOWS[k] = () => { const p = mk(k, {}); add([p], playText(p)); }));
document.querySelectorAll("[data-a]").forEach((b) => (b.onclick = () => FLOWS[b.dataset.a]()));

// ---------------------------------------------------------------------------
// Edit a play
// ---------------------------------------------------------------------------
function editPlay(p, back) {
  const sub = `Editing · ${p.q}`;
  const done = (msg) => { back(); toast(msg, false); };
  const edit = { close: back, del: () => { delPlay(p); done("Play deleted"); } };
  const save = (f) => { updPlay(p, { f }); done("Changes saved"); };
  switch (p.type) {
    case "shot": return shotSheet(p.f, save, edit, sub);
    case "ast": return astSheet(p.f, save, edit, sub);
    case "to": return toSheet(p.f, save, edit, sub);
    case "fd": return fdSheet(p.f, save, edit, sub);
    case "fc": return fcSheet(p.f, save, edit, sub);
    case "opp": return oppSheet(p.f, save, edit, sub);
    case "ft": return openSheet("Edit free throw", sub, (s) => {
      const bg = el("div", "bigs two");
      bg.append(cur(btn("big mk", "MADE", () => save({ ...p.f, made: true })), p.f.made), cur(btn("big ms", "MISSED", () => save({ ...p.f, made: false })), !p.f.made));
      s.append(bg); deleteBtn(s, edit);
    }, { back, backLabel: "Back" });
    default: return openSheet("Edit play", sub, (s) => {
      s.append(el("p", "help", "Tap the correct play to save."));
      const g = el("div", "tgrid");
      Object.entries(SIMPLE).forEach(([k, l]) => g.append(cur(btn("big nt", l, () => { updPlay(p, { type: k }); done("Changes saved"); }), p.type === k)));
      s.append(g); deleteBtn(s, edit);
    }, { back, backLabel: "Back" });
  }
}

function playList(s, gid, back) {
  const l = el("div", "loglist");
  const rows = statPlays(gid).slice().reverse();
  if (!rows.length) l.append(el("div", "empty", "No plays logged yet."));
  rows.forEach((p) => {
    const pts = ptsOf(p);
    const r = btn("lrow", "", () => editPlay(p, back));
    r.append(el("div", "q", esc(p.q)), el("div", "t", esc(playText(p)) + (pts ? `<span class="p">+${pts}</span>` : "")), el("span", "ed", "Edit"));
    l.append(r);
  });
  s.append(l);
}

function openLiveLog() {
  const g = liveGame(); if (!g) return;
  openSheet("Game log", `${statPlays(g.id).length} plays · tap any play to fix it`, (s) => {
    playList(s, g.id, openLiveLog);
    const d = btn("ghost", "Back to game", () => closeSheet(false)); d.style.marginTop = "auto"; s.append(d);
  }, { back: () => closeSheet(false), backLabel: "Back to game" });
}
$("l-log").onclick = openLiveLog;

// ---------------------------------------------------------------------------
// Start / end a game
// ---------------------------------------------------------------------------
function startGame(g) {
  const live = liveGame();
  if (live && live.id !== g.id) { toast("Finish the game in progress first (End game).", false); return; }
  saveGame({ ...g, status: "live" });
  closeSheet(false); show("v-live");
}

function boxEl(stats) {
  const w = el("div", "box");
  boxCells(stats).forEach(([k, v]) => w.append(el("div", "", `<b class="${v == null ? "blank" : ""}">${v == null ? "—" : v}</b><span>${k}</span>`)));
  return w;
}

function endGame() {
  const g = liveGame(); if (!g) return;
  const P = statPlays(g.id);
  const trk = Object.fromEntries(CATS.map((c) => [c[0], true]));
  openSheet("End game", `${g.opp} · ${fmtLong(g.date)}`, (s) => {
    const stl = el("div", "statusline"), bx = el("div", "");
    s.append(stl, bx, el("div", "secttl", "What did you track this game?"),
      el("p", "help", "Anything you switch to Not tracked is saved as blank, not zero, and won't affect his averages."));
    const t = el("div", "trk");
    CATS.forEach(([id, name, desc, types]) => {
      const n = P.filter((p) => types.includes(p.type)).length, r = el("div", "trow");
      r.append(el("div", "nm", `${name}<small>${desc ? desc + " · " : ""}${n} logged${n === 0 ? " (a real zero counts)" : ""}</small>`));
      const b = btn("tg", "Tracked", () => { trk[id] = !trk[id]; b.setAttribute("aria-pressed", trk[id]); b.textContent = trk[id] ? "Tracked" : "Not tracked"; upd(); });
      b.setAttribute("aria-pressed", "true"); r.append(b); t.append(r);
    });
    s.append(t);
    const sv = btn("save", "Save game", () => {
      const partial = Object.values(trk).some((v) => !v);
      saveGame({ ...g, status: "done", trk: { ...trk }, partial, sb: false, endedAt: Date.now() });
      home(); toast(`Game saved · ${partial ? "Partial Stats" : "Complete"}`, false);
    });
    sv.style.marginTop = "auto"; s.append(sv, btn("ghost", "Keep tracking", () => closeSheet(false)));
    if (!P.length) {
      s.append(armed(btn("ghost danger", "Stop without saving (no plays logged)"), "Tap again to stop", () => {
        gamePlays(g.id).forEach(delPlay);
        saveGame({ ...g, status: "scheduled" }); home(); toast("Stopped. The game is back on the schedule.", false);
      }));
    }
    function upd() {
      const partial = Object.values(trk).some((v) => !v);
      stl.innerHTML = `<span class="pill ${partial ? "part" : "ok"}">${partial ? "⚠ Partial Stats" : "Complete"}</span> ${P.length} plays logged`;
      bx.innerHTML = ""; bx.append(boxEl(statsFromPlays(P, trk)));
    }
    upd();
  }, { back: () => closeSheet(false), backLabel: "Back to game" });
}
$("l-end").onclick = endGame;

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------
function openSchedule() {
  const list = S.games.slice().sort(byDate), today = todayStr();
  openSheet("Schedule", `${list.length} entries · tap a game to edit it`, (s) => {
    const l = el("div", "");
    list.forEach((g) => {
      const tag = g.cancelled ? "Cancelled" : g.status === "live" ? "Live" : g.type;
      const r = btn("srow" + (g.date < today ? " past" : "") + (g.cancelled ? " cx" : ""), "", () => gameForm(g));
      r.append(el("div", "d", fmtShort(g.date)), el("div", "o", esc(g.opp)), el("span", "tag " + tag, tag),
        el("div", "m", `${timeLabel(g.time)} · ${g.ha === "H" ? "Home" : "Away"}${g.fac ? " · " + esc(g.fac) : ""}${g.status === "done" ? " · ✓ stats saved" : ""}`));
      l.append(r);
    });
    s.append(l, btn("ghost", "+ Add a game", () => gameForm(null)));
  }, { back: home, backLabel: "Home" });
}
$("h-sched").onclick = openSchedule;

function segCtl(opts, val, onch) {
  const w = el("div", "seg" + (opts.length === 3 ? " three" : ""));
  opts.forEach(([v, l]) => {
    const b = btn("", l, () => { w.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); onch(v); });
    b.setAttribute("aria-pressed", v === val); w.append(b);
  });
  return w;
}
function fld(label, ctl, id) { const f = el("div", "fld"), l = el("label", "", label); if (id) l.htmlFor = id; f.append(l, ctl); return f; }
function inp(type, id, val) { const i = document.createElement("input"); i.type = type; i.id = id; if (val != null) i.value = val; return i; }

function gameForm(orig) {
  const isNew = !orig;
  const g = orig ? { ...orig } : { date: "", time: "TBD", ha: "H", opp: "", type: "Game", fac: "", cancelled: false, status: "scheduled", partial: false, sb: false };
  openSheet(isNew ? "Add a game" : "Edit game", isNew ? "Fill in what you know" : fmtLong(g.date), (s) => {
    const op = inp("text", "gf-opp", g.opp); op.placeholder = "vs Dunellen or @ Rahway HS"; s.append(fld("Opponent", op, "gf-opp"));
    const da = inp("date", "gf-date", g.date), ti = inp("time", "gf-time", to24(g.time));
    const tbd = el("label", "chk"), cb = inp("checkbox", "gf-tbd");
    cb.checked = g.time === "TBD"; ti.disabled = cb.checked; cb.onchange = () => (ti.disabled = cb.checked);
    tbd.append(cb, document.createTextNode("Time TBD"));
    const r2 = el("div", "row2"); r2.append(fld("Date", da, "gf-date"), fld("Time", ti, "gf-time")); s.append(r2, tbd);
    const ha = el("div", "fld"); ha.append(el("div", "lb", "Home or away"), segCtl([["H", "Home"], ["A", "Away"]], g.ha, (v) => (g.ha = v))); s.append(ha);
    const ty = el("div", "fld"); ty.append(el("div", "lb", "Type"), segCtl([["Game", "Game"], ["Scrimmage", "Scrimmage"], ["Tournament", "Tournament"]], g.type, (v) => (g.type = v))); s.append(ty);
    const fa = inp("text", "gf-fac", g.fac); fa.placeholder = "Gym or school"; s.append(fld("Facility", fa, "gf-fac"));
    if (g.status === "done") s.append(el("p", "help", "Stats are saved for this game. See them in Game Log."));

    const sv = btn("save", isNew ? "Add game" : "Save changes", () => {
      if (!op.value.trim() || !da.value) { toast("Add an opponent and a date to save.", false); return; }
      const out = { ...g, opp: op.value.trim(), date: da.value, time: cb.checked || !ti.value ? "TBD" : to12(ti.value), fac: fa.value.trim(), id: g.id || newId("games") };
      saveGame(out); openSchedule(); toast(isNew ? "Game added" : "Game updated", false);
    });
    sv.style.marginTop = "auto"; s.append(sv);

    if (!isNew && g.status === "scheduled" && !g.cancelled) {
      s.append(btn("ghost", "Track this game live", () => startGame(g)));
    }
    if (!isNew && g.status === "scheduled") {
      if (g.cancelled) s.append(btn("ghost", "Restore this game", () => { saveGame({ ...g, cancelled: false }); openSchedule(); toast("Game restored", false); }));
      else s.append(armed(btn("ghost danger", "Cancel this game"), "Tap again to cancel the game", () => { saveGame({ ...g, cancelled: true }); openSchedule(); toast("Game cancelled", false); }));
    }
  }, { back: openSchedule, backLabel: "Schedule" });
}

// ---------------------------------------------------------------------------
// Game Log (all games)
// ---------------------------------------------------------------------------
function openGames() {
  const list = doneGames();
  openSheet("Game log", list.length ? `${list.length} game${list.length > 1 ? "s" : ""} · tap one to see it` : "", (s) => {
    if (!list.length) s.append(el("div", "empty", "No games yet. A game shows up here after you tap End game on the live screen, or enter one from a scorebook (⋯ menu)."));
    list.forEach((g) => {
      const st = gameStats(g), r = btn("srow", "", () => openGame(g.id));
      r.append(el("div", "d", fmtShort(g.date)), el("div", "o", esc(g.opp)), el("span", `pill ${g.partial ? "part" : "ok"}`, g.partial ? "⚠ Partial" : "Complete"),
        el("div", "m", [st.pts != null && st.pts + " pts", st.ast != null && st.ast + " ast", st.to != null && st.to + " to", g.sb && "from scorebook", g.type === "Scrimmage" && "scrimmage"].filter(Boolean).join(" · ")));
      s.append(r);
    });
  }, { back: home, backLabel: "Home" });
}
$("h-log").onclick = openGames;

function openGame(gid) {
  const g = S.games.find((x) => x.id === gid); if (!g) { openGames(); return; }
  openSheet(g.opp, fmtLong(g.date), (s) => {
    s.append(el("div", "statusline", `<span class="pill ${g.partial ? "part" : "ok"}">${g.partial ? "⚠ Partial Stats" : "Complete"}</span>${g.sb ? " Entered from a scorebook" : ""}`));
    s.append(boxEl(gameStats(g)));
    if (g.trk) {
      const nt = CATS.filter((c) => g.trk[c[0]] === false).map((c) => c[1]);
      if (nt.length) s.append(el("p", "help", "Not tracked: " + nt.join(", ") + ". These are left out of his averages."));
    }
    if (g.sb) {
      s.append(el("p", "help", "No play-by-play for scorebook games. Blank boxes weren't tracked."));
      s.append(btn("ghost", "Edit scorebook numbers", () => openScorebook(g.id)));
    } else {
      s.append(el("div", "secttl", "Plays · tap any play to fix it"));
      playList(s, g.id, () => openGame(gid));
    }
    const del = armed(btn("ghost danger", "Delete this game's stats"), "Tap again to delete all stats for this game", () => {
      gamePlays(g.id).forEach(delPlay);
      saveGame({ ...g, status: "scheduled", trk: null, partial: false, sb: false, sbStats: null });
      openGames(); toast("Stats deleted. The game is back on the schedule.", false);
    });
    del.style.marginTop = "auto"; s.append(del);
  }, { back: openGames, backLabel: "All games" });
}

// ---------------------------------------------------------------------------
// Scorebook entry
// ---------------------------------------------------------------------------
const SB_FIELDS = [["PTS", "pts"], ["FGM", "fgm"], ["FGA", "fga"], ["3PM", "tpm"], ["3PA", "tpa"], ["FTM", "ftm"], ["FTA", "fta"], ["AST", "ast"], ["TO", "to"], ["REB", "reb"], ["STL", "stl"], ["PF", "pf"]];
function openScorebook(gid) {
  const choices = S.games.filter((g) => !g.cancelled && (g.status === "scheduled" || (g.status === "done" && g.sb))).sort(byDate);
  let pick = gid || (choices.find((g) => g.date <= todayStr() && g.status === "scheduled") || choices[0] || {}).id;
  const fromGame = !!gid;
  openSheet("Enter from a scorebook", "For a game you didn't track live", (s) => {
    if (!choices.length) { s.append(el("p", "help", "There are no games available. Add one to the schedule first.")); return; }
    const selEl = document.createElement("select"); selEl.id = "sb-game";
    choices.forEach((g) => { const o = document.createElement("option"); o.value = g.id; o.textContent = `${fmtShort(g.date)} · ${g.opp}`; if (g.id === pick) o.selected = true; selEl.append(o); });
    s.append(fld("Game", selEl, "sb-game"), el("p", "help", "Leave a box empty if you don't know it. Empty means not tracked. 0 means it didn't happen."));
    const grid = el("div", "sb"), ins = {};
    const fill = () => { const g = S.games.find((x) => x.id === pick); const v = (g && g.sbStats) || {}; SB_FIELDS.forEach(([, k]) => (ins[k].value = v[k] ?? "")); };
    SB_FIELDS.forEach(([lab, k]) => { const i = inp("number", "sb-" + k); i.inputMode = "numeric"; i.min = "0"; i.placeholder = "—"; ins[k] = i; grid.append(fld(lab, i, "sb-" + k)); });
    selEl.onchange = () => { pick = selEl.value; fill(); };
    s.append(grid); fill();
    const sv = btn("save", "Save game", () => {
      const val = (k) => (ins[k].value === "" ? null : Math.max(0, Math.round(+ins[k].value)));
      if (SB_FIELDS.every(([, k]) => val(k) == null)) { toast("Enter at least one number to save.", false); return; }
      const g = S.games.find((x) => x.id === pick);
      const sbStats = Object.fromEntries(SB_FIELDS.map(([, k]) => [k, val(k)]));
      saveGame({ ...g, status: "done", sb: true, partial: true, trk: null, sbStats, endedAt: Date.now() });
      if (fromGame) openGame(g.id); else home();
      toast("Saved from scorebook · Partial Stats", false);
    });
    sv.style.marginTop = "auto"; s.append(sv);
  }, fromGame ? { back: () => openGame(gid), backLabel: "Back" } : { back: home, backLabel: "Home" });
}

// ---------------------------------------------------------------------------
// Edit player
// ---------------------------------------------------------------------------
function resizePhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const size = 360, c = document.createElement("canvas"); c.width = c.height = size;
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
      c.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That photo couldn't be opened.")); };
    img.src = url;
  });
}
function openPlayer() {
  const p = { name: "", number: "", position: "Point Guard", photo: "", ...(S.profile || {}) };
  openSheet("Edit player", "Shown on the home screen", (s) => {
    const row = el("div", "photo"), av = el("div", "av lg", avatarHTML(p));
    const file = inp("file", "pl-photo"); file.accept = "image/*"; file.hidden = true;
    const pickB = btn("ghost", p.photo ? "Change photo" : "Add photo", () => file.click());
    const rm = btn("ghost", "Remove", () => { p.photo = ""; av.innerHTML = avatarHTML(p); rm.hidden = true; pickB.textContent = "Add photo"; });
    rm.hidden = !p.photo;
    file.onchange = async () => {
      const f = file.files && file.files[0]; if (!f) return;
      try { p.photo = await resizePhoto(f); av.innerHTML = avatarHTML(p); rm.hidden = false; pickB.textContent = "Change photo"; }
      catch (e) { toast(e.message, false); }
    };
    const btns = el("div", "mlist"); btns.append(pickB, rm);
    row.append(av, btns, file); s.append(row);
    const nm = inp("text", "pl-name", p.name), no = inp("text", "pl-num", p.number), po = inp("text", "pl-pos", p.position);
    no.inputMode = "numeric"; no.placeholder = "Not set yet";
    s.append(fld("Name", nm, "pl-name"));
    const r2 = el("div", "row2"); r2.append(fld("Jersey number", no, "pl-num"), fld("Position", po, "pl-pos")); s.append(r2);
    const sv = btn("save", "Save", () => {
      const out = { name: nm.value.trim() || "Player", number: no.value.trim(), position: po.value.trim(), photo: p.photo || "" };
      S.profile = out; merge("profile", "main", out); home(); toast("Player saved", false);
    });
    sv.style.marginTop = "auto"; s.append(sv);
  }, { back: home, backLabel: "Home" });
}
$("h-player").onclick = openPlayer;

// ---------------------------------------------------------------------------
// ⋯ menu, export, coming-soon tiles
// ---------------------------------------------------------------------------
function openMenu() {
  openSheet("More", null, (s) => {
    const m = el("div", "mlist");
    m.append(btn("ghost", "Enter a game from a scorebook", () => openScorebook()));
    m.append(btn("ghost", "Export all stats to a spreadsheet", exportCSV));
    const inc = !!S.settings.includeScrim;
    m.append(btn("ghost", `Include scrimmages in averages: ${inc ? "On" : "Off"}`, () => {
      S.settings = { ...S.settings, includeScrim: !inc }; merge("settings", "main", { includeScrim: !inc }); openMenu();
    }));
    m.append(btn("ghost", "Edit player", openPlayer));
    m.append(armed(btn("ghost danger", "Sign out"), "Tap again to sign out", async () => { closeSheet(false); S.unsubs.forEach((u) => u()); S.unsubs = []; await signOut(auth); }));
    s.append(m);
    s.append(el("p", "help", `Signed in as ${esc(S.user ? S.user.email : "")}`));
  }, { back: home, backLabel: "Home" });
}
$("h-menu").onclick = openMenu;

async function exportCSV() {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["Date", "Opponent", "Game type", "Status", "Period", "Play", "Details", "Points", "Zone", "Fast break"]];
  S.games.slice().sort(byDate).forEach((g) => {
    if (g.status !== "done" && g.status !== "live") return;
    const status = g.status === "live" ? "In progress" : g.partial ? "Partial" : "Complete";
    if (g.sb) {
      const v = g.sbStats || {};
      rows.push([g.date, g.opp, g.type, status, "", "Scorebook totals", SB_FIELDS.map(([l, k]) => `${l} ${v[k] ?? "—"}`).join("; "), v.pts ?? "", "", ""]);
      return;
    }
    statPlays(g.id).forEach((p) => rows.push([g.date, g.opp, g.type, status, p.q, p.type, playText(p), ptsOf(p),
      p.type === "shot" ? ZM[p.f.zone].name : "", p.f && p.f.fb ? "Yes" : ""]));
  });
  const csv = rows.map((r) => r.map(q).join(",")).join("\r\n");
  const name = `pg-stats-${todayStr()}.csv`;
  const file = new File([csv], name, { type: "text/csv" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "PG Stats export" }); return; }
  } catch (e) { if (e && e.name === "AbortError") return; }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

document.querySelectorAll("[data-soon]").forEach((t) => (t.onclick = () => toast(`${t.dataset.soon} comes in Phase ${t.dataset.phase}`, false)));

// ---------------------------------------------------------------------------
// Keep the screen awake during a game
// ---------------------------------------------------------------------------
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && view === "v-live") keepAwake(true); });

// ---------------------------------------------------------------------------
// Offline app files
// ---------------------------------------------------------------------------
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
