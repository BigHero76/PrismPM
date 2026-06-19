import { useState, useEffect, useRef } from "react";

const EY = {
  yellow: "#FFE600",
  black: "#000000",
  white: "#FFFFFF",
  darkGray: "#2E2E2E",
  lightGray: "#E5E5E5",
};

// ─── Groq API Helper ────────────────────────────────────────────────────────
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

async function callGroq(prompt, systemPrompt = "", apiKey = "") {
  const key = apiKey || localStorage.getItem("prismpm.groqApiKey") || import.meta.env.VITE_GROQ_API_KEY || "";
  if (!key) {
    throw new Error("Groq API key is missing. Add it in the BRD Generator panel.");
  }

  let lastError = null;

  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt || "You are an expert project management AI assistant. Always respond with valid JSON only, no markdown, no extra text." },
              { role: "user", content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 4000,
            response_format: {
              type: "json_object",
            },
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) {
        const message = data.error?.message || data.message || `Groq request failed (${response.status})`;
        lastError = new Error(message);
        const modelIssue = /deprecated|not have access|no access|model|unavailable|not found|unsupported/i.test(message);
        if (modelIssue && model !== GROQ_MODELS[GROQ_MODELS.length - 1]) {
          continue;
        }
        throw lastError;
      }

      const text = data.choices?.[0]?.message?.content || "";
      const clean = text.replace(/```json|```/g, "").trim();
      try {
        return JSON.parse(clean);
      } catch {
        return { raw: text };
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error("Groq request failed.");
}

// ─── Seed Data ──────────────────────────────────────────────────────────────
const INITIAL_PROJECTS = [
  {
    id: 1, name: "FinanceFlow Overhaul", client: "NexaBank Ltd", clientStars: 5,
    pm: "Sarah Chen", ba: "Marcus Webb", type: "Enterprise Banking",
    status: "On Track", progress: 0, plannedDays: 120, elapsed: 0,
    description: "Core banking system modernisation with API-first architecture.",
    budget: 280000, spent: 0,
    team: [
      { name: "Sarah Chen", role: "PM", skillStars: 5, specialty: "Fintech" },
      { name: "Marcus Webb", role: "BA", skillStars: 4, specialty: "Banking" }
    ],
    weeklyLogs: []
  },
  {
    id: 2, name: "RetailPulse Mobile", client: "Zephyr Retail Group", clientStars: 3,
    pm: "James Okonkwo", ba: "Priya Sharma", type: "Mobile App",
    status: "On Track", progress: 0, plannedDays: 90, elapsed: 0,
    description: "Customer-facing loyalty & shopping mobile app for iOS and Android.",
    budget: 95000, spent: 0,
    team: [
      { name: "James Okonkwo", role: "PM", skillStars: 4, specialty: "Mobile Apps" },
      { name: "Priya Sharma", role: "BA", skillStars: 4, specialty: "Retail" }
    ],
    weeklyLogs: []
  },
  {
    id: 3, name: "HealthHub Platform", client: "MedCore Solutions", clientStars: 4,
    pm: "Sarah Chen", ba: "Elena Volkov", type: "Healthcare SaaS",
    status: "On Track", progress: 0, plannedDays: 150, elapsed: 0,
    description: "Telehealth and patient management SaaS platform with HL7 FHIR compliance.",
    budget: 420000, spent: 0,
    team: [
      { name: "Sarah Chen", role: "PM", skillStars: 5, specialty: "Healthcare" },
      { name: "Elena Volkov", role: "BA", skillStars: 5, specialty: "Healthcare" }
    ],
    weeklyLogs: []
  },
];

const INITIAL_EPICS = [];
const INITIAL_STORIES = [];
const INITIAL_SPRINTS = [];
const INITIAL_TASKS = [];
const INITIAL_RISKS = [];

