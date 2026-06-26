# 🧠 PRISM — AI-Powered Project Management Platform

> **Simulate. Predict. Deliver.**
> PRISM is a dark-themed, AI-driven project management platform built for teams that want intelligent weekly simulations, predictive analytics, sprint tracking, and a full manual override audit trail — all in a single React app.

---

## 📸 Overview

PRISM combines the structure of tools like Jira and ClickUp with on-demand AI intelligence. Instead of just tracking work, it **simulates** it — letting you run week-by-week AI projections, catch delays before they happen, and review every AI decision before it's applied.

---

## ✨ Features

### 🏠 Dashboard
- Portfolio-level KPI strip: active projects, risk exposure, stories complete, budget utilisation, avg velocity, schedule impact
- Colour-coded project cards with left-border status indicators (🟡 On Track · 🟠 At Risk · 🔴 Delayed)
- Per-project delay badges and live velocity indicators
- AI Weekly Portfolio Summary — one-click summary across all projects

### 📁 Project Detail
- Sticky subtab navigation: Overview · Team · Analytics · Risks · ⚡ AI Setup · Audit Log
- Week-by-week execution timeline
- **Delay prediction banner** — calculates projected overrun from actual velocity vs planned weeks
- **AI Smart Weekly Summary** — auto-generated bullets covering tasks completed, delays flagged, and risks triggered

### 🤖 AI Setup & Simulation
- Upload a PDF/Word doc or paste raw requirements text
- AI generates Epics, Sprints, User Stories, Tasks, and Risks in one click
- Week-by-week simulation with a **human review step** before anything is applied
- Burndown math enforced in code — remaining points always strictly decrease, no AI hallucination
- Simulation is locked until the team meets the minimum composition requirement (see Team section)

### 📊 Analytics (Interactive Charts)
- **Sprint Burndown** — hover dots for tooltips, ideal line, red dashed projection line showing predicted overrun
- **Sprint Velocity** — paired target/actual bars, hover tooltips per week, avg velocity reference line
- **Interactive Gantt** — click any epic row to expand individual story bars; sprint name headers, current-week marker, delay extensions in red

### 👥 Team Management
- Add/drop members per project from a shared employee roster
- Weekly activity breakdown per team member
- Team compatibility scoring
- Simulation locked until: **PM + BA + at least 2 additional members** are assigned (minimum 4 total)

### ⚠️ Risk Tracking
- 5×5 risk heatmap (click any cell to filter by impact/probability)
- Risk list with severity, mitigation strategy, and owner
- Risks only surface after at least one week has been simulated — no phantom risks on a fresh project

### 📋 Manual Override Audit Log
- Every manual edit to an AI-generated value is logged: entity, field, original value vs corrected value, timestamp
- Scoped per project — edits in one project never bleed into another
- Wiped clean on every new login (fresh session = clean slate)
- Password-protected **Clear Log** button for deliberate resets
- Captures: budget edits, Kanban drag-and-drop moves, sim review field edits, risk updates

### 🗂️ Agile Board
- Kanban board with drag-and-drop story status changes (all moves logged to audit)
- Full sprint and epic management
- Story detail modal with points, assignee, status, and description

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Framework | React 18 (Vite) |
| Styling | Tailwind CSS |
| Primary AI | Groq API (`llama3-8b-8192`) |
| Fallback AI | Mistral AI (`mistral-small-latest`, `open-mistral-7b`) |
| Charts | Custom SVG (zero chart library dependencies) |
| Persistence | localStorage |
| Build tool | Vite |

---

## 🤖 AI Provider Architecture

PRISM uses a **dual-provider AI setup** with automatic fallback:

```
Request → Groq (primary)
              ↓ rate limit / token exhaustion / error
         Mistral AI (fallback)
              ↓ also fails
         Error surfaced to user
```

