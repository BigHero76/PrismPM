# PRISM — AI-Powered Project Management Platform

PRISM is a dark-themed, AI-driven project management tool built for teams that want intelligent weekly simulations, predictive analytics, sprint tracking, and a full audit trail — all in a single React app.

---

## Features

**Dashboard**
- Portfolio-level KPIs: active projects, risk exposure, stories complete, budget utilisation, avg velocity, schedule impact
- Colour-coded project cards (green / amber / red border by status)
- AI Weekly Portfolio Summary generator
- Per-project delay badges and velocity indicators

**Project Detail**
- Sticky subtab navigation: Overview · Team · Analytics · Risks · AI Setup · Audit Log
- Execution timeline with week-by-week simulation
- Delay prediction banner (calculates projected overrun from actual velocity)
- AI Smart Weekly Summary bullets (tasks done, delays, risks) auto-generated after each simulated week

**AI Setup & Simulation**
- Upload a PDF or Word document, or paste raw requirements text
- AI generates Epics, Sprints, User Stories, Tasks, and Risks in one click (powered by Groq)
- Week-by-week simulation with a human review step before applying
- Burndown math enforced in code — remaining points always strictly decrease
- Requires PM + BA + minimum 2 additional team members before simulation unlocks

**Analytics (Interactive Charts)**
- Sprint Burndown chart with hover tooltips, ideal line, and red projection line for delays
- Sprint Velocity chart with paired target/actual bars, hover tooltips, and avg velocity line
- Interactive Gantt chart — click any epic row to expand individual story bars; sprint headers, current-week marker, delay extensions shown in red

**Team**
- Add and drop members per project from a shared employee roster
- Weekly activity breakdown per team member
- Compatibility scoring

**Risks**
- 5×5 heatmap (click cells to filter)
- Risk list with severity, mitigation, and owner
- Risks only surface after at least one week is simulated

**Manual Override Audit Log**
- Every manual edit to an AI-generated value is logged with original vs corrected value
- Scoped per project — no bleed between projects
- Cleared on every new login (fresh session = clean slate)
- Password-protected "Clear Log" button (`password`)

**Agile Board**
- Kanban board with drag-and-drop story status changes (logged to audit)
- Full sprint and epic management

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | React 18 (Vite) |
| Styling | Tailwind CSS |
| AI | Groq API (`llama3-8b-8192` / `mixtral`) |
| Charts | Custom SVG (no chart library dependency) |
| Persistence | localStorage |
| Build | Vite |

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Groq API key](https://console.groq.com) (free tier works fine)

### Clone & Install

```bash
git clone https://github.com/your-username/prism-pm.git
cd prism-pm
npm install
```

### Environment Setup

Create a `.env` file in the project root:

```bash
VITE_GROQ_API_KEY=your_groq_api_key_here
```

> You can also paste your Groq key directly in the app's AI Setup tab — it gets saved to localStorage and persists across sessions.

### Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

---

## Project Structure

```
prism-pm/
├── src/
│   └── App.jsx          # Entire application (single-file architecture)
├── public/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── package.json
└── .env                 # VITE_GROQ_API_KEY (not committed)
```

> PRISM uses a single-file architecture — all components, state, and logic live in `App.jsx`. This was an intentional choice for rapid iteration and demo purposes.

---

## How to Use

### 1. Login
Click the login button to start a fresh session. The audit log is wiped on each login.

### 2. Create a Project
Go to **Dashboard → + New Project** and fill in the project details.

### 3. Set Up with AI
Navigate into the project → **⚡ AI Setup** tab. Paste your requirements or upload a document, then click **Run AI Generator**. This creates Epics, Sprints, Stories, Tasks, and Risks automatically.

### 4. Build Your Team
Go to the **Team** tab and add members from the roster. You need at minimum:
- 1 PM
- 1 BA
- 2 additional team members

Simulation is blocked until this requirement is met.

### 5. Simulate Weeks
Back on **Overview**, click **Simulate Week**. The AI runs a weekly simulation, you review and optionally edit the results, then apply. Repeat each week.

### 6. Track Progress
- **Analytics** tab: burndown, velocity, and Gantt (hover/click for details)
- **Overview**: delay prediction banner and AI weekly summary
- **Risks** tab: heatmap and risk list (populated after simulation)
- **Audit Log**: full history of every manual override you made

---

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_GROQ_API_KEY` | Your Groq API key. Can also be set in-app via AI Setup tab. |

---

## Known Limitations

- Single-file architecture means the bundle is large; not optimised for production scale
- No backend — all state is localStorage (clears on browser data wipe)
- Groq free tier has rate limits; heavy simulation usage may hit them

---

## Audit Log Password

The Manual Override Audit Log clear button requires the password: **`password`**

(This is intentionally simple for demo purposes — swap it out before any real deployment.)

---

## License

MIT