const INITIAL_TEAM_MEMBERS = [
  { name: "Sarah Chen", role: "PM", skillStars: 5, specialty: "Fintech / Healthcare IT", projects: 2, available: false },
  { name: "James Okonkwo", role: "PM", skillStars: 4, specialty: "Mobile / Consumer Apps", projects: 1, available: true },
  { name: "Maya Singh", role: "PM", skillStars: 5, specialty: "ERP / Operations", projects: 3, available: true },
  { name: "Omar Khalid", role: "PM", skillStars: 4, specialty: "Cloud / Data Delivery", projects: 2, available: true },
  { name: "Nadia Rahman", role: "PM", skillStars: 5, specialty: "Transformation / PMO", projects: 2, available: true },
  { name: "Marcus Webb", role: "BA", skillStars: 4, specialty: "Banking / ERP", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Priya Sharma", role: "BA", skillStars: 4, specialty: "Retail / eCommerce", projects: 1, available: true, assignedPm: "James Okonkwo" },
  { name: "Elena Volkov", role: "BA", skillStars: 5, specialty: "Healthcare / HL7", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Dev Patel", role: "Lead Dev", skillStars: 5, specialty: "APIs / Cloud", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Raj Mehta", role: "Lead Dev", skillStars: 4, specialty: "Healthcare APIs", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Mei Lin", role: "iOS Dev", skillStars: 5, specialty: "Swift / iOS", projects: 1, available: false, assignedPm: "James Okonkwo" },
  { name: "Tunde Adeyemi", role: "Android Dev", skillStars: 3, specialty: "Kotlin", projects: 1, available: true, assignedPm: "James Okonkwo" },
  { name: "Aisha Omar", role: "QA", skillStars: 3, specialty: "Manual / Healthcare", projects: 2, available: false, assignedPm: "Sarah Chen" },
  { name: "Luca Rossi", role: "Architect", skillStars: 4, specialty: "Cloud / AWS", projects: 1, available: true, assignedPm: "Omar Khalid" },
  { name: "Hana Kobayashi", role: "Backend Dev", skillStars: 5, specialty: "Node.js / Microservices", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Carlos Mendes", role: "Backend Dev", skillStars: 4, specialty: "Java / Spring Boot", projects: 2, available: true },
  { name: "Freya Lindqvist", role: "Frontend Dev", skillStars: 5, specialty: "React / Design Systems", projects: 1, available: false, assignedPm: "James Okonkwo" },
  { name: "Ibrahim Toure", role: "Frontend Dev", skillStars: 3, specialty: "Vue / Accessibility", projects: 1, available: true },
  { name: "Olivia Bennett", role: "DevOps Engineer", skillStars: 4, specialty: "CI/CD / Kubernetes", projects: 2, available: true },
  { name: "Yusuf Demir", role: "DevOps Engineer", skillStars: 5, specialty: "AWS / Terraform", projects: 1, available: false, assignedPm: "Omar Khalid" },
  { name: "Grace Mwangi", role: "Data Scientist", skillStars: 5, specialty: "Predictive Analytics / ML", projects: 1, available: true },
  { name: "Tomás Fernández", role: "Data Scientist", skillStars: 4, specialty: "NLP / Forecasting", projects: 1, available: false, assignedPm: "Nadia Rahman" },
  { name: "Sophie Laurent", role: "UX Designer", skillStars: 5, specialty: "Research / Prototyping", projects: 2, available: true },
  { name: "Kenji Watanabe", role: "UX Designer", skillStars: 4, specialty: "Mobile UX / Usability", projects: 1, available: false, assignedPm: "James Okonkwo" },
  { name: "Adaeze Nwosu", role: "Security Engineer", skillStars: 5, specialty: "AppSec / Pen Testing", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Viktor Petrov", role: "Security Engineer", skillStars: 4, specialty: "Compliance / SOC2", projects: 2, available: true },
  { name: "Layla Haddad", role: "Scrum Master", skillStars: 4, specialty: "Agile Coaching / SAFe", projects: 3, available: true },
  { name: "Connor Murphy", role: "QA Automation", skillStars: 4, specialty: "Selenium / Cypress", projects: 1, available: true },
  { name: "Pranav Iyer", role: "Database Admin", skillStars: 5, specialty: "PostgreSQL / Performance Tuning", projects: 2, available: false, assignedPm: "Maya Singh" },
  { name: "Naledi Dlamini", role: "Technical Writer", skillStars: 3, specialty: "API Docs / BRDs", projects: 1, available: true },
];

const PM_STORAGE_KEY = "prismpm.team";

// ─── Utility Components ──────────────────────────────────────────────────────
const Stars = ({ count, max = 5, size = "sm", color = "amber" }) => {
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-xl" };
  const colors = { amber: "text-[#FFE600]", indigo: "text-[#E5E5E5]", emerald: "text-[#FFFFFF]" };
  return (
    <span className={`${sizes[size]} ${colors[color]}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < count ? "" : "opacity-20"}>★</span>
      ))}
    </span>
  );
};

const StatusBadge = ({ status }) => {
  const map = {
    "On Track": "bg-[#FFE600]/15 text-[#FFE600] border-[#FFE600]/30",
    "At Risk": "bg-[#2E2E2E] text-[#E5E5E5] border-[#E5E5E5]/30",
    "Behind": "bg-[#000000] text-[#FFFFFF] border-[#E5E5E5]/20",
    "Done": "bg-[#FFE600] text-[#000000] border-[#FFE600]/40",
    "In Progress": "bg-[#FFE600]/20 text-[#FFE600] border-[#FFE600]/40",
    "Not Started": "bg-[#2E2E2E] text-[#E5E5E5] border-[#E5E5E5]/20",
    "Delayed": "bg-[#FFE600]/10 text-[#FFE600] border-[#FFE600]/20",
    "Blocked": "bg-[#000000] text-[#FFE600] border-[#FFE600]/40",
    "Backlog": "bg-[#2E2E2E] text-slate-400 border-slate-700",
    "To Do": "bg-slate-800 text-slate-200 border-slate-700",
    "Review": "bg-amber-950/40 text-amber-300 border-amber-800/30",
    "Testing": "bg-indigo-950/40 text-indigo-300 border-indigo-800/30",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-medium transition-all ${map[status] || map["Not Started"]}`}>
      {status}
    </span>
  );
};

const RiskBadge = ({ severity }) => {
  const map = {
    Critical: "bg-[#FFE600] text-[#000000] border-[#FFE600]/40",
    High: "bg-[#2E2E2E] text-[#FFFFFF] border-[#E5E5E5]/30",
    Medium: "bg-[#2E2E2E] text-[#E5E5E5] border-[#E5E5E5]/30",
    Low: "bg-[#000000] text-[#FFE600] border-[#FFE600]/30",
  };
  return <span className={`px-2 py-0.5 rounded border text-xs font-mono font-bold ${map[severity] || map.Medium}`}>{severity}</span>;
};

const ProgressBar = ({ value, color = "indigo" }) => {
  const colors = {
    indigo: "bg-[#FFE600]", emerald: "bg-[#FFFFFF]",
    amber: "bg-[#E5E5E5]", rose: "bg-[#2E2E2E]",
  };
  const barColor = value >= 70 ? colors.indigo : value >= 40 ? colors.amber : colors.rose;
  return (
    <div className="w-full bg-[#2E2E2E] rounded-full h-2 overflow-hidden border border-[#E5E5E5]/10">
      <div
        className={`h-2 rounded-full transition-all duration-700 ${barColor}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
};

const Spinner = () => (
  <div className="flex items-center gap-2 text-[#FFE600] text-sm py-2">
    <div className="w-4 h-4 border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
    AI is thinking...
  </div>
);

const PulseRing = ({ progress, status, size = 80 }) => {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const dash = (progress / 100) * circ;
  const statusColor = status === "On Track" ? EY.yellow : status === "At Risk" ? EY.lightGray : EY.white;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={EY.darkGray} strokeWidth="6" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={statusColor} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        strokeDashoffset={circ * 0.25}
        style={{ filter: `drop-shadow(0 0 6px ${statusColor})` }}
      />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle"
        fill={statusColor} fontSize={size * 0.22} fontFamily="JetBrains Mono, monospace" fontWeight="bold">
        {Math.round(progress)}%
      </text>
    </svg>
  );
};

// ─── Team Compatibility Calculations ─────────────────────────────────────────
const scoreMember = (member) => {
  const baseScore = (member.skillStars || 0) * 20;
  const workloadAdjustment = Math.max(0, 12 - ((member.projects || 0) * 4));
  const availabilityBonus = member.available ? 8 : 0;
  return Math.max(0, Math.min(100, Math.round(baseScore + workloadAdjustment + availabilityBonus)));
};

const calculateCompatibility = (member, projectManager) => {
  const sharedKeywords = ["healthcare", "fintech", "banking", "mobile", "retail", "cloud", "data", "erp", "api", "apis", "security", "compliance", "operations"];
  const memberText = `${member.role} ${member.specialty}`.toLowerCase();
  const pmText = `${projectManager.name} ${projectManager.specialty}`.toLowerCase();
  const sharedCount = sharedKeywords.filter(keyword => memberText.includes(keyword) && pmText.includes(keyword)).length;
  const specialtyBonus = sharedCount * 14;
  const skillBonus = (member.skillStars || 0) * 6;
  const roleBonus = member.role === "BA" ? 6 : member.role === "Lead Dev" ? 8 : member.role.includes("Dev") ? 7 : 4;
  const experienceBonus = Math.max(0, 8 - ((member.projects || 0) * 2));
  return Math.max(0, Math.min(100, Math.round(35 + specialtyBonus + skillBonus + roleBonus + experienceBonus)));
};

const updateProjectCompatibility = (team, pmName, roster) => {
  const pmInRoster = roster.find(e => e.role === "PM" && e.name === pmName);
  if (!pmInRoster || !team || team.length === 0) {
    return 50;
  }
  const teamMembersToScore = team.filter(m => m.name !== pmName);
  if (teamMembersToScore.length === 0) return 100;
  const totalCompat = teamMembersToScore.reduce((sum, member) => {
    const rosterMember = roster.find(e => e.name === member.name && e.role === member.role) || member;
    return sum + calculateCompatibility(rosterMember, pmInRoster);
  }, 0);
  return Math.round(totalCompat / teamMembersToScore.length);
};

const mergeTeamRoster = (storedTeam) => {
  const baseRoster = Array.isArray(storedTeam) ? storedTeam : [];
  const rosterIndex = new Map(baseRoster.map(member => [`${member.name}::${member.role}`, member]));
  for (const seedMember of INITIAL_TEAM_MEMBERS) {
    const key = `${seedMember.name}::${seedMember.role}`;
    if (!rosterIndex.has(key)) {
      baseRoster.push(seedMember);
    }
  }
  return baseRoster.length > 0 ? baseRoster : INITIAL_TEAM_MEMBERS;
};

// ─── Login Page Component ────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    setError("");
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      if (username === "admin" && password === "admin") {
        onLogin();
      } else {
        setError("Invalid credentials. Try admin / admin.");
        setLoading(false);
      }
    }, 600);
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div style={{ position: "absolute", top: "-10%", left: "-10%", width: "50%", height: "50%", background: "radial-gradient(circle, rgba(255,230,0,0.08) 0%, transparent 70%)" }} />
        <div style={{ position: "absolute", bottom: "-10%", right: "-10%", width: "40%", height: "40%", background: "radial-gradient(circle, rgba(255,230,0,0.05) 0%, transparent 70%)" }} />
      </div>

      <div className="relative z-10 w-full max-w-sm mx-auto px-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="font-bold text-4xl text-[#FFE600] tracking-tight mb-1" style={{ fontFamily: "Syne, sans-serif" }}>
            PRISM<span className="text-white font-medium">PM</span>
          </div>
          <div className="text-[10px] text-slate-500 tracking-widest uppercase">AI Project Intelligence Platform</div>
        </div>

        {/* Card */}
        <div className="bg-[#111] border border-white/10 rounded-2xl p-8 space-y-5 shadow-2xl">
          <h2 className="text-white font-bold text-sm uppercase tracking-widest">Sign In</h2>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="admin"
              autoComplete="username"
              className="w-full bg-black border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFE600]/60 transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              placeholder="••••••"
              autoComplete="current-password"
              className="w-full bg-black border border-white/15 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#FFE600]/60 transition-all"
            />
          </div>

          {error && (
            <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-2.5 bg-[#FFE600] text-black font-bold text-xs uppercase tracking-widest rounded-xl hover:bg-white transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Authenticating..." : "Sign In →"}
          </button>
        </div>

        <div className="text-center mt-6 text-[10px] text-slate-600">
          PRISM Intelligence · Secure Workspace
        </div>
      </div>
    </div>
  );
}

// ─── Main App Component ──────────────────────────────────────────────────────
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const [tab, setTab] = useState("dashboard");
  const [activeProjectId, setActiveProjectId] = useState(1);
  const [selectedProject, setSelectedProject] = useState(null);

  // States with Local Storage Support
  const [projects, setProjects] = useState(() => {
    try {
      const stored = localStorage.getItem("prismpm.projects");
      return stored ? JSON.parse(stored) : INITIAL_PROJECTS;
    } catch { return INITIAL_PROJECTS; }
  });

  const [epics, setEpics] = useState(() => {
    try {
      const stored = localStorage.getItem("prismpm.epics");
      return stored ? JSON.parse(stored) : INITIAL_EPICS;
    } catch { return INITIAL_EPICS; }
  });

  const [stories, setStories] = useState(() => {
    try {
      const stored = localStorage.getItem("prismpm.stories");
      return stored ? JSON.parse(stored) : INITIAL_STORIES;
    } catch { return INITIAL_STORIES; }
  });

  const [sprints, setSprints] = useState(() => {
    try {
      const stored = localStorage.getItem("prismpm.sprints");
      return stored ? JSON.parse(stored) : INITIAL_SPRINTS;
    } catch { return INITIAL_SPRINTS; }
  });

  const [tasks, setTasks] = useState(() => {
    try {
      const stored = localStorage.getItem("prismpm.tasks");
      return stored ? JSON.parse(stored) : INITIAL_TASKS;
    } catch { return INITIAL_TASKS; }
  });

  const [risks, setRisks] = useState(() => {
    try {
      const stored = localStorage.getItem("prismpm.risks");
      return stored ? JSON.parse(stored) : INITIAL_RISKS;
    } catch { return INITIAL_RISKS; }
  });

  const [employees, setEmployees] = useState(() => {
    try {
      const stored = localStorage.getItem(PM_STORAGE_KEY);
      return stored ? mergeTeamRoster(JSON.parse(stored)) : INITIAL_TEAM_MEMBERS;
    } catch { return INITIAL_TEAM_MEMBERS; }
  });

  const [notifications, setNotifications] = useState(() => {
    try {
      const stored = localStorage.getItem("prismpm.notifications");
      return stored ? JSON.parse(stored) : [
        { id: 1, message: "PRISM Intelligence online.", timestamp: new Date().toISOString(), type: "system", read: false },
        { id: 2, message: "Setup completed successfully.", timestamp: new Date().toISOString(), type: "info", read: false }
      ];
    } catch { return []; }
  });

  // UI state variables
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [storyDetailModal, setStoryDetailModal] = useState(null);

  // Sync to local storage
  useEffect(() => { try { localStorage.setItem("prismpm.projects", JSON.stringify(projects)); } catch {} }, [projects]);
  useEffect(() => { try { localStorage.setItem("prismpm.epics", JSON.stringify(epics)); } catch {} }, [epics]);
  useEffect(() => { try { localStorage.setItem("prismpm.stories", JSON.stringify(stories)); } catch {} }, [stories]);
  useEffect(() => { try { localStorage.setItem("prismpm.sprints", JSON.stringify(sprints)); } catch {} }, [sprints]);
  useEffect(() => { try { localStorage.setItem("prismpm.tasks", JSON.stringify(tasks)); } catch {} }, [tasks]);
  useEffect(() => { try { localStorage.setItem("prismpm.risks", JSON.stringify(risks)); } catch {} }, [risks]);
  useEffect(() => { try { localStorage.setItem(PM_STORAGE_KEY, JSON.stringify(employees)); } catch {} }, [employees]);
  useEffect(() => { try { localStorage.setItem("prismpm.notifications", JSON.stringify(notifications)); } catch {} }, [notifications]);

  // Logging notification helper
  const addNotification = (message, type = "info") => {
    const newNotif = {
      id: Date.now() + Math.random(),
      message,
      timestamp: new Date().toISOString(),
      type,
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const currentProject = projects.find(p => p.id === activeProjectId) || projects[0] || null;

  // Recalculating project progress based on completed Story Points
  useEffect(() => {
    if (!projects.length) return;
    const nextProjects = projects.map(p => {
      const projStories = stories.filter(s => s.projectId === p.id);
      if (projStories.length === 0) return { ...p, progress: 0 };
      const donePoints = projStories.filter(s => s.status === "Done").reduce((sum, s) => sum + (Number(s.points) || 0), 0);
      const totalPoints = projStories.reduce((sum, s) => sum + (Number(s.points) || 0), 0);
      const calculatedProgress = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;
      if (p.progress !== calculatedProgress) {
        return { ...p, progress: calculatedProgress };
      }
      return p;
    });
    const changed = JSON.stringify(projects) !== JSON.stringify(nextProjects);
    if (changed) {
      setProjects(nextProjects);
    }
  }, [stories]);

  // Recalculating epic progress based on completed Story Points inside the epic
  useEffect(() => {
    if (!epics.length) return;
    const nextEpics = epics.map(ep => {
      const epicStories = stories.filter(s => s.epicId === ep.id);
      if (epicStories.length === 0) return { ...ep, progress: 0 };
      const donePoints = epicStories.filter(s => s.status === "Done").reduce((sum, s) => sum + (Number(s.points) || 0), 0);
      const totalPoints = epicStories.reduce((sum, s) => sum + (Number(s.points) || 0), 0);
      const calculatedProgress = totalPoints > 0 ? Math.round((donePoints / totalPoints) * 100) : 0;
      if (ep.progress !== calculatedProgress) {
        return { ...ep, progress: calculatedProgress };
      }
      return ep;
    });
    const changed = JSON.stringify(epics) !== JSON.stringify(nextEpics);
    if (changed) {
      setEpics(nextEpics);
    }
  }, [stories]);

  // Project handling functions
  const handleSelectProject = (p) => {
    setActiveProjectId(p.id);
    setSelectedProject(p);
    setTab("project");
  };

  const handleCreateProject = (project) => {
    const nextEmployees = employees.map(e => {
      const isInitialMember = project.team.some(m => m.name === e.name && m.role === e.role);
      if (isInitialMember) {
        return { ...e, projects: (e.projects || 0) + 1, available: false };
      }
      return e;
    });
    setEmployees(nextEmployees);

    const compatibilityScore = updateProjectCompatibility(project.team, project.pm, nextEmployees);
    const updatedProject = { ...project, compatibilityScore };
    setProjects(current => [updatedProject, ...current]);
    addNotification(`Project "${project.name}" has been created.`, "system");
  };

  const handleAddMemberToProject = (member, projectId) => {
    const nextEmployees = employees.map(e => {
      if (e.name === member.name && e.role === member.role) {
        return { ...e, projects: (e.projects || 0) + 1, available: false };
      }
      return e;
    });
    setEmployees(nextEmployees);

    setProjects(current => current.map(p => {
      if (p.id !== projectId) return p;
      if (p.team.some(m => m.name === member.name && m.role === member.role)) return p;
      const newTeam = [...p.team, {
        name: member.name, role: member.role, skillStars: member.skillStars, specialty: member.specialty
      }];
      return { ...p, team: newTeam, compatibilityScore: updateProjectCompatibility(newTeam, p.pm, nextEmployees) };
    }));
    addNotification(`Assigned ${member.name} (${member.role}) to Project ID ${projectId}.`, "assignment");
  };

  const handleDropMemberFromProject = (member, projectId) => {
    const nextEmployees = employees.map(e => {
      if (e.name === member.name && e.role === member.role) {
        const nextCount = Math.max(0, (e.projects || 0) - 1);
        return { ...e, projects: nextCount, available: nextCount === 0 };
      }
      return e;
    });
    setEmployees(nextEmployees);

    setProjects(current => current.map(p => {
      if (p.id !== projectId) return p;
      const newTeam = p.team.filter(m => !(m.name === member.name && m.role === member.role));
      return { ...p, team: newTeam, compatibilityScore: updateProjectCompatibility(newTeam, p.pm, nextEmployees) };
    }));
    addNotification(`Dropped ${member.name} from Project ID ${projectId}.`, "system");
  };

  const handleDeleteProject = (projectId) => {
    const projectToDelete = projects.find(p => p.id === projectId);
    if (projectToDelete && projectToDelete.team) {
      setEmployees(current => current.map(e => {
        const isAllocated = projectToDelete.team.some(m => m.name === e.name && m.role === e.role);
        if (isAllocated) {
          const nextCount = Math.max(0, (e.projects || 0) - 1);
          return { ...e, projects: nextCount, available: nextCount === 0 };
        }
        return e;
      }));
    }
    setProjects(current => current.filter(p => p.id !== projectId));
    setStories(current => current.filter(s => s.projectId !== projectId));
    setEpics(current => current.filter(ep => ep.projectId !== projectId));
    setSprints(current => current.filter(sp => sp.projectId !== projectId));
    setRisks(current => current.filter(r => r.projectId !== projectId));
    addNotification(`Deleted project with ID: ${projectId}.`, "system");
    if (selectedProject?.id === projectId) {
      setSelectedProject(null);
    }
    setTab("dashboard");
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "◈" },
    { id: "agile", label: "Agile Board", icon: "📋" },
    { id: "team", label: "Team Directory", icon: "◆" },
    { id: "brd", label: "BRD Generator", icon: "✦" },
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-[#FFFFFF]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #FFE600; color: #000000; }
        ::-webkit-scrollbar { width: 6px; height: 6px; } 
        ::-webkit-scrollbar-track { background: #000000; } 
        ::-webkit-scrollbar-thumb { background: #FFE600; border-radius: 3px; }
        .animate-spin { animation: spin 1s linear infinite; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        select option { background: #2E2E2E; color: #FFFFFF; }
      `}</style>

      {!isLoggedIn ? (
        <LoginPage onLogin={handleLogin} />
      ) : (
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="w-56 bg-[#2E2E2E] border-r border-white/10 flex flex-col sticky top-0 h-screen z-20">
            <div className="p-6">
              <div className="font-bold text-2xl text-[#FFE600] tracking-tight font-['Syne']">
                PRISM<span className="text-white font-medium">PM</span>
              </div>
              <div className="text-[9px] text-[#E5E5E5] tracking-widest uppercase mt-1">
                AI Project Intelligence
              </div>
            </div>

            {/* Navigation */}
            <nav className="px-3 flex-1 space-y-1">
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setTab(item.id); setSelectedProject(null); }}
                  className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl text-left text-xs font-semibold tracking-wider transition-all duration-150 ${
                    tab === item.id 
                      ? "bg-[#FFE600]/10 text-white border-l-4 border-[#FFE600]" 
                      : "text-slate-400 hover:text-white hover:bg-white/5 border-l-4 border-transparent"
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </nav>

            {/* Quick Project selector link list */}
            <div className="p-4 border-t border-white/10">
              <div className="text-[9px] text-slate-500 uppercase tracking-widest mb-2 px-2">Active Projects</div>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProject(p)}
                    className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-lg text-left text-slate-400 hover:text-white hover:bg-[#FFE600]/5 transition-all"
                  >
                    <span className={`w-2 h-2 rounded-full ${p.status === "On Track" ? "bg-[#FFE600]" : p.status === "At Risk" ? "bg-amber-500" : "bg-red-500"}`} />
                    <span className="text-[11px] truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Logout button */}
            <div className="p-4 border-t border-white/10">
              <button
                onClick={() => {
                  setIsLoggedIn(false);
                  try { localStorage.removeItem("prismpm.isLoggedIn"); } catch {}
                }}
                className="flex items-center gap-3 w-full px-4 py-2 rounded-xl text-left text-xs font-semibold text-[#FFE600] hover:bg-[#FFE600]/10 transition-all"
              >
                <span>🚪</span> Logout
              </button>
            </div>
          </aside>

          {/* Main workspace */}
          <main className="flex-1 flex flex-col min-w-0">
            {/* Header top bar */}
            <header className="sticky top-0 bg-black/95 backdrop-blur border-b border-white/10 px-8 py-4 flex items-center justify-between z-10">
              <div>
                <h1 className="text-xl font-extrabold tracking-wide text-white capitalize">
                  {tab === "dashboard" ? "Project Portfolio" 
                    : tab === "team" ? "Team Directory" 
                    : tab === "brd" ? "AI BRD Generator" 
                    : tab === "agile" ? `Agile Scrum Board: ${currentProject?.name || "Choose Project"}` 
                    : selectedProject?.name || "Project"}
                </h1>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {tab === "dashboard" ? `${projects.length} Active Projects · ${risks.filter(r => r.severity === "Critical").length} Critical Risks` 
                    : tab === "team" ? `${employees.length} Team Members Roster` 
                    : tab === "brd" ? "Generate complete functional specs via LLM" 
                    : tab === "agile" ? "Manage sprints, backlog, and Kanban flow"
                    : selectedProject ? `${selectedProject.client} · ${selectedProject.type}` : ""}
                </p>
              </div>

              <div className="flex items-center gap-5">
                {/* Active Project Quick Dropdown in Header */}
                {(tab === "agile" || tab === "project") && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 text-[10px] uppercase tracking-wider">Project:</span>
                    <select
                      value={activeProjectId}
                      onChange={e => {
                        const nextId = Number(e.target.value);
                        setActiveProjectId(nextId);
                        const nextP = projects.find(p => p.id === nextId);
                        if (nextP && tab === "project") {
                          setSelectedProject(nextP);
                        }
                      }}
                      className="bg-[#2E2E2E] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#FFE600]"
                    >
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full bg-[#FFE600] animate-pulse" />
                  <span className="text-xs text-slate-400 font-medium font-mono">AI Active</span>
                </div>

                {/* Notifications trigger bell */}
                <button
                  onClick={() => setShowNotificationsDrawer(true)}
                  className="relative p-2 text-slate-400 hover:text-[#FFE600] bg-[#2E2E2E]/60 rounded-xl transition-all"
                >
                  <span>🔔</span>
                  {notifications.filter(n => !n.read).length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-[#FFE600] text-black text-[9px] font-black rounded-full w-4.5 h-4.5 flex items-center justify-center">
                      {notifications.filter(n => !n.read).length}
                    </span>
                  )}
                </button>
              </div>
            </header>

            {/* Content */}
            <div className="p-8 max-w-6xl w-full mx-auto">
              {tab === "dashboard" && <DashboardTab projects={projects} risks={risks} stories={stories} tasks={tasks} onSelectProject={handleSelectProject} employees={employees} onResetWorkspace={() => {
                if (!window.confirm("Reset workspace? This will clear all projects, epics, sprints, stories, tasks, and risks, and restore the default seed data.")) return;
                setProjects(INITIAL_PROJECTS);
                setEpics([]);
                setStories([]);
                setSprints([]);
                setTasks([]);
                setRisks([]);
                setNotifications([]);
                setEmployees(INITIAL_TEAM_MEMBERS);
                setTab("dashboard");
                localStorage.removeItem("prismpm.projects");
                localStorage.removeItem("prismpm.epics");
                localStorage.removeItem("prismpm.stories");
                localStorage.removeItem("prismpm.sprints");
                localStorage.removeItem("prismpm.tasks");
                localStorage.removeItem("prismpm.risks");
                localStorage.removeItem(PM_STORAGE_KEY);
                localStorage.removeItem("prismpm.notifications");
              }} />}
              {tab === "team" && (
                <TeamTab
                  employees={employees}
                  onAddMember={(m) => { setEmployees(prev => [m, ...prev]); addNotification(`Added new roster member: ${m.name}`, "system"); }}
                  projects={projects}
                  onAddMemberToProject={handleAddMemberToProject}
                  onDropMemberFromProject={handleDropMemberFromProject}
                  onCreateProject={handleCreateProject}
                  onDeleteProject={handleDeleteProject}
                />
              )}
              {tab === "brd" && <BRDTab projects={projects} setProjects={setProjects} stories={stories} setStories={setStories} addNotification={addNotification} />}
              {tab === "agile" && (
                <AgileBoardTab
                  projectId={activeProjectId}
                  projects={projects}
                  epics={epics}
                  setEpics={setEpics}
                  stories={stories}
                  setStories={setStories}
                  sprints={sprints}
                  setSprints={setSprints}
                  tasks={tasks}
                  setTasks={setTasks}
                  employees={employees}
                  addNotification={addNotification}
                  setStoryDetailModal={setStoryDetailModal}
                />
              )}
              {tab === "project" && selectedProject && (
                <ProjectDetail
                  project={projects.find(p => p.id === selectedProject.id) || selectedProject}
                  projects={projects}
                  setProjects={setProjects}
                  epics={epics}
                  setEpics={setEpics}
                  stories={stories}
                  setStories={setStories}
                  sprints={sprints}
                  setSprints={setSprints}
                  tasks={tasks}
                  setTasks={setTasks}
                  risks={risks}
                  setRisks={setRisks}
                  employees={employees}
                  onBack={() => setTab("dashboard")}
                  onDeleteProject={handleDeleteProject}
                  addNotification={addNotification}
                />
              )}
            </div>
          </main>
        </div>
      )}

      {/* Notifications Drawer */}
      {showNotificationsDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <div className="w-80 bg-[#1e1e1e] border-l border-white/10 h-full p-5 flex flex-col justify-between shadow-2xl">
            <div>
              <div className="flex justify-between items-center pb-4 border-b border-white/10 mb-4">
                <h3 className="text-white font-bold flex items-center gap-2 text-sm uppercase tracking-wider">
                  <span>🔔</span> Notifications
                </h3>
                <div className="flex gap-3">
                  <button onClick={() => {
                    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                    addNotification("All notifications marked as read.", "system");
                  }} className="text-[10px] text-[#FFE600] font-bold hover:text-white transition-colors">Mark All Read</button>
                  <button onClick={() => setShowNotificationsDrawer(false)} className="text-xs text-slate-400 hover:text-white transition-colors">✕</button>
                </div>
              </div>
              <div className="space-y-3 overflow-y-auto max-h-[calc(100vh-130px)] pr-1">
                {notifications.length === 0 ? (
                  <div className="text-slate-500 text-xs text-center py-10">No recent notifications.</div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`p-3 rounded-xl border text-[11px] relative transition-all duration-200 ${n.read ? "bg-black/20 border-white/5 text-slate-400" : "bg-[#2E2E2E]/40 border-[#FFE600]/20 text-white"}`}>
                      <div className="flex justify-between items-start mb-1.5">
                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-mono tracking-widest uppercase ${n.type === "system" ? "bg-indigo-900/35 text-indigo-300 border border-indigo-700/20" : n.type === "assignment" ? "bg-emerald-900/35 text-emerald-300 border border-emerald-700/20" : "bg-[#FFE600]/10 text-[#FFE600] border border-[#FFE600]/20"}`}>{n.type}</span>
                        <span className="text-[8px] text-slate-500 font-mono">{new Date(n.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <p className="pr-4 leading-relaxed font-sans">{n.message}</p>
                      <button onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))} className="absolute top-2.5 right-2.5 text-[10px] text-slate-500 hover:text-white">✕</button>
                    </div>
                  ))
                )}
              </div>
            </div>
            <button onClick={() => setNotifications([])} className="w-full py-2.5 bg-black hover:bg-slate-900 text-slate-400 hover:text-white border border-white/10 text-xs font-bold rounded-xl transition-all">
              Clear All Notifications
            </button>
          </div>
        </div>
      )}

      {/* Story & Tasks Details Modal (with Collaboration Comments section) */}
      {storyDetailModal && (
        <StoryDetailModal
          story={storyDetailModal}
          onClose={() => setStoryDetailModal(null)}
          tasks={tasks}
          setTasks={setTasks}
          employees={employees}
          stories={stories}
          setStories={setStories}
          epics={epics}
          sprints={sprints}
          addNotification={addNotification}
        />
      )}
    </div>
  );
}

// ─── Dashboard Tab Component ────────────────────────────────────────────────
function DashboardTab({ projects, risks, stories, tasks, onSelectProject, employees, onResetWorkspace }) {
  const totalBudget = projects.reduce((sum, p) => sum + p.budget, 0);
  const totalSpent = projects.reduce((sum, p) => sum + p.spent, 0);
  const totalCriticalRisks = risks.filter(r => r.severity === "Critical").length;
  const delayedTasks = tasks.filter(t => t.status !== "Done" && (new Date(t.due) < new Date()));

  // Team wide workload stats
  const memberWorkload = employees.map(emp => {
    const assignedStories = stories.filter(s => s.assignee === emp.name && s.status !== "Done");
    const points = assignedStories.reduce((sum, s) => sum + (Number(s.points) || 0), 0);
    return { name: emp.name, role: emp.role, points, count: assignedStories.length };
  }).filter(e => e.points > 0).sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-8">
      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Projects", value: projects.length, icon: "◈", color: "text-[#FFE600]" },
          { label: "Critical Risks", value: totalCriticalRisks, icon: "⚠", color: "text-rose-400" },
          { label: "Overdue Tasks", value: delayedTasks.length, icon: "⏱", color: "text-amber-400" },
          { label: "Budget Utilization", value: totalBudget > 0 ? `${Math.round((totalSpent / totalBudget) * 100)}%` : "0%", icon: "💰", color: "text-white" },
        ].map((k) => (
          <div key={k.label} className="bg-[#2E2E2E]/40 border border-white/10 rounded-2xl p-5 hover:border-[#FFE600]/30 transition-all duration-300">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xl ${k.color}`}>{k.icon}</span>
              <span className="text-slate-400 text-[9px] uppercase tracking-wider font-semibold">{k.label}</span>
            </div>
            <div className={`font-mono font-bold text-3xl ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Portfolio Overview Section */}
      <div className="grid gap-6">
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-[#FFE600] font-bold text-xs uppercase tracking-widest">Enterprise Projects Portfolio</h2>
            <button
              onClick={onResetWorkspace}
              className="text-[10px] text-red-400 font-bold border border-red-900/30 hover:border-red-400 px-2 py-1 rounded bg-black transition-all"
            >
              Reset Workspace to Empty Slate
            </button>
          </div>
          <div className="grid gap-4">
            {projects.map((p) => {
              const projRisks = risks.filter(r => r.projectId === p.id);
              const projStories = stories.filter(s => s.projectId === p.id);
              const isCritical = projRisks.some(r => r.severity === "Critical");
              return (
                <div key={p.id}
                  className="bg-[#2E2E2E]/30 border border-white/10 rounded-2xl p-6 cursor-pointer hover:border-[#FFE600]/40 hover:bg-[#2E2E2E]/60 transition-all duration-300 group"
                  onClick={() => onSelectProject(p)}>
                  <div className="flex items-start gap-5 flex-wrap md:flex-nowrap">
                    <PulseRing progress={p.progress} status={p.status} size={76} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <h3 className="font-bold text-white text-base group-hover:text-[#FFE600] transition-colors">{p.name}</h3>
                        <StatusBadge status={p.status} />
                      </div>
                      <p className="text-slate-400 text-xs mb-3 line-clamp-1">{p.description}</p>
                      <div className="flex items-center gap-4 flex-wrap text-[11px] text-slate-500">
                        <span>Client: <strong className="text-white">{p.client}</strong></span>
                        <span>·</span>
                        <Stars count={p.clientStars} size="sm" />
                        <span>·</span>
                        <span>PM: <strong className="text-slate-300">{p.pm}</strong></span>
                        <span>·</span>
                        <span className={isCritical ? "text-rose-400 font-bold" : ""}>
                          {projRisks.length} Risk{projRisks.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="text-right min-w-[150px] w-full md:w-auto">
                      <div className="text-slate-500 text-[10px] uppercase mb-1">Budget Burn</div>
                      <div className="font-mono text-sm text-white mb-1.5">
                        ${(p.spent / 1000).toFixed(0)}k <span className="text-slate-500">/ ${(p.budget / 1000).toFixed(0)}k</span>
                      </div>
                      <ProgressBar value={(p.spent / p.budget) * 100} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Global Roster Workload Breakdown Widget */}
        <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-6">
          <h3 className="text-white text-xs font-bold uppercase tracking-widest mb-4">Team Workload Allocation</h3>
          {memberWorkload.length === 0 ? (
            <div className="text-slate-500 text-xs py-4 text-center">All team members have empty backlogs.</div>
          ) : (
            <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
              {memberWorkload.map(item => {
                const maxPoints = 15;
                const utilPercent = Math.round((item.points / maxPoints) * 100);
                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300 font-medium">{item.name} <span className="text-slate-500 text-[10px]">({item.role})</span></span>
                      <span className="text-slate-400 font-mono">{item.points} pts / {item.count} stories ({utilPercent}% Utilized)</span>
                    </div>
                    <div className="w-full bg-[#1A1A1A] h-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${utilPercent > 100 ? "bg-red-500" : utilPercent > 70 ? "bg-[#FFE600]" : "bg-white"}`} style={{ width: `${Math.min(utilPercent, 100)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Agile Board Tab ────────────────────────────────────────────────────────
function AgileBoardTab({ projectId, projects, epics, setEpics, stories, setStories, sprints, setSprints, tasks, setTasks, employees, addNotification, setStoryDetailModal }) {
  const [subTab, setSubTab] = useState("backlog");
  const projectStories = stories.filter(s => s.projectId === projectId);
  const projectEpics = epics.filter(e => e.projectId === projectId);
  const projectSprints = sprints.filter(s => s.projectId === projectId);

  // Forms
  const [showCreateStory, setShowCreateStory] = useState(false);
  const [editingStory, setEditingStory] = useState(null);
  const [newStory, setNewStory] = useState({
    title: "", description: "", priority: "Medium", points: 3, epicId: "", assignee: "", moscow: "Should Have", score: 50
  });

  const [showCreateSprint, setShowCreateSprint] = useState(false);
  const [newSprint, setNewSprint] = useState({
    name: "", goal: "", startDate: "", endDate: "", status: "Future"
  });

  const [showCreateEpic, setShowCreateEpic] = useState(false);
  const [newEpic, setNewEpic] = useState({ name: "", description: "" });

  // Filters for Kanban Board
  const [kanbanAssignee, setKanbanAssignee] = useState("All");
  const [kanbanPriority, setKanbanPriority] = useState("All");
  const [kanbanEpic, setKanbanEpic] = useState("All");

  // Re-ordering stories in Backlog
  const moveStoryOrder = (index, direction) => {
    const list = [...projectStories];
    if (direction === "up" && index > 0) {
      const temp = list[index];
      list[index] = list[index - 1];
      list[index - 1] = temp;
    } else if (direction === "down" && index < list.length - 1) {
      const temp = list[index];
      list[index] = list[index + 1];
      list[index + 1] = temp;
    }
    // Update main stories list preserving elements from other projects
    const otherProjectsStories = stories.filter(s => s.projectId !== projectId);
    setStories([...otherProjectsStories, ...list]);
  };

  // AI Story Generator
  const runAIStoryGenerator = async () => {
    const proj = projects.find(p => p.id === projectId);
    if (!proj) return;
    setApiLoading(true);
    try {
      const result = await callGroq(
        `Based on this project description: "${proj.name} - ${proj.description}", generate 4 user stories.
        Return JSON with exactly this key format:
        { "stories": [ { "title": "User Story Title", "description": "Story details", "priority": "High/Medium/Low", "points": 1/2/3/5/8/13, "epicName": "Core Module" } ] }`
      );
      if (result && Array.isArray(result.stories)) {
        let createdCount = 0;
        result.stories.forEach(storyData => {
          let epic = epics.find(e => e.projectId === projectId && e.name.toLowerCase() === storyData.epicName.toLowerCase());
          let epicId = epic ? epic.id : null;
          if (!epicId) {
            epicId = Date.now() + Math.random();
            const newEpObj = { id: epicId, projectId, name: storyData.epicName, description: "AI Auto Generated Epic", status: "To Do", progress: 0 };
            setEpics(prev => [...prev, newEpObj]);
          }

          const storyObj = {
            id: Date.now() + Math.random(),
            projectId,
            epicId,
            title: storyData.title,
            description: storyData.description,
            priority: storyData.priority || "Medium",
            points: Number(storyData.points) || 3,
            assignee: "Unassigned",
            status: "Backlog",
            sprintId: null,
            moscow: "Should Have",
            score: 50
          };
          setStories(prev => [...prev, storyObj]);
          createdCount++;
        });
        addNotification(`AI generated ${createdCount} user stories and associated epics successfully.`, "system");
      }
    } catch (e) {
      alert("AI Generation failed: " + e.message);
    } finally {
      setApiLoading(false);
    }
  };

  // AI Sprint Planner
  const runAISprintPlanning = async () => {
    const unassigned = projectStories.filter(s => !s.sprintId);
    const capacityTotal = employees.length * 15;
    if (unassigned.length === 0) {
      alert("No unassigned stories in backlog to plan.");
      return;
    }
    setApiLoading(true);
    try {
      const result = await callGroq(
        `Here is a list of unassigned user stories for our project:
        ${JSON.stringify(unassigned.map(s => ({ id: s.id, title: s.title, points: s.points, priority: s.priority })))}
        Total Team Capacity is ${capacityTotal} points.
        Divide these stories into recommended sprint packages.
        Return JSON with:
        { "recommendedSprints": [ { "name": "Sprint 3: Core Implementation", "goal": "Deliver auth validation and setup", "storyIds": [list of numbers], "reason": "string rationale" } ] }`
      );
      if (result && Array.isArray(result.recommendedSprints)) {
        result.recommendedSprints.forEach(sprintRec => {
          const sprintId = Date.now() + Math.random();
          const newSp = {
            id: sprintId,
            projectId,
            name: sprintRec.name,
            goal: sprintRec.goal,
            startDate: new Date().toISOString().split("T")[0],
            endDate: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString().split("T")[0],
            status: "Future"
          };
          setSprints(prev => [...prev, newSp]);
          setStories(prev => prev.map(st => {
            if (sprintRec.storyIds.includes(st.id)) {
              return { ...st, sprintId };
            }
            return st;
          }));
        });
        addNotification(`AI Sprint Planner established ${result.recommendedSprints.length} recommended sprints.`, "system");
      }
    } catch (e) {
      alert("AI Sprint planning failed: " + e.message);
    } finally {
      setApiLoading(false);
    }
  };

  const handleCreateStorySubmit = (e) => {
    e.preventDefault();
    const storyObj = {
      id: Date.now(),
      projectId,
      epicId: newStory.epicId ? Number(newStory.epicId) : null,
      title: newStory.title,
      description: newStory.description,
      priority: newStory.priority,
      points: Number(newStory.points) || 1,
      assignee: newStory.assignee || "Unassigned",
      status: "Backlog",
      sprintId: null,
      moscow: newStory.moscow,
      score: Number(newStory.score) || 50
    };
    setStories(prev => [...prev, storyObj]);
    setNewStory({ title: "", description: "", priority: "Medium", points: 3, epicId: "", assignee: "", moscow: "Should Have", score: 50 });
    setShowCreateStory(false);
    addNotification(`Created new User Story: "${storyObj.title}".`, "system");
  };

  const handleEditStorySubmit = (e) => {
    e.preventDefault();
    setStories(prev => prev.map(s => s.id === editingStory.id ? editingStory : s));
    setEditingStory(null);
    addNotification(`Updated User Story details.`, "system");
  };

  const handleCreateSprintSubmit = (e) => {
    e.preventDefault();
    const sprintObj = {
      id: Date.now(),
      projectId,
      ...newSprint
    };
    setSprints(prev => [...prev, sprintObj]);
    setNewSprint({ name: "", goal: "", startDate: "", endDate: "", status: "Future" });
    setShowCreateSprint(false);
    addNotification(`Sprint "${sprintObj.name}" created successfully.`, "system");
  };

  const handleCreateEpicSubmit = (e) => {
    e.preventDefault();
    const epicObj = {
      id: Date.now(),
      projectId,
      name: newEpic.name,
      description: newEpic.description,
      status: "To Do",
      progress: 0
    };
    setEpics(prev => [...prev, epicObj]);
    setNewEpic({ name: "", description: "" });
    setShowCreateEpic(false);
    addNotification(`Epic "${epicObj.name}" created.`, "system");
  };

  const [apiLoading, setApiLoading] = useState(false);

  return (
    <div className="space-y-6">
      {/* Sub tabs nav */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex gap-1 bg-[#2E2E2E] p-1 rounded-xl">
          {["backlog", "sprints", "kanban"].map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${subTab === t ? "bg-[#FFE600] text-black" : "text-slate-400 hover:text-white"}`}
            >
              {t === "backlog" ? "Backlog & Epics" : t === "sprints" ? "Sprint Planning" : "Kanban Board"}
            </button>
          ))}
        </div>

        {apiLoading && <Spinner />}

        <div className="flex gap-2">
          {subTab === "backlog" && (
            <button onClick={runAIStoryGenerator} className="px-3.5 py-1.5 bg-[#2E2E2E] border border-[#FFE600]/30 hover:border-[#FFE600] text-[#FFE600] text-xs font-bold rounded-xl transition-all">
              ✦ AI Generate Stories
            </button>
          )}
          {subTab === "sprints" && (
            <button onClick={runAISprintPlanning} className="px-3.5 py-1.5 bg-[#2E2E2E] border border-[#FFE600]/30 hover:border-[#FFE600] text-[#FFE600] text-xs font-bold rounded-xl transition-all">
              ✦ AI Plan Sprints
            </button>
          )}
        </div>
      </div>

      {/* 1. BACKLOG VIEW */}
      {subTab === "backlog" && (
        <div className="grid lg:grid-cols-[2fr_1.1fr] gap-6">
          {/* Stories List */}
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-white text-sm font-bold uppercase tracking-wider">Product Backlog ({projectStories.length})</h3>
              <button onClick={() => setShowCreateStory(true)} className="px-3 py-1.5 bg-[#FFE600] text-black text-xs font-bold rounded-lg hover:bg-white transition-all">
                + Add User Story
              </button>
            </div>

            {/* Create Story inline Form */}
            {showCreateStory && (
              <form onSubmit={handleCreateStorySubmit} className="bg-[#2E2E2E]/60 border border-white/10 rounded-2xl p-5 space-y-3">
                <h4 className="text-white font-bold text-xs">Create User Story</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  <input
                    value={newStory.title}
                    onChange={e => setNewStory(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Story Title"
                    required
                    className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <select
                    value={newStory.epicId}
                    onChange={e => setNewStory(prev => ({ ...prev, epicId: e.target.value }))}
                    className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="">No Epic</option>
                    {projectEpics.map(ep => (
                      <option key={ep.id} value={ep.id}>{ep.name}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={newStory.description}
                  onChange={e => setNewStory(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="As a [User], I want to [Action], so that [Outcome]..."
                  rows={2}
                  className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                />
                <div className="grid grid-cols-4 gap-2">
                  <select
                    value={newStory.priority}
                    onChange={e => setNewStory(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                  <select
                    value={newStory.points}
                    onChange={e => setNewStory(prev => ({ ...prev, points: Number(e.target.value) }))}
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  >
                    {[1, 2, 3, 5, 8, 13].map(n => <option key={n} value={n}>{n} pts</option>)}
                  </select>
                  <select
                    value={newStory.moscow}
                    onChange={e => setNewStory(prev => ({ ...prev, moscow: e.target.value }))}
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  >
                    <option>Must Have</option>
                    <option>Should Have</option>
                    <option>Could Have</option>
                    <option>Wont Have</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={newStory.score}
                    onChange={e => setNewStory(prev => ({ ...prev, score: Number(e.target.value) }))}
                    placeholder="Score"
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateStory(false)} className="px-3 py-1 bg-black/40 text-xs rounded-lg">Cancel</button>
                  <button type="submit" className="px-3 py-1 bg-[#FFE600] text-black text-xs font-bold rounded-lg">Save Story</button>
                </div>
              </form>
            )}

            {/* Edit Story inline Form */}
            {editingStory && (
              <form onSubmit={handleEditStorySubmit} className="bg-[#2E2E2E]/60 border border-[#FFE600]/40 rounded-2xl p-5 space-y-3">
                <h4 className="text-[#FFE600] font-bold text-xs">Edit User Story Details</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  <input
                    value={editingStory.title}
                    onChange={e => setEditingStory(prev => ({ ...prev, title: e.target.value }))}
                    required
                    className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white focus:outline-none"
                  />
                  <select
                    value={editingStory.epicId || ""}
                    onChange={e => setEditingStory(prev => ({ ...prev, epicId: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="">No Epic</option>
                    {projectEpics.map(ep => (
                      <option key={ep.id} value={ep.id}>{ep.name}</option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={editingStory.description}
                  onChange={e => setEditingStory(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                />
                <div className="grid grid-cols-4 gap-2">
                  <select
                    value={editingStory.priority}
                    onChange={e => setEditingStory(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  >
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                  <select
                    value={editingStory.points}
                    onChange={e => setEditingStory(prev => ({ ...prev, points: Number(e.target.value) }))}
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  >
                    {[1, 2, 3, 5, 8, 13].map(n => <option key={n} value={n}>{n} pts</option>)}
                  </select>
                  <select
                    value={editingStory.moscow}
                    onChange={e => setEditingStory(prev => ({ ...prev, moscow: e.target.value }))}
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  >
                    <option>Must Have</option>
                    <option>Should Have</option>
                    <option>Could Have</option>
                    <option>Wont Have</option>
                  </select>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={editingStory.score}
                    onChange={e => setEditingStory(prev => ({ ...prev, score: Number(e.target.value) }))}
                    className="w-full bg-black border border-white/20 rounded-lg p-2 text-xs text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEditingStory(null)} className="px-3 py-1 bg-black/40 text-xs rounded-lg">Cancel</button>
                  <button type="submit" className="px-3 py-1 bg-[#FFE600] text-black text-xs font-bold rounded-lg">Update</button>
                </div>
              </form>
            )}

            {projectStories.length === 0 ? (
              <div className="text-slate-500 text-xs py-10 text-center border border-dashed border-white/10 rounded-xl">No stories in backlog. Generate some with AI.</div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {projectStories.map((story, idx) => {
                  const epic = projectEpics.find(e => e.id === story.epicId);
                  const sprint = projectSprints.find(s => s.id === story.sprintId);
                  return (
                    <div key={story.id} className="bg-[#2E2E2E]/30 border border-white/10 rounded-xl p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        {/* Order controls */}
                        <div className="flex flex-col gap-1.5">
                          <button onClick={() => moveStoryOrder(idx, "up")} className="text-[10px] text-slate-500 hover:text-[#FFE600]">▲</button>
                          <button onClick={() => moveStoryOrder(idx, "down")} className="text-[10px] text-slate-500 hover:text-[#FFE600]">▼</button>
                        </div>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-white font-semibold text-xs cursor-pointer hover:text-[#FFE600]" onClick={() => setStoryDetailModal(story)}>{story.title}</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-black/55 text-slate-400 rounded-full border border-white/10">{story.points} pts</span>
                            <span className="text-[9px] px-1.5 py-0.2 bg-[#FFE600]/10 text-[#FFE600] rounded-full border border-[#FFE600]/20">{story.moscow}</span>
                            {epic && <span className="text-[9px] px-1.5 py-0.2 bg-indigo-900/30 text-indigo-300 rounded border border-indigo-800/20">{epic.name}</span>}
                            {sprint && <span className="text-[9px] px-1.5 py-0.2 bg-emerald-950 text-emerald-400 rounded">{sprint.name}</span>}
                          </div>
                          <p className="text-slate-400 text-[11px] line-clamp-1">{story.description}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[9px] text-slate-500 uppercase">Score</div>
                          <div className="font-mono text-xs text-white font-bold">{story.score || 50}</div>
                        </div>
                        <button onClick={() => setEditingStory(story)} className="p-1.5 text-xs text-slate-400 hover:text-white bg-black/40 rounded-lg">✎</button>
                        <button onClick={() => {
                          setStories(prev => prev.filter(s => s.id !== story.id));
                          addNotification(`Deleted Story: "${story.title}".`, "system");
                        }} className="p-1.5 text-xs text-red-400 hover:text-white bg-red-950/20 rounded-lg">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Epics panel */}
          <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-4 h-fit">
            <div className="flex justify-between items-center">
              <h3 className="text-white text-xs font-bold uppercase tracking-widest">Project Epics</h3>
              <button onClick={() => setShowCreateEpic(true)} className="text-[10px] text-[#FFE600] font-bold hover:underline">
                + Create Epic
              </button>
            </div>

            {showCreateEpic && (
              <form onSubmit={handleCreateEpicSubmit} className="bg-black/60 border border-white/10 rounded-xl p-3 space-y-3">
                <input
                  value={newEpic.name}
                  onChange={e => setNewEpic(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Epic Name"
                  required
                  className="w-full bg-black border border-white/20 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                />
                <input
                  value={newEpic.description}
                  onChange={e => setNewEpic(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Description..."
                  className="w-full bg-black border border-white/20 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                />
                <button type="submit" className="w-full py-1.5 bg-[#FFE600] text-black text-xs font-bold rounded-lg">Create Epic</button>
              </form>
            )}

            <div className="space-y-3">
              {projectEpics.map(ep => {
                const epicStories = projectStories.filter(s => s.epicId === ep.id);
                const totalPts = epicStories.reduce((sum, s) => sum + s.points, 0);
                return (
                  <div key={ep.id} className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-white font-semibold text-xs">{ep.name}</h4>
                        <p className="text-slate-500 text-[10px]">{ep.description}</p>
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">{epicStories.length} stories ({totalPts} pts)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <ProgressBar value={ep.progress} />
                      </div>
                      <span className="text-[10px] text-[#FFE600] font-mono font-bold">{ep.progress}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 2. SPRINT PLANNING VIEW */}
      {subTab === "sprints" && (
        <div className="grid lg:grid-cols-[1.8fr_1.2fr] gap-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-white text-sm font-bold uppercase tracking-wider">Active & Future Sprints</h3>
              <button onClick={() => setShowCreateSprint(true)} className="px-3.5 py-1.5 bg-[#FFE600] text-black text-xs font-bold rounded-lg transition-all">
                + Create New Sprint
              </button>
            </div>

            {showCreateSprint && (
              <form onSubmit={handleCreateSprintSubmit} className="bg-[#2E2E2E]/60 border border-white/10 rounded-2xl p-5 space-y-3">
                <h4 className="text-white font-bold text-xs">New Sprint</h4>
                <div className="grid md:grid-cols-2 gap-3">
                  <input
                    value={newSprint.name}
                    onChange={e => setNewSprint(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Sprint Name"
                    required
                    className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <input
                    value={newSprint.goal}
                    onChange={e => setNewSprint(prev => ({ ...prev, goal: e.target.value }))}
                    placeholder="Sprint Goal"
                    className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="date"
                    value={newSprint.startDate}
                    onChange={e => setNewSprint(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                  />
                  <input
                    type="date"
                    value={newSprint.endDate}
                    onChange={e => setNewSprint(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowCreateSprint(false)} className="px-3 py-1 bg-black/40 text-xs rounded-lg">Cancel</button>
                  <button type="submit" className="px-3 py-1 bg-[#FFE600] text-black text-xs font-bold rounded-lg">Save Sprint</button>
                </div>
              </form>
            )}

            <div className="space-y-4">
              {projectSprints.map(sprint => {
                const sprintStories = projectStories.filter(s => s.sprintId === sprint.id);
                const totalPoints = sprintStories.reduce((sum, s) => sum + s.points, 0);
                return (
                  <div key={sprint.id} className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-3">
                    <div className="flex justify-between items-start flex-wrap gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-white font-bold text-sm">{sprint.name}</h4>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${sprint.status === "Active" ? "bg-[#FFE600]/15 text-[#FFE600]" : sprint.status === "Closed" ? "bg-slate-800 text-slate-400" : "bg-black text-white"}`}>
                            {sprint.status}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs mt-1">Goal: {sprint.goal}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{sprint.startDate} to {sprint.endDate}</p>
                      </div>

                      <div className="text-right">
                        <span className="text-xs text-[#FFE600] font-mono font-bold">{totalPoints} pts</span>
                        <div className="flex gap-2.5 mt-1.5">
                          {sprint.status === "Future" && (
                            <button
                              onClick={() => {
                                setSprints(prev => prev.map(sp => sp.id === sprint.id ? { ...sp, status: "Active" } : sp));
                                addNotification(`Sprint "${sprint.name}" is now Active.`, "system");
                              }}
                              className="px-2 py-1 bg-[#FFE600] text-black text-[10px] font-bold rounded hover:bg-white"
                            >
                              Start Sprint
                            </button>
                          )}
                          {sprint.status === "Active" && (
                            <button
                              onClick={() => {
                                setSprints(prev => prev.map(sp => sp.id === sprint.id ? { ...sp, status: "Closed" } : sp));
                                addNotification(`Sprint "${sprint.name}" has been Closed.`, "system");
                              }}
                              className="px-2 py-1 bg-white text-black text-[10px] font-bold rounded"
                            >
                              Close Sprint
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                      <div className="border-t border-white/10 pt-3">
                      <div className="text-slate-500 text-[10px] uppercase mb-2">Sprint Backlog ({sprintStories.length} Stories)</div>
                      <div className="space-y-1.5 max-h-36 overflow-y-auto">
                        {sprintStories.map(st => {
                          const isDone = st.status === "Done";
                          const isInProgress = st.status === "In Progress";
                          return (
                            <div key={st.id} className={`flex justify-between items-center p-2 rounded-lg text-xs transition-all ${isDone ? "bg-green-950/30 border border-green-800/30" : isInProgress ? "bg-yellow-950/20 border border-yellow-800/20" : "bg-black/40"}`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`text-base leading-none flex-shrink-0 ${isDone ? "text-green-400" : isInProgress ? "text-yellow-400" : "text-slate-600"}`}>
                                  {isDone ? "✓" : isInProgress ? "◑" : "○"}
                                </span>
                                <span
                                  onClick={() => setStoryDetailModal(st)}
                                  className={`cursor-pointer hover:underline truncate ${isDone ? "line-through text-slate-500" : "text-white"}`}
                                >
                                  {st.title}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                <span className={`text-[10px] font-mono ${isDone ? "text-green-500" : "text-slate-400"}`}>{st.points} pts</span>
                                {isDone
                                  ? <span className="text-[9px] text-green-500 font-bold uppercase tracking-wider">Done</span>
                                  : isInProgress
                                    ? <span className="text-[9px] text-yellow-400 font-bold uppercase tracking-wider">Active</span>
                                    : <button onClick={() => {
                                        setStories(prev => prev.map(s => s.id === st.id ? { ...s, sprintId: null } : s));
                                        addNotification(`Removed "${st.title}" from ${sprint.name}.`, "system");
                                      }} className="text-red-400 hover:text-white">✕</button>
                                }
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Planning Panel: Drag stories into Sprints */}
          <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-4 h-fit">
            <h3 className="text-white text-xs font-bold uppercase tracking-widest">Sprint Assignment Backlog</h3>
            <p className="text-slate-400 text-xs">Easily assign backlog stories to any scheduled sprint.</p>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {projectStories.filter(s => !s.sprintId).map(story => (
                <div key={story.id} className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-2.5">
                  <div className="flex justify-between items-start">
                    <span className="text-white font-semibold text-xs cursor-pointer hover:underline" onClick={() => setStoryDetailModal(story)}>{story.title}</span>
                    <span className="text-[10px] font-mono text-[#FFE600]">{story.points} pts</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] text-slate-500">{story.priority} Priority</span>
                    <select
                      onChange={e => {
                        const sId = Number(e.target.value);
                        if (!sId) return;
                        setStories(prev => prev.map(s => s.id === story.id ? { ...s, sprintId: sId } : s));
                        addNotification(`Assigned "${story.title}" to Sprint ID ${sId}.`, "system");
                      }}
                      className="bg-[#2E2E2E] border border-white/10 rounded px-2 py-1 text-[10px] text-white"
                      defaultValue=""
                    >
                      <option value="" disabled>Send to Sprint...</option>
                      {projectSprints.filter(sp => sp.status !== "Closed").map(sp => (
                        <option key={sp.id} value={sp.id}>{sp.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3. KANBAN BOARD VIEW */}
      {subTab === "kanban" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex gap-4 flex-wrap bg-[#2E2E2E]/30 p-3 rounded-xl border border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Assignee</span>
              <select value={kanbanAssignee} onChange={e => setKanbanAssignee(e.target.value)} className="bg-black border border-white/10 rounded-lg p-1.5 text-xs text-white">
                <option value="All">All Team</option>
                {employees.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
                <option value="Unassigned">Unassigned</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Priority</span>
              <select value={kanbanPriority} onChange={e => setKanbanPriority(e.target.value)} className="bg-black border border-white/10 rounded-lg p-1.5 text-xs text-white">
                <option value="All">All Priorities</option>
                <option>High</option>
                <option>Medium</option>
                <option>Low</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 uppercase font-mono">Epic</span>
              <select value={kanbanEpic} onChange={e => setKanbanEpic(e.target.value)} className="bg-black border border-white/10 rounded-lg p-1.5 text-xs text-white">
                <option value="All">All Epics</option>
                {projectEpics.map(ep => <option key={ep.id} value={ep.id}>{ep.name}</option>)}
              </select>
            </div>
          </div>

          {/* Kanban Columns */}
          <div className="flex gap-3 overflow-x-auto pb-4 min-h-[600px]">
            {["Backlog", "To Do", "In Progress", "Review", "Testing", "Done"].map(col => {
              const filteredStories = projectStories.filter(s => {
                if (s.status !== col) return false;
                if (kanbanAssignee !== "All" && s.assignee !== kanbanAssignee) return false;
                if (kanbanPriority !== "All" && s.priority !== kanbanPriority) return false;
                if (kanbanEpic !== "All" && String(s.epicId) !== kanbanEpic) return false;
                return true;
              });

              return (
                <div
                  key={col}
                  className="bg-[#2E2E2E]/10 border border-white/5 rounded-2xl p-3 flex flex-col flex-shrink-0 w-[190px]"
                  onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-[#FFE600]/50"); }}
                  onDragLeave={e => { e.currentTarget.classList.remove("border-[#FFE600]/50"); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-[#FFE600]/50");
                    const storyId = Number(e.dataTransfer.getData("storyId"));
                    if (!storyId) return;
                    setStories(prev => prev.map(s => s.id === storyId ? { ...s, status: col } : s));
                    addNotification(`Moved story to ${col}.`, "system");
                  }}
                >
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/10">
                    <span className="text-white font-bold text-xs uppercase tracking-wider">{col}</span>
                    <span className="text-[10px] font-mono text-slate-500 bg-black/45 px-2 py-0.5 rounded-full">{filteredStories.length}</span>
                  </div>

                  <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
                    {filteredStories.map(story => {
                      const storyTasks = tasks.filter(t => t.storyId === story.id);
                      const isDone = story.status === "Done";
                      const isInProgress = story.status === "In Progress";
                      const completedTasks = isDone ? storyTasks.length : storyTasks.filter(t => t.status === "Done").length;
                      const taskProgress = storyTasks.length > 0 ? Math.round((completedTasks / storyTasks.length) * 100) : (isDone ? 100 : 0);
                      const epicName = epics.find(e => e.id === story.epicId)?.name;
                      return (
                        <div
                          key={story.id}
                          draggable
                          onDragStart={e => {
                            e.dataTransfer.setData("storyId", story.id);
                            e.currentTarget.style.opacity = "0.4";
                          }}
                          onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
                          className={`border rounded-xl p-3 space-y-2.5 hover:border-[#FFE600]/40 transition-all cursor-grab active:cursor-grabbing ${isDone ? "bg-green-950/20 border-green-800/20" : isInProgress ? "bg-yellow-950/10 border-yellow-800/15" : "bg-[#2E2E2E]/50 border-white/10"}`}
                        >
                          {/* Title + status dot */}
                          <div className="flex justify-between items-start gap-1">
                            <span onClick={() => setStoryDetailModal(story)} className={`font-semibold text-[11px] hover:text-[#FFE600] cursor-pointer hover:underline line-clamp-2 ${isDone ? "line-through text-slate-400" : "text-white"}`}>
                              {story.title}
                            </span>
                            <span className={`flex-shrink-0 text-xs leading-none mt-0.5 ${isDone ? "text-green-400" : isInProgress ? "text-yellow-400" : "text-slate-600"}`}>
                              {isDone ? "✓" : isInProgress ? "◑" : "○"}
                            </span>
                          </div>

                          {/* Assignee row */}
                          {story.assignee && story.assignee !== "Unassigned" && (
                            <div className="flex items-center gap-1.5 text-[9px] text-slate-400">
                              <span className="w-4 h-4 rounded-full bg-indigo-700 flex items-center justify-center text-white font-bold text-[8px] flex-shrink-0">
                                {story.assignee.charAt(0)}
                              </span>
                              <span className="truncate">{story.assignee}</span>
                            </div>
                          )}

                          {/* Epic + points row */}
                          <div className="flex justify-between items-center text-[9px]">
                            {epicName
                              ? <span className="text-indigo-400 bg-indigo-900/20 px-1.5 py-0.5 rounded truncate max-w-[100px]">{epicName}</span>
                              : <span className="text-slate-600">No Epic</span>
                            }
                            <span className="font-mono text-[#FFE600] font-bold">{story.points} pt</span>
                          </div>

                          {/* Tasks checklist */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-[9px] text-slate-500">
                              <span>Tasks</span>
                              <span className={completedTasks === storyTasks.length && storyTasks.length > 0 ? "text-green-400 font-bold" : ""}>
                                {storyTasks.length === 0 ? "No tasks" : `${completedTasks}/${storyTasks.length} done`}
                              </span>
                            </div>
                            {storyTasks.length > 0 && (
                              <div className="w-full bg-black/40 rounded-full h-1">
                                <div
                                  className={`h-1 rounded-full transition-all ${taskProgress === 100 ? "bg-green-400" : isInProgress ? "bg-[#FFE600]" : "bg-slate-600"}`}
                                  style={{ width: `${taskProgress}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Story Detail Modal Component (Collaboration Timeline + AI Task Gen) ─────
function StoryDetailModal({ story, onClose, tasks, setTasks, employees, stories, setStories, epics, sprints, addNotification }) {
  const [taskName, setTaskName] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("Unassigned");
  const [taskPriority, setTaskPriority] = useState("Medium");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskDue, setTaskDue] = useState("");

  const [commentText, setCommentText] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);

  const storyTasks = tasks.filter(t => t.storyId === story.id);
  const epic = epics.find(e => e.id === story.epicId);
  const sprint = sprints.find(s => s.id === story.sprintId);

  // AI Task Generator
  const runAITaskGenerator = async () => {
    setApiLoading(true);
    try {
      const result = await callGroq(
        `Generate 3 sub-tasks required to complete the user story: "${story.title} - ${story.description}".
        Return JSON with exactly this key format:
        { "tasks": [ { "name": "Task name", "estimateDays": 2, "description": "Action details", "priority": "High/Medium/Low" } ] }`
      );
      if (result && Array.isArray(result.tasks)) {
        result.tasks.forEach(tData => {
          const tObj = {
            id: Date.now() + Math.random(),
            storyId: story.id,
            projectId: story.projectId,
            name: tData.name,
            status: "To Do",
            priority: tData.priority || "Medium",
            assignee: "Unassigned",
            due: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split("T")[0],
            description: tData.description || "",
            attachments: [],
            comments: []
          };
          setTasks(prev => [...prev, tObj]);
        });
        addNotification(`AI automatically parsed sub-tasks for story: "${story.title}".`, "system");
      }
    } catch (e) {
      alert("AI task parsing failed: " + e.message);
    } finally {
      setApiLoading(false);
    }
  };

  const handleCreateTask = (e) => {
    e.preventDefault();
    if (!taskName.trim()) return;
    const tObj = {
      id: Date.now(),
      storyId: story.id,
      projectId: story.projectId,
      name: taskName,
      status: "To Do",
      priority: taskPriority,
      assignee: taskAssignee,
      due: taskDue || new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString().split("T")[0],
      description: taskDesc,
      attachments: [],
      comments: []
    };
    setTasks(prev => [...prev, tObj]);
    setTaskName("");
    setTaskDesc("");
    addNotification(`Added task "${tObj.name}" to story.`, "system");
  };

  // Add Collaboration Comment with @mention handling
  const handleAddComment = (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const mentionRegex = /@(\w+\s?\w*)/g;
    let match;
    while ((match = mentionRegex.exec(commentText)) !== null) {
      const mentionedName = match[1];
      const matchEmp = employees.find(emp => emp.name.toLowerCase().includes(mentionedName.toLowerCase()));
      if (matchEmp) {
        addNotification(`Mention: ${matchEmp.name} was pinged in story: "${story.title}".`, "info");
      }
    }

    if (storyTasks.length > 0) {
      const updated = tasks.map(t => {
        if (t.storyId === story.id) {
          return {
            ...t,
            comments: [...(t.comments || []), { author: "Admin", text: commentText, time: new Date().toLocaleString() }]
          };
        }
        return t;
      });
      setTasks(updated);
    } else {
      const dummyTask = {
        id: Date.now(),
        storyId: story.id,
        projectId: story.projectId,
        name: "Story Conversations & Timeline Log",
        status: "To Do",
        priority: "Low",
        assignee: "System",
        due: "",
        description: "Auto generated channel for reviews.",
        attachments: [],
        comments: [{ author: "Admin", text: commentText, time: new Date().toLocaleString() }]
      };
      setTasks(prev => [...prev, dummyTask]);
    }
    setCommentText("");
    addNotification(`Comment registered on story timeline.`, "system");
  };

  const handleCommentChange = (val) => {
    setCommentText(val);
    if (val.endsWith("@")) {
      setShowMentionSuggestions(true);
    } else if (!val.includes("@") || val.endsWith(" ")) {
      setShowMentionSuggestions(false);
    }
  };

  const [apiLoading, setApiLoading] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#1e1e1e] border border-white/10 rounded-2xl w-full max-w-4xl p-6 space-y-6 max-h-[90vh] overflow-y-auto shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg">✕</button>

        {/* Story Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] bg-[#FFE600] text-black font-extrabold px-2 py-0.5 rounded">Story ID: {story.id.toString().slice(-4)}</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-white/10">{story.moscow}</span>
            {epic && <span className="text-[10px] bg-indigo-900/30 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700/20">{epic.name}</span>}
            {sprint && <span className="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded">{sprint.name}</span>}
          </div>
          <h2 className="text-white font-extrabold text-xl">{story.title}</h2>
          <p className="text-slate-400 text-xs leading-relaxed">{story.description}</p>
        </div>

        {/* Task Creation & List */}
        <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-white/10">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-white font-bold text-xs uppercase tracking-widest">Tasks List ({storyTasks.length})</h3>
              <button onClick={runAITaskGenerator} className="text-[10px] text-[#FFE600] font-bold hover:underline">
                ✦ AI Generate Tasks
              </button>
            </div>

            {/* List */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {storyTasks.map(t => {
                const effectiveStatus = story.status === "Done" ? "Done" : t.status;
                const tIsDone = effectiveStatus === "Done";
                const tIsActive = effectiveStatus === "In Progress";
                return (
                  <div key={t.id} className={`border rounded-xl p-3 flex justify-between items-center gap-3 transition-all ${tIsDone ? "bg-green-950/20 border-green-800/25" : tIsActive ? "bg-yellow-950/15 border-yellow-800/20" : "bg-black/30 border-white/5"}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-sm flex-shrink-0 ${tIsDone ? "text-green-400" : tIsActive ? "text-yellow-400" : "text-slate-600"}`}>
                        {tIsDone ? "✓" : tIsActive ? "◑" : "○"}
                      </span>
                      <div className="min-w-0">
                        <span className={`font-medium text-xs block truncate ${tIsDone ? "line-through text-slate-500" : "text-white"}`}>{t.name}</span>
                        {t.due && <span className="text-[9px] text-slate-600">Due: {t.due}</span>}
                      </div>
                    </div>
                    <select
                      value={effectiveStatus}
                      disabled={story.status === "Done"}
                      onChange={e => {
                        const st = e.target.value;
                        setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: st } : x));
                        addNotification(`Task "${t.name}" → ${st}.`, "system");
                      }}
                      className={`bg-[#2E2E2E] border border-white/10 rounded text-[9px] p-1 flex-shrink-0 ${tIsDone ? "text-green-400" : tIsActive ? "text-yellow-400" : "text-white"} disabled:opacity-50`}
                    >
                      <option>To Do</option>
                      <option>In Progress</option>
                      <option>Done</option>
                    </select>
                  </div>
                );
              })}
            </div>

            {/* Manual Task Add */}
            <form onSubmit={handleCreateTask} className="bg-[#2E2E2E]/20 p-3.5 rounded-xl border border-white/5 space-y-3">
              <span className="text-white font-semibold text-[10px] uppercase">Add Task Manually</span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={taskName}
                  onChange={e => setTaskName(e.target.value)}
                  placeholder="Task Name"
                  required
                  className="bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
                />
                <select value={taskAssignee} onChange={e => setTaskAssignee(e.target.value)} className="bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white">
                  <option value="Unassigned">Unassigned</option>
                  {employees.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={taskDue}
                  onChange={e => setTaskDue(e.target.value)}
                  className="bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
                />
                <button type="submit" className="bg-[#FFE600] text-black text-xs font-bold rounded hover:bg-white transition-all">Add Task</button>
              </div>
            </form>
          </div>

          {/* Collaboration Comments & Activities Timeline */}
          <div className="space-y-4">
            <h3 className="text-white font-bold text-xs uppercase tracking-widest">Collaboration Timeline</h3>

            {/* Comments Timeline */}
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1 text-xs">
              {storyTasks.flatMap(t => t.comments || []).length === 0 ? (
                <div className="text-slate-500 text-center py-6">No discussions yet. Post a comment.</div>
              ) : (
                storyTasks.flatMap(t => t.comments || []).map((c, i) => (
                  <div key={i} className="bg-black/45 border border-white/5 p-3 rounded-xl space-y-1">
                    <div className="flex justify-between text-[9px] text-slate-500">
                      <strong className="text-[#FFE600]">{c.author}</strong>
                      <span>{c.time}</span>
                    </div>
                    <p className="text-slate-300 font-sans">{c.text}</p>
                  </div>
                ))
              )}
            </div>

            {/* Post Comments Form */}
            <form onSubmit={handleAddComment} className="space-y-2 relative">
              <textarea
                value={commentText}
                onChange={e => handleCommentChange(e.target.value)}
                placeholder="Write a message (@name to mention)..."
                rows={2}
                className="w-full bg-black border border-white/20 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFE600]"
              />

              {showMentionSuggestions && (
                <div className="absolute bottom-12 left-0 right-0 bg-[#2E2E2E] border border-white/10 rounded-xl max-h-28 overflow-y-auto z-10 p-1">
                  {employees.map(emp => (
                    <button
                      key={emp.name}
                      type="button"
                      onClick={() => {
                        setCommentText(prev => prev.slice(0, -1) + `@${emp.name} `);
                        setShowMentionSuggestions(false);
                      }}
                      className="w-full text-left text-xs text-white hover:bg-white/10 px-2 py-1 rounded"
                    >
                      {emp.name} ({emp.role})
                    </button>
                  ))}
                </div>
              )}

              <button type="submit" className="w-full py-2 bg-white hover:bg-[#FFE600] text-black font-bold text-xs rounded-xl transition-all">
                Post Comment
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Team Tab Component ──────────────────────────────────────────────────────
function TeamTab({ employees, onAddMember, projects, onAddMemberToProject, onDropMemberFromProject, onCreateProject, onDeleteProject }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newMember, setNewMember] = useState({ name: "", role: "BA", specialty: "", assignedPm: "", skillStars: 4 });

  const activeProj = projects.find(p => p.id === Number(selectedProjectId));

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (!newMember.name.trim()) return;
    onAddMember({
      name: newMember.name,
      role: newMember.role,
      specialty: newMember.specialty || newMember.role,
      assignedPm: newMember.assignedPm || "Unassigned",
      skillStars: Number(newMember.skillStars) || 4,
      projects: 0,
      available: true
    });
    setNewMember({ name: "", role: "BA", specialty: "", assignedPm: "", skillStars: 4 });
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-[1.8fr_1.2fr] gap-6">
        {/* Allocations workspace */}
        <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-white text-sm font-bold uppercase tracking-wider">Project Team Allocation</h3>
            <select
              value={selectedProjectId}
              onChange={e => setSelectedProjectId(e.target.value)}
              className="bg-black border border-white/20 rounded-lg px-3 py-1 text-xs text-white"
            >
              <option value="">Choose Active Project...</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {activeProj ? (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Allocated Members */}
              <div className="bg-black/45 p-4 rounded-xl border border-white/5 space-y-3">
                <span className="text-slate-400 text-xs font-bold block border-b border-white/10 pb-1.5">Project Team ({activeProj.team?.length || 0})</span>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {activeProj.team?.map((mem, i) => (
                    <div key={i} className="flex justify-between items-center bg-[#2E2E2E]/20 p-2 rounded-lg text-xs">
                      <div>
                        <span className="text-white font-medium block">{mem.name}</span>
                        <span className="text-[10px] text-slate-500">{mem.role}</span>
                      </div>
                      <button onClick={() => onDropMemberFromProject(mem, activeProj.id)} className="text-red-400 hover:text-white">Drop</button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Roster Pool */}
              <div className="bg-black/45 p-4 rounded-xl border border-white/5 space-y-3">
                <span className="text-slate-400 text-xs font-bold block border-b border-white/10 pb-1.5">Roster Pool</span>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {employees.filter(emp => !activeProj.team?.some(t => t.name === emp.name)).map(emp => (
                    <div key={emp.name} className="flex justify-between items-center bg-[#2E2E2E]/20 p-2 rounded-lg text-xs">
                      <div>
                        <span className="text-white font-medium block">{emp.name}</span>
                        <span className="text-[10px] text-slate-500">{emp.role} · {emp.specialty}</span>
                      </div>
                      <button onClick={() => onAddMemberToProject(emp, activeProj.id)} className="text-[#FFE600] hover:text-white">Assign</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-slate-500 text-xs text-center py-10">Select an active project above to start allocating team resources.</div>
          )}
        </div>

        {/* Add roster member */}
        <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-4 h-fit">
          <div className="flex justify-between items-center">
            <h3 className="text-white text-xs font-bold uppercase tracking-widest">Roster Pool Directory</h3>
            <button onClick={() => setShowAddForm(!showAddForm)} className="text-xs text-[#FFE600] font-bold hover:underline">
              {showAddForm ? "Hide Form" : "+ Add Employee"}
            </button>
          </div>

          {showAddForm && (
            <form onSubmit={handleFormSubmit} className="bg-black/60 p-4 border border-white/10 rounded-xl space-y-3">
              <input
                value={newMember.name}
                onChange={e => setNewMember(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Full Name"
                required
                className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
              />
              <select
                value={newMember.role}
                onChange={e => setNewMember(prev => ({ ...prev, role: e.target.value }))}
                className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
              >
                <option>BA</option>
                <option>Lead Dev</option>
                <option>iOS Dev</option>
                <option>Android Dev</option>
                <option>QA</option>
                <option>Architect</option>
                <option>Security</option>
              </select>
              <input
                value={newMember.specialty}
                onChange={e => setNewMember(prev => ({ ...prev, specialty: e.target.value }))}
                placeholder="Specialty (e.g. Swift, HIPAA)"
                className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
              />
              <button type="submit" className="w-full py-1.5 bg-[#FFE600] text-black text-xs font-bold rounded">Save to Roster</button>
            </form>
          )}

          <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
            {employees.map(emp => (
              <div key={emp.name} className="bg-black/40 border border-white/5 rounded-xl p-3 flex justify-between items-center text-xs">
                <div>
                  <span className="text-white font-bold block">{emp.name}</span>
                  <span className="text-[10px] text-slate-400">{emp.role} · {emp.specialty}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] bg-white/5 border border-white/10 text-slate-300 px-1.5 py-0.2 rounded font-mono">
                    Score: {scoreMember(emp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BRD Generator Tab Component (Enhanced Prompt + Create Project) ─────────
function BRDTab({ projects, setProjects, stories, setStories, addNotification }) {
  const [form, setForm] = useState({ problem: "", goal: "", stakeholders: "", constraints: "", assumptions: "", clientName: "", projectType: "Healthcare SaaS" });
  const [brd, setBrd] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("prismpm.groqApiKey") || "");

  useEffect(() => {
    if (apiKey) localStorage.setItem("prismpm.groqApiKey", apiKey);
  }, [apiKey]);

  const generateBRD = async () => {
    if (!form.problem || !form.goal || !apiKey) return;
    setLoading(true);
    setBrd(null);
    try {
      const result = await callGroq(
        `Generate a professional Business Requirements Document (BRD).
        Client: ${form.clientName || "TBD"}
        Project Type: ${form.projectType}
        Business Problem: ${form.problem}
        Goal: ${form.goal}
        Stakeholders: ${form.stakeholders}
        Constraints: ${form.constraints}
        Assumptions: ${form.assumptions}

        Return JSON with exact keys:
        {
          "executiveSummary": "string",
          "businessObjectives": [list],
          "projectScope": { "inScope": [list], "outOfScope": [list] },
          "stakeholders": [ {"role": "string", "name": "string", "responsibility": "string"} ],
          "functionalRequirements": [list],
          "nonFunctionalRequirements": [list],
          "userPersonas": [ {"name": "string", "role": "string", "description": "string", "goals": "string"} ],
          "userStories": [ {"asA": "string", "iWantTo": "string", "soThat": "string", "acceptanceCriteria": "string", "points": 3} ],
          "risks": [list of strings],
          "assumptions": [list],
          "successMetrics": [list]
        }`,
        "",
        apiKey
      );
      setBrd(result);
      addNotification("AI Business Requirements Document created successfully.", "system");
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProjectFromBRD = () => {
    if (!brd) return;
    const projectId = Date.now();
    const newProj = {
      id: projectId,
      name: `${form.clientName || "New Client"} ${form.projectType}`,
      client: form.clientName || "Enterprise Client",
      clientStars: 4,
      pm: "Sarah Chen",
      ba: "Marcus Webb",
      type: form.projectType,
      status: "On Track",
      progress: 0,
      plannedDays: 120,
      elapsed: 0,
      description: brd.executiveSummary || "AI Generated Project.",
      budget: 150000,
      spent: 0,
      team: [
        { name: "Sarah Chen", role: "PM", skillStars: 5, specialty: "Fintech" },
        { name: "Marcus Webb", role: "BA", skillStars: 4, specialty: "Banking" }
      ]
    };
    setProjects(prev => [newProj, ...prev]);

    if (Array.isArray(brd.userStories)) {
      const storyObjects = brd.userStories.map((us, i) => ({
        id: Date.now() + i + Math.random(),
        projectId,
        epicId: null,
        title: us.iWantTo || `Requirement Story ${i + 1}`,
        description: `As a ${us.asA || "user"}, I want to ${us.iWantTo || "action"} so that ${us.soThat || "outcome"}. AC: ${us.acceptanceCriteria || ""}`,
        priority: "Medium",
        points: us.points || 3,
        assignee: "Unassigned",
        status: "Backlog",
        sprintId: null,
        moscow: "Should Have",
        score: 60
      }));
      setStories(prev => [...prev, ...storyObjects]);
    }

    addNotification(`Imported project and user stories from generated BRD.`, "system");
    alert("Project and Stories successfully created!");
  };

  const exportBRDToTXT = () => {
    if (!brd) return;
    const fileContent = `
========================================================================
                      BUSINESS REQUIREMENTS DOCUMENT
========================================================================
Project Type: ${form.projectType}
Client: ${form.clientName || "Enterprise Client"}
Generated At: ${new Date().toLocaleString()}

EXECUTIVE SUMMARY
-----------------
${brd.executiveSummary || "N/A"}

BUSINESS OBJECTIVES
-------------------
${brd.businessObjectives?.map((o, i) => `${i + 1}. ${o}`).join("\n") || "N/A"}

SCOPE OF WORK
-------------
In Scope:
${brd.projectScope?.inScope?.map(s => ` - ${s}`).join("\n") || "N/A"}
Out of Scope:
${brd.projectScope?.outOfScope?.map(s => ` - ${s}`).join("\n") || "N/A"}

USER STORIES
------------
${brd.userStories?.map((us, i) => `US ${i + 1}: As a ${us.asA}, I want to ${us.iWantTo} so that ${us.soThat}`).join("\n") || "N/A"}
    `;
    const blob = new Blob([fileContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BRD_${form.clientName || "Project"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-[#2E2E2E]/40 border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="text-[#FFE600] font-bold text-sm uppercase tracking-widest flex items-center gap-2">
          <span>✦</span> Enhanced AI BRD Generator
        </h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Client Name</label>
            <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="NexaBank Ltd" className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Project Type</label>
            <input value={form.projectType} onChange={e => setForm(f => ({ ...f, projectType: e.target.value }))} className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Business Problem *</label>
            <textarea value={form.problem} onChange={e => setForm(f => ({ ...f, problem: e.target.value }))} rows={2} placeholder="Explain the business bottleneck..." className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" required />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Project Goal *</label>
            <textarea value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} rows={2} placeholder="Define the end state target..." className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" required />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-3">
          <input value={form.stakeholders} onChange={e => setForm(f => ({ ...f, stakeholders: e.target.value }))} placeholder="Stakeholders (e.g. Risk officers)" className="bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white" />
          <input value={form.constraints} onChange={e => setForm(f => ({ ...f, constraints: e.target.value }))} placeholder="Constraints (e.g. Budget ceiling)" className="bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white" />
          <input value={form.assumptions} onChange={e => setForm(f => ({ ...f, assumptions: e.target.value }))} placeholder="Assumptions" className="bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white" />
        </div>

        <div>
          <label className="text-slate-400 text-xs uppercase mb-1 block">Groq API Key</label>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste Groq API Key..." className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
        </div>

        <button onClick={generateBRD} disabled={loading} className="w-full py-2.5 bg-[#FFE600] text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all">
          {loading ? "Generating specifications..." : "✦ AI Generate Specs"}
        </button>
      </div>

      {brd && (
        <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <h4 className="text-white font-bold text-sm">Generated Specifications</h4>
            <div className="flex gap-2">
              <button onClick={handleCreateProjectFromBRD} className="px-3.5 py-1.5 bg-[#FFE600] text-black text-xs font-bold rounded-lg">
                Create Project from BRD
              </button>
              <button onClick={exportBRDToTXT} className="px-3.5 py-1.5 bg-white text-black text-xs font-bold rounded-lg">
                Export Report (.txt)
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-1">
              <span className="text-[#FFE600] text-[10px] font-bold uppercase tracking-wider">Executive Summary</span>
              <p className="text-slate-300 text-xs leading-relaxed">{brd.executiveSummary}</p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-2">Business Objectives</span>
                <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                  {brd.businessObjectives?.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </div>
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-2">Project Scope (In-Scope)</span>
                <ul className="list-disc pl-4 text-xs text-[#FFE600] space-y-1">
                  {brd.projectScope?.inScope?.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-white text-xs font-bold block">User Stories ({brd.userStories?.length || 0})</span>
              <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
                {brd.userStories?.map((us, i) => (
                  <div key={i} className="bg-black/35 p-3 rounded-lg border border-white/5 text-xs">
                    <strong>As a:</strong> {us.asA} | <strong>I want to:</strong> {us.iWantTo} | <strong>So that:</strong> {us.soThat}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Project Detail Page (SVGs, Analytics, and AI Risks) ────────────────────
function ProjectDetail({
  project,
  projects,
  setProjects,
  epics,
  setEpics,
  stories,
  setStories,
  sprints,
  setSprints,
  tasks,
  setTasks,
  risks,
  setRisks,
  employees,
  onBack,
  onDeleteProject,
  addNotification
}) {
  const [subTab, setSubTab] = useState("overview");
  const [apiLoading, setApiLoading] = useState(false);
  const [riskFilter, setRiskFilter] = useState(null);
  const [aiInput, setAiInput] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("prismpm.groqApiKey") || "");
  const [docParsing, setDocParsing] = useState(false);
  const [docFileName, setDocFileName] = useState("");
  const [docError, setDocError] = useState("");
  const docFileInputRef = useRef(null);

  const projectStories = stories.filter(s => s.projectId === project.id);
  const projectRisks = risks.filter(r => r.projectId === project.id);
  const projectEpics = epics.filter(e => e.projectId === project.id);

  const hasWeeklyData = project.weeklyLogs && project.weeklyLogs.length > 0;
  const [selectedWeek, setSelectedWeek] = useState(1);

  // If we have weekly data, get current week's log
  const currentWeekLog = hasWeeklyData
    ? project.weeklyLogs.find(w => w.week === selectedWeek) || project.weeklyLogs[0]
    : null;

  // Dynamically calculate values based on selected week (if generated) or project states
  const totalStoriesCount = projectStories.length;
  const completedStoriesCount = projectStories.filter(s => s.status === "Done").length;
  
  const totalPoints = projectStories.reduce((sum, s) => sum + s.points, 0);
  const completedPoints = hasWeeklyData && currentWeekLog
    ? currentWeekLog.donePoints
    : projectStories.filter(s => s.status === "Done").reduce((sum, s) => sum + s.points, 0);

  const progress = hasWeeklyData && currentWeekLog
    ? Math.round((currentWeekLog.donePoints / (currentWeekLog.donePoints + currentWeekLog.remainingPoints)) * 100) || 0
    : (totalPoints > 0 ? Math.round((completedStoriesCount / totalPoints) * 100) : 0);

  const elapsed = project.elapsed || (hasWeeklyData ? project.weeklyLogs.length * 7 : 0);
  const spent = project.spent || 0;

  const delayDays = hasWeeklyData && currentWeekLog ? currentWeekLog.delayDays : 0;
  
  // Only reveal risks whose encounteredWeek has been simulated
  const simulatedWeekCount = project.weeklyLogs ? project.weeklyLogs.length : 0;
  const activeRisks = simulatedWeekCount === 0
    ? []
    : projectRisks.filter(r => !r.encounteredWeek || r.encounteredWeek <= selectedWeek);

  const handleDocumentUpload = async (file) => {
    if (!file) return;
    setDocError("");
    setDocParsing(true);
    setDocFileName(file.name);
    const ext = file.name.split(".").pop().toLowerCase();

    try {
      if (ext === "pdf") {
        // Load pdf.js from CDN
        const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          fullText += content.items.map(item => item.str).join(" ") + "\n";
        }
        setAiInput(prev => prev ? prev + "\n\n--- Extracted from " + file.name + " ---\n" + fullText.trim() : fullText.trim());
      } else if (ext === "docx") {
        // Load mammoth via script tag since its CDN build doesn't work as ES module
        await new Promise((resolve, reject) => {
          if (window.mammoth) return resolve();
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.8.0/mammoth.browser.min.js";
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load mammoth.js"));
          document.head.appendChild(script);
        });
        const arrayBuffer = await file.arrayBuffer();
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        const text = result.value.trim();
        setAiInput(prev => prev ? prev + "\n\n--- Extracted from " + file.name + " ---\n" + text : text);
      } else {
        setDocError("Only PDF and DOCX files are supported.");
        setDocFileName("");
      }
    } catch (err) {
      setDocError("Failed to parse document: " + err.message);
      setDocFileName("");
    } finally {
      setDocParsing(false);
    }
  };

  const handleRunAIGenerator = async () => {
    if (!aiInput.trim()) {
      alert("Please provide some project descriptions or requirements text.");
      return;
    }
    const key = apiKey || localStorage.getItem("prismpm.groqApiKey") || import.meta.env.VITE_GROQ_API_KEY || "";
    if (!key) {
      alert("Please provide a Groq API key.");
      return;
    }
    setApiLoading(true);
    try {
      const projectContext = `Project Name: ${project.name}
Description: ${project.description}
Requirements: ${aiInput}`;

      const teamRoster = project.team && project.team.length > 0
        ? project.team.map(m => `${m.name} (${m.role})`).join(", ")
        : employees.slice(0, 6).map(m => `${m.name} (${m.role})`).join(", ");

      // ── Call 1: Epics, Stories, Sprints, Tasks, Risks ──
      const structurePrompt = `${projectContext}
Available team members: ${teamRoster}

Generate a project structure with 3-4 epics, 6-8 user stories, 3 sprints, 2-3 tasks per story, and 3-4 risks.
For Risks, assign encounteredWeek from 1 to 4.
For stories and tasks, assign a team member from the available list based on their role and the work required.

Return ONLY this JSON (no markdown, no extra text):
{
  "epics": [{ "name": "string", "description": "string" }],
  "stories": [{ "title": "string", "description": "As a... I want to... So that...", "points": 5, "priority": "High", "moscow": "Must Have", "epicName": "string", "sprintName": "Sprint 1", "assignee": "Name from team roster" }],
  "sprints": [{ "name": "Sprint 1", "goal": "string", "startDate": "2026-06-01", "endDate": "2026-06-14" }],
  "tasks": [{ "storyTitle": "string", "name": "string", "priority": "High", "due": "2026-06-05", "description": "string", "assignee": "Name from team roster" }],
  "risks": [{ "title": "string", "severity": "High", "impact": "string", "probability": 70, "category": "Technical", "mitigationPlan": "string", "encounteredWeek": 2 }]
}`;

      const [result] = await Promise.all([
        callGroq(structurePrompt, "You are an expert project manager AI. Always respond with valid JSON only.", key),
      ]);

      const mergedResult = { ...result, weeklyLogs: [] };
      if (mergedResult) {
        const epicMap = {};
        const sprintMap = {};
        const storyMap = {};

        const generatedEpics = (mergedResult.epics || []).map(ep => {
          const id = Date.now() + Math.random();
          epicMap[ep.name] = id;
          return {
            id,
            projectId: project.id,
            name: ep.name,
            description: ep.description || "",
            status: "To Do",
            progress: 0
          };
        });

        const generatedSprints = (mergedResult.sprints || []).map(sp => {
          const id = Date.now() + Math.random();
          sprintMap[sp.name] = id;
          return {
            id,
            projectId: project.id,
            name: sp.name,
            goal: sp.goal || "",
            startDate: sp.startDate || "",
            endDate: sp.endDate || "",
            status: "Planned" // always start blank — simulation drives sprint progress
          };
        });

        const generatedStories = (mergedResult.stories || []).map(st => {
          const id = Date.now() + Math.random();
          storyMap[st.title] = id;
          return {
            id,
            projectId: project.id,
            epicId: epicMap[st.epicName] || null,
            sprintId: sprintMap[st.sprintName] || null,
            title: st.title,
            description: st.description || "",
            points: Number(st.points) || 3,
            priority: st.priority || "Medium",
            moscow: st.moscow || "Should Have",
            status: "Backlog", // always start blank — simulation drives progress
            assignee: st.assignee || null,
            score: 50
          };
        });

        const generatedTasks = (mergedResult.tasks || []).map(tk => {
          return {
            id: Date.now() + Math.random(),
            storyId: storyMap[tk.storyTitle] || null,
            projectId: project.id,
            name: tk.name,
            status: "To Do", // always start blank — simulation drives progress
            priority: tk.priority || "Medium",
            due: tk.due || "",
            assignee: tk.assignee || null,
            description: tk.description || "",
            attachments: [],
            comments: []
          };
        });

        const generatedRisks = (mergedResult.risks || []).map(rk => {
          return {
            id: Date.now() + Math.random(),
            projectId: project.id,
            title: rk.title,
            severity: rk.severity || "Medium",
            impact: rk.impact || "",
            probability: Number(rk.probability) || 50,
            category: rk.category || "Technical",
            mitigationPlan: rk.mitigationPlan || "",
            encounteredWeek: Number(rk.encounteredWeek) || 1
          };
        });

        setEpics(prev => [...prev.filter(e => e.projectId !== project.id), ...generatedEpics]);
        setSprints(prev => [...prev.filter(s => s.projectId !== project.id), ...generatedSprints]);
        setStories(prev => [...prev.filter(s => s.projectId !== project.id), ...generatedStories]);
        setTasks(prev => [...prev.filter(t => t.projectId !== project.id), ...generatedTasks]);
        setRisks(prev => [...prev.filter(r => r.projectId !== project.id), ...generatedRisks]);

        if (apiKey) {
          localStorage.setItem("prismpm.groqApiKey", apiKey);
        }

        setProjects(prev => prev.map(p => {
          if (p.id === project.id) {
            return {
              ...p,
              weeklyLogs: [],
              progress: 0,
              elapsed: 0,
              spent: 0
            };
          }
          return p;
        }));

        addNotification(`AI successfully generated full project setup for ${project.name}.`, "system");
        setSelectedWeek(1);
        alert("Project setup successfully generated!");
      }
    } catch (e) {
      alert("AI generation failed: " + e.message);
    } finally {
      setApiLoading(false);
    }
  };

  const [simulateLoading, setSimulateLoading] = useState(false);

  const handleSimulateWeek = async () => {
    const key = apiKey || localStorage.getItem("prismpm.groqApiKey") || import.meta.env.VITE_GROQ_API_KEY || "";
    if (!key) { alert("Please provide a Groq API key in the AI Setup tab."); return; }

    const existingLogs = project.weeklyLogs || [];
    const nextWeek = existingLogs.length + 1;
    const projectStoryList = stories.filter(s => s.projectId === project.id);

    // Block simulation if AI Generator hasn't been run yet
    if (projectStoryList.length === 0) {
      alert("No project data found. Please go to AI Setup, upload a document or paste requirements, and run the AI Generator first."); return;
    }
    if (!aiInput.trim() && existingLogs.length === 0) {
      alert("Please upload a document or paste requirements text in the AI Setup tab before simulating."); return;
    }

    const totalPts = projectStoryList.reduce((sum, s) => sum + (s.points || 0), 0);
    const prevLog = existingLogs[existingLogs.length - 1] || null;
    const prevDone = prevLog ? prevLog.donePoints : 0;
    const prevRemaining = prevLog ? prevLog.remainingPoints : totalPts;

    if (prevRemaining <= 0 && existingLogs.length > 0) {
      alert("Project is already 100% complete — no more weeks to simulate."); return;
    }

    setSimulateLoading(true);
    try {
      const sprintList = sprints.filter(s => s.projectId === project.id);
      const epicList = epics.filter(e => e.projectId === project.id);
      const riskList = risks.filter(r => r.projectId === project.id);

      const context = `Project: ${project.name}
Description: ${project.description}
Total Story Points: ${totalPts}
Sprints: ${sprintList.map(s => s.name).join(", ")}
Epics: ${epicList.map(e => e.name).join(", ")}
Known Risks: ${riskList.map(r => r.title).join(", ")}
Previous weeks simulated: ${existingLogs.length}
Points done so far: ${prevDone}
Points remaining: ${prevRemaining}
Stories: ${projectStoryList.map(s => `${s.title} (${s.points}pts, ${s.status})`).join("; ")}`;

      const prompt = `${context}

You are simulating Week ${nextWeek} of execution for this project.
Based on the backlog and remaining story points (${prevRemaining} pts left), decide:
- How many points get completed this week (realistic, accounting for team velocity and possible blockers)
- Which stories move to "In Progress" or "Done" this week
- Whether any delays or new risks occur
- Burndown for each of the 7 days this week (array of 7 numbers, decreasing)
- Velocity target vs actual

Return ONLY this JSON:
{
  "week": ${nextWeek},
  "label": "Week ${nextWeek}",
  "donePoints": <cumulative points done including this week>,
  "remainingPoints": <points still left after this week>,
  "delayDays": <0 if on track, positive number if behind>,
  "velocityTarget": <expected points this week>,
  "velocityActual": <actual points completed this week>,
  "burndownPoints": [<7 daily values, starting from remaining at week start, ending at remaining after week>],
  "risks": [<array of risk strings that surfaced this week, can be empty>],
  "storyUpdates": [{ "title": "<story title>", "status": "In Progress" | "Done" }],
  "weekSummary": "<2-3 sentence natural language summary of what happened this week>"
}`;

      const result = await callGroq(prompt, "You are an expert agile project manager AI. Always respond with valid JSON only.", key);

      // If callGroq fell back to {raw: text}, JSON.parse failed — surface the error
      if (result && result.raw) {
        alert("AI returned malformed JSON. Try again — the model occasionally truncates responses.");
        return;
      }

      if (result && result.week) {
        // Apply story status updates from AI
        if (result.storyUpdates && result.storyUpdates.length > 0) {
          setStories(prev => prev.map(s => {
            if (s.projectId !== project.id) return s;
            const update = result.storyUpdates.find(u => u.title === s.title);
            return update ? { ...s, status: update.status } : s;
          }));
        }

        // If project is fully complete, force ALL stories to Done so Gantt/epics reflect 100%
        if ((result.remainingPoints ?? prevRemaining) <= 0) {
          setStories(prev => prev.map(s =>
            s.projectId === project.id ? { ...s, status: "Done" } : s
          ));
        }

        // Append the new weekly log, update elapsed days and spent budget
        setProjects(prev => prev.map(p => {
          if (p.id !== project.id) return p;
          const newLog = {
            week: result.week,
            label: result.label || `Week ${nextWeek}`,
            donePoints: result.donePoints || prevDone,
            remainingPoints: result.remainingPoints ?? prevRemaining,
            delayDays: result.delayDays || 0,
            velocityTarget: result.velocityTarget || 10,
            velocityActual: result.velocityActual || 0,
            burndownPoints: result.burndownPoints || [],
            risks: result.risks || [],
            weekSummary: result.weekSummary || ""
          };
          const updatedLogs = [...(p.weeklyLogs || []), newLog];

          // Budget burn: proportional to points done + 5% overrun per delay day
          const totalPts = (newLog.donePoints + newLog.remainingPoints) || 1;
          const baseSpend = Math.round(p.budget * (newLog.donePoints / totalPts));
          const delayOverrun = Math.round(p.budget * 0.005 * (newLog.delayDays || 0));
          const newSpent = Math.min(baseSpend + delayOverrun, Math.round(p.budget * 1.15)); // cap at 15% over budget

          return {
            ...p,
            weeklyLogs: updatedLogs,
            elapsed: updatedLogs.length * 7,
            spent: newSpent,
          };
        }));

        setSelectedWeek(nextWeek);
        addNotification(`Week ${nextWeek} simulated: ${result.velocityActual} pts completed. ${result.delayDays > 0 ? `⚠️ ${result.delayDays} day delay.` : "✅ On track."}`, "system");
      } else {
        alert("AI returned an unexpected response. Please try again.");
      }
    } catch (e) {
      alert("Simulation failed: " + e.message);
    } finally {
      setSimulateLoading(false);
    }
  };

  const exportProjectPDF = () => {
    const w = window.open("", "_blank");
    const epicsHtml = projectEpics.map(ep => {
      const epStories = projectStories.filter(s => s.epicId === ep.id);
      return `<h3 style="color:#b8860b;margin:12px 0 4px">${ep.name}</h3>
        <ul>${epStories.map(s => `<li>${s.title} — <b>${s.points}pts</b> — ${s.status}${s.assignee ? ` — 👤 ${s.assignee}` : ""}</li>`).join("")}</ul>`;
    }).join("");
    const risksHtml = activeRisks.map(r =>
      `<tr><td>${r.title}</td><td>${r.severity}</td><td>${r.probability}%</td><td>${r.mitigationPlan}</td></tr>`
    ).join("");
    const weeksHtml = (project.weeklyLogs || []).map(l =>
      `<tr><td>Week ${l.week}</td><td>${l.donePoints}</td><td>${l.remainingPoints}</td><td>${l.velocityActual}</td><td>${l.delayDays}d</td></tr>`
    ).join("");

    w.document.write(`<!DOCTYPE html><html><head><title>Project Report — ${project.name}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:40px;color:#111;max-width:900px;margin:0 auto}
      h1{color:#000;border-bottom:3px solid #FFD700;padding-bottom:8px}
      h2{color:#333;margin-top:28px;border-left:4px solid #FFD700;padding-left:10px}
      h3{color:#555}
      table{width:100%;border-collapse:collapse;margin:12px 0}
      th{background:#222;color:#FFD700;padding:8px;text-align:left;font-size:12px}
      td{padding:7px 8px;border-bottom:1px solid #eee;font-size:12px}
      .kpi{display:inline-block;background:#f5f5f5;border:1px solid #ddd;border-radius:8px;padding:10px 20px;margin:6px;text-align:center}
      .kpi b{display:block;font-size:22px;color:#b8860b}
      @media print{body{padding:20px}}
    </style></head><body>
    <h1>📋 Project Status Report</h1>
    <p><b>Project:</b> ${project.name} &nbsp;|&nbsp; <b>Client:</b> ${project.client} &nbsp;|&nbsp; <b>Type:</b> ${project.type}</p>

    <h2>Key Metrics</h2>
    <div>
      <div class="kpi"><b>${progress}%</b>Progress</div>
      <div class="kpi"><b>$${(project.spent||0).toLocaleString()} / $${project.budget.toLocaleString()}</b>Budget</div>
      <div class="kpi"><b>${completedStoriesCount}/${totalStoriesCount}</b>Stories Done</div>
      <div class="kpi"><b>${elapsed} days</b>Elapsed</div>
      <div class="kpi"><b>${delayDays}d</b>Delay</div>
    </div>

    <h2>Epics & Stories</h2>${epicsHtml}

    <h2>Weekly Execution Log</h2>
    <table><thead><tr><th>Week</th><th>Points Done</th><th>Remaining</th><th>Velocity</th><th>Delay</th></tr></thead>
    <tbody>${weeksHtml}</tbody></table>

    <h2>Risk Register</h2>
    <table><thead><tr><th>Risk</th><th>Severity</th><th>Probability</th><th>Mitigation</th></tr></thead>
    <tbody>${risksHtml}</tbody></table>

    <p style="margin-top:40px;color:#999;font-size:11px">Generated by PrismPM · ${new Date().toLocaleString()}</p>
    <script>window.onload=()=>{window.print()}<\/script>
    </body></html>`);
    w.document.close();
  };

  const exportProjectDOCX = () => {
    const epicsHtml = projectEpics.map(ep => {
      const epStories = projectStories.filter(s => s.epicId === ep.id);
      return `<h3>${ep.name}</h3><ul>${epStories.map(s =>
        `<li>${s.title} — ${s.points}pts — ${s.status}${s.assignee ? ` — ${s.assignee}` : ""}</li>`
      ).join("")}</ul>`;
    }).join("");
    const risksRows = activeRisks.map(r =>
      `<tr><td>${r.title}</td><td>${r.severity}</td><td>${r.probability}%</td><td>${r.mitigationPlan}</td></tr>`
    ).join("");
    const weeksRows = (project.weeklyLogs || []).map(l =>
      `<tr><td>Week ${l.week}</td><td>${l.donePoints}</td><td>${l.remainingPoints}</td><td>${l.velocityActual}</td><td>${l.delayDays}d</td></tr>`
    ).join("");

    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office'
      xmlns:w='urn:schemas-microsoft-com:office:word'
      xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'><title>Project Report</title>
    <style>
      body{font-family:Calibri,Arial,sans-serif;font-size:11pt}
      h1{font-size:18pt;color:#1a1a1a;border-bottom:2pt solid #b8860b}
      h2{font-size:13pt;color:#333;border-left:4pt solid #b8860b;padding-left:6pt}
      h3{font-size:11pt;color:#555}
      table{border-collapse:collapse;width:100%}
      th{background:#222;color:#FFD700;padding:5pt;font-size:9pt;border:1pt solid #aaa}
      td{padding:4pt;border:1pt solid #ddd;font-size:9pt}
    </style></head><body>
    <h1>Project Status Report — ${project.name}</h1>
    <p><b>Client:</b> ${project.client} &nbsp; <b>Type:</b> ${project.type} &nbsp; <b>Generated:</b> ${new Date().toLocaleDateString()}</p>
    <h2>Key Metrics</h2>
    <table><tr><th>Progress</th><th>Budget Spent</th><th>Budget Total</th><th>Stories Done</th><th>Elapsed</th><th>Delay</th></tr>
    <tr><td>${progress}%</td><td>$${(project.spent||0).toLocaleString()}</td><td>$${project.budget.toLocaleString()}</td><td>${completedStoriesCount}/${totalStoriesCount}</td><td>${elapsed}d</td><td>${delayDays}d</td></tr></table>
    <h2>Epics &amp; Stories</h2>${epicsHtml}
    <h2>Weekly Execution Log</h2>
    <table><tr><th>Week</th><th>Points Done</th><th>Remaining</th><th>Velocity</th><th>Delay</th></tr>${weeksRows}</table>
    <h2>Risk Register</h2>
    <table><tr><th>Risk</th><th>Severity</th><th>Probability</th><th>Mitigation</th></tr>${risksRows}</table>
    </body></html>`;

    const blob = new Blob(["\ufeff" + html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Report_${project.name.replace(/\s+/g, "_")}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getRiskScore = (r) => {
    const p = Math.ceil(r.probability / 20);
    let impVal = 3;
    if (r.severity === "Low") impVal = 1;
    if (r.severity === "Medium") impVal = 3;
    if (r.severity === "High") impVal = 4;
    if (r.severity === "Critical") impVal = 5;
    return { x: p, y: impVal };
  };

  const heatmapData = Array.from({ length: 5 }, (_, yIndex) => {
    const y = 5 - yIndex;
    return Array.from({ length: 5 }, (_, xIndex) => {
      const x = xIndex + 1;
      const matches = activeRisks.filter(r => {
        const coords = getRiskScore(r);
        return coords.x === x && coords.y === y;
      });
      return { x, y, count: matches.length, items: matches };
    });
  });

  const getEpicWeeks = (epicId) => {
    const epicStories = projectStories.filter(s => s.epicId === epicId);
    if (epicStories.length === 0) return { start: 1, end: 1 };
    let start = 4;
    let end = 1;
    epicStories.forEach(s => {
      const sprint = sprints.find(sp => sp.id === s.sprintId);
      if (sprint) {
        const sprintIndex = sprints.filter(sp => sp.projectId === project.id).findIndex(sp => sp.id === sprint.id);
        const sprintStartWeek = sprintIndex >= 0 ? sprintIndex * 2 + 1 : 1;
        const sprintEndWeek = sprintStartWeek + 1;
        if (sprintStartWeek < start) start = sprintStartWeek;
        if (sprintEndWeek > end) end = sprintEndWeek;
      }
    });
    return { start: Math.max(1, start), end: Math.min(4, end) };
  };

  // Build points path for Burndown
  let burndownPointsStr = "";
  if (hasWeeklyData) {
    const totalWeeks = project.weeklyLogs.length;
    const actualPoints = [];
    for (let i = 0; i < selectedWeek; i++) {
      const log = project.weeklyLogs[i];
      const x = 20 + (i / (totalWeeks - 1 || 1)) * 260;
      const totalPt = log.donePoints + log.remainingPoints;
      const ratio = totalPt > 0 ? (log.remainingPoints / totalPt) : 1;
      const y = 20 + ratio * 110;
      actualPoints.push(`${x},${y}`);
    }
    burndownPointsStr = actualPoints.join(" ");
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <button onClick={onBack} className="text-slate-400 hover:text-[#FFE600] text-xs font-semibold uppercase tracking-wider">
          ← Back to Portfolio
        </button>
        <div className="flex gap-2">
          <div className="flex gap-2">
            <button onClick={exportProjectPDF} className="px-3.5 py-1.5 bg-[#2E2E2E] border border-white/10 text-white text-xs font-bold rounded-xl hover:border-[#FFE600] transition-all">
              Export PDF
            </button>
            <button onClick={exportProjectDOCX} className="px-3.5 py-1.5 bg-[#2E2E2E] border border-white/10 text-white text-xs font-bold rounded-xl hover:border-[#FFE600] transition-all">
              Export DOCX
            </button>
          </div>
          <button onClick={() => onDeleteProject(project.id)} className="px-3.5 py-1.5 bg-red-950/40 border border-red-800/20 text-red-400 text-xs font-bold rounded-xl">
            Delete Project
          </button>
        </div>
      </div>

      {/* Project info card */}
      <div className="bg-[#2E2E2E]/40 border border-white/10 rounded-2xl p-6">
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div className="space-y-2">
            <h2 className="text-white text-2xl font-extrabold">{project.name}</h2>
            <p className="text-slate-400 text-xs">{project.description}</p>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-500 uppercase block">Progress Rate</span>
            <span className="text-2xl font-mono font-bold text-[#FFE600]">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Week-by-Week projection/history control */}
      {hasWeeklyData ? (
        <div className="bg-[#2E2E2E]/30 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="text-white text-xs font-bold uppercase tracking-widest">
              Execution Timeline — <strong className="text-[#FFE600] font-mono">Week {selectedWeek}</strong> of {project.weeklyLogs.length}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {project.weeklyLogs.map(log => (
                <button
                  key={log.week}
                  onClick={() => setSelectedWeek(log.week)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all ${
                    selectedWeek === log.week ? "bg-[#FFE600] text-black" : "bg-black/45 text-slate-400 hover:text-white"
                  }`}
                >
                  W{log.week}
                </button>
              ))}
              {simulateLoading ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 rounded-lg">
                  <div className="w-3 h-3 border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] text-[#FFE600] font-bold">Simulating...</span>
                </div>
              ) : (
                <button
                  onClick={handleSimulateWeek}
                  disabled={!aiInput.trim() && stories.filter(s => s.projectId === project.id).length === 0}
                  title={!aiInput.trim() && stories.filter(s => s.projectId === project.id).length === 0 ? "Upload a document and run AI Generator first" : ""}
                  className="px-3 py-1.5 bg-[#FFE600] text-black text-xs font-extrabold uppercase tracking-wider rounded-lg hover:bg-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ▶ Simulate Week {project.weeklyLogs.length + 1}
                </button>
              )}
            </div>
          </div>
          <input
            type="range"
            min="1"
            max={project.weeklyLogs.length}
            value={selectedWeek}
            onChange={e => setSelectedWeek(Number(e.target.value))}
            className="w-full accent-[#FFE600] cursor-pointer"
          />
          {currentWeekLog?.weekSummary && (
            <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-xs text-slate-300 italic leading-relaxed">
              <span className="text-[#FFE600] font-bold not-italic">Week {selectedWeek} Summary: </span>
              {currentWeekLog.weekSummary}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-amber-950/20 border border-amber-800/30 rounded-2xl p-4 text-xs text-amber-300 flex justify-between items-center gap-4 flex-wrap">
          <span>⚠️ No weeks simulated yet. Run the AI Generator first to set up the project, then use <strong>Simulate Week</strong> to step through execution.</span>
          {simulateLoading ? (
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] text-[#FFE600] font-bold">Simulating...</span>
            </div>
          ) : (
            <button
              onClick={handleSimulateWeek}
              disabled={stories.filter(s => s.projectId === project.id).length === 0}
              className="px-4 py-2 bg-[#FFE600] text-black text-xs font-extrabold uppercase tracking-wider rounded-xl hover:bg-white transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              ▶ Simulate Week 1
            </button>
          )}
        </div>
      )}

      {/* Sub sections nav */}
      <div className="flex gap-1 bg-[#2E2E2E] p-1 rounded-xl w-fit">
        {["overview", "analytics", "risks", "AI Setup"].map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${subTab === t ? "bg-[#FFE600] text-black" : "text-slate-400 hover:text-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Overview */}
      {subTab === "overview" && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-[#2E2E2E]/20 p-5 rounded-2xl border border-white/5 text-center">
              <span className="text-slate-500 text-xs font-bold uppercase block mb-1">Story Points Complete</span>
              <div className="font-mono text-3xl font-black text-white">
                {completedPoints} <span className="text-slate-600 text-lg">/ {totalPoints || 0} pts</span>
              </div>
            </div>
            <div className="bg-[#2E2E2E]/20 p-5 rounded-2xl border border-white/5 text-center">
              <span className="text-slate-500 text-xs font-bold uppercase block mb-1">Elapsed Timeline</span>
              <div className="font-mono text-3xl font-black text-white">
                {elapsed} <span className="text-slate-600 text-lg">/ {project.plannedDays} Days</span>
              </div>
            </div>
            <div className="bg-[#2E2E2E]/20 p-5 rounded-2xl border border-white/5 text-center">
              <span className="text-slate-500 text-xs font-bold uppercase block mb-1">Timeline Delay / Lag</span>
              <div className={`font-mono text-3xl font-black ${delayDays > 0 ? "text-red-400" : "text-white"}`}>
                {delayDays} <span className="text-slate-600 text-lg">Days</span>
              </div>
            </div>
            <div className="bg-[#2E2E2E]/20 p-5 rounded-2xl border border-white/5 text-center">
              <span className="text-slate-500 text-xs font-bold uppercase block mb-1">Total Epics</span>
              <div className="font-mono text-3xl font-black text-white">{projectEpics.length}</div>
            </div>
          </div>

          {hasWeeklyData && simulatedWeekCount > 0 && (() => {
            const weekRisks = projectRisks.filter(r => r.encounteredWeek === selectedWeek);
            if (weekRisks.length === 0) return null;
            return (
              <div className="bg-[#2E2E2E]/20 p-5 rounded-2xl border border-white/5">
                <h4 className="text-white text-xs font-bold uppercase tracking-widest mb-3">Risks Encountered in Week {selectedWeek}</h4>
                <ul className="space-y-2">
                  {weekRisks.map(r => (
                    <li key={r.id} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className={`flex-shrink-0 font-bold text-[10px] px-1.5 py-0.5 rounded ${r.severity === "Critical" ? "bg-red-900/50 text-red-300" : r.severity === "High" ? "bg-orange-900/50 text-orange-300" : "bg-yellow-900/30 text-yellow-300"}`}>
                        {r.severity}
                      </span>
                      <span>{r.title} — <span className="text-slate-500">{r.mitigationPlan}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>
      )}

      {/* Analytics (SVG Burndown and Velocity, plus Gantt Chart) */}
      {subTab === "analytics" && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            {/* SVG Burndown Chart */}
            <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-5 space-y-3">
              <h4 className="text-white text-xs font-bold uppercase tracking-widest">Sprint Burndown Chart</h4>
              <div className="w-full flex justify-center bg-black/40 p-3 rounded-xl min-h-[160px] items-center">
                {!hasWeeklyData ? (
                  <span className="text-slate-500 text-xs">No Burndown Data. Run AI Generator.</span>
                ) : (
                  <svg viewBox="0 0 300 150" className="w-full max-w-sm">
                    <line x1="20" y1="10" x2="20" y2="130" stroke="#444" strokeWidth="1" />
                    <line x1="20" y1="130" x2="280" y2="130" stroke="#444" strokeWidth="1" />
                    <line x1="20" y1="20" x2="280" y2="130" stroke="#555" strokeDasharray="3,3" strokeWidth="1.5" />
                    <polyline
                      fill="none"
                      stroke="#FFE600"
                      strokeWidth="2.5"
                      points={`20,20 ${burndownPointsStr}`}
                    />
                    <text x="25" y="15" fill="#aaa" fontSize="8" fontFamily="monospace">Planned (Ideal)</text>
                    <text x="180" y="55" fill="#FFE600" fontSize="8" fontFamily="monospace">Actual (W{selectedWeek})</text>
                    <text x="140" y="145" fill="#666" fontSize="8" fontFamily="monospace">Weeks 1 - {project.weeklyLogs.length}</text>
                  </svg>
                )}
              </div>
            </div>

            {/* SVG Velocity Chart */}
            <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-5 space-y-3">
              <h4 className="text-white text-xs font-bold uppercase tracking-widest">Sprint Velocity Chart</h4>
              <div className="w-full flex justify-center bg-black/40 p-3 rounded-xl min-h-[160px] items-center">
                {!hasWeeklyData ? (
                  <span className="text-slate-500 text-xs">No Velocity Data. Run AI Generator.</span>
                ) : (
                  <svg viewBox="0 0 300 150" className="w-full max-w-sm">
                    <line x1="20" y1="10" x2="20" y2="130" stroke="#444" />
                    <line x1="20" y1="130" x2="280" y2="130" stroke="#444" />
                    {project.weeklyLogs.slice(0, selectedWeek).map((log, idx) => {
                      const spacing = 45;
                      const xStart = 30 + idx * spacing;
                      const maxPts = Math.max(...project.weeklyLogs.map(l => Math.max(l.velocityTarget, l.velocityActual))) || 15;
                      const targetHeight = (log.velocityTarget / maxPts) * 90;
                      const actualHeight = (log.velocityActual / maxPts) * 90;
                      return (
                        <g key={log.week}>
                          <rect
                            x={xStart}
                            y={130 - targetHeight}
                            width={12}
                            height={targetHeight}
                            fill="#2E2E2E"
                            rx={1}
                          />
                          <rect
                            x={xStart + 14}
                            y={130 - actualHeight}
                            width={12}
                            height={actualHeight}
                            fill="#FFE600"
                            rx={1}
                          />
                          <text x={xStart + 7} y="142" fill="#888" fontSize="8">W{log.week}</text>
                        </g>
                      );
                    })}
                    <text x="235" y="40" fill="#888" fontSize="7">■ Target</text>
                    <text x="235" y="55" fill="#FFE600" fontSize="7">■ Actual</text>
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Gantt Timeline Chart */}
          <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-5 space-y-3">
            <h4 className="text-white text-xs font-bold uppercase tracking-widest">Gantt Timeline Projection</h4>
            <div className="w-full bg-black/40 rounded-xl overflow-auto" style={{ maxHeight: 320 }}>
              {!hasWeeklyData ? (
                <div className="flex items-center justify-center h-32 text-slate-500 text-xs">No Gantt Timeline. Simulate at least one week to begin.</div>
              ) : (() => {
                const totalWeeks = project.weeklyLogs.length;
                const COL_W = 52;
                const ROW_H = 28;
                const LABEL_W = 130;
                const HEADER_H = 22;
                const PAD_BOTTOM = 20;
                const svgW = LABEL_W + totalWeeks * COL_W;
                const svgH = HEADER_H + projectEpics.length * ROW_H + PAD_BOTTOM;

                const getEpicSpan = (epicId) => {
                  const epicStories = projectStories.filter(s => s.epicId === epicId);
                  if (epicStories.length === 0) return { start: 1, end: totalWeeks };
                  const projectSprintList = sprints.filter(sp => sp.projectId === project.id);
                  let start = Infinity, end = 0;
                  epicStories.forEach(s => {
                    const spIdx = projectSprintList.findIndex(sp => sp.id === s.sprintId);
                    if (spIdx >= 0) {
                      const sw = spIdx * 2 + 1;
                      const ew = Math.min(sw + 1, totalWeeks);
                      if (sw < start) start = sw;
                      if (ew > end) end = ew;
                    }
                  });
                  if (!isFinite(start)) return { start: 1, end: totalWeeks };
                  return { start: Math.max(1, start), end: Math.min(totalWeeks, end) };
                };

                const getEpicProgress = (epicId) => {
                  const epicStories = projectStories.filter(s => s.epicId === epicId);
                  if (!epicStories.length) return 0;
                  return epicStories.filter(s => s.status === "Done").length / epicStories.length;
                };

                return (
                  <svg
                    width={svgW}
                    height={svgH}
                    style={{ display: "block", fontFamily: "monospace" }}
                  >
                    {/* Column stripes + headers */}
                    {Array.from({ length: totalWeeks }).map((_, i) => (
                      <g key={i}>
                        <rect
                          x={LABEL_W + i * COL_W} y={0}
                          width={COL_W} height={svgH - PAD_BOTTOM}
                          fill={i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}
                        />
                        <text
                          x={LABEL_W + i * COL_W + COL_W / 2} y={14}
                          fill={i + 1 === selectedWeek ? "#FFE600" : "#555"}
                          fontSize="9" textAnchor="middle" fontWeight="bold"
                        >W{i + 1}</text>
                      </g>
                    ))}

                    {/* Epic rows */}
                    {projectEpics.map((ep, idx) => {
                      const { start, end } = getEpicSpan(ep.id);
                      const progress = getEpicProgress(ep.id);
                      const isCompleted = progress >= 1;
                      const barX = LABEL_W + (start - 1) * COL_W + 2;
                      const barW = (end - start + 1) * COL_W - 4;
                      const barY = HEADER_H + idx * ROW_H + 5;
                      const barH = 14;

                      const epicLogs = project.weeklyLogs.filter(l => l.week >= start && l.week <= end);
                      const totalDelay = epicLogs.reduce((sum, l) => sum + (l.delayDays || 0), 0);
                      const delayW = totalDelay > 0 ? Math.min(Math.round((totalDelay / 7) * COL_W), COL_W - 2) : 0;

                      return (
                        <g key={ep.id}>
                          <line x1={0} y1={HEADER_H + idx * ROW_H} x2={svgW} y2={HEADER_H + idx * ROW_H} stroke="#1a1a1a" strokeWidth="1" />
                          {/* Label */}
                          <text x={6} y={barY + barH / 2 + 3.5}
                            fill={isCompleted ? "#22c55e" : "#aaa"}
                            fontSize="8" fontWeight="bold">
                            {ep.name.length > 17 ? ep.name.substring(0, 17) + "…" : ep.name}{isCompleted ? " ✓" : ""}
                          </text>
                          {/* Track */}
                          <rect x={barX} y={barY} width={barW} height={barH} fill="#111" rx="3" />
                          {/* Fill */}
                          <rect x={barX} y={barY} width={Math.max(3, barW * progress)} height={barH}
                            fill={isCompleted ? "#22c55e" : "#FFE600"} rx="3" opacity="0.9" />
                          {/* Delay */}
                          {delayW > 0 && (
                            <rect x={barX + barW} y={barY + 3} width={delayW} height={barH - 6}
                              fill="#ef4444" rx="2" opacity="0.85" />
                          )}
                          {/* % label */}
                          {barW > 24 && (
                            <text x={barX + 4} y={barY + barH / 2 + 3.5}
                              fill={isCompleted ? "#fff" : "#000"} fontSize="7" fontWeight="bold">
                              {Math.round(progress * 100)}%
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* Current week line */}
                    <line
                      x1={LABEL_W + (selectedWeek - 1) * COL_W} y1={HEADER_H}
                      x2={LABEL_W + (selectedWeek - 1) * COL_W} y2={svgH - PAD_BOTTOM}
                      stroke="#fff" strokeWidth="1" strokeDasharray="3,2" opacity="0.4"
                    />

                    {/* Legend */}
                    <rect x={LABEL_W} y={svgH - 14} width={8} height={6} fill="#FFE600" rx="1" />
                    <text x={LABEL_W + 10} y={svgH - 8} fill="#555" fontSize="7">In Progress</text>
                    <rect x={LABEL_W + 68} y={svgH - 14} width={8} height={6} fill="#22c55e" rx="1" />
                    <text x={LABEL_W + 78} y={svgH - 8} fill="#555" fontSize="7">Complete</text>
                    <rect x={LABEL_W + 130} y={svgH - 14} width={8} height={6} fill="#ef4444" rx="1" />
                    <text x={LABEL_W + 140} y={svgH - 8} fill="#555" fontSize="7">Delay</text>
                  </svg>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Risks heatmap & list */}
      {subTab === "risks" && (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-5 space-y-3">
              <h4 className="text-white text-xs font-bold uppercase tracking-widest">Risk Heatmap (5x5 Grid)</h4>
              <p className="text-[10px] text-slate-500">Click a cell to filter risks.</p>
              
              <div className="w-full flex justify-center py-2">
                {simulatedWeekCount === 0 ? (
                  <div className="text-slate-500 text-xs text-center py-10">No risks revealed yet. Simulate weeks to uncover risks progressively.</div>
                ) : activeRisks.length === 0 ? (
                  <div className="text-slate-500 text-xs text-center py-10">No risks encountered up to Week {selectedWeek} yet.</div>
                ) : (
                  <svg viewBox="0 0 200 200" className="w-full max-w-[200px] mx-auto bg-black/60 p-2 rounded-xl border border-white/10">
                    {heatmapData.map((row, yIdx) =>
                      row.map((cell, xIdx) => {
                        const cellWidth = 34;
                        const gap = 4;
                        const hasActive = cell.count > 0;
                        let fillColor = "rgba(16, 185, 129, 0.15)";
                        let strokeColor = "rgba(16, 185, 129, 0.3)";
                        if (cell.y >= 4 && cell.x >= 4) {
                          fillColor = "rgba(239, 68, 68, 0.4)";
                          strokeColor = "rgba(239, 68, 68, 0.6)";
                        } else if (cell.y >= 3 && cell.x >= 3) {
                          fillColor = "rgba(245, 158, 11, 0.3)";
                          strokeColor = "rgba(245, 158, 11, 0.5)";
                        }

                        const xPos = xIdx * (cellWidth + gap);
                        const yPos = yIdx * (cellWidth + gap);

                        return (
                          <g key={`${cell.x}-${cell.y}`} className="cursor-pointer" onClick={() => {
                            if (hasActive) setRiskFilter({ x: cell.x, y: cell.y });
                            else setRiskFilter(null);
                          }}>
                            <rect
                              x={xPos}
                              y={yPos}
                              width={cellWidth}
                              height={cellWidth}
                              fill={fillColor}
                              stroke={hasActive ? "#FFE600" : strokeColor}
                              strokeWidth={hasActive ? 2 : 1}
                              rx={4}
                            />
                            <text
                              x={xPos + cellWidth / 2}
                              y={yPos + cellWidth / 2 + 3}
                              fill={hasActive ? "#FFE600" : "#555"}
                              fontSize="10"
                              fontWeight="bold"
                              textAnchor="middle"
                            >
                              {cell.count}
                            </text>
                          </g>
                        );
                      })
                    )}
                  </svg>
                )}
              </div>
              
              <div className="flex justify-between text-[9px] text-slate-500 px-2 font-mono">
                <span>← Low Prob</span>
                <span>High Prob →</span>
              </div>
            </div>

            <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-white text-xs font-bold uppercase">Risk Register</span>
                {riskFilter && (
                  <button onClick={() => setRiskFilter(null)} className="text-[10px] text-amber-400">Clear Filter</button>
                )}
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 text-xs">
                {activeRisks
                  .filter(r => {
                    if (!riskFilter) return true;
                    const c = getRiskScore(r);
                    return c.x === riskFilter.x && c.y === riskFilter.y;
                  })
                  .map(risk => (
                    <div key={risk.id} className="bg-black/35 border border-white/5 p-3 rounded-xl space-y-2">
                      <div className="flex justify-between">
                        <strong>{risk.title}</strong>
                        <RiskBadge severity={risk.severity} />
                      </div>
                      <p className="text-[11px] text-slate-400">Mitigation: {risk.mitigationPlan}</p>
                      {risk.encounteredWeek && (
                        <span className="text-[9px] font-mono text-[#FFE600]">Encountered in Week {risk.encounteredWeek}</span>
                      )}
                    </div>
                  ))}
                {activeRisks.length === 0 && (
                  <div className="text-slate-500 text-center py-6">
                    {simulatedWeekCount === 0
                      ? "Simulate weeks to reveal risks progressively."
                      : "No risks encountered up to Week " + selectedWeek + "."}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Setup and Generator tab */}
      {subTab === "AI Setup" && (
        <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-6 space-y-4">
          <h4 className="text-white text-xs font-bold uppercase tracking-widest">AI Project Setup Generator</h4>
          <p className="text-slate-400 text-xs">
            Upload a PDF or Word document, or paste raw requirements text below. The AI will generate Epics, Sprints, User Stories, Tasks, Risks, and weekly tracking logs.
          </p>

          {/* Document Upload Zone */}
          <div
            className="border-2 border-dashed border-white/20 rounded-xl p-5 text-center cursor-pointer hover:border-[#FFE600]/60 transition-all relative"
            onClick={() => docFileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleDocumentUpload(file);
            }}
          >
            <input
              ref={docFileInputRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={e => {
                const file = e.target.files[0];
                if (file) handleDocumentUpload(file);
                e.target.value = "";
              }}
            />
            {docParsing ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400">Reading document...</span>
              </div>
            ) : docFileName ? (
              <div className="flex flex-col items-center gap-1">
                <span className="text-lg">✅</span>
                <span className="text-xs text-[#FFE600] font-semibold">{docFileName}</span>
                <span className="text-[10px] text-slate-500">Text extracted and added below. Click to upload another.</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <span className="text-2xl">📄</span>
                <span className="text-xs text-white font-semibold">Drop a PDF or Word file here</span>
                <span className="text-[10px] text-slate-500">or click to browse &nbsp;·&nbsp; .pdf and .docx supported</span>
              </div>
            )}
          </div>

          {docError && (
            <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
              {docError}
            </div>
          )}

          <div className="relative">
            <textarea
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              rows={6}
              placeholder="Extracted document text will appear here, or type/paste requirements manually..."
              className="w-full bg-black border border-white/20 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-[#FFE600]"
            />
            {aiInput && (
              <button
                onClick={() => { setAiInput(""); setDocFileName(""); setDocError(""); }}
                className="absolute top-2 right-2 text-[10px] text-slate-500 hover:text-red-400 transition-all"
                title="Clear text"
              >
                ✕ Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Groq API Key:</span>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Paste Groq API Key..."
              className="bg-black border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none"
            />
          </div>
          {apiLoading ? (
            <Spinner />
          ) : (
            <button onClick={handleRunAIGenerator} className="px-4 py-2 bg-[#FFE600] text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-white transition-all">
              ✦ Run AI Generator
            </button>
          )}
        </div>
      )}
    </div>
  );
}