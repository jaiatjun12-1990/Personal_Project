/* SET Chennai Outing 2026 - Spin Wheel (VIEWER page)
 * Shows ONLY the wheel and the spinner's own result.
 * No team rosters are ever loaded on this page. */

const canvas = document.getElementById("wheel");
const ctx = canvas.getContext("2d");
const SIZE = canvas.width; // 440
const CENTER = SIZE / 2;
const RADIUS = CENTER - 6;

const els = {
  playerName: document.getElementById("playerName"),
  spinBtn: document.getElementById("spinBtn"),
  message: document.getElementById("message"),
  totalCount: document.getElementById("totalCount"),
  modalOverlay: document.getElementById("modalOverlay"),
  resultName: document.getElementById("resultName"),
  resultTeam: document.getElementById("resultTeam"),
  closeModal: document.getElementById("closeModal"),
  bgBubbles: document.getElementById("bgBubbles"),
  burst: document.getElementById("burst"),
};

let TEAMS = [];
let currentRotation = 0; // degrees
let spinning = false;

/* ---------- Load public state (teams + total only) ---------- */
async function loadState() {
  const res = await fetch("/api/public-state");
  const data = await res.json();
  TEAMS = data.teams;
  if (els.totalCount) els.totalCount.textContent = data.total;
  updateSlots(data.slotsRemaining);
  drawWheel();
  // Commit an explicit starting transform so the first spin animates.
  canvas.style.transform = "rotate(0deg)";
}

/* When a cap is set: disable spinning once all teams are full. */
function updateSlots(slotsRemaining) {
  if (slotsRemaining === null || slotsRemaining === undefined) return; // no cap
  if (slotsRemaining <= 0) {
    els.spinBtn.disabled = true;
    els.spinBtn.textContent = "All teams are full ✅";
    showMessage("All teams are full. Please see the host.", true);
  }
}

/* ---------- Draw the wheel ---------- */
function drawWheel() {
  const n = TEAMS.length;
  const seg = (2 * Math.PI) / n;
  const startOffset = -Math.PI / 2 - seg / 2;

  ctx.clearRect(0, 0, SIZE, SIZE);

  TEAMS.forEach((team, i) => {
    const start = startOffset + i * seg;
    const end = start + seg;

    ctx.beginPath();
    ctx.moveTo(CENTER, CENTER);
    ctx.arc(CENTER, CENTER, RADIUS, start, end);
    ctx.closePath();
    ctx.fillStyle = team.color;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.stroke();

    ctx.save();
    ctx.translate(CENTER, CENTER);
    ctx.rotate(start + seg / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#fff";
    ctx.font = "700 20px 'Baloo 2', sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 4;
    ctx.fillText(team.name, RADIUS - 18, 7);
    ctx.restore();
  });
}

/* ---------- Spin ---------- */
async function spin() {
  if (spinning) return;
  const name = els.playerName.value.trim();
  if (!name) {
    showMessage("Please enter your name first!", false);
    els.playerName.focus();
    return;
  }

  spinning = true;
  els.spinBtn.disabled = true;
  showMessage("");

  let data;
  try {
    const res = await fetch("/api/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    data = await res.json();
    if (!res.ok) {
      showMessage(data.error || "Something went wrong.", false);
      resetSpinState();
      return;
    }
  } catch (err) {
    showMessage("Could not reach the server. Is it running?", false);
    resetSpinState();
    return;
  }

  animateToTeam(data.teamIndex, () => {
    showResult(data.name, data.team);
    if (els.totalCount) els.totalCount.textContent = data.total;
    resetSpinState();
    updateSlots(data.slotsRemaining); // final say: locks button if full
    els.playerName.value = "";
  });
}

function resetSpinState() {
  spinning = false;
  els.spinBtn.disabled = false;
}

/* Rotate the wheel so the given segment index lands under the top pointer.
 * We ALWAYS add several full forward turns on top of the current rotation,
 * so every spin is a clear, visible animation (never a jump). */
function animateToTeam(teamIndex, onDone) {
  const n = TEAMS.length;
  const segDeg = 360 / n;

  // Where the target segment currently sits (its centre offset from top).
  const targetSegmentAngle = teamIndex * segDeg;

  // Current angle within one turn (0..360), normalised to positive.
  const currentWithin = ((currentRotation % 360) + 360) % 360;

  // To bring the target segment to the top pointer, the wheel must end at
  // a multiple of 360 minus the segment's angle. Compute how much more we
  // need to rotate FORWARD from where we are now.
  const desiredWithin = (360 - targetSegmentAngle) % 360;
  let delta = desiredWithin - currentWithin;
  if (delta < 0) delta += 360;

  // Add 5 full turns for drama, plus the delta to land precisely.
  currentRotation += 5 * 360 + delta;

  canvas.style.transform = `rotate(${currentRotation}deg)`;

  // Reveal the result when the CSS transition ends (with a safety fallback).
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    canvas.removeEventListener("transitionend", finish);
    onDone();
  };
  canvas.addEventListener("transitionend", finish);
  clearTimeout(animateToTeam._t);
  animateToTeam._t = setTimeout(finish, 5200); // fallback (transition is 5s)
}

/* ---------- Result modal ---------- */
function showResult(name, team) {
  els.resultName.textContent = name;
  els.resultTeam.textContent = team.name;
  els.resultTeam.style.background = team.color;
  els.modalOverlay.classList.add("show");
  launchConfetti(team.color);
}

function closeModal() {
  els.modalOverlay.classList.remove("show");
}

/* ---------- Messages ---------- */
function showMessage(text, ok) {
  els.message.textContent = text;
  els.message.classList.toggle("ok", !!ok);
}

/* ---------- Confetti burst ---------- */
function launchConfetti(color) {
  const colors = ["#2563eb", "#16a34a", "#ea580c", "#dc2626", "#facc15", color];
  els.burst.innerHTML = "";
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("span");
    const c = colors[Math.floor(Math.random() * colors.length)];
    piece.style.cssText = `
      position:absolute; top:0; left:50%;
      width:8px; height:14px; background:${c};
      border-radius:2px;
      transform: translate(-50%,0);`;
    els.burst.appendChild(piece);
    const angle = Math.random() * 2 * Math.PI;
    const dist = 60 + Math.random() * 160;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist + 120;
    piece.animate(
      [
        { transform: "translate(-50%,0) rotate(0deg)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx}px), ${dy}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 1000 + Math.random() * 600, easing: "cubic-bezier(.15,.5,.5,1)", fill: "forwards" }
    );
  }
}

/* ---------- Background bubbles ---------- */
function makeBubbles() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 16; i++) {
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
els.spinBtn.addEventListener("click", spin);
els.playerName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") spin();
});
els.closeModal.addEventListener("click", closeModal);
els.modalOverlay.addEventListener("click", (e) => {
  if (e.target === els.modalOverlay) closeModal();
});

makeBubbles();
loadState();
