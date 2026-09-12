# 🎡 SET Chennai Outing 2026 — Team Spin Wheel

A standalone Node.js web app that fairly separates 50+ participants into **4 House teams** —
**Blue House, Green House, Orange House, Red House** — using a colorful animated spin wheel.

Each person enters their name and spins. The result is displayed with a celebration, and a
live dashboard shows every team's roster so you can organize people at the venue.

## ✨ Features

- Colorful, attractive GUI with animated spin wheel, confetti, and floating background.
- **Guaranteed equal split** — the server assigns each spinner to the team with the fewest
  members, so all 4 teams stay within 1 person of each other (works for 50, 52, 53… any count).
- Captures the **name of each spinner** and which team they joined.
- Live team dashboard with member chips and counts.
- Prevents the same name being assigned twice.
- **Undo last** and **Reset all** controls for the host.
- Data is saved to `data/assignments.json`, so it survives a server restart.

## 🚀 How to run

You need [Node.js](https://nodejs.org/) (v16 or newer) installed.

```bash
# 1. Go into the project folder
cd SpinWheel

# 2. Install dependencies (one time)
npm install

# 3. Start the app
npm start
```

Then open your browser at:

```
http://localhost:3000
```

To let others on the **same Wi-Fi/LAN** use it (e.g. on a projector or their phones),
share your machine's local IP, for example `http://192.168.1.25:3000`.

## 🕹️ How to use at the event

1. Each participant types their name and clicks **SPIN THE WHEEL**.
2. The wheel spins and lands on their assigned House.
3. A popup congratulates **that person only** and shows their team.
4. Participants do **not** see the full team rosters — only the host does.

### Two separate pages

| Page | URL | Who uses it | Shows |
|------|-----|-------------|-------|
| **Viewer** | `http://localhost:3000/` | Participants / projector | Only the spin wheel + each spinner's own result |
| **Admin**  | `http://localhost:3000/admin` | Host only (password) | All team rosters, counts, Undo/Reset |

The admin page is **password protected**. Default password: `setchennai2026`.
Change it by editing `ADMIN_PASSWORD` in `server.js`, or set an environment
variable before starting:

```bash
# Windows (cmd)
set ADMIN_PASSWORD=mySecret && npm start

# macOS/Linux
ADMIN_PASSWORD=mySecret npm start
```

Host controls (on the admin dashboard):
- **🔄 Refresh** — reload the rosters (also auto-refreshes every 4s).
- **↩ Undo last** — removes the most recent assignment (e.g. a typo).
- **⟳ Reset all** — clears everything for a fresh run.
- **🔒 Logout** — locks the dashboard again.

At the end of the event, the host reads out each House roster from the admin
page to group people at the venue.

## 🎨 Customizing teams

Edit the `TEAMS` array in `server.js` to rename teams, change colors, or add/remove teams.
The wheel and dashboard update automatically to match.

```js
const TEAMS = [
  { id: "blue",   name: "Blue House",   color: "#2563eb" },
  { id: "green",  name: "Green House",  color: "#16a34a" },
  { id: "orange", name: "Orange House", color: "#ea580c" },
  { id: "red",    name: "Red House",    color: "#dc2626" },
];
```

## 📁 Project structure

```
SpinWheel/
├── package.json          # dependencies & start script
├── server.js             # Express server + equal-balancing logic + API
├── data/
│   └── assignments.json  # auto-created; stores who is on which team
└── public/
    ├── index.html        # viewer page (wheel only)
    ├── admin.html        # admin dashboard (password protected)
    ├── styles.css         # colorful styling
    ├── app.js             # viewer: wheel drawing, spin animation
    └── admin.js           # admin: login, rosters, undo/reset
```

## 🔌 API (for reference)

| Method | Endpoint             | Auth  | Purpose                                        |
|--------|----------------------|-------|------------------------------------------------|
| GET    | `/api/public-state`  | none  | Teams config + total spins only (no roster)    |
| POST   | `/api/spin`          | none  | Body `{ "name": "..." }` → assigns a team       |
| POST   | `/api/login`         | none  | Body `{ "password": "..." }` → returns a token  |
| POST   | `/api/logout`        | admin | Ends the admin session                         |
| GET    | `/api/admin-state`   | admin | Teams, counts, and full roster                 |
| POST   | `/api/undo`          | admin | Remove the last assignment                     |
| POST   | `/api/reset`         | admin | Clear all assignments                          |

Admin endpoints require an `Authorization: Bearer <token>` header obtained from `/api/login`.

Enjoy the outing! 🎉
