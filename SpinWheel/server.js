/**
 * SET Chennai Outing 2026 - Team Separation Spin Wheel
 * ----------------------------------------------------
 * A standalone Node.js + Express server that assigns 50+ participants
 * equally into 4 "House" teams (Blue, Green, Orange, Red).
 *
 * The equal split is guaranteed on the SERVER side, not left to luck:
 * when a person spins, the server picks the team that currently has the
 * fewest members and tells the wheel where to land. This keeps every
 * team within 1 person of the others at all times.
 *
 * VIEWS:
 *   /        -> Viewer page: ONLY the spin wheel. No team rosters shown.
 *   /admin   -> Admin page:  password-protected dashboard with all
 *               rosters, counts, and Undo/Reset controls.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Admin password ----------------------------------------------------
// Change this, or set an ADMIN_PASSWORD environment variable before start.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "setchennai2026";
// Active admin session tokens (in-memory; cleared on restart).
const adminTokens = new Set();

// ---- Capacity per team -------------------------------------------------
// Maximum members allowed in EACH team. 0 = no cap (pure auto-balance).
// Example: for ~52 people in 4 teams, set 13 to cap each House at 13.
// Override at start:  set TEAM_CAP=13 && npm start
const TEAM_CAP = Number(process.env.TEAM_CAP || 0);

// ---- Team definitions (index order matters: matches wheel segments) ----
const TEAMS = [
  { id: "blue", name: "Blue House", color: "#2563eb" },
  { id: "green", name: "Green House", color: "#16a34a" },
  { id: "orange", name: "Orange House", color: "#ea580c" },
  { id: "red", name: "Red House", color: "#dc2626" },
];

// ---- Persistence ----
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "assignments.json");

/** @type {{name: string, teamId: string, time: string}[]} */
let assignments = [];

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      assignments = JSON.parse(raw);
      if (!Array.isArray(assignments)) assignments = [];
    }
  } catch (err) {
    console.error("Could not read saved data, starting fresh:", err.message);
    assignments = [];
  }
}

function saveData() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(assignments, null, 2), "utf8");
  } catch (err) {
    console.error("Could not save data:", err.message);
  }
}

// ---- Helpers ----
function teamCounts() {
  const counts = {};
  TEAMS.forEach((t) => (counts[t.id] = 0));
  assignments.forEach((a) => {
    if (counts[a.teamId] !== undefined) counts[a.teamId] += 1;
  });
  return counts;
}

/**
 * Pick the team that keeps things equal: among teams that still have room
 * (below TEAM_CAP), choose the one(s) with the fewest members. Ties are
 * broken at random. Returns null if every team is full.
 */
function pickBalancedTeam() {
  const counts = teamCounts();
  // Only teams with spare capacity are eligible.
  const open = TEAMS.filter((t) => TEAM_CAP === 0 || counts[t.id] < TEAM_CAP);
  if (open.length === 0) return null; // all teams full
  const min = Math.min(...open.map((t) => counts[t.id]));
  const candidates = open.filter((t) => counts[t.id] === min);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/** How many more members can still be added across all teams. */
function slotsRemaining() {
  if (TEAM_CAP === 0) return null; // unlimited
  const counts = teamCounts();
  return TEAMS.reduce((sum, t) => sum + Math.max(0, TEAM_CAP - counts[t.id]), 0);
}

/** Extract the bearer token from the Authorization header. */
function getToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

/** Middleware: allow only requests carrying a valid admin token. */
function requireAdmin(req, res, next) {
  if (adminTokens.has(getToken(req))) return next();
  return res.status(401).json({ error: "Admin authentication required." });
}

// ---- Middleware ----
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Pages ----
// Admin page (the file itself is harmless; the DATA behind it is protected).
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ---- Auth API ----
app.post("/api/login", (req, res) => {
  const password = req.body && req.body.password ? String(req.body.password) : "";
  if (password === ADMIN_PASSWORD) {
    const token = crypto.randomBytes(24).toString("hex");
    adminTokens.add(token);
    return res.json({ ok: true, token });
  }
  return res.status(401).json({ error: "Incorrect password." });
});

app.post("/api/logout", requireAdmin, (req, res) => {
  adminTokens.delete(getToken(req));
  res.json({ ok: true });
});

// ---- Public API --------------------------------------------------------

// PUBLIC state: teams config + total count ONLY. No roster, no per-team
// breakdown, so viewers cannot see who is on which team.
app.get("/api/public-state", (req, res) => {
  res.json({
    teams: TEAMS.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    total: assignments.length,
    cap: TEAM_CAP,
    slotsRemaining: slotsRemaining(),
  });
});

// A person spins. Body: { name }. Server decides the balanced team.
// The response tells THIS spinner their own team only.
app.post("/api/spin", (req, res) => {
  const name = (req.body && req.body.name ? String(req.body.name) : "").trim();
  if (!name) {
    return res.status(400).json({ error: "Please enter a name before spinning." });
  }

  // Prevent the exact same name from being assigned twice.
  const already = assignments.find(
    (a) => a.name.toLowerCase() === name.toLowerCase()
  );
  if (already) {
    return res.status(409).json({
      error: `"${name}" has already spun. Please check with the host.`,
    });
  }

  const team = pickBalancedTeam();
  if (!team) {
    return res.status(409).json({
      error: "All teams are full. Please check with the host.",
      full: true,
    });
  }
  const teamIndex = TEAMS.findIndex((t) => t.id === team.id);

  const record = { name, teamId: team.id, time: new Date().toISOString() };
  assignments.push(record);
  saveData();

  // Note: we deliberately do NOT return counts/roster to the viewer.
  res.json({
    name,
    team,
    teamIndex, // wheel segment to land on
    total: assignments.length,
    slotsRemaining: slotsRemaining(),
  });
});

// ---- Admin API (protected) --------------------------------------------

// FULL state: teams, counts, and the complete roster. Admin only.
app.get("/api/admin-state", requireAdmin, (req, res) => {
  res.json({
    teams: TEAMS,
    counts: teamCounts(),
    total: assignments.length,
    cap: TEAM_CAP,
    slotsRemaining: slotsRemaining(),
    assignments,
  });
});

// Reset everything (for a fresh event or a test run). Admin only.
app.post("/api/reset", requireAdmin, (req, res) => {
  assignments = [];
  saveData();
  res.json({ ok: true, counts: teamCounts(), total: 0 });
});

// Undo the most recent assignment (handy if someone mis-typed). Admin only.
app.post("/api/undo", requireAdmin, (req, res) => {
  const removed = assignments.pop();
  saveData();
  res.json({ ok: true, removed, counts: teamCounts(), total: assignments.length });
});

loadData();
app.listen(PORT, () => {
  console.log(`\n  SET Chennai Outing 2026 - Spin Wheel running!`);
  console.log(`  Viewers open:  http://localhost:${PORT}`);
  console.log(`  Admin opens:   http://localhost:${PORT}/admin`);
  console.log(`  Admin password: ${ADMIN_PASSWORD}`);
  console.log(
    `  Per-team cap:  ${TEAM_CAP === 0 ? "none (auto-balance)" : TEAM_CAP + " per House"}\n`
  );
});
