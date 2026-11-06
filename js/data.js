// Fixed data and stat math. No Firebase or screen code in this file.

// ---- Court zones -------------------------------------------------------
export const ZONES = [
  { id: "LL", name: "Left Lane", s: "L Lane", c: "lay", p: 2, alt: 0 },
  { id: "PA", name: "Paint", s: "Paint", c: "lay", p: 2, alt: 1 },
  { id: "RL", name: "Right Lane", s: "R Lane", c: "lay", p: 2, alt: 0 },
  { id: "LB", name: "Left Baseline", s: "L Base", c: "mid", p: 2, alt: 1 },
  { id: "LE", name: "Left Elbow", s: "L Elbow", c: "mid", p: 2, alt: 0 },
  { id: "MC", name: "Center (Mid)", s: "Center", c: "mid", p: 2, alt: 1 },
  { id: "RE", name: "Right Elbow", s: "R Elbow", c: "mid", p: 2, alt: 0 },
  { id: "RB", name: "Right Baseline", s: "R Base", c: "mid", p: 2, alt: 1 },
  { id: "LC", name: "Left Corner 3", s: "L Cnr", c: "three", p: 3, alt: 1 },
  { id: "LW", name: "Left Wing 3", s: "L Wing", c: "three", p: 3, alt: 0 },
  { id: "TC", name: "Top of Key 3", s: "Top", c: "three", p: 3, alt: 1 },
  { id: "RW", name: "Right Wing 3", s: "R Wing", c: "three", p: 3, alt: 0 },
  { id: "RC", name: "Right Corner 3", s: "R Cnr", c: "three", p: 3, alt: 1 },
];
export const ZM = Object.fromEntries(ZONES.map((z) => [z.id, z]));

// Court drawing space (stylized half court, basket at top).
export const W = 300, H = 210, BX = 150, BY = 30, R3 = 112;

export function classify(x, y) {
  const dx = x - BX, dy = y - BY, d = Math.hypot(dx, dy);
  const a = (Math.atan2(dx, dy) * 180) / Math.PI;
  const three = y <= BY ? Math.abs(dx) >= R3 : d >= R3;
  if (three) {
    if (y <= 72 && Math.abs(dx) >= 100) return dx < 0 ? "LC" : "RC";
    if (a < -30) return "LW";
    if (a > 30) return "RW";
    return "TC";
  }
  if (d < 62) {
    if (Math.abs(a) <= 35) return "PA";
    return dx < 0 ? "LL" : "RL";
  }
  if (Math.abs(a) <= 20) return "MC";
  if (Math.abs(a) <= 55) return dx < 0 ? "LE" : "RE";
  return dx < 0 ? "LB" : "RB";
}

export const shotTypes = (z) => (z.c === "lay" ? ["Floater", "Layup"] : ["Catch & Shoot", "Off Dribble"]);

export const TURNOVERS = ["Bad Pass", "Lost Dribble", "Offensive Foul", "Traveling", "Double Dribble",
  "Out of Bounds", "Back Court", "Carrying", "3 Seconds", "Lane Violation"];

export const SIMPLE = { oreb: "Offensive rebound", dreb: "Defensive rebound", stl: "Steal", dfl: "Deflection", chg: "Charge taken" };

// End Game categories: [id, name, description, play types]
export const CATS = [
  ["shoot", "Shooting", "Field goals and 3s", ["shot"]],
  ["ft", "Free throws", "", ["ft"]],
  ["ast", "Assists", "", ["ast"]],
  ["to", "Turnovers", "", ["to"]],
  ["fd", "Fouls drawn", "", ["fd"]],
  ["foul", "Fouls committed", "", ["fc"]],
  ["reb", "Rebounds", "Offensive and defensive", ["oreb", "dreb"]],
  ["def", "Defense", "Steals, deflections, charges, opp. shots", ["stl", "dfl", "chg", "opp"]],
];

