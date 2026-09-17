/**
 * SET Chennai Outing 2026 - Team Separation Spin Wheel
 * ----------------------------------------------------
 * A standalone Node.js + Express server that assigns 50+ participants
 * equally into 4 "House" teams (Blue, Green, Orange, Red).
 *
 * The equal split is guaranteed on the SERVER side, not left to luck:
 * when a person spins, the server picks the team that currently has the
 * fewest members and tells the wheel where to land.
 *
 * STORAGE (durable):
 *   - If DATABASE_URL is set (e.g. Render PostgreSQL) -> data is stored in
 *     Postgres and SURVIVES restarts / redeploys / idle-sleep. It is only
 *     cleared when an admin presses "Reset all".
 *   - If DATABASE_URL is NOT set (e.g. running locally via start.bat) ->
 *     data is stored in a local JSON file (data/assignments.json).
 *
 * VIEWS:
 *   /        -> Viewer page: ONLY the spin wheel. No team rosters shown.
 *   /admin   -> Admin page:  password-protected dashboard with rosters,
 *               counts, and Undo/Reset controls.
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Admin password ----------------------------------------------------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "setchennai2026";
const adminTokens = new Set();

// ---- Capacity per team -------------------------------------------------
// Maximum members allowed in EACH team. 0 = no cap (pure auto-balance).
const TEAM_CAP = Number(process.env.TEAM_CAP || 0);

// ---- Team definitions (index order matters: matches wheel segments) ----
const TEAMS = [
  { id: "red", name: "Red House", color: "#dc2626" },
  { id: "blue", name: "Blue House", color: "#2563eb" },
  { id: "green", name: "Green House", color: "#16a34a" },
  { id: "white", name: "White House", color: "#f8fafc" },
];

/* =======================================================================
 * STORAGE LAYER
 * A small "store" object with async methods. Two implementations:
 *   - PostgresStore  (used when DATABASE_URL is set)   -> durable
 *   - FileStore      (used otherwise)                  -> local file
 * Each assignment record: { name, teamId, time }
 * ===================================================================== */

const DATABASE_URL = process.env.DATABASE_URL || "";

/** File-based store (local development / laptop). */
function createFileStore() {
  const DATA_DIR = path.join(__dirname, "data");
  const DATA_FILE = path.join(DATA_DIR, "assignments.json");
  let cache = [];

  function persist() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2), "utf8");
  }

  return {
    kind: "file",
    async init() {
      try {
        if (fs.existsSync(DATA_FILE)) {
          const raw = fs.readFileSync(DATA_FILE, "utf8");
          const parsed = JSON.parse(raw);
          cache = Array.isArray(parsed) ? parsed : [];
        }
      } catch (err) {
        console.error("File store: could not read data, starting fresh:", err.message);
        cache = [];
      }
    },
    async all() {
      return cache.slice();
    },
    async add(record) {
      cache.push(record);
      persist();
    },
    async removeLast() {
      const removed = cache.pop() || null;
      persist();
      return removed;
    },
    async clear() {
      cache = [];
      persist();
    },
  };
}

