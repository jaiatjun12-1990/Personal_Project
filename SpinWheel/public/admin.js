/* SET Chennai Outing 2026 - Admin dashboard logic.
 * Password-gated. Only this page loads the full roster. */

const els = {
  loginCard: document.getElementById("loginCard"),
  adminPassword: document.getElementById("adminPassword"),
  loginBtn: document.getElementById("loginBtn"),
  loginMsg: document.getElementById("loginMsg"),
  adminMain: document.getElementById("adminMain"),
  teams: document.getElementById("teams"),
  totalCount: document.getElementById("totalCount"),
  balanceNote: document.getElementById("balanceNote"),
  refreshBtn: document.getElementById("refreshBtn"),
  undoBtn: document.getElementById("undoBtn"),
  resetBtn: document.getElementById("resetBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  message: document.getElementById("message"),
  bgBubbles: document.getElementById("bgBubbles"),
};

let TOKEN = sessionStorage.getItem("adminToken") || "";
let TEAMS = [];
let refreshTimer = null;

/* ---------- Auth ---------- */
async function login() {
  const password = els.adminPassword.value;
  if (!password) {
    els.loginMsg.textContent = "Enter the password.";
    return;
  }
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      els.loginMsg.textContent = data.error || "Login failed.";
      return;
    }
    TOKEN = data.token;
    sessionStorage.setItem("adminToken", TOKEN);
    showDashboard();
  } catch (err) {
    els.loginMsg.textContent = "Could not reach the server.";
  }
}

async function logout() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      headers: { Authorization: "Bearer " + TOKEN },
    });
  } catch (_) {}
  TOKEN = "";
  sessionStorage.removeItem("adminToken");
  stopAutoRefresh();
  els.adminMain.style.display = "none";
  els.loginCard.style.display = "";
  els.adminPassword.value = "";
}

function authHeaders(extra) {
  return Object.assign({ Authorization: "Bearer " + TOKEN }, extra || {});
}

/* ---------- Dashboard ---------- */
function showDashboard() {
  els.loginCard.style.display = "none";
  els.adminMain.style.display = "";
  loadAdminState();
  startAutoRefresh();
}

async function loadAdminState() {
  try {
    const res = await fetch("/api/admin-state", { headers: authHeaders() });
    if (res.status === 401) {
      // Token expired or server restarted; force re-login.
      return logout();
    }
    const data = await res.json();
    TEAMS = data.teams;
    render(data);
  } catch (err) {
    els.message.textContent = "Could not load data.";
  }
}

function render(data) {
  els.totalCount.textContent = data.total;

  const byTeam = {};
  TEAMS.forEach((t) => (byTeam[t.id] = []));
  data.assignments.forEach((a) => {
    if (byTeam[a.teamId]) byTeam[a.teamId].push(a.name);
  });

  // Balance indicator
  const counts = TEAMS.map((t) => byTeam[t.id].length);
  const diff = Math.max(...counts) - Math.min(...counts);
  const capText =
    data.cap && data.cap > 0
      ? ` · Cap ${data.cap}/House · ${data.slotsRemaining} slots left`
      : "";
  els.balanceNote.textContent =
    (data.total === 0
      ? "No spins yet."
      : diff <= 1
      ? "✅ Teams are balanced (within 1 member)."
      : "⚠ Teams differ by " + diff + " members.") + capText;

  els.teams.innerHTML = TEAMS.map((t) => {
    const members = byTeam[t.id] || [];
    const capLabel = data.cap && data.cap > 0 ? ` / ${data.cap}` : "";
    const chips = members
      .map((name, i) => `<span class="member-chip">${i + 1}. ${escapeHtml(name)}</span>`)
      .join("");
    return `
      <div class="team-card" style="background:${t.color}">
        <div class="team-top">
          <span>${t.name}</span>
          <span class="count">${members.length}${capLabel}</span>
        </div>
        <div class="members">${chips}</div>
      </div>`;
  }).join("");
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/* ---------- Actions ---------- */
async function undoLast() {
  if (!confirm("Remove the most recent spin?")) return;
  const res = await fetch("/api/undo", { method: "POST", headers: authHeaders() });
  if (res.status === 401) return logout();
  const data = await res.json();
  els.message.textContent = data.removed
    ? `Removed: ${data.removed.name}`
    : "Nothing to undo.";
  loadAdminState();
}

async function resetAll() {
  if (!confirm("Reset ALL team assignments? This cannot be undone.")) return;
  const res = await fetch("/api/reset", { method: "POST", headers: authHeaders() });
  if (res.status === 401) return logout();
  await res.json();
  els.message.textContent = "All assignments cleared.";
  loadAdminState();
}

/* ---------- Auto refresh ---------- */
function startAutoRefresh() {
  stopAutoRefresh();
  refreshTimer = setInterval(loadAdminState, 4000);
}
function stopAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
}

/* ---------- Background bubbles ---------- */
function makeBubbles() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 14; i++) {
    const b = document.createElement("span");
    const size = 20 + Math.random() * 80;
    b.style.width = b.style.height = `${size}px`;
    b.style.left = `${Math.random() * 100}%`;
    b.style.background = ["#fde047", "#fb923c", "#f472b6", "#34d399", "#fff"][
      Math.floor(Math.random() * 5)
    ];
    b.style.animationDuration = `${8 + Math.random() * 14}s`;
    b.style.animationDelay = `${-Math.random() * 12}s`;
    frag.appendChild(b);
  }
  els.bgBubbles.appendChild(frag);
}

/* ---------- Wire up ---------- */
els.loginBtn.addEventListener("click", login);
els.adminPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
els.refreshBtn.addEventListener("click", loadAdminState);
els.undoBtn.addEventListener("click", undoLast);
els.resetBtn.addEventListener("click", resetAll);
els.logoutBtn.addEventListener("click", logout);

makeBubbles();

// If we already have a token (from a previous unlock this session), verify it.
if (TOKEN) {
  fetch("/api/admin-state", { headers: authHeaders() }).then((res) => {
    if (res.ok) showDashboard();
    else {
      TOKEN = "";
      sessionStorage.removeItem("adminToken");
    }
  });
}