### How it works
- **Groq** is tried first for all AI calls (BRD generation, weekly simulation, team suggestions, portfolio summary)
- If Groq hits a rate limit or exhausts tokens, **Mistral AI takes over automatically** — no user action needed
- Mistral cycles through `mistral-small-latest` → `open-mistral-7b` as further fallback models

### Key point — neither key is required
- ✅ **Groq only** — works fine, Mistral fallback simply won't activate
- ✅ **Mistral only** — works as a standalone, Groq calls are skipped
- ✅ **Both keys** — full redundancy, automatic failover
- ❌ **Neither** — AI features disabled, rest of the app works normally

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- At least one of:
  - [Groq API key](https://console.groq.com) (free tier available)
  - [Mistral AI key](https://console.mistral.ai) (free tier available)

---

### 1. Clone the repo

```bash
git clone https://github.com/your-username/prism-pm.git
cd prism-pm
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env` file in the project root:

```env
# At least one of these is needed for AI features.
# Both can be set for full redundancy.

VITE_GROQ_API_KEY=your_groq_api_key_here
VITE_MISTRAL_API_KEY=your_mistral_api_key_here
```

> 💡 **You can also skip the `.env` entirely** and paste your API key(s) directly in the app's **⚡ AI Setup** tab. Keys entered there are saved to localStorage and persist across sessions.

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 5. Build for production

```bash
npm run build
npm run preview
```

---

## 📂 Project Structure

```
prism-pm/
├── src/
│   └── App.jsx           # Entire application — all components, state, and logic
├── public/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── package.json
├── .env                  
└── .env.example          # Template for contributors
```

> **Single-file architecture** — all components live in `App.jsx`. This was an intentional choice for rapid iteration and demo purposes. The component tree is structured with clear section comments throughout the file.

---

## 🧭 How to Use

### Step 1 — Login
Click the login button to start a fresh session. The audit log is wiped on login so each session starts clean.

### Step 2 — Create a Project
**Dashboard → + New Project**. Fill in name, client, PM, type, and planned duration.

### Step 3 — Set Up with AI
Go into the project → **⚡ AI Setup** tab. Paste requirements text or upload a document, then click **Run AI Generator**. This auto-creates Epics, Sprints, Stories, Tasks, and Risks for the project.

### Step 4 — Build Your Team
Go to the **Team** tab. Add members from the shared roster. The minimum required to unlock simulation is:

```
✅ 1 × PM
✅ 1 × BA
✅ 2 × any other role
─────────────────
   4 members minimum
```

### Step 5 — Simulate Weeks
On the **Overview** tab, click **▶ Simulate Week**. The AI generates a full weekly update. You review and optionally edit every field in the review modal, then click **Accept & Apply**.

### Step 6 — Track & Analyse
- 📈 **Analytics** — burndown, velocity, Gantt (hover/click for details)
- 🔴 **Overview** — delay prediction + AI weekly summary bullets
- ⚠️ **Risks** — heatmap and risk list (populated post-simulation)
- 🗒️ **Audit Log** — every manual override recorded with before/after values

---

## 🔐 Audit Log

The Manual Override Audit Log clear button is password-protected.

**Password: `password`**

> ⚠️ This is intentionally simple for demo purposes. Replace it with a proper auth check before any production deployment.

---

## ⚙️ Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `VITE_GROQ_API_KEY` | Optional | Groq API key. Used as primary AI provider. |
| `VITE_MISTRAL_API_KEY` | Optional | Mistral AI key. Used as fallback when Groq fails or is absent. |

At least one key is needed for AI features. Both can be set for full redundancy.

---

## ⚠️ Known Limitations

- **Single-file bundle** — `App.jsx` is large by design; not split into lazy-loaded chunks
- **No backend** — all state lives in localStorage; clears on browser data wipe
- **Groq free tier rate limits** — heavy simulation usage may hit limits; Mistral fallback handles this automatically
- **Audit password** — hardcoded for demo; swap before real deployment

---

## 📄 License

MIT — free to use, modify, and distribute.