// ---- Season schedule (from the David Brearley schedule PDF) -------------
// [date, time, H/A, opponent, type, facility]
export const SEED_SCHEDULE = [
  ["2026-12-10", "4:00 PM", "H", "vs Dunellen", "Scrimmage", "David Brearley HS"],
  ["2026-12-12", "10:00 AM", "H", "vs Technology", "Scrimmage", "David Brearley HS"],
  ["2026-12-17", "5:30 PM", "H", "vs Abraham Clark HS", "Game", "David Brearley HS"],
  ["2026-12-19", "1:00 PM", "A", "@ Rahway HS", "Game", "Rahway HS"],
  ["2026-12-29", "TBD", "A", "Metuchen Bulldog Holiday Tournament", "Tournament", "Metuchen HS"],
  ["2026-12-31", "TBD", "A", "Metuchen Bulldog Holiday Tournament", "Tournament", "Metuchen HS"],
  ["2027-01-05", "5:30 PM", "A", "@ Jonathan Dayton", "Game", "Jonathan Dayton HS"],
  ["2027-01-07", "5:30 PM", "H", "vs Roselle Park", "Game", "David Brearley HS"],
  ["2027-01-12", "7:00 PM", "A", "@ Governor Livingston (PAL Day)", "Game", "Governor Livingston HS, Blue Gym"],
  ["2027-01-14", "5:30 PM", "A", "@ Abraham Clark HS", "Game", "Abraham Clark HS, Large Gym"],
  ["2027-01-21", "5:30 PM", "H", "vs Jonathan Dayton", "Game", "David Brearley HS"],
  ["2027-01-23", "10:30 AM", "H", "vs Rahway HS", "Game", "David Brearley HS"],
  ["2027-01-26", "4:30 PM", "H", "vs Thomas Edison Energy Charter School", "Game", "David Brearley HS"],
  ["2027-01-28", "5:30 PM", "A", "@ Roselle Park", "Game", "Roselle Park HS"],
  ["2027-02-02", "5:30 PM", "H", "vs Governor Livingston", "Game", "David Brearley HS"],
  ["2027-02-05", "5:30 PM", "A", "@ Somerset County Vocational & Technical", "Game", "Somerset County Vocational"],
  ["2027-02-08", "5:30 PM", "H", "vs College Achieve of Plainfield", "Game", "David Brearley HS"],
  ["2027-02-09", "TBD", "A", "UCT", "Tournament", ""],
  ["2027-02-10", "5:30 PM", "H", "vs Newark Vocational HS", "Game", "David Brearley HS"],
  ["2027-02-11", "TBD", "A", "UCT", "Tournament", ""],
  ["2027-02-12", "5:00 PM", "A", "@ Timothy Christian", "Game", "Timothy Christian School"],
  ["2027-02-23", "TBD", "A", "State Tournament", "Tournament", ""],
  ["2027-02-25", "TBD", "A", "State Tournament", "Tournament", ""],
];

// ---- Play helpers --------------------------------------------------------
export const ptsOf = (p) =>
  p.type === "shot" && p.f.res === "make" ? ZM[p.f.zone].p : p.type === "ft" && p.f.made ? 1 : 0;

export const pfOf = (p) => (p.type === "fc" || (p.type === "to" && p.f.kind === "Offensive Foul") ? 1 : 0);

export function playText(p) {
  const f = p.f || {};
  const j = (base, parts) => [base, ...parts.filter(Boolean)].join(" · ");
  switch (p.type) {
    case "shot": {
      const z = ZM[f.zone], ty = shotTypes(z), m = f.res === "make";
      return j(`${z.p}PT ${m ? "make" : f.res === "air" ? "air ball" : "miss"} · ${z.s}`,
        [f.st != null && ty[f.st], f.fb && "Fast Break", m && f.as && "Assisted", f.fo && (m ? "And-1" : "Shooting foul")]);
    }
    case "ft": return (f.n ? `FT ${f.i} of ${f.n} ` : "FT ") + (f.made ? "made" : "missed");
    case "ast": return j(`${f.hk ? "Hockey assist" : "Assist"} · ${f.res ? "scored " + f.res : "teammate missed"}`, [f.bp && "Bounce", f.fb && "Fast Break"]);
    case "to": return j("TO · " + f.kind, [f.forced && "Forced", f.fb && "Fast Break", f.kind === "Offensive Foul" && "counts as foul"]);
    case "fd": return j("Foul drawn · " + (f.how === "dribble" ? "off the dribble" : "off the ball"), [f.fb && "Fast Break"]);
    case "fc": return j("Foul · " + (f.smart ? "smart" : "not smart"), [f.sh ? "Shooting" : "Floor", f.fb && "Fast Break"]);
    case "opp": return `Opp. ${f.cat.toLowerCase()} · ${f.stop ? "stopped" : "scored on"}`;
    default: return SIMPLE[p.type] || p.type;
  }
}