/** PostgreSQL-based store (Render / any hosted Postgres). Durable. */
function createPostgresStore(connectionString) {
  const { Pool } = require("pg");
  // Render Postgres requires SSL. Allow self-signed cert chain.
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  return {
    kind: "postgres",
    async init() {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS assignments (
          id      SERIAL PRIMARY KEY,
          name    TEXT NOT NULL,
          team_id TEXT NOT NULL,
          time    TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    },
    async all() {
      const { rows } = await pool.query(
        "SELECT name, team_id, time FROM assignments ORDER BY id ASC"
      );
      return rows.map((r) => ({
        name: r.name,
        teamId: r.team_id,
        time: r.time instanceof Date ? r.time.toISOString() : r.time,
      }));
    },
    async add(record) {
      await pool.query(
        "INSERT INTO assignments (name, team_id, time) VALUES ($1, $2, $3)",
        [record.name, record.teamId, record.time]
      );
    },
    async removeLast() {
      // Delete the row with the highest id and return it.
      const { rows } = await pool.query(
        `DELETE FROM assignments
         WHERE id = (SELECT id FROM assignments ORDER BY id DESC LIMIT 1)
         RETURNING name, team_id, time`
      );
      if (!rows.length) return null;
      const r = rows[0];
      return {
        name: r.name,
        teamId: r.team_id,
        time: r.time instanceof Date ? r.time.toISOString() : r.time,
      };
    },
    async clear() {
      await pool.query("DELETE FROM assignments");
    },
  };
}

const store = DATABASE_URL
  ? createPostgresStore(DATABASE_URL)
  : createFileStore();

// ---- Helpers (operate on a list of assignment records) ----------------
function teamCounts(list) {
  const counts = {};
  TEAMS.forEach((t) => (counts[t.id] = 0));
  list.forEach((a) => {
    if (counts[a.teamId] !== undefined) counts[a.teamId] += 1;
  });
  return counts;
}

/**
 * Among teams that still have room (below TEAM_CAP), pick the one(s) with
 * the fewest members; break ties at random. Returns null if all full.
 */
function pickBalancedTeam(list) {
  const counts = teamCounts(list);
  const open = TEAMS.filter((t) => TEAM_CAP === 0 || counts[t.id] < TEAM_CAP);
  if (open.length === 0) return null;
  const min = Math.min(...open.map((t) => counts[t.id]));
  const candidates = open.filter((t) => counts[t.id] === min);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function slotsRemaining(list) {
  if (TEAM_CAP === 0) return null;
  const counts = teamCounts(list);
  return TEAMS.reduce((sum, t) => sum + Math.max(0, TEAM_CAP - counts[t.id]), 0);
}

function getToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function requireAdmin(req, res, next) {
  if (adminTokens.has(getToken(req))) return next();
  return res.status(401).json({ error: "Admin authentication required." });
}

// ---- Middleware ----
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- Pages ----
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

// PUBLIC state: teams config + total count ONLY (no roster).
app.get("/api/public-state", async (req, res) => {
  try {
    const list = await store.all();
    res.json({
      teams: TEAMS.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      total: list.length,
      cap: TEAM_CAP,
      slotsRemaining: slotsRemaining(list),
    });
  } catch (err) {
    console.error("public-state error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
});

// A person spins. Body: { name }. Server decides the balanced team.
app.post("/api/spin", async (req, res) => {
  const name = (req.body && req.body.name ? String(req.body.name) : "").trim();
  if (!name) {
    return res.status(400).json({ error: "Please enter a name before spinning." });
  }

  try {
    const list = await store.all();

    // Prevent the exact same name from being assigned twice.
    const already = list.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (already) {
      return res.status(409).json({
        error: `"${name}" has already spun. Please check with the host.`,
      });
    }

    const team = pickBalancedTeam(list);
    if (!team) {
      return res.status(409).json({
        error: "All teams are full. Please check with the host.",
        full: true,
      });
    }
    const teamIndex = TEAMS.findIndex((t) => t.id === team.id);

    const record = { name, teamId: team.id, time: new Date().toISOString() };
    await store.add(record);

    const total = list.length + 1;
    // Recompute slots from the updated list.
    const updated = list.concat([record]);
    res.json({
      name,
      team,
      teamIndex,
      total,
      slotsRemaining: slotsRemaining(updated),
    });
  } catch (err) {
    console.error("spin error:", err.message);
    res.status(500).json({ error: "Server error while saving. Please retry." });
  }
});

// ---- Admin API (protected) --------------------------------------------

// FULL state: teams, counts, and the complete roster. Admin only.
app.get("/api/admin-state", requireAdmin, async (req, res) => {
  try {
    const list = await store.all();
    res.json({
      teams: TEAMS,
      counts: teamCounts(list),
      total: list.length,
      cap: TEAM_CAP,
      slotsRemaining: slotsRemaining(list),
      assignments: list,
    });
  } catch (err) {
    console.error("admin-state error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
});

// Reset everything. Admin only. THIS is the only thing that clears data.
app.post("/api/reset", requireAdmin, async (req, res) => {
  try {
    await store.clear();
    res.json({ ok: true, counts: teamCounts([]), total: 0 });
  } catch (err) {
    console.error("reset error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
});

// Undo the most recent assignment. Admin only.
app.post("/api/undo", requireAdmin, async (req, res) => {
  try {
    const removed = await store.removeLast();
    const list = await store.all();
    res.json({ ok: true, removed, counts: teamCounts(list), total: list.length });
  } catch (err) {
    console.error("undo error:", err.message);
    res.status(500).json({ error: "Server error." });
  }
});

// ---- Start ----
store
  .init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n  SET Chennai Outing 2026 - Spin Wheel running!`);
      console.log(`  Viewers open:  http://localhost:${PORT}`);
      console.log(`  Admin opens:   http://localhost:${PORT}/admin`);
      console.log(`  Admin password: ${ADMIN_PASSWORD}`);
      console.log(
        `  Per-team cap:  ${TEAM_CAP === 0 ? "none (auto-balance)" : TEAM_CAP + " per House"}`
      );
      console.log(
        `  Storage:       ${store.kind === "postgres" ? "PostgreSQL (durable)" : "local file (data/assignments.json)"}\n`
      );
    });
  })
  .catch((err) => {
    console.error("Failed to initialise storage:", err.message);
    process.exit(1);
  });