// ---- Game stats ------------------------------------------------------------
// Returns numbers, or null where a stat was not tracked (blank is not zero).
export function statsFromPlays(plays, trk) {
  const T = (k) => !trk || trk[k] !== false;
  const P = plays.filter((p) => p.type !== "period");
  const c = (t) => P.filter((p) => p.type === t);
  const sh = c("shot"), threes = sh.filter((p) => ZM[p.f.zone].p === 3), ft = c("ft");
  return {
    pts: T("shoot") && T("ft") ? P.reduce((s, p) => s + ptsOf(p), 0) : null,
    fgm: T("shoot") ? sh.filter((p) => p.f.res === "make").length : null,
    fga: T("shoot") ? sh.length : null,
    tpm: T("shoot") ? threes.filter((p) => p.f.res === "make").length : null,
    tpa: T("shoot") ? threes.length : null,
    ftm: T("ft") ? ft.filter((p) => p.f.made).length : null,
    fta: T("ft") ? ft.length : null,
    ast: T("ast") ? c("ast").filter((p) => p.f.res > 0 && !p.f.hk).length : null,
    to: T("to") ? c("to").length : null,
    reb: T("reb") ? c("oreb").length + c("dreb").length : null,
    stl: T("def") ? c("stl").length : null,
    defl: T("def") ? c("dfl").length : null,
    pf: T("foul") || T("to")
      ? P.reduce((s, p) => s + ((T("foul") && p.type === "fc") || (T("to") && p.type === "to" && p.f.kind === "Offensive Foul") ? 1 : 0), 0)
      : null,
  };
}

const pair = (a, b) => (a == null || b == null ? null : `${a}/${b}`);
export function boxCells(s) {
  return [
    ["PTS", s.pts], ["FG", pair(s.fgm, s.fga)], ["3PT", pair(s.tpm, s.tpa)], ["FT", pair(s.ftm, s.fta)],
    ["AST", s.ast], ["TO", s.to], ["REB", s.reb], ["STL", s.stl], ["DEFL", s.defl], ["PF", s.pf],
  ];
}

// Season snapshot from a list of per-game stat objects.
export function seasonSnapshot(list) {
  const sum = (k) => list.reduce((s, g) => s + (g[k] ?? 0), 0);
  const n = (k) => list.filter((g) => g[k] != null).length;
  const both = list.filter((g) => g.ast != null && g.to != null);
  const astB = both.reduce((s, g) => s + g.ast, 0), toB = both.reduce((s, g) => s + g.to, 0);
  return {
    ppg: n("pts") ? (sum("pts") / n("pts")).toFixed(1) : "—",
    apg: n("ast") ? (sum("ast") / n("ast")).toFixed(1) : "—",
    tp: sum("tpa") ? Math.round((sum("tpm") / sum("tpa")) * 100) + "%" : "—",
    ato: both.length ? (toB ? (astB / toB).toFixed(1) : astB ? astB.toFixed(1) : "—") : "—",
  };
}

// ---- Dates ------------------------------------------------------------------
export const dt = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const fmtLong = (s) => dt(s).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtShort = (s) => dt(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const timeLabel = (t) => (!t || t === "TBD" ? "Time TBD" : t);
export function to24(t) {
  const m = /(\d+):(\d+)\s*(AM|PM)/.exec(t || "");
  if (!m) return "";
  const h = (+m[1] % 12) + (m[3] === "PM" ? 12 : 0);
  return String(h).padStart(2, "0") + ":" + m[2];
}
export function to12(v) {
  let [h, mi] = v.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(mi).padStart(2, "0")} ${ap}`;
}
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
