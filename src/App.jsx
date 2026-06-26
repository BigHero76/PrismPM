import { useState, useEffect, useRef, Component } from "react";

// ─── Error Boundary ─────────────────────────────────────────────────────────
class TabErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e) { console.error("PrismPM tab error:", e); }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-red-950/20 border border-red-800/30 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">⚠</span>
            <h4 className="text-red-400 font-bold text-sm">Something went wrong rendering this tab</h4>
          </div>
          <p className="text-red-300 text-xs font-mono">{this.state.error?.message || "Unknown error"}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-3 py-1.5 bg-red-800/40 hover:bg-red-700/40 text-red-300 text-xs font-bold rounded-lg transition-all"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const EY = {
  yellow: "#FFE600",
  black: "#000000",
  white: "#FFFFFF",
  darkGray: "#2E2E2E",
  lightGray: "#E5E5E5",
};

// ─── Groq API Helper ────────────────────────────────────────────────────────
const GROQ_MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"];
const GROQ_RETRIES_PER_MODEL = 1;
const GROQ_MAX_WAIT_SECONDS = 30;
const GROQ_MAX_TOKENS_CEILING = 4000;

// ─── Mistral Fallback Config ─────────────────────────────────────────────────
const MISTRAL_MODELS = ["mistral-small-latest", "open-mistral-7b"];
const MISTRAL_API_BASE = "https://api.mistral.ai/v1";

const MODEL_UNAVAILABLE_PATTERN = /deprecated|decommissioned|does not exist|not have access|no access|model unavailable|model not found|unsupported model/i;
const JSON_TRUNCATION_PATTERN = /failed to generate json|failed_generation/i;

// Helper: call a single Mistral model (OpenAI-compatible endpoint)
async function callMistralOnce(model, prompt, systemPrompt, key, maxTokens) {
  const response = await fetch(`${MISTRAL_API_BASE}/chat/completions`, {
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
      max_tokens: maxTokens,
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || data.message || `Mistral request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  const text = data.choices?.[0]?.message?.content || "";
  const clean = text.replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch { return { raw: text }; }
}

// Try Mistral models in sequence; returns parsed JSON or throws
async function callMistralFallback(prompt, systemPrompt, maxTokens) {
  const mistralKey = localStorage.getItem("prismpm.mistralApiKey") || import.meta.env.VITE_MISTRAL_API_KEY || "";
  if (!mistralKey) throw new Error("No Mistral API key set. Add one in AI Setup to enable fallback.");
  let lastErr = null;
  for (const model of MISTRAL_MODELS) {
    try {
      const result = await callMistralOnce(model, prompt, systemPrompt, mistralKey, maxTokens);
      console.info(`[PrismPM] Mistral fallback succeeded with ${model}`);
      return result;
    } catch (e) {
      lastErr = e;
      if (e.status === 429) break; // rate-limited on Mistral too — give up
    }
  }
  throw lastErr || new Error("Mistral fallback failed.");
}

async function callGroqOnce(model, prompt, systemPrompt, key, maxTokens, forceJson = true) {
  // Groq requires the word "json" to appear in messages when using json_object format.
  // Copilot and other plain-text calls must NOT use response_format or Groq rejects them.
  const wantsJson = forceJson && (
    (systemPrompt || "").toLowerCase().includes("json") ||
    prompt.toLowerCase().includes("json") ||
    prompt.toLowerCase().includes("return json") ||
    prompt.toLowerCase().includes("respond with")
  );

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
        max_tokens: maxTokens,
        ...(wantsJson ? { response_format: { type: "json_object" } } : {}),
      }),
    },
  );

  const data = await response.json();
  if (!response.ok) {
    const message = data.error?.message || data.message || `Groq request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const text = data.choices?.[0]?.message?.content || "";
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    return { raw: text };
  }
}

async function callGroq(prompt, systemPrompt = "", apiKey = "", maxTokens = 4000, forceJson = true) {
  const key = apiKey || localStorage.getItem("prismpm.groqApiKey") || import.meta.env.VITE_GROQ_API_KEY || "";

  // ── Try Groq first ──────────────────────────────────────────────────────
  if (key) {
    let lastError = null;
    let effectiveMaxTokens = maxTokens;

    for (const model of GROQ_MODELS) {
      let attempt = 0;
      while (attempt <= GROQ_RETRIES_PER_MODEL) {
        try {
          return await callGroqOnce(model, prompt, systemPrompt, key, effectiveMaxTokens, forceJson);
        } catch (e) {
          lastError = e;

          if (e.status === 429) {
            if (attempt < GROQ_RETRIES_PER_MODEL) {
              const waitMatch = e.message.match(/try again in ([\d.]+)s/i);
              const waitSeconds = waitMatch ? parseFloat(waitMatch[1]) : 3;
              await new Promise(res => setTimeout(res, Math.min(waitSeconds, GROQ_MAX_WAIT_SECONDS) * 1000 + 250));
              attempt++;
              continue;
            }
            break; // rate-limited and out of retries — try next model
          }

          if (JSON_TRUNCATION_PATTERN.test(e.message) && attempt < GROQ_RETRIES_PER_MODEL && effectiveMaxTokens < GROQ_MAX_TOKENS_CEILING) {
            effectiveMaxTokens = Math.min(effectiveMaxTokens * 2, GROQ_MAX_TOKENS_CEILING);
            attempt++;
            continue;
          }

          if (MODEL_UNAVAILABLE_PATTERN.test(e.message) && model !== GROQ_MODELS[GROQ_MODELS.length - 1]) {
            break; // try next Groq model
          }

          // Unexpected error — skip to Mistral fallback
          lastError = e;
          break;
        }
      }
    }

    // ── All Groq models failed — try Mistral ──────────────────────────────
    const mistralKey = localStorage.getItem("prismpm.mistralApiKey") || import.meta.env.VITE_MISTRAL_API_KEY || "";
    if (mistralKey) {
      console.warn("[PrismPM] Groq exhausted, falling back to Mistral...");
      try {
        return await callMistralFallback(prompt, systemPrompt, maxTokens);
      } catch (mistralError) {
        throw new Error(`Groq failed (${lastError?.message}) and Mistral fallback also failed (${mistralError.message}). Please try again.`);
      }
    }

    throw lastError || new Error("Groq request failed and no Mistral API key is configured.");
  }

  // ── No Groq key at all — try Mistral directly ───────────────────────────
  const mistralKey = localStorage.getItem("prismpm.mistralApiKey") || import.meta.env.VITE_MISTRAL_API_KEY || "";
  if (mistralKey) {
    console.info("[PrismPM] No Groq key found, using Mistral directly.");
    return await callMistralFallback(prompt, systemPrompt, maxTokens);
  }

  throw new Error("No AI API key found. Add a Groq or Mistral API key in AI Setup.");
}

// Plain-text variant — no JSON response_format, returns raw string.
// Falls back to Mistral if Groq fails.
async function callGroqText(prompt, systemPrompt = "", apiKey = "", maxTokens = 800) {
  const key = apiKey || localStorage.getItem("prismpm.groqApiKey") || import.meta.env.VITE_GROQ_API_KEY || "";

  // Try Groq first
  if (key) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: GROQ_MODELS[0],
          messages: [
            { role: "system", content: systemPrompt || "You are PrismPM Copilot, a concise and actionable AI project management assistant." },
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: maxTokens,
        }),
      });
      const data = await response.json();
      if (response.ok) return data.choices?.[0]?.message?.content?.trim() || "";
      // Fall through to Mistral if Groq returned an error
      console.warn("[PrismPM] Groq text call failed, trying Mistral:", data.error?.message);
    } catch (e) {
      console.warn("[PrismPM] Groq text call threw, trying Mistral:", e.message);
    }
  }

  // Mistral fallback for plain-text (Copilot)
  const mistralKey = localStorage.getItem("prismpm.mistralApiKey") || import.meta.env.VITE_MISTRAL_API_KEY || "";
  if (mistralKey) {
    const response = await fetch(`${MISTRAL_API_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${mistralKey}` },
      body: JSON.stringify({
        model: MISTRAL_MODELS[0],
        messages: [
          { role: "system", content: systemPrompt || "You are PrismPM Copilot, a concise and actionable AI project management assistant." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      }),
    });
    const data = await response.json();
    if (response.ok) return data.choices?.[0]?.message?.content?.trim() || "";
    throw new Error(data.error?.message || `Mistral error ${response.status}`);
  }

  throw new Error("No AI API key found. Add a Groq or Mistral API key in AI Setup.");
}

// ─── Seed Data ──────────────────────────────────────────────────────────────
const INITIAL_PROJECTS = [
  {
    id: 1, name: "FinanceFlow Overhaul", client: "NexaBank Ltd", clientStars: 5,
    pm: "Sarah Chen", ba: "Marcus Webb", type: "Enterprise Banking",
    status: "On Track", progress: 0, plannedDays: 120, elapsed: 0,
    description: "Core banking system modernisation with API-first architecture.",
    budget: 280000, budgetSource: "ai", spent: 0,
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
    budget: 95000, budgetSource: "ai", spent: 0,
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
    budget: 420000, budgetSource: "ai", spent: 0,
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
    try { localStorage.removeItem("prismpm.overrideLog"); } catch {}
    setAiOverrideLog([]);
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
  const [aiOverrideLog, setAiOverrideLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem("prismpm.overrideLog") || "[]"); } catch { return []; }
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return JSON.parse(localStorage.getItem("prismpm.sidebarOpen") || "false"); } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("prismpm.sidebarOpen", JSON.stringify(sidebarOpen)); } catch {} }, [sidebarOpen]);
  const [showCopilot, setShowCopilot] = useState(false);
  const [copilotQuery, setCopilotQuery] = useState("");
  const [copilotResponse, setCopilotResponse] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotHistory, setCopilotHistory] = useState([]);
  const [showNotificationsDrawer, setShowNotificationsDrawer] = useState(false);
  const [storyDetailModal, setStoryDetailModal] = useState(null);
  // Portfolio-level AI smart summary
  const [portfolioSummary, setPortfolioSummary] = useState(null);
  const [portfolioSummaryLoading, setPortfolioSummaryLoading] = useState(false);

  useEffect(() => { try { localStorage.setItem("prismpm.overrideLog", JSON.stringify(aiOverrideLog)); } catch {} }, [aiOverrideLog]);

  const logOverride = (entity, field, oldVal, newVal, source = "manual", projectId = null) => {
    setAiOverrideLog(prev => [{
      id: Date.now(),
      timestamp: new Date().toISOString(),
      entity, field,
      oldVal: String(oldVal),
      newVal: String(newVal),
      source, projectId
    }, ...prev.slice(0, 99)]);
  };

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

  const handleCopilotAsk = async (query) => {
    const key = localStorage.getItem("prismpm.groqApiKey") || import.meta.env.VITE_GROQ_API_KEY || "";
    if (!key) { setCopilotResponse("⚠️ No Groq API key found. Add it in AI Setup first."); return; }
    if (!query.trim()) return;
    setCopilotLoading(true);
    setCopilotResponse("");
    const projectSummary = projects.map(p => {
      const pStories = stories.filter(s => s.projectId === p.id);
      const pRisks = risks.filter(r => r.projectId === p.id);
      const pLogs = (p.weeklyLogs || []);
      const lastLog = pLogs[pLogs.length - 1];
      const riskBreakdown = ["Critical","High","Medium","Low"].map(sev => {
        const count = pRisks.filter(r => r.severity === sev).length;
        return count > 0 ? `${count} ${sev}` : null;
      }).filter(Boolean).join(", ");
      const riskDetails = pRisks.map(r =>
        `[${r.severity}] ${r.title} (Week ${r.encounteredWeek || "?"}) — ${r.mitigationPlan}`
      ).join("; ");
      const recentSummary = lastLog?.weekSummary ? `Latest (W${lastLog.week}): ${lastLog.weekSummary}` : "No weeks simulated yet";
      return `Project: ${p.name} | Progress: ${p.progress}% | Budget: $${(p.spent||0).toLocaleString()}/$${(p.budget||0).toLocaleString()} | Stories: ${pStories.filter(s=>s.status==="Done").length}/${pStories.length} done | Risks: ${riskBreakdown || "none"} | ${recentSummary} | Risk details: ${riskDetails || "none"}`;
    }).join("\n");
    const systemCtx = `You are PrismPM Copilot, an expert AI project management assistant embedded in a PM tool. Be concise, specific, and actionable. Format your response clearly with short paragraphs or bullet points. Never respond with raw JSON. Always end with one specific recommended next action.

IMPORTANT: When discussing risks, reference ALL severity levels (Critical, High, Medium, Low) not just Critical ones. When discussing project status, reference the latest weekly summary provided. Make sure your answers are fully consistent with the risk details and weekly summaries in the portfolio data below.

Current portfolio:\n${projectSummary}\nTotal team members: ${employees.length}\nCurrent view: ${tab === "project" ? `Project Detail — ${selectedProject?.name}` : tab}`;
    try {
      const text = await callGroqText(query, systemCtx, key, 900);
      setCopilotHistory(prev => [...prev.slice(-9), { q: query, a: text }]);
      setCopilotResponse(""); // clear so it doesn't show twice alongside history
    } catch (e) {
      setCopilotResponse("Error: " + e.message);
    } finally {
      setCopilotLoading(false);
    }
  };

  const handleGeneratePortfolioSummary = async () => {
    const key = localStorage.getItem("prismpm.groqApiKey") || import.meta.env.VITE_GROQ_API_KEY || "";
    if (!key) { alert("Add a Groq API key in AI Setup first."); return; }
    setPortfolioSummaryLoading(true);
    setPortfolioSummary(null);
    const projectData = projects.map(p => {
      const pStories = stories.filter(s => s.projectId === p.id);
      const pRisks = risks.filter(r => r.projectId === p.id);
      const lastLog = (p.weeklyLogs || []).slice(-1)[0] || null;
      return {
        name: p.name, client: p.client, pm: p.pm, status: p.status, progress: p.progress,
        budget: p.budget, spent: p.spent || 0,
        storiesDone: pStories.filter(s => s.status === "Done").length, totalStories: pStories.length,
        criticalRisks: pRisks.filter(r => r.severity === "Critical").length,
        highRisks: pRisks.filter(r => r.severity === "High").length,
        mediumRisks: pRisks.filter(r => r.severity === "Medium").length,
        riskDetails: pRisks.map(r => `[${r.severity}] ${r.title} (Week ${r.encounteredWeek || "?"})`).join("; "),
        weeklyVelocity: lastLog?.velocityActual || 0, delayDays: lastLog?.delayDays || 0,
        lastWeekSummary: lastLog?.weekSummary || null,
        weeksSimulated: (p.weeklyLogs || []).length
      };
    });
    try {
      const result = await callGroq(
        `You are an expert project management AI. Analyze this portfolio and generate a structured weekly executive summary.

Portfolio data: ${JSON.stringify(projectData)}
Total team members: ${employees.length}

IMPORTANT: Each project includes criticalRisks, highRisks, mediumRisks counts AND riskDetails (individual risk titles with severity). Use ALL of this in your riskHighlights — do not say "no high-level risks" if highRisks > 0. Reference the lastWeekSummary for each project when summarising tasks completed.

Return ONLY this JSON (no markdown):
{
  "headline": "one punchy sentence summarising portfolio health",
  "tasksCompleted": "summary of stories/tasks completed across portfolio this week based on lastWeekSummary",
  "delayAlerts": ["specific delay alert per project if any"],
  "riskHighlights": ["list ALL high and critical risks by name across the portfolio — never say no risks if counts > 0"],
  "predictiveInsights": [
    { "project": "project name", "prediction": "what the AI predicts e.g. likely to delay by X weeks", "confidence": "High/Medium/Low", "action": "recommended action" }
  ],
  "recommendations": ["up to 3 specific actionable recommendations for the PM team this week"]
}`,
        "You are a senior PM advisor AI. Respond only with valid JSON, no markdown or extra text.", key, 1500
      );
      setPortfolioSummary(result);
    } catch (e) {
      alert("AI summary failed: " + e.message);
    } finally {
      setPortfolioSummaryLoading(false);
    }
  };

  // Recalculating project progress based on Story status across all Kanban columns.
  // Stories in Review/Testing count as partial progress — they represent real work
  // completed, just not yet signed off. This means dragging a card to Review or
  // Testing on the Kanban board immediately moves the Dashboard progress ring.
  //   Done      = 100% of story points
  //   Testing   =  80% of story points
  //   Review    =  60% of story points
  //   In Progress =  30% of story points
  //   Backlog / To Do = 0%
  const STORY_STATUS_WEIGHT = { "Done": 1.0, "Testing": 0.8, "Review": 0.6, "In Progress": 0.3 };

  useEffect(() => {
    if (!projects.length) return;
    const nextProjects = projects.map(p => {
      const projStories = stories.filter(s => s.projectId === p.id);
      if (projStories.length === 0) return { ...p, progress: 0 };
      const totalPoints = projStories.reduce((sum, s) => sum + (Number(s.points) || 0), 0);
      const weightedPoints = projStories.reduce((sum, s) => {
        const weight = STORY_STATUS_WEIGHT[s.status] || 0;
        return sum + (Number(s.points) || 0) * weight;
      }, 0);
      const calculatedProgress = totalPoints > 0 ? Math.round((weightedPoints / totalPoints) * 100) : 0;

      // Auto-update project status based on progress
      let newStatus = p.status;
      if (calculatedProgress >= 100) newStatus = "Completed";
      else if (calculatedProgress > 0 && p.status === "On Track") newStatus = "In Progress";
      else if (calculatedProgress === 0) newStatus = p.weeklyLogs?.length > 0 ? p.status : "On Track";

      if (p.progress !== calculatedProgress || p.status !== newStatus) {
        return { ...p, progress: calculatedProgress, status: newStatus };
      }
      return p;
    });
    const changed = JSON.stringify(projects) !== JSON.stringify(nextProjects);
    if (changed) setProjects(nextProjects);
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
          <aside className={`${sidebarOpen ? "w-56" : "w-14"} bg-[#111] border-r border-white/8 flex flex-col sticky top-0 h-screen z-20 transition-all duration-200 overflow-hidden`}>
            {/* Logo + toggle row */}
            <div className={`flex items-center ${sidebarOpen ? "justify-between px-5 py-5" : "justify-center py-5"}`}>
              {sidebarOpen && (
                <div>
                  <div className="font-bold text-xl text-[#FFE600] tracking-tight" style={{ fontFamily: "Syne, sans-serif" }}>
                    PRISM<span className="text-white font-medium">PM</span>
                  </div>
                  <div className="text-[8px] text-slate-500 tracking-widest uppercase mt-0.5">AI Intelligence</div>
                </div>
              )}
              <button
                onClick={() => setSidebarOpen(o => !o)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-[#FFE600] hover:bg-white/5 transition-all text-sm"
                title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? "←" : "→"}
              </button>
            </div>

            {/* Navigation */}
            <nav className={`flex-1 space-y-0.5 ${sidebarOpen ? "px-2" : "px-1"}`}>
              {navItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setTab(item.id); setSelectedProject(null); }}
                  title={!sidebarOpen ? item.label : undefined}
                  className={`flex items-center gap-3 w-full rounded-xl text-left text-xs font-semibold tracking-wider transition-all duration-150 ${sidebarOpen ? "px-3 py-2.5" : "px-0 py-2.5 justify-center"} ${
                    tab === item.id 
                      ? "bg-[#FFE600]/10 text-[#FFE600] border-l-2 border-[#FFE600]" 
                      : "text-slate-500 hover:text-white hover:bg-white/5 border-l-2 border-transparent"
                  }`}
                >
                  <span className="text-sm shrink-0">{item.icon}</span>
                  {sidebarOpen && <span>{item.label}</span>}
                </button>
              ))}
            </nav>

            {/* Quick Project list — only when expanded */}
            {sidebarOpen && (
              <div className="px-3 pb-2 border-t border-white/8 pt-3">
                <div className="text-[8px] text-slate-600 uppercase tracking-widest mb-2 px-1">Projects</div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleSelectProject(p)}
                      className="flex items-center gap-2 w-full px-1 py-1.5 rounded-lg text-left text-slate-500 hover:text-white hover:bg-[#FFE600]/5 transition-all"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.status === "On Track" ? "bg-[#FFE600]" : p.status === "At Risk" ? "bg-amber-500" : "bg-red-500"}`} />
                      <span className="text-[10px] truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Logout */}
            <div className={`border-t border-white/8 ${sidebarOpen ? "p-3" : "p-1 flex justify-center"}`}>
              <button
                onClick={() => { setIsLoggedIn(false); try { localStorage.removeItem("prismpm.isLoggedIn"); } catch {} }}
                title={!sidebarOpen ? "Logout" : undefined}
                className={`flex items-center gap-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-[#FFE600] hover:bg-[#FFE600]/8 transition-all ${sidebarOpen ? "w-full px-3 py-2" : "w-9 h-9 justify-center"}`}
              >
                <span>🚪</span>
                {sidebarOpen && "Logout"}
              </button>
            </div>
          </aside>

          {/* Main workspace */}
          <main className="flex-1 flex flex-col min-w-0">
            {/* Header top bar */}
            <header className="sticky top-0 bg-black/95 backdrop-blur border-b border-white/8 px-6 py-3.5 flex items-center justify-between z-10">
              <div className="flex items-center gap-4 min-w-0">
                {!sidebarOpen && (
                  <span className="font-bold text-sm text-[#FFE600] tracking-tight shrink-0" style={{ fontFamily: "Syne, sans-serif" }}>
                    PRISM<span className="text-white font-medium">PM</span>
                  </span>
                )}
                <div className="min-w-0">
                  <h1 className="text-base font-bold tracking-wide text-white truncate">
                    {tab === "dashboard" ? "Portfolio" 
                      : tab === "team" ? "Team Directory" 
                      : tab === "brd" ? "BRD Generator" 
                      : tab === "agile" ? `Agile Board` 
                      : selectedProject?.name || "Project"}
                  </h1>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                    {tab === "dashboard" ? `${projects.length} projects · ${risks.filter(r => r.severity === "Critical").length} critical risks` 
                      : tab === "team" ? `${employees.length} roster members` 
                      : tab === "brd" ? "Generate functional specs via AI" 
                      : tab === "agile" ? `${projects.find(p => p.id === activeProjectId)?.name || "Select project"}`
                      : selectedProject ? `${selectedProject.client} · ${selectedProject.type}` : ""}
                  </p>
                </div>
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
            <div className="p-6 max-w-5xl w-full mx-auto flex-1">
              {tab === "dashboard" && <DashboardTab projects={projects} risks={risks} stories={stories} tasks={tasks} onSelectProject={handleSelectProject} employees={employees} onCreateProject={handleCreateProject} portfolioSummary={portfolioSummary} portfolioSummaryLoading={portfolioSummaryLoading} onGeneratePortfolioSummary={handleGeneratePortfolioSummary} onResetWorkspace={() => {
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
              {tab === "brd" && <BRDTab projects={projects} setProjects={setProjects} stories={stories} setStories={setStories} employees={employees} onCreateProject={handleCreateProject} onNavigateToDashboard={() => setTab("dashboard")} addNotification={addNotification} />}
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
                  logOverride={(entity, field, oldVal, newVal, source) =>
                    logOverride(entity, field, oldVal, newVal, source, activeProjectId)
                  }
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
                  onAddMemberToProject={handleAddMemberToProject}
                  onDropMemberFromProject={handleDropMemberFromProject}
                  onBack={() => setTab("dashboard")}
                  onDeleteProject={handleDeleteProject}
                  addNotification={addNotification}
                  logOverride={logOverride}
                  aiOverrideLog={aiOverrideLog}
                  setAiOverrideLog={setAiOverrideLog}
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
      {/* ── AI Copilot Floating Panel ── */}
      {isLoggedIn && (
        <>
          {/* Floating button */}
          <button
            onClick={() => setShowCopilot(c => !c)}
            className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#FFE600] text-black font-black text-xl shadow-2xl hover:bg-white transition-all flex items-center justify-center"
            title="AI Copilot"
          >
            {showCopilot ? "✕" : "✦"}
          </button>

          {/* Copilot panel */}
          {showCopilot && (
            <div className="fixed bottom-24 right-6 z-50 w-[420px] bg-[#0d0d0d] border border-white/12 rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "75vh" }}>
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-[#FFE600]">
                <div className="flex items-center gap-2">
                  <span className="font-black text-black text-sm">✦ PrismPM Copilot</span>
                  {tab === "project" && selectedProject && (
                    <span className="text-[9px] bg-black/20 text-black font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">{selectedProject.name}</span>
                  )}
                </div>
                <button onClick={() => setShowCopilot(false)} className="text-black/60 hover:text-black font-bold text-base leading-none">✕</button>
              </div>

              {/* Context chip */}
              <div className="px-4 pt-3 pb-1">
                <div className="text-[9px] text-slate-600 uppercase tracking-widest">
                  Context: {tab === "dashboard" ? "Portfolio Overview" : tab === "project" ? `${selectedProject?.name || "Project"}` : tab === "agile" ? "Agile Board" : tab === "team" ? "Team Directory" : "BRD Generator"}
                </div>
              </div>

              {/* History */}
              <div className="flex-1 overflow-y-auto px-4 pb-3 space-y-3 min-h-0">
                {copilotHistory.length === 0 && !copilotLoading && !copilotResponse && (() => {
                  const contextPrompts = tab === "project" && selectedProject ? [
                    `What is the risk outlook for ${selectedProject.name}?`,
                    `Is ${selectedProject.name} on track to meet its deadline?`,
                    `What should the team prioritise this week?`,
                    `Summarise budget health for ${selectedProject.name}`,
                  ] : tab === "agile" ? [
                    "Which stories are blocking velocity?",
                    "How should I prioritise the backlog?",
                    "What's the current sprint health?",
                    "Recommend next sprint scope",
                  ] : tab === "team" ? [
                    "Who is over-allocated across projects?",
                    "Which team members are available for new work?",
                    "Recommend team composition for a banking project",
                  ] : [
                    "Which project is most at risk this week?",
                    "Give me an executive summary of the portfolio",
                    "Which project is likely to miss its deadline?",
                    "Where should the PM team focus this week?",
                  ];
                  return (
                    <div className="space-y-2 pt-1">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Suggested questions</p>
                      {contextPrompts.map(s => (
                        <button key={s} onClick={() => { setCopilotQuery(s); handleCopilotAsk(s); }} className="w-full text-left text-xs text-slate-300 bg-white/4 hover:bg-[#FFE600]/8 border border-white/8 hover:border-[#FFE600]/25 rounded-xl px-3 py-2.5 transition-all leading-snug">
                          {s}
                        </button>
                      ))}
                    </div>
                  );
                })()}
                {copilotHistory.map((h, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="bg-[#FFE600]/10 border border-[#FFE600]/15 rounded-xl px-3 py-2 text-xs text-[#FFE600] font-medium">{h.q}</div>
                    <div className="bg-white/4 border border-white/8 rounded-xl px-3 py-2.5 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{h.a}</div>
                  </div>
                ))}
                {copilotLoading && (
                  <div className="flex items-center gap-2 text-[#FFE600] text-xs py-2">
                    <div className="w-3 h-3 border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
                    Analysing portfolio data...
                  </div>
                )}
                {/* copilotResponse intentionally not rendered here — answer goes straight into history */}
              </div>

              {/* Clear history */}
              {copilotHistory.length > 0 && (
                <div className="px-4 pb-1 flex justify-end">
                  <button onClick={() => { setCopilotHistory([]); setCopilotResponse(""); }} className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors">Clear history</button>
                </div>
              )}

              {/* Input */}
              <div className="p-3 border-t border-white/8 flex gap-2">
                <input
                  value={copilotQuery}
                  onChange={e => setCopilotQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !copilotLoading) { handleCopilotAsk(copilotQuery); setCopilotQuery(""); } }}
                  placeholder="Ask anything about your projects..."
                  className="flex-1 bg-black border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FFE600] placeholder-slate-700"
                />
                <button
                  onClick={() => { handleCopilotAsk(copilotQuery); setCopilotQuery(""); }}
                  disabled={copilotLoading || !copilotQuery.trim()}
                  className="px-3 py-2 bg-[#FFE600] text-black text-sm font-bold rounded-xl hover:bg-white transition-all disabled:opacity-40"
                >
                  →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}


function DashboardTab({ projects, risks, stories, tasks, onSelectProject, employees, onCreateProject, onResetWorkspace, portfolioSummary, portfolioSummaryLoading, onGeneratePortfolioSummary }) {
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  const budgetedProjects = projects.filter(p => p.budget != null);
  const totalBudget = budgetedProjects.reduce((sum, p) => sum + p.budget, 0);
  const totalSpent = budgetedProjects.reduce((sum, p) => sum + (p.spent || 0), 0);
  const totalCriticalRisks = risks.filter(r => r.severity === "Critical").length;
  const totalHighRisks = risks.filter(r => r.severity === "High").length;
  const delayedTasks = tasks.filter(t => t.status !== "Done" && (new Date(t.due) < new Date()));
  const allLogs = projects.flatMap(p => p.weeklyLogs || []);
  const avgVelocity = allLogs.length > 0 ? Math.round(allLogs.reduce((s, l) => s + (l.velocityActual || 0), 0) / allLogs.length) : null;
  const totalDelayDays = allLogs.reduce((s, l) => s + (l.delayDays || 0), 0);

  // Per-project health score (0-100) for demo
  const getHealthScore = (p) => {
    const logs = p.weeklyLogs || [];
    if (logs.length === 0) return null; // no data yet
    const projRisks = risks.filter(r => r.projectId === p.id);
    let score = 80;
    score -= projRisks.filter(r => r.severity === "Critical").length * 15;
    score -= projRisks.filter(r => r.severity === "High").length * 7;
    const lastLog = logs.slice(-1)[0];
    if (lastLog?.delayDays > 0) score -= Math.min(lastLog.delayDays * 3, 20);
    if (lastLog?.velocityActual < lastLog?.velocityTarget) score -= 8;
    const budgetPct = p.budget > 0 ? (p.spent || 0) / p.budget : 0;
    if (budgetPct > 0.9) score -= 10;
    return Math.max(10, Math.min(100, Math.round(score)));
  };

  // Predictive delay detection
  const atRiskProjects = projects.filter(p => {
    const logs = p.weeklyLogs || [];
    if (logs.length < 2) return false;
    const avgVel = logs.reduce((s, l) => s + (l.velocityActual || 0), 0) / logs.length;
    const lastLog = logs.slice(-1)[0];
    const remaining = lastLog?.remainingPoints || 0;
    const plannedWeeks = Math.ceil((p.plannedDays || 90) / 7);
    const projectedWeeks = logs.length + (avgVel > 0 ? Math.ceil(remaining / avgVel) : 0);
    return projectedWeeks > plannedWeeks;
  });

  return (
    <div className="space-y-5">
      {/* ── Primary KPIs ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Active Projects", value: projects.length, sub: `${projects.filter(p => p.status === "On Track" || p.status === "In Progress").length} on track`, accent: true },
          { label: "Risk Exposure", value: totalCriticalRisks, sub: `${totalHighRisks} high · ${totalCriticalRisks} critical`, warn: totalCriticalRisks > 0 },
          { label: "Stories Complete", value: `${stories.filter(s => s.status === "Done").length}/${stories.length}`, sub: `${delayedTasks.length} overdue tasks`, warn: delayedTasks.length > 0 },
        ].map((k) => (
          <div key={k.label} className={`bg-[#111] border rounded-xl p-4 transition-all ${k.accent ? "border-[#FFE600]/25" : k.warn && (typeof k.value === "number" ? k.value > 0 : true) ? "border-red-900/30" : "border-white/8"}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold">{k.label}</span>
            </div>
            <div className={`font-mono font-bold text-2xl mb-0.5 ${k.accent ? "text-[#FFE600]" : k.warn && (typeof k.value === "number" ? k.value > 0 : true) ? "text-red-400" : "text-white"}`}>{k.value}</div>
            <div className="text-[10px] text-slate-600">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Secondary metrics strip ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Budget Used", value: totalBudget > 0 ? `${Math.round((totalSpent / totalBudget) * 100)}%` : "—", sub: totalBudget > 0 ? `$${Math.round(totalSpent/1000)}k of $${Math.round(totalBudget/1000)}k` : "No budget set" },
          { label: "Avg Velocity", value: avgVelocity != null ? `${avgVelocity} pts` : "—", sub: "per week across portfolio" },
          { label: "Schedule Health", value: totalDelayDays > 0 ? `+${totalDelayDays}d` : "On time", sub: atRiskProjects.length > 0 ? `${atRiskProjects.length} project${atRiskProjects.length > 1 ? "s" : ""} at delay risk` : "All projects on schedule", warn: totalDelayDays > 0 },
        ].map((k) => (
          <div key={k.label} className="bg-[#111] border border-white/8 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold">{k.label}</span>
              <span className={`font-mono font-semibold text-sm ${k.warn ? "text-red-400" : "text-slate-300"}`}>{k.value}</span>
            </div>
            <div className="text-[10px] text-slate-600">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Predictive Risk Alerts ── */}
      {atRiskProjects.length > 0 && (
        <div className="bg-red-950/20 border border-red-800/30 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-400 text-xs">⚠</span>
            <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest">Predictive Delay Alerts</span>
          </div>
          {atRiskProjects.map(p => {
            const logs = p.weeklyLogs || [];
            const avgVel = logs.reduce((s, l) => s + (l.velocityActual || 0), 0) / logs.length;
            const lastLog = logs.slice(-1)[0];
            const remaining = lastLog?.remainingPoints || 0;
            const plannedWeeks = Math.ceil((p.plannedDays || 90) / 7);
            const projectedWeeks = logs.length + Math.ceil(remaining / avgVel);
            const delayW = projectedWeeks - plannedWeeks;
            return (
              <div key={p.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-red-300 font-medium">{p.name}</span>
                <span className="text-red-400">Likely to delay by ~{delayW} week{delayW > 1 ? "s" : ""} at current velocity ({Math.round(avgVel)} pts/wk)</span>
                <button onClick={() => onSelectProject(p)} className="text-[9px] text-red-400 border border-red-800/40 px-2 py-0.5 rounded hover:bg-red-900/30 transition-all shrink-0">View →</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── AI Portfolio Weekly Summary ── */}
      <div className="bg-[#111] border border-[#FFE600]/15 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[#FFE600] text-sm">✦</span>
            <span className="text-[10px] text-[#FFE600] font-bold uppercase tracking-widest">AI Weekly Portfolio Summary</span>
            {portfolioSummary && (
              <button
                onClick={() => setSummaryCollapsed(c => !c)}
                className="text-[9px] text-slate-500 hover:text-[#FFE600] border border-white/10 hover:border-[#FFE600]/30 px-2 py-0.5 rounded transition-all ml-1"
              >
                {summaryCollapsed ? "▼ Expand" : "▲ Collapse"}
              </button>
            )}
          </div>
          <button
            onClick={onGeneratePortfolioSummary}
            disabled={portfolioSummaryLoading}
            className="text-[10px] bg-[#FFE600] text-black font-bold px-3 py-1.5 rounded-lg hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {portfolioSummaryLoading ? (
              <><div className="w-2.5 h-2.5 border border-black border-t-transparent rounded-full animate-spin" />Generating...</>
            ) : (
              <>{portfolioSummary ? "↻ Refresh" : "✦ Generate Summary"}</>
            )}
          </button>
        </div>

        {!portfolioSummary && !portfolioSummaryLoading && (
          <p className="text-[11px] text-slate-600">Click to generate an AI-powered weekly summary covering tasks completed, delay alerts, risk highlights, and predictive insights across all projects.</p>
        )}

        {portfolioSummary && !summaryCollapsed && (
          <div className="space-y-4">
            {/* Headline */}
            <p className="text-sm text-white font-medium leading-snug border-l-2 border-[#FFE600] pl-3">{portfolioSummary.headline}</p>

            <div className="grid grid-cols-2 gap-4">
              {/* Tasks Completed */}
              <div className="space-y-1.5">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-1"><span className="text-green-400">✓</span> Tasks Completed</div>
                <p className="text-[11px] text-slate-300 leading-relaxed">{portfolioSummary.tasksCompleted}</p>
              </div>
              {/* Delay Alerts */}
              <div className="space-y-1.5">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-1"><span className="text-red-400">⚠</span> Delay Alerts</div>
                {portfolioSummary.delayAlerts?.length > 0 ? (
                  <ul className="space-y-1">
                    {portfolioSummary.delayAlerts.map((a, i) => <li key={i} className="text-[11px] text-red-300 flex gap-1.5"><span className="shrink-0 text-red-500 mt-0.5">▸</span>{a}</li>)}
                  </ul>
                ) : <p className="text-[11px] text-green-400">No delays detected this week.</p>}
              </div>
            </div>

            {/* Risk Highlights */}
            {portfolioSummary.riskHighlights?.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-1"><span className="text-amber-400">◆</span> Risk Highlights</div>
                <div className="flex flex-wrap gap-2">
                  {portfolioSummary.riskHighlights.map((r, i) => (
                    <span key={i} className="text-[10px] text-amber-300 bg-amber-900/20 border border-amber-800/30 px-2 py-1 rounded-lg">{r}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Predictive Insights */}
            {portfolioSummary.predictiveInsights?.length > 0 && (
              <div className="space-y-2">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold flex items-center gap-1"><span className="text-sky-400">◈</span> Predictive Insights</div>
                <div className="space-y-2">
                  {portfolioSummary.predictiveInsights.map((ins, i) => (
                    <div key={i} className="bg-black/40 border border-white/6 rounded-lg p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] text-white font-semibold">{ins.project}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${ins.confidence === "High" ? "bg-red-900/40 text-red-400" : ins.confidence === "Medium" ? "bg-amber-900/40 text-amber-400" : "bg-slate-800 text-slate-400"}`}>{ins.confidence}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">{ins.prediction}</p>
                        {ins.action && <p className="text-[10px] text-[#FFE600] mt-1 font-medium">→ {ins.action}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {portfolioSummary.recommendations?.length > 0 && (
              <div className="space-y-1.5 pt-1 border-t border-white/6">
                <div className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold">Recommended Actions</div>
                <ol className="space-y-1">
                  {portfolioSummary.recommendations.map((r, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                      <span className="text-[#FFE600] font-mono font-bold shrink-0">{i + 1}.</span>{r}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
        {portfolioSummary && summaryCollapsed && (
          <p className="text-xs text-slate-400 italic border-l-2 border-[#FFE600]/40 pl-3">{portfolioSummary.headline}</p>
        )}
      </div>

      {/* ── New Project Panel ── */}
      <NewProjectPanel employees={employees} onCreateProject={onCreateProject} />

      {/* ── Projects List ── */}
      <div>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Projects</h2>
          <button onClick={onResetWorkspace} className="text-[9px] text-slate-600 hover:text-red-400 font-semibold transition-colors">Reset workspace</button>
        </div>
        <div className="space-y-2">
          {projects.map((p) => {
            const projRisks = risks.filter(r => r.projectId === p.id);
            const projStories = stories.filter(s => s.projectId === p.id);
            const doneStories = projStories.filter(s => s.status === "Done").length;
            const isCritical = projRisks.some(r => r.severity === "Critical");
            const hasBudget = p.budget != null;
            const projLogs = p.weeklyLogs || [];
            const projDelay = projLogs.reduce((s, l) => s + (l.delayDays || 0), 0);
            const accentColor = p.status === "On Track" || p.status === "In Progress" ? "#FFE600" : p.status === "At Risk" ? "#f59e0b" : "#ef4444";
            const healthScore = getHealthScore(p);
            const healthColor = healthScore === null ? "text-slate-600" : healthScore >= 75 ? "text-green-400" : healthScore >= 55 ? "text-amber-400" : "text-red-400";
            const nextSprint = (() => {
              const ps = projStories.filter(s => s.status !== "Done" && s.sprintId);
              return ps.length > 0 ? `${ps.length} stories in sprint` : null;
            })();
            return (
              <div
                key={p.id}
                className="bg-[#111] border border-white/8 rounded-xl p-4 cursor-pointer hover:border-[#FFE600]/25 hover:bg-[#131313] transition-all duration-200 group"
                onClick={() => onSelectProject(p)}
                style={{ borderLeft: `3px solid ${accentColor}` }}
              >
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                    <PulseRing progress={p.progress} status={p.status} size={50} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <h3 className="font-semibold text-white text-sm group-hover:text-[#FFE600] transition-colors">{p.name}</h3>
                      <StatusBadge status={p.status} />
                      {projDelay > 0 && <span className="text-[9px] text-red-400 font-bold">+{projDelay}d delay</span>}
                      {isCritical && <span className="text-[9px] text-red-400 bg-red-900/20 border border-red-800/30 px-1.5 py-0.5 rounded font-bold">Critical Risk</span>}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mb-1.5">{p.description}</p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-600 flex-wrap">
                      <span className="text-slate-400 font-medium">{p.client}</span>
                      <Stars count={p.clientStars} size="sm" />
                      <span>PM: <span className="text-slate-400">{p.pm}</span></span>
                      <span>{doneStories}/{projStories.length} stories done</span>
                      {nextSprint && <span className="text-[#FFE600]/70">{nextSprint}</span>}
                    </div>
                  </div>
                  {/* Health + Budget */}
                  <div className="shrink-0 text-right space-y-2">
                    <div>
                      <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-0.5">Health</div>
                      <div className={`font-mono font-bold text-sm ${healthColor}`}>{healthScore ?? "—"}</div>
                    </div>
                    {hasBudget && (
                      <div>
                        <div className="text-[8px] text-slate-600 uppercase tracking-wider mb-1">Budget</div>
                        <div className="text-[10px] font-mono text-white">${Math.round((p.spent || 0)/1000)}k<span className="text-slate-600">/${Math.round(p.budget/1000)}k</span></div>
                        <div className="mt-1 w-20"><ProgressBar value={p.budget > 0 ? Math.round(((p.spent||0)/p.budget)*100) : 0} /></div>
                      </div>
                    )}
                  </div>
                  <span className="text-slate-700 group-hover:text-[#FFE600] transition-colors ml-1">→</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Agile Board Tab ────────────────────────────────────────────────────────
function AgileBoardTab({ projectId, projects, epics, setEpics, stories, setStories, sprints, setSprints, tasks, setTasks, employees, addNotification, setStoryDetailModal, logOverride = () => {} }) {
  const [subTab, setSubTab] = useState("backlog");
  const [apiLoading, setApiLoading] = useState(false);
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
        `Based on this project description: "${proj.name} - ${proj.description}", generate 6 user stories covering the main functional areas.
        Return JSON with exactly this key format:
        { "stories": [ { "title": "User Story Title", "description": "Story details", "priority": "High/Medium/Low", "points": 1/2/3/5/8/13, "epicName": "Core Module" } ] }`,
        "You are an expert agile project manager AI. Always respond with valid JSON only.", "", 2000
      );
      if (result && Array.isArray(result.stories)) {
        // Batch ALL epic and story creates into single state updates to avoid
        // stale-closure issues where each setStories call in a forEach loop
        // overwrites the previous one, leaving only the last story.
        const newEpics = [];
        const newStories = [];
        const existingEpicsCopy = [...epics];

        result.stories.forEach(storyData => {
          let epic = [...existingEpicsCopy, ...newEpics].find(
            e => e.projectId === projectId && e.name.toLowerCase() === (storyData.epicName || "").toLowerCase()
          );
          let epicId = epic ? epic.id : null;
          if (!epicId) {
            epicId = Date.now() + Math.random();
            const newEpObj = { id: epicId, projectId, name: storyData.epicName || "General", description: "AI Generated Epic", status: "To Do", progress: 0 };
            newEpics.push(newEpObj);
          }
          newStories.push({
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
          });
        });

        // Single batched state update — no stale closures
        if (newEpics.length > 0) setEpics(prev => [...prev, ...newEpics]);
        if (newStories.length > 0) setStories(prev => [...prev, ...newStories]);
        addNotification(`AI generated ${newStories.length} user stories across ${newEpics.length} new epics.`, "system");
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
        { "recommendedSprints": [ { "name": "Sprint 3: Core Implementation", "goal": "Deliver auth validation and setup", "storyIds": [list of numbers], "reason": "string rationale" } ] }`,
        "", "", 1500
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
                    const story = projectStories.find(s => s.id === storyId);
                    if (!story) return;
                    logOverride(`Story: ${story.title}`, "status", story.status, col, "manual", projectId);
                    setStories(prev => prev.map(s => s.id === storyId ? { ...s, status: col } : s));
                    // Progress re-calculation fires automatically via the useEffect
                    // that watches stories — Review/Testing/Done all contribute now.
                    const statusMsg = col === "Done" ? "✓ Marked complete — progress updated"
                      : col === "Testing" ? "🧪 Moved to Testing (80% weight) — progress updated"
                      : col === "Review" ? "👁 Moved to Review (60% weight) — progress updated"
                      : col === "In Progress" ? "→ Work started (30% weight) — progress updated"
                      : `Moved to ${col}`;
                    addNotification(`"${story.title}" — ${statusMsg}.`, "system");
                  }}
                >
                  <div className="flex justify-between items-center mb-3 pb-2 border-b border-white/10">
                    <div>
                      <span className="text-white font-bold text-xs uppercase tracking-wider">{col}</span>
                      {col === "Review" && <span className="ml-1.5 text-[9px] text-indigo-400 font-mono">60%</span>}
                      {col === "Testing" && <span className="ml-1.5 text-[9px] text-amber-400 font-mono">80%</span>}
                      {col === "Done" && <span className="ml-1.5 text-[9px] text-emerald-400 font-mono">100%</span>}
                      {col === "In Progress" && <span className="ml-1.5 text-[9px] text-blue-400 font-mono">30%</span>}
                    </div>
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
                          className={`border rounded-xl p-3 space-y-2.5 hover:border-[#FFE600]/40 transition-all cursor-grab active:cursor-grabbing ${
                            story.status === "Done" ? "bg-green-950/20 border-green-800/20" :
                            story.status === "Testing" ? "bg-amber-950/20 border-amber-800/20" :
                            story.status === "Review" ? "bg-indigo-950/20 border-indigo-800/20" :
                            story.status === "In Progress" ? "bg-yellow-950/10 border-yellow-800/15" :
                            "bg-[#2E2E2E]/50 border-white/10"
                          }`}
                        >
                          {/* Title + status dot */}
                          <div className="flex justify-between items-start gap-1">
                            <span onClick={() => setStoryDetailModal(story)} className={`font-semibold text-[11px] hover:text-[#FFE600] cursor-pointer hover:underline line-clamp-2 ${isDone ? "line-through text-slate-400" : "text-white"}`}>
                              {story.title}
                            </span>
                            <span className={`flex-shrink-0 text-xs leading-none mt-0.5 ${
                              isDone ? "text-green-400" :
                              story.status === "Testing" ? "text-amber-400" :
                              story.status === "Review" ? "text-indigo-400" :
                              isInProgress ? "text-yellow-400" : "text-slate-600"
                            }`}>
                              {isDone ? "✓" : story.status === "Testing" ? "🧪" : story.status === "Review" ? "👁" : isInProgress ? "◑" : "○"}
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
                                  className={`h-1 rounded-full transition-all ${
                                    taskProgress === 100 ? "bg-green-400" :
                                    story.status === "Testing" ? "bg-amber-400" :
                                    story.status === "Review" ? "bg-indigo-400" :
                                    isInProgress ? "bg-[#FFE600]" : "bg-slate-600"
                                  }`}
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
  const [apiLoading, setApiLoading] = useState(false);
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
        { "tasks": [ { "name": "Task name", "estimateDays": 2, "description": "Action details", "priority": "High/Medium/Low" } ] }`,
        "", "", 1000
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
const EMPTY_NEW_PROJECT = {
  name: "", client: "", clientStars: 3, pm: "", ba: "", type: "",
  description: "", plannedDays: 90,
};

// ─── New Project Panel (shared by Dashboard + Team tabs) ────────────────────
function NewProjectPanel({ employees, onCreateProject, defaultOpen = false }) {
  const [showProjectForm, setShowProjectForm] = useState(defaultOpen);
  const [newProject, setNewProject] = useState(EMPTY_NEW_PROJECT);
  const [projectFormError, setProjectFormError] = useState("");

  const pmOptions = employees.filter(e => e.role === "PM");
  const baOptions = employees.filter(e => e.role === "BA");

  const handleProjectFormSubmit = (e) => {
    e.preventDefault();
    setProjectFormError("");
    if (!newProject.name.trim() || !newProject.client.trim() || !newProject.pm) {
      setProjectFormError("Project name, client, and PM are required.");
      return;
    }

    const pmRecord = employees.find(e => e.name === newProject.pm && e.role === "PM");
    const baRecord = employees.find(e => e.name === newProject.ba && e.role === "BA");

    if (!pmRecord) {
      setProjectFormError("Selected PM is no longer in the roster — please re-select.");
      return;
    }

    // Team starts with PM (+ BA if chosen) — identical shape to the seeded
    // projects' team arrays, so AgileBoard/ProjectDetail/risk-matrix/compatibility
    // scoring all work exactly the same as they do for the original 3 projects.
    const team = [
      pmRecord ? { name: pmRecord.name, role: "PM", skillStars: pmRecord.skillStars, specialty: pmRecord.specialty } : null,
      baRecord ? { name: baRecord.name, role: "BA", skillStars: baRecord.skillStars, specialty: baRecord.specialty } : null,
    ].filter(Boolean);

    const project = {
      id: Date.now(),
      name: newProject.name.trim(),
      client: newProject.client.trim(),
      clientStars: Number(newProject.clientStars) || 3,
      pm: pmRecord.name,
      ba: baRecord ? baRecord.name : "Unassigned",
      type: newProject.type.trim() || "General",
      status: "On Track",
      progress: 0,
      plannedDays: Number(newProject.plannedDays) || 90,
      elapsed: 0,
      description: newProject.description.trim() || "No description provided yet.",
      // Budget is intentionally NOT set here. It's decided later by the AI
      // (from the requirements doc in AI Setup) or entered manually in the
      // project's Overview tab. Until then it stays null and budget UI hides.
      budget: null,
      budgetSource: null,
      spent: 0,
      team,
      weeklyLogs: [],
    };

    onCreateProject(project);
    setNewProject(EMPTY_NEW_PROJECT);
    setShowProjectForm(false);
  };

  return (
    <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-white text-sm font-bold uppercase tracking-wider">Project Setup</h3>
        <button onClick={() => { setShowProjectForm(!showProjectForm); setProjectFormError(""); }} className="text-xs text-[#FFE600] font-bold hover:underline">
          {showProjectForm ? "Hide Form" : "+ New Project"}
        </button>
      </div>

      {showProjectForm && (
        <form onSubmit={handleProjectFormSubmit} className="bg-black/60 p-4 border border-white/10 rounded-xl space-y-3">
          {pmOptions.length === 0 && (
            <div className="text-[11px] text-amber-400 bg-amber-900/20 border border-amber-800/30 rounded-lg px-3 py-2">
              No PMs in the roster yet. Add a roster member with role "PM" before creating a project.
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <input
              value={newProject.name}
              onChange={e => setNewProject(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Project Name"
              required
              className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
            />
            <input
              value={newProject.client}
              onChange={e => setNewProject(prev => ({ ...prev, client: e.target.value }))}
              placeholder="Client Name"
              required
              className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <select
              value={newProject.pm}
              onChange={e => setNewProject(prev => ({ ...prev, pm: e.target.value }))}
              required
              className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">Assign Project Manager...</option>
              {pmOptions.map(pm => <option key={pm.name} value={pm.name}>{pm.name} ({pm.specialty})</option>)}
            </select>
            <select
              value={newProject.ba}
              onChange={e => setNewProject(prev => ({ ...prev, ba: e.target.value }))}
              className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">Assign Business Analyst (optional)...</option>
              {baOptions.map(ba => <option key={ba.name} value={ba.name}>{ba.name} ({ba.specialty})</option>)}
            </select>
          </div>

          <input
            value={newProject.type}
            onChange={e => setNewProject(prev => ({ ...prev, type: e.target.value }))}
            placeholder="Project Type (e.g. Mobile App, Healthcare SaaS)"
            className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
          />

          <textarea
            value={newProject.description}
            onChange={e => setNewProject(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Short project description..."
            rows={2}
            className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white resize-none"
          />

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Client Importance (1-5 ★)</label>
              <select
                value={newProject.clientStars}
                onChange={e => setNewProject(prev => ({ ...prev, clientStars: e.target.value }))}
                className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
              >
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Star{n !== 1 ? "s" : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-1">Planned Duration (days)</label>
              <input
                type="number"
                min="1"
                value={newProject.plannedDays}
                onChange={e => setNewProject(prev => ({ ...prev, plannedDays: e.target.value }))}
                className="w-full bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div className="text-[10px] text-slate-500 bg-black/40 border border-white/5 rounded-lg px-3 py-2">
            💰 No budget field here — once the project is created, head to its <strong className="text-slate-400">AI Setup</strong> tab and provide the client’s requirements document. The AI will propose a budget, which you can then accept or edit manually.
          </div>

          {projectFormError && (
            <div className="text-[11px] text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2">
              {projectFormError}
            </div>
          )}

          <button type="submit" className="w-full py-1.5 bg-[#FFE600] text-black text-xs font-bold rounded">
            Create Project
          </button>
          <p className="text-[10px] text-slate-500 text-center">
            New projects get the full feature set — Agile Board, AI BRD generation, AI risk &amp; timeline tools, compatibility scoring — same as every other project.
          </p>
        </form>
      )}
    </div>
  );
}

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
      {/* New Project Creation */}
      <NewProjectPanel employees={employees} onCreateProject={onCreateProject} />

      <div className="grid md:grid-cols-[1.8fr_1.2fr] gap-6">
        {/* Allocations workspace */}
        <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-white text-sm font-bold uppercase tracking-wider">Project Team Allocation</h3>
            <div className="flex items-center gap-2">
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="bg-black border border-white/20 rounded-lg px-3 py-1 text-xs text-white"
              >
                <option value="">Choose Active Project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {activeProj && (
                <button
                  onClick={() => { onDeleteProject(activeProj.id); setSelectedProjectId(""); }}
                  className="text-[10px] text-red-400 font-bold border border-red-900/30 hover:border-red-400 px-2 py-1 rounded bg-black transition-all"
                >
                  Delete Project
                </button>
              )}
            </div>
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
function BRDTab({ projects, setProjects, stories, setStories, employees, onCreateProject, onNavigateToDashboard, addNotification }) {
  const [form, setForm] = useState({
    problem: "", goal: "", stakeholders: "", constraints: "", assumptions: "",
    clientName: "", projectType: "Healthcare SaaS",
    pm: "", ba: "", clientStars: 4, plannedDays: 120,
  });
  const [brd, setBrd] = useState(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("prismpm.groqApiKey") || "");

  const pmOptions = employees.filter(e => e.role === "PM");
  const baOptions = employees.filter(e => e.role === "BA");

  useEffect(() => {
    if (apiKey) localStorage.setItem("prismpm.groqApiKey", apiKey);
  }, [apiKey]);

  // Pre-select first available PM/BA when employees load
  useEffect(() => {
    if (!form.pm && pmOptions.length > 0) setForm(f => ({ ...f, pm: pmOptions[0].name }));
    if (!form.ba && baOptions.length > 0) setForm(f => ({ ...f, ba: baOptions[0].name }));
  }, [employees.length]);

  const generateBRD = async () => {
    if (!form.problem || !form.goal || !apiKey) {
      alert("Business Problem, Project Goal, and Groq API Key are all required.");
      return;
    }
    setLoading(true);
    setBrd(null);
    setCreated(false);
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
  "businessObjectives": ["string"],
  "projectScope": { "inScope": ["string"], "outOfScope": ["string"] },
  "stakeholders": [{"role": "string", "name": "string", "responsibility": "string"}],
  "functionalRequirements": ["string"],
  "nonFunctionalRequirements": ["string"],
  "userPersonas": [{"name": "string", "role": "string", "description": "string", "goals": "string"}],
  "userStories": [{"asA": "string", "iWantTo": "string", "soThat": "string", "acceptanceCriteria": "string", "points": 3}],
  "risks": ["string"],
  "assumptions": ["string"],
  "successMetrics": ["string"],
  "estimatedBudget": 150000,
  "budgetReasoning": "string"
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
    if (!form.pm) { alert("Please select a Project Manager before creating the project."); return; }

    setCreating(true);

    const pmRecord = employees.find(e => e.name === form.pm && e.role === "PM");
    const baRecord = employees.find(e => e.name === form.ba && e.role === "BA");

    const team = [
      pmRecord ? { name: pmRecord.name, role: "PM", skillStars: pmRecord.skillStars, specialty: pmRecord.specialty } : null,
      baRecord ? { name: baRecord.name, role: "BA", skillStars: baRecord.skillStars, specialty: baRecord.specialty } : null,
    ].filter(Boolean);

    const projectId = Date.now();
    const aiBudget = Number(brd.estimatedBudget) || null;

    const newProj = {
      id: projectId,
      name: form.clientName ? `${form.clientName} — ${form.projectType}` : form.projectType,
      client: form.clientName || "Enterprise Client",
      clientStars: Number(form.clientStars) || 4,
      pm: pmRecord ? pmRecord.name : "Unassigned",
      ba: baRecord ? baRecord.name : "Unassigned",
      type: form.projectType,
      status: "On Track",
      progress: 0,
      plannedDays: Number(form.plannedDays) || 120,
      elapsed: 0,
      description: brd.executiveSummary || "AI Generated Project.",
      budget: aiBudget,
      budgetSource: aiBudget != null ? "ai" : null,
      budgetReasoning: brd.budgetReasoning || "",
      spent: 0,
      team,
      weeklyLogs: [],
    };

    // Route through the real handler — updates employee allocation counts,
    // calculates compatibility score, fires the creation notification.
    onCreateProject(newProj);

    // Seed user stories from the BRD into the global stories state
    if (Array.isArray(brd.userStories) && brd.userStories.length > 0) {
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

    setCreating(false);
    setCreated(true);
    addNotification(`Project "${newProj.name}" created from BRD with ${brd.userStories?.length || 0} user stories.`, "system");
  };

  const exportBRDToTXT = () => {
    if (!brd) return;
    const fileContent = `
========================================================================
                      BUSINESS REQUIREMENTS DOCUMENT
========================================================================
Project Type: ${form.projectType}
Client: ${form.clientName || "Enterprise Client"}
PM: ${form.pm || "TBD"} | BA: ${form.ba || "TBD"}
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

FUNCTIONAL REQUIREMENTS
-----------------------
${brd.functionalRequirements?.map((r, i) => `FR${i+1}: ${r}`).join("\n") || "N/A"}

USER STORIES
------------
${brd.userStories?.map((us, i) => `US ${i + 1}: As a ${us.asA}, I want to ${us.iWantTo} so that ${us.soThat}`).join("\n") || "N/A"}

ESTIMATED BUDGET: $${Number(brd.estimatedBudget || 0).toLocaleString()}
BUDGET REASONING: ${brd.budgetReasoning || "N/A"}
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
      {/* Input Form */}
      <div className="bg-[#2E2E2E]/40 border border-white/10 rounded-2xl p-6 space-y-4">
        <h3 className="text-[#FFE600] font-bold text-sm uppercase tracking-widest flex items-center gap-2">
          <span>✦</span> Enhanced AI BRD Generator
        </h3>

        {/* Row 1: Client + Project Type */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Client Name</label>
            <input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="e.g. NexaBank Ltd" className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Project Type</label>
            <input value={form.projectType} onChange={e => setForm(f => ({ ...f, projectType: e.target.value }))} className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
        </div>

        {/* Row 2: PM + BA + Client Stars + Planned Days */}
        <div className="grid md:grid-cols-4 gap-3">
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Project Manager *</label>
            <select value={form.pm} onChange={e => setForm(f => ({ ...f, pm: e.target.value }))} className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white">
              <option value="">Select PM...</option>
              {pmOptions.map(pm => <option key={pm.name} value={pm.name}>{pm.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Business Analyst</label>
            <select value={form.ba} onChange={e => setForm(f => ({ ...f, ba: e.target.value }))} className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white">
              <option value="">Select BA...</option>
              {baOptions.map(ba => <option key={ba.name} value={ba.name}>{ba.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Client Importance</label>
            <select value={form.clientStars} onChange={e => setForm(f => ({ ...f, clientStars: e.target.value }))} className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white">
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} Star{n !== 1 ? "s" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Planned Duration (days)</label>
            <input type="number" min="1" value={form.plannedDays} onChange={e => setForm(f => ({ ...f, plannedDays: e.target.value }))} className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
        </div>

        {/* Row 3: Problem + Goal */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Business Problem *</label>
            <textarea value={form.problem} onChange={e => setForm(f => ({ ...f, problem: e.target.value }))} rows={3} placeholder="Explain the business bottleneck or pain point..." className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white resize-none" />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Project Goal *</label>
            <textarea value={form.goal} onChange={e => setForm(f => ({ ...f, goal: e.target.value }))} rows={3} placeholder="Define the desired end state and success criteria..." className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white resize-none" />
          </div>
        </div>

        {/* Row 4: Stakeholders + Constraints + Assumptions */}
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Stakeholders</label>
            <input value={form.stakeholders} onChange={e => setForm(f => ({ ...f, stakeholders: e.target.value }))} placeholder="e.g. Risk officers, CTO" className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Constraints</label>
            <input value={form.constraints} onChange={e => setForm(f => ({ ...f, constraints: e.target.value }))} placeholder="e.g. Budget ceiling, compliance rules" className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1.5 block">Assumptions</label>
            <input value={form.assumptions} onChange={e => setForm(f => ({ ...f, assumptions: e.target.value }))} placeholder="e.g. API access available" className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
        </div>

        {/* API Keys */}
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1 block">Groq API Key <span className="text-slate-600 normal-case">(primary)</span></label>
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); if (e.target.value) localStorage.setItem("prismpm.groqApiKey", e.target.value); }} placeholder="Paste Groq key..." className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-xs text-white" />
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase mb-1 block">Mistral API Key <span className="text-slate-600 normal-case">(fallback)</span></label>
            <input type="password" defaultValue={localStorage.getItem("prismpm.mistralApiKey") || ""} onChange={e => { if (e.target.value) localStorage.setItem("prismpm.mistralApiKey", e.target.value); else localStorage.removeItem("prismpm.mistralApiKey"); }} placeholder="Paste Mistral key..." className="w-full bg-black border border-white/15 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-700" />
          </div>
        </div>
        <p className="text-[9px] text-slate-600">Groq is used first. If rate-limited, PrismPM automatically switches to Mistral.</p>

        <button onClick={generateBRD} disabled={loading || !form.problem || !form.goal || (!apiKey && !localStorage.getItem("prismpm.mistralApiKey"))} className="w-full py-2.5 bg-[#FFE600] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-xs uppercase tracking-wider rounded-xl transition-all">
          {loading ? "Generating specifications..." : "✦ AI Generate Specs"}
        </button>
      </div>

      {/* Generated BRD Output */}
      {brd && (
        <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-6 space-y-6">

          {/* Action bar */}
          <div className="flex justify-between items-start gap-4 border-b border-white/10 pb-4 flex-wrap">
            <div>
              <h4 className="text-white font-bold text-sm mb-0.5">Generated Specifications</h4>
              <p className="text-slate-500 text-[10px]">
                {form.clientName || "Project"} · {form.projectType} · PM: {form.pm || "Unassigned"} · BA: {form.ba || "Unassigned"}
                {brd.estimatedBudget ? ` · AI Budget Estimate: $${Number(brd.estimatedBudget).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {!created ? (
                <button
                  onClick={handleCreateProjectFromBRD}
                  disabled={creating || !form.pm}
                  className="px-4 py-2 bg-[#FFE600] disabled:opacity-40 text-black text-xs font-bold rounded-lg flex items-center gap-1.5"
                >
                  {creating ? "Creating..." : "✦ Push to Dashboard"}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400 text-xs font-bold">✓ Project added to Dashboard</span>
                  <button
                    onClick={onNavigateToDashboard}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all"
                  >
                    Go to Dashboard →
                  </button>
                </div>
              )}
              <button onClick={exportBRDToTXT} className="px-3.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-all">
                Export .txt
              </button>
            </div>
          </div>

          {/* BRD Sections */}
          <div className="space-y-5">

            {/* Executive Summary */}
            <div className="space-y-1">
              <span className="text-[#FFE600] text-[10px] font-bold uppercase tracking-wider">Executive Summary</span>
              <p className="text-slate-300 text-xs leading-relaxed">{brd.executiveSummary}</p>
            </div>

            {/* Objectives + Scope */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-2">Business Objectives</span>
                <ul className="list-disc pl-4 text-xs text-slate-300 space-y-1">
                  {brd.businessObjectives?.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </div>
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-1">In Scope</span>
                <ul className="list-disc pl-4 text-xs text-[#FFE600] space-y-1 mb-3">
                  {brd.projectScope?.inScope?.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
                <span className="text-slate-500 text-xs font-bold block mb-1">Out of Scope</span>
                <ul className="list-disc pl-4 text-xs text-slate-500 space-y-1">
                  {brd.projectScope?.outOfScope?.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              </div>
            </div>

            {/* Functional + Non-functional Requirements */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-2">Functional Requirements</span>
                <ul className="space-y-1">
                  {brd.functionalRequirements?.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-300">
                      <span className="text-[#FFE600] font-mono font-bold text-[10px] mt-0.5">FR{i+1}</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-2">Non-Functional Requirements</span>
                <ul className="space-y-1">
                  {brd.nonFunctionalRequirements?.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-300">
                      <span className="text-slate-500 font-mono font-bold text-[10px] mt-0.5">NFR{i+1}</span>{r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Stakeholders */}
            {brd.stakeholders?.length > 0 && (
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-2">Stakeholders</span>
                <div className="grid sm:grid-cols-2 gap-2">
                  {brd.stakeholders.map((s, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-[#FFE600] font-bold min-w-[90px]">{s.role}</span>
                      <span className="text-slate-400">{s.name}</span>
                      <span className="text-slate-600">— {s.responsibility}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* User Stories */}
            <div className="space-y-2">
              <span className="text-white text-xs font-bold block">User Stories ({brd.userStories?.length || 0}) <span className="text-slate-500 font-normal">— will be seeded into the project backlog</span></span>
              <div className="grid gap-2 max-h-52 overflow-y-auto pr-1">
                {brd.userStories?.map((us, i) => (
                  <div key={i} className="bg-black/35 p-3 rounded-lg border border-white/5 text-xs flex justify-between items-start gap-3">
                    <span className="text-slate-300"><strong className="text-white">As a</strong> {us.asA} — <strong className="text-white">I want to</strong> {us.iWantTo} — <strong className="text-white">So that</strong> {us.soThat}</span>
                    <span className="text-[#FFE600] font-mono font-bold flex-shrink-0">{us.points}pt</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Risks + Success Metrics */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-2">Identified Risks</span>
                <ul className="space-y-1">
                  {brd.risks?.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-300"><span className="text-rose-400">⚠</span>{r}</li>
                  ))}
                </ul>
              </div>
              <div className="bg-black/30 p-4 rounded-xl">
                <span className="text-white text-xs font-bold block mb-2">Success Metrics</span>
                <ul className="space-y-1">
                  {brd.successMetrics?.map((m, i) => (
                    <li key={i} className="flex gap-2 text-xs text-slate-300"><span className="text-emerald-400">✓</span>{m}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* AI Budget Estimate */}
            {brd.estimatedBudget && (
              <div className="bg-[#FFE600]/5 border border-[#FFE600]/20 rounded-xl p-4 flex items-start gap-3">
                <span className="text-[#FFE600] text-lg">💰</span>
                <div>
                  <span className="text-[#FFE600] text-xs font-bold block mb-0.5">AI Budget Estimate</span>
                  <span className="text-white font-mono font-bold text-lg">${Number(brd.estimatedBudget).toLocaleString()}</span>
                  {brd.budgetReasoning && <p className="text-slate-400 text-[11px] mt-1 italic">{brd.budgetReasoning}</p>}
                  <p className="text-slate-500 text-[10px] mt-1">This figure is applied to the project automatically. You can edit it manually in the project&apos;s Overview tab.</p>
                </div>
              </div>
            )}

            {/* Post-creation CTA */}
            {created && (
              <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-emerald-400 font-bold text-sm">✓ Project successfully pushed to Dashboard</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    Head to the Dashboard to see it, then open it and use <strong>AI Setup</strong> to generate epics, sprints, tasks, and a full simulation.
                  </p>
                </div>
                <button onClick={onNavigateToDashboard} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold rounded-lg transition-all flex-shrink-0">
                  Go to Dashboard →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Budget Panel (AI-estimated, manually editable) ──────────────────────────
function BudgetPanel({ project, setProjects, addNotification, logOverride = () => {} }) {
  const [editing, setEditing] = useState(false);
  const [draftBudget, setDraftBudget] = useState(project.budget ?? 0);

  const spent = project.spent || 0;
  const budget = project.budget || 0;
  const pctUsed = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const overBudget = spent > budget;

  const startEditing = () => {
    setDraftBudget(project.budget ?? 0);
    setEditing(true);
  };

  const saveBudget = () => {
    const value = Number(draftBudget);
    if (!Number.isFinite(value) || value < 0) return;
    logOverride(`Project: ${project.name}`, "budget", `$${(project.budget ?? 0).toLocaleString()} (AI Estimate)`, `$${value.toLocaleString()} (Manual Edit)`, "manual");
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, budget: value, budgetSource: "manual" } : p));
    addNotification(`Budget for "${project.name}" manually set to $${value.toLocaleString()}.`, "system");
    setEditing(false);
  };

  return (
    <div className="bg-[#2E2E2E]/20 p-5 rounded-2xl border border-white/5 space-y-3">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 text-xs font-bold uppercase">Budget</span>
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${project.budgetSource === "ai" ? "bg-[#FFE600]/15 text-[#FFE600]" : "bg-white/10 text-slate-300"}`}>
            {project.budgetSource === "ai" ? "AI Estimate" : "Manually Set"}
          </span>
        </div>
        {!editing && (
          <button onClick={startEditing} className="text-[10px] text-[#FFE600] font-bold hover:underline">
            Edit Budget
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-500 text-xs">$</span>
          <input
            type="number"
            min="0"
            autoFocus
            value={draftBudget}
            onChange={e => setDraftBudget(e.target.value)}
            className="bg-black border border-white/20 rounded px-2.5 py-1.5 text-xs text-white w-36"
          />
          <button onClick={saveBudget} className="px-3 py-1.5 bg-[#FFE600] text-black text-xs font-bold rounded">Save</button>
          <button onClick={() => setEditing(false)} className="px-3 py-1.5 bg-black border border-white/20 text-slate-300 text-xs rounded">Cancel</button>
        </div>
      ) : (
        <>
          <div className="font-mono text-2xl font-black text-white">
            ${spent.toLocaleString()} <span className="text-slate-600 text-base font-normal">/ ${budget.toLocaleString()}</span>
          </div>
          <ProgressBar value={pctUsed} />
          <div className="flex justify-between text-[10px] text-slate-500">
            <span className={overBudget ? "text-red-400 font-bold" : ""}>{pctUsed}% utilized{overBudget ? " — over budget" : ""}</span>
            <span>${Math.max(budget - spent, 0).toLocaleString()} remaining</span>
          </div>
          {project.budgetReasoning && (
            <p className="text-[10px] text-slate-500 italic pt-1 border-t border-white/5">
              AI reasoning: {project.budgetReasoning}
            </p>
          )}
        </>
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
  onAddMemberToProject,
  onDropMemberFromProject,
  onBack,
  onDeleteProject,
  addNotification,
  logOverride: logOverrideGlobal = () => {},
  aiOverrideLog: aiOverrideLogAll = [],
  setAiOverrideLog = () => {}
}) {
  const logOverride = (entity, field, oldVal, newVal, source = "manual") =>
    logOverrideGlobal(entity, field, oldVal, newVal, source, project.id);
  const aiOverrideLog = aiOverrideLogAll.filter(e => e.projectId === project.id);

  const [subTab, setSubTab] = useState("overview");
  const [apiLoading, setApiLoading] = useState(false);
  const [riskFilter, setRiskFilter] = useState(null);
  const [aiInput, setAiInput] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("prismpm.groqApiKey") || "");
  const [docParsing, setDocParsing] = useState(false);
  const [docFileName, setDocFileName] = useState("");
  const [docError, setDocError] = useState("");
  const docFileInputRef = useRef(null);
  const [editingWeekSummary, setEditingWeekSummary] = useState(false);
  const [weekSummaryDraft, setWeekSummaryDraft] = useState("");
  const [editingRiskId, setEditingRiskId] = useState(null);
  const [pendingSimResult, setPendingSimResult] = useState(null); // holds AI result waiting for user review
  const [showSimReview, setShowSimReview] = useState(false);
  const [aiTeamSuggestions, setAiTeamSuggestions] = useState(null);
  const [teamWeekView, setTeamWeekView] = useState(1);
  const [showClearAudit, setShowClearAudit] = useState(false);
  const [clearAuditPassword, setClearAuditPassword] = useState("");
  const [clearAuditError, setClearAuditError] = useState("");

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

  // ── Predictive analytics ──────────────────────────────────────────────────
  // Compute projected completion: if we know avg velocity, how many more weeks?
  const weeklyLogs = project.weeklyLogs || [];
  const avgWeeklyVelocity = weeklyLogs.length > 0
    ? weeklyLogs.reduce((s, l) => s + (l.velocityActual || 0), 0) / weeklyLogs.length
    : 0;
  const remainingPts = hasWeeklyData && currentWeekLog ? currentWeekLog.remainingPoints : totalPoints;
  const weeksToFinish = avgWeeklyVelocity > 0 ? Math.ceil(remainingPts / avgWeeklyVelocity) : null;
  const projectedTotalWeeks = weeklyLogs.length + (weeksToFinish || 0);
  const plannedWeeks = Math.ceil((project.plannedDays || 90) / 7);
  const predictedDelayWeeks = hasWeeklyData && weeksToFinish != null
    ? Math.max(0, projectedTotalWeeks - plannedWeeks)
    : 0;

  // Smart weekly summary bullets parsed from the current weekLog summary text
  const smartSummary = currentWeekLog?.weekSummary
    ? currentWeekLog.weekSummary.split(/[.\n]/).map(s => s.trim()).filter(s => s.length > 10).slice(0, 4)
    : null;
  
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

      // Always give AI the FULL roster — not just current team members.
      // Using only current team caused it to hallucinate names to fill gaps.
      const rosterNames = employees.map(m => m.name);
      const teamRoster = employees
        .map(m => `${m.name} (${m.role}, ${m.specialty}, ${m.skillStars}★)`)
        .join(", ");

      // ── Call 1: Epics, Stories, Sprints, Tasks, Risks, Budget Estimate, Team ──
      const structurePrompt = `${projectContext}
Available team members (ONLY use names from this exact list): ${teamRoster}
Client importance (stars): ${project.clientStars || 3}/5

CRITICAL: For suggestedTeam, you MUST only use names that appear verbatim in the list above. Do not invent or modify any names.

Generate a project structure with 3-4 epics, 6-8 user stories, 3 sprints, 2-3 tasks per story, and 3-4 risks.
For Risks, assign encounteredWeek from 1 to 4.
For stories and tasks, assign a team member from the available list based on their role and the work required.
Also estimate a total project budget in USD based on the scope, complexity, and duration implied by the requirements — consider team size, project type, and effort. Give a brief one-sentence reasoning for the figure.
Also suggest the ideal team composition for this project — pick 3-5 people from the roster above whose roles and specialties best match the project needs. For high client importance (4-5 stars), bias toward members with higher skillStars. You MUST only suggest names that exist exactly in the roster list above.

Return ONLY this JSON (no markdown, no extra text):
{
  "epics": [{ "name": "string", "description": "string" }],
  "stories": [{ "title": "string", "description": "As a... I want to... So that...", "points": 5, "priority": "High", "moscow": "Must Have", "epicName": "string", "sprintName": "Sprint 1", "assignee": "Name from team roster" }],
  "sprints": [{ "name": "Sprint 1", "goal": "string", "startDate": "2026-06-01", "endDate": "2026-06-14" }],
  "tasks": [{ "storyTitle": "string", "name": "string", "priority": "High", "due": "2026-06-05", "description": "string", "assignee": "Name from team roster" }],
  "risks": [{ "title": "string", "severity": "High", "impact": "string", "probability": 70, "category": "Technical", "mitigationPlan": "string", "encounteredWeek": 2 }],
  "estimatedBudget": 150000,
  "budgetReasoning": "string",
  "suggestedTeam": [{ "name": "string (must be exact name from roster)", "role": "string", "reason": "string" }]
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
            const aiBudget = Number(mergedResult.estimatedBudget) || null;
            // Don't clobber a budget the PM already set by hand — only apply
            // the AI's figure if there's no budget yet or the existing one
            // also came from the AI (e.g. re-running the generator).
            const keepManualBudget = p.budgetSource === "manual" && p.budget != null;
            return {
              ...p,
              weeklyLogs: [],
              progress: 0,
              elapsed: 0,
              spent: 0,
              ...(keepManualBudget ? {} : {
                budget: aiBudget,
                budgetSource: aiBudget != null ? "ai" : p.budgetSource,
                budgetReasoning: mergedResult.budgetReasoning || "",
              }),
            };
          }
          return p;
        }));

        const budgetNote = (mergedResult.estimatedBudget && !(project.budgetSource === "manual" && project.budget != null))
          ? ` AI estimated a budget of $${Number(mergedResult.estimatedBudget).toLocaleString()}.`
          : "";

        // Hard-filter suggested team against the real roster — drop any name
        // the AI hallucinated that doesn't exist in employees exactly.
        if (Array.isArray(mergedResult.suggestedTeam) && mergedResult.suggestedTeam.length > 0) {
          const validSuggestions = mergedResult.suggestedTeam.filter(s =>
            rosterNames.includes(s.name)
          );
          if (validSuggestions.length > 0) setAiTeamSuggestions(validSuggestions);
        }

        addNotification(`AI successfully generated full project setup for ${project.name}.${budgetNote}`, "system");
        setSelectedWeek(1);
        const teamNote = mergedResult.suggestedTeam?.length ? ` AI also suggested a team of ${mergedResult.suggestedTeam.length} members — check the Team tab.` : "";
        alert("Project setup successfully generated!" + budgetNote + teamNote);
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

      const result = await callGroq(prompt, "You are an expert agile project manager AI. Always respond with valid JSON only.", key, 2500);

      // If callGroq fell back to {raw: text}, JSON.parse failed — surface the error
      if (result && result.raw) {
        alert("AI returned malformed JSON. Try again — the model occasionally truncates responses.");
        return;
      }

      if (result && result.week) {
        // Show review modal instead of immediately applying
        setPendingSimResult({ ...result, nextWeek, prevDone, prevRemaining, totalPts });
        setShowSimReview(true);
      } else {
        alert("AI returned an unexpected response. Please try again.");
      }
    } catch (e) {
      alert("Simulation failed: " + e.message);
    } finally {
      setSimulateLoading(false);
    }
  };

  const applySimResult = (result) => {
    const { nextWeek, prevDone, prevRemaining } = result;
    if (result.storyUpdates && result.storyUpdates.length > 0) {
      setStories(prev => prev.map(s => {
        if (s.projectId !== project.id) return s;
        const update = result.storyUpdates.find(u => u.title === s.title);
        return update ? { ...s, status: update.status } : s;
      }));
    }
    if ((result.remainingPoints ?? prevRemaining) <= 0) {
      setStories(prev => prev.map(s =>
        s.projectId === project.id ? { ...s, status: "Done" } : s
      ));
    }
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
      let newSpent = p.spent || 0;
      if (p.budget != null) {
        const tp = (newLog.donePoints + newLog.remainingPoints) || 1;
        const baseSpend = Math.round(p.budget * (newLog.donePoints / tp));
        const delayOverrun = Math.round(p.budget * 0.005 * (newLog.delayDays || 0));
        newSpent = Math.min(baseSpend + delayOverrun, Math.round(p.budget * 1.15));
      }
      return { ...p, weeklyLogs: updatedLogs, elapsed: updatedLogs.length * 7, spent: newSpent };
    }));
    setSelectedWeek(nextWeek);
    addNotification(`Week ${nextWeek} applied: ${result.velocityActual} pts. ${result.delayDays > 0 ? `⚠️ ${result.delayDays}d delay.` : "✅ On track."}`, "system");
    setPendingSimResult(null);
    setShowSimReview(false);
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
    const prob = Number(r.probability) || 0;
    const p = Math.min(5, Math.max(1, Math.ceil(prob / 20))); // clamp 1-5; 0% → 1
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
        try {
          const coords = getRiskScore(r);
          return coords.x === x && coords.y === y;
        } catch { return false; }
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
          {currentWeekLog?.weekSummary !== undefined && (
            <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 space-y-2">
              {editingWeekSummary ? (
                <div className="space-y-2">
                  <textarea
                    value={weekSummaryDraft}
                    onChange={e => setWeekSummaryDraft(e.target.value)}
                    rows={3}
                    className="w-full bg-black border border-[#FFE600]/40 rounded-lg px-3 py-2 text-xs text-white resize-none focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => {
                      const old = currentWeekLog.weekSummary;
                      setProjects(prev => prev.map(p => p.id !== project.id ? p : {
                        ...p, weeklyLogs: p.weeklyLogs.map(l => l.week === selectedWeek ? { ...l, weekSummary: weekSummaryDraft } : l)
                      }));
                      logOverride(`Week ${selectedWeek} Summary`, "weekSummary", old, weekSummaryDraft);
                      setEditingWeekSummary(false);
                      addNotification(`Week ${selectedWeek} summary manually updated.`, "system");
                    }} className="px-3 py-1 bg-[#FFE600] text-black text-xs font-bold rounded-lg">Save</button>
                    <button onClick={() => setEditingWeekSummary(false)} className="px-3 py-1 bg-white/10 text-white text-xs rounded-lg">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-between items-start gap-3">
                  <p className="text-xs text-slate-300 italic leading-relaxed flex-1">
                    <span className="text-[#FFE600] font-bold not-italic">Week {selectedWeek} Summary: </span>
                    {currentWeekLog.weekSummary}
                  </p>
                  <button onClick={() => { setWeekSummaryDraft(currentWeekLog.weekSummary); setEditingWeekSummary(true); }}
                    className="text-[9px] text-slate-500 hover:text-[#FFE600] border border-white/10 hover:border-[#FFE600]/30 px-2 py-1 rounded flex-shrink-0 transition-all">
                    ✎ Edit
                  </button>
                </div>
              )}
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

      {/* Sub sections nav — sticky so it stays visible while scrolling */}
      <div className="sticky top-[73px] z-10 bg-black/90 backdrop-blur py-2 -mx-8 px-8 border-b border-white/5">
        <div className="flex gap-1 bg-[#2E2E2E] p-1 rounded-xl w-fit flex-wrap">
          {["overview", "team", "analytics", "risks", "AI Setup", "audit"].map(t => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className={`px-4 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${subTab === t ? "bg-[#FFE600] text-black" : "text-slate-400 hover:text-white"}`}
            >
              {t === "audit" ? "Audit Log" : t === "AI Setup" ? "⚡ AI Setup" : t}
            </button>
          ))}
        </div>
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

          {/* Predictive delay banner */}
          {predictedDelayWeeks > 0 && (
            <div className="bg-red-950/30 border border-red-700/40 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-red-400 text-lg mt-0.5">🔴</span>
              <div>
                <p className="text-red-300 text-xs font-bold uppercase tracking-wider mb-1">Delay Prediction</p>
                <p className="text-red-200 text-sm">
                  At current velocity (<strong>{Math.round(avgWeeklyVelocity)} pts/wk</strong>), this project is likely to finish <strong>{predictedDelayWeeks} week{predictedDelayWeeks > 1 ? "s" : ""} late</strong>.{" "}
                  <span className="text-red-400">{remainingPts} points remaining across ~{weeksToFinish} more weeks.</span>
                </p>
              </div>
            </div>
          )}
          {hasWeeklyData && weeksToFinish != null && predictedDelayWeeks === 0 && (
            <div className="bg-green-950/20 border border-green-800/30 rounded-2xl p-4 flex items-center gap-3">
              <span className="text-green-400 text-lg">✅</span>
              <p className="text-green-300 text-xs">
                On track — projected to complete in <strong>~{weeksToFinish} more week{weeksToFinish !== 1 ? "s" : ""}</strong> at current velocity.
              </p>
            </div>
          )}

          {/* AI Smart Weekly Summary */}
          {smartSummary && smartSummary.length > 0 && (
            <div className="bg-[#111] border border-[#FFE600]/20 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[#FFE600]">✦</span>
                  <h4 className="text-[10px] text-[#FFE600] font-bold uppercase tracking-widest">AI Weekly Summary — Week {selectedWeek}</h4>
                </div>
                <div className="flex items-center gap-3 text-[9px] text-slate-600">
                  <span className="text-sky-400 font-mono">{currentWeekLog?.velocityActual} pts done</span>
                  <span className={currentWeekLog?.delayDays > 0 ? "text-red-400" : "text-green-400"}>
                    {currentWeekLog?.delayDays > 0 ? `+${currentWeekLog.delayDays}d delay` : "On schedule"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {/* Tasks Completed */}
                <div className="bg-black/30 rounded-lg p-3 space-y-1.5">
                  <div className="text-[9px] text-green-400 font-bold uppercase tracking-widest flex items-center gap-1">✓ Completed</div>
                  {(currentWeekLog?.storyUpdates || []).filter(u => u.status === "Done").length > 0 ? (
                    <ul className="space-y-1">
                      {(currentWeekLog?.storyUpdates || []).filter(u => u.status === "Done").slice(0, 3).map((u, i) => (
                        <li key={i} className="text-[10px] text-slate-300 flex gap-1.5 items-start"><span className="text-green-400 shrink-0 mt-0.5">▸</span>{u.title}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-slate-500">{smartSummary[0] || "No completions this week."}</p>
                  )}
                </div>
                {/* Delays */}
                <div className="bg-black/30 rounded-lg p-3 space-y-1.5">
                  <div className="text-[9px] text-red-400 font-bold uppercase tracking-widest flex items-center gap-1">⚠ Delays</div>
                  {currentWeekLog?.delayDays > 0 ? (
                    <p className="text-[10px] text-red-300">+{currentWeekLog.delayDays} day{currentWeekLog.delayDays > 1 ? "s" : ""} behind schedule. Velocity: {currentWeekLog.velocityActual}/{currentWeekLog.velocityTarget} pts target.</p>
                  ) : (
                    <p className="text-[10px] text-green-400">No delays this week. Team met velocity target.</p>
                  )}
                </div>
                {/* Risks */}
                <div className="bg-black/30 rounded-lg p-3 space-y-1.5">
                  <div className="text-[9px] text-amber-400 font-bold uppercase tracking-widest flex items-center gap-1">◆ Risks</div>
                  {(currentWeekLog?.risks || []).length > 0 ? (
                    <ul className="space-y-1">
                      {(currentWeekLog.risks || []).slice(0, 2).map((r, i) => (
                        <li key={i} className="text-[10px] text-amber-300 flex gap-1.5 items-start"><span className="shrink-0">▸</span>{r}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[10px] text-slate-500">{smartSummary[smartSummary.length - 1] || "No new risks surfaced."}</p>
                  )}
                </div>
              </div>
              {/* Narrative summary */}
              {currentWeekLog?.weekSummary && (
                <p className="text-[11px] text-slate-400 leading-relaxed border-l-2 border-[#FFE600]/30 pl-3 italic">{currentWeekLog.weekSummary}</p>
              )}
            </div>
          )}
          {project.budget != null ? (
            <BudgetPanel project={project} setProjects={setProjects} addNotification={addNotification} logOverride={logOverride} />
          ) : (
            <div className="bg-[#2E2E2E]/20 p-5 rounded-2xl border border-white/5 border-dashed text-center space-y-2">
              <span className="text-slate-500 text-xs font-bold uppercase block">Budget</span>
              <p className="text-slate-400 text-xs max-w-md mx-auto">
                No budget set yet. Go to <strong className="text-[#FFE600]">AI Setup</strong> and provide the client’s requirements document — the AI will propose a budget based on scope and complexity, which you can then accept or edit manually.
              </p>
            </div>
          )}

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
      {/* ── TEAM TAB ──────────────────────────────────────────────────────── */}
      {subTab === "team" && (() => {
        const currentTeam = project.team || [];
        const notOnTeam = employees.filter(e => !currentTeam.some(m => m.name === e.name && m.role === e.role));
        const simulatedWeeks = project.weeklyLogs || [];
        const weekLog = simulatedWeeks.find(w => w.week === teamWeekView) || null;

        // Per-member story breakdown for the selected week
        const memberStoryMap = {};
        (project.team || []).forEach(m => {
          const myStories = projectStories.filter(s => s.assignee === m.name);
          const done = myStories.filter(s => s.status === "Done");
          const inProgress = myStories.filter(s => s.status === "In Progress");
          const backlog = myStories.filter(s => s.status === "Backlog" || s.status === "To Do");
          const blocked = tasks.filter(t => t.projectId === project.id && t.assignee === m.name && t.status === "Blocked");
          memberStoryMap[m.name] = { done, inProgress, backlog, blocked, all: myStories };
        });

        return (
          <div className="space-y-5">

            {/* Current Team */}
            <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-white text-xs font-bold uppercase tracking-widest">Current Team ({currentTeam.length})</h4>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  project.compatibilityScore >= 75 ? "bg-emerald-900/40 text-emerald-400" :
                  project.compatibilityScore >= 55 ? "bg-amber-900/40 text-amber-400" :
                  "bg-red-900/40 text-red-400"
                }`}>
                  Compatibility {project.compatibilityScore ?? "—"}%
                </span>
              </div>

              {currentTeam.length === 0 ? (
                <p className="text-slate-500 text-xs">No team members yet. Add from the roster below or run AI Setup to get AI suggestions.</p>
              ) : (
                <div className="grid gap-3">
                  {currentTeam.map((m, i) => {
                    const info = memberStoryMap[m.name] || { done: [], inProgress: [], backlog: [], blocked: [], all: [] };
                    const totalPts = info.all.reduce((s, st) => s + (st.points || 0), 0);
                    const donePts = info.done.reduce((s, st) => s + (st.points || 0), 0);
                    return (
                      <div key={i} className="bg-black/40 border border-white/5 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                              m.role === "PM" ? "bg-[#FFE600]/20 text-[#FFE600] border border-[#FFE600]/30" :
                              m.role === "BA" ? "bg-purple-500/20 text-purple-400 border border-purple-500/30" :
                              "bg-white/10 text-white border border-white/10"
                            }`}>
                              {m.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <div className="text-white font-semibold text-sm">{m.name}</div>
                              <div className="text-slate-500 text-[10px]">{m.role} · {m.specialty || "—"}</div>
                              <div className="flex gap-0.5 mt-0.5">
                                {Array.from({ length: 5 }, (_, si) => (
                                  <span key={si} className={`text-[10px] ${si < (m.skillStars || 0) ? "text-[#FFE600]" : "text-slate-700"}`}>★</span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-center flex-wrap">
                            <div>
                              <div className="text-emerald-400 font-mono font-bold text-lg">{info.done.length}</div>
                              <div className="text-[9px] text-slate-600 uppercase">Done</div>
                            </div>
                            <div>
                              <div className="text-blue-400 font-mono font-bold text-lg">{info.inProgress.length}</div>
                              <div className="text-[9px] text-slate-600 uppercase">In Progress</div>
                            </div>
                            <div>
                              {/* Backlog count only turns amber once work has started — before that everything being in backlog is expected */}
                              <div className={`font-mono font-bold text-lg ${simulatedWeeks.length > 0 && info.backlog.length > 2 ? "text-amber-400" : "text-slate-400"}`}>{info.backlog.length}</div>
                              <div className="text-[9px] text-slate-600 uppercase">Backlog</div>
                            </div>
                            {info.blocked.length > 0 && (
                              <div>
                                <div className="text-red-400 font-mono font-bold text-lg">{info.blocked.length}</div>
                                <div className="text-[9px] text-slate-600 uppercase">Blocked</div>
                              </div>
                            )}
                            {m.role !== "PM" && (
                              <button
                                onClick={() => onDropMemberFromProject(m, project.id)}
                                className="text-[10px] text-red-400 border border-red-900/30 hover:border-red-400 px-2 py-1 rounded transition-all"
                              >
                                Drop
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Story breakdown — only meaningful once simulation has started */}
                        {info.all.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-white/5 space-y-2">
                            {simulatedWeeks.length === 0 ? (
                              // Pre-simulation: just show assigned story count, no alarms
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-slate-500">{info.all.length} stor{info.all.length !== 1 ? "ies" : "y"} assigned · ready to start</span>
                                <span className="text-slate-600 font-mono">{totalPts} pts total</span>
                              </div>
                            ) : (
                              <>
                                {/* Progress bar */}
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                                    <div className="h-1.5 bg-[#FFE600] rounded-full" style={{ width: `${totalPts > 0 ? Math.round((donePts / totalPts) * 100) : 0}%` }} />
                                  </div>
                                  <span className="text-[10px] text-slate-500 font-mono">{donePts}/{totalPts} pts</span>
                                </div>

                                {info.inProgress.length > 0 && (
                                  <div>
                                    <div className="text-[10px] text-blue-400 font-bold uppercase mb-1">In Progress</div>
                                    {info.inProgress.map((st, j) => (
                                      <div key={j} className="text-[11px] text-slate-300 flex justify-between py-0.5">
                                        <span>→ {st.title}</span>
                                        <span className="text-slate-600 font-mono">{st.points}pt</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Backlog only flagged as a problem once simulation is running */}
                                {info.backlog.length > 0 && (
                                  <div>
                                    <div className={`text-[10px] font-bold uppercase mb-1 ${info.backlog.length > 2 ? "text-amber-400" : "text-slate-500"}`}>
                                      Pending Backlog {info.backlog.length > 2 ? "⚠ Holding up delivery" : ""}
                                    </div>
                                    {info.backlog.map((st, j) => (
                                      <div key={j} className="text-[11px] text-slate-400 flex justify-between py-0.5">
                                        <span>· {st.title}</span>
                                        <span className="text-slate-600 font-mono">{st.points}pt</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}

                            {info.blocked.length > 0 && (
                              <div>
                                <div className="text-[10px] text-red-400 font-bold uppercase mb-1">Blocked Tasks 🔴</div>
                                {info.blocked.map((t, j) => (
                                  <div key={j} className="text-[11px] text-red-300 py-0.5">⛔ {t.name}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Weekly Activity View */}
            {simulatedWeeks.length > 0 && (
              <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-white text-xs font-bold uppercase tracking-widest">Weekly Activity Breakdown</h4>
                  <div className="flex gap-1">
                    {simulatedWeeks.map(w => (
                      <button key={w.week} onClick={() => setTeamWeekView(w.week)}
                        className={`px-2.5 py-1 rounded text-[10px] font-bold transition-all ${teamWeekView === w.week ? "bg-[#FFE600] text-black" : "bg-white/5 text-slate-400 hover:text-white"}`}>
                        W{w.week}
                      </button>
                    ))}
                  </div>
                </div>

                {weekLog ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-3 text-center">
                      <div className="bg-black/30 p-3 rounded-lg">
                        <div className="font-mono font-bold text-[#FFE600] text-xl">{weekLog.velocityActual}</div>
                        <div className="text-[9px] text-slate-600 uppercase">Pts Completed</div>
                      </div>
                      <div className="bg-black/30 p-3 rounded-lg">
                        <div className="font-mono font-bold text-slate-300 text-xl">{weekLog.velocityTarget}</div>
                        <div className="text-[9px] text-slate-600 uppercase">Pts Target</div>
                      </div>
                      <div className="bg-black/30 p-3 rounded-lg">
                        <div className="font-mono font-bold text-white text-xl">{weekLog.donePoints}</div>
                        <div className="text-[9px] text-slate-600 uppercase">Cumulative Done</div>
                      </div>
                      <div className="bg-black/30 p-3 rounded-lg">
                        <div className={`font-mono font-bold text-xl ${weekLog.delayDays > 0 ? "text-red-400" : "text-emerald-400"}`}>
                          {weekLog.delayDays > 0 ? `+${weekLog.delayDays}d` : "On track"}
                        </div>
                        <div className="text-[9px] text-slate-600 uppercase">Delay</div>
                      </div>
                    </div>

                    {weekLog.weekSummary && (
                      <p className="text-slate-400 text-xs leading-relaxed border-l-2 border-[#FFE600]/40 pl-3">
                        {weekLog.weekSummary}
                      </p>
                    )}

                    {/* Per-member story completions for this week */}
                    <div>
                      <div className="text-[10px] text-slate-500 font-bold uppercase mb-2">Who Did What — Week {teamWeekView}</div>
                      <div className="space-y-2">
                        {currentTeam.map((m, i) => {
                          const info = memberStoryMap[m.name] || { done: [], inProgress: [], backlog: [] };
                          // Stories that were moved to Done/In Progress this week per storyUpdates
                          const weekUpdates = (weekLog.storyUpdates || []).filter(u => {
                            const story = projectStories.find(s => s.title === u.title);
                            return story && story.assignee === m.name;
                          });
                          if (weekUpdates.length === 0 && info.backlog.length === 0) return null;
                          return (
                            <div key={i} className="bg-black/30 rounded-lg p-3 text-xs">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold text-white">
                                  {m.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                                </div>
                                <span className="text-white font-semibold">{m.name}</span>
                                <span className="text-slate-600">{m.role}</span>
                              </div>
                              {weekUpdates.length > 0 && (
                                <div className="space-y-1 mb-1">
                                  {weekUpdates.map((u, j) => (
                                    <div key={j} className={`flex items-center gap-1.5 text-[11px] ${u.status === "Done" ? "text-emerald-400" : "text-blue-400"}`}>
                                      <span>{u.status === "Done" ? "✓" : "→"}</span>
                                      <span>{u.title}</span>
                                      <span className={`text-[9px] px-1 rounded ${u.status === "Done" ? "bg-emerald-900/40" : "bg-blue-900/40"}`}>{u.status}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {info.backlog.length > 0 && (
                                <div className={`text-[10px] ${simulatedWeeks.length > 1 && info.backlog.length > 1 ? "text-amber-400" : "text-slate-500"} mt-1`}>
                                  {info.backlog.length} backlog item{info.backlog.length !== 1 ? "s" : ""} remaining{simulatedWeeks.length > 1 && info.backlog.length > 1 ? " — may slow delivery" : ""}
                                </div>
                              )}
                            </div>
                          );
                        }).filter(Boolean)}
                      </div>
                    </div>

                    {weekLog.risks?.length > 0 && (
                      <div>
                        <div className="text-[10px] text-red-400 font-bold uppercase mb-1">Risks Surfaced This Week</div>
                        {weekLog.risks.map((r, i) => (
                          <div key={i} className="text-[11px] text-red-300 flex gap-2 py-0.5"><span>⚠</span>{r}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs">No log for Week {teamWeekView}.</p>
                )}
              </div>
            )}

            {/* AI Team Suggestions */}
            {aiTeamSuggestions && aiTeamSuggestions.length > 0 && (
              <div className="bg-[#FFE600]/5 border border-[#FFE600]/20 rounded-2xl p-5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-[#FFE600] text-xs font-bold uppercase tracking-widest">✦ AI Team Suggestion</h4>
                  <button onClick={() => setAiTeamSuggestions(null)} className="text-[10px] text-slate-500 hover:text-white">Dismiss</button>
                </div>
                <p className="text-slate-400 text-[11px]">Based on the requirements document and client importance ({project.clientStars}/5★), the AI recommends:</p>
                <div className="space-y-2">
                  {aiTeamSuggestions.map((s, i) => {
                    const alreadyOnTeam = currentTeam.some(m => m.name === s.name);
                    const rosterMatch = employees.find(e => e.name === s.name);
                    return (
                      <div key={i} className="bg-black/40 border border-white/5 rounded-xl p-3 flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-full bg-[#FFE600]/15 flex items-center justify-center text-[10px] font-bold text-[#FFE600] flex-shrink-0">
                            {s.name.split(" ").map(n => n[0]).join("").slice(0,2)}
                          </div>
                          <div>
                            <div className="text-white font-semibold text-sm">{s.name}</div>
                            <div className="text-slate-500 text-[10px]">{s.role}</div>
                            <div className="text-slate-400 text-[11px] mt-0.5 italic">{s.reason}</div>
                          </div>
                        </div>
                        {alreadyOnTeam ? (
                          <span className="text-[10px] text-emerald-400 font-bold border border-emerald-900/30 px-2 py-1 rounded">Already on team</span>
                        ) : rosterMatch ? (
                          <button
                            onClick={() => { onAddMemberToProject(rosterMatch, project.id); }}
                            className="text-[10px] text-black bg-[#FFE600] font-bold px-3 py-1 rounded hover:bg-white transition-all"
                          >
                            + Add to Team
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600 italic">Not in roster</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add from Roster */}
            <div className="bg-[#2E2E2E]/20 border border-white/10 rounded-2xl p-5 space-y-3">
              <h4 className="text-white text-xs font-bold uppercase tracking-widest">Add from Roster</h4>
              {notOnTeam.length === 0 ? (
                <p className="text-slate-500 text-xs">Everyone in the roster is already on this project.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {notOnTeam.map((emp, i) => (
                    <div key={i} className="bg-black/30 border border-white/5 rounded-lg p-3 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-white text-xs font-semibold">{emp.name}</div>
                        <div className="text-slate-500 text-[10px]">{emp.role} · {emp.specialty}</div>
                        <div className="flex gap-0.5 mt-0.5">
                          {Array.from({ length: 5 }, (_, si) => (
                            <span key={si} className={`text-[9px] ${si < (emp.skillStars || 0) ? "text-[#FFE600]" : "text-slate-700"}`}>★</span>
                          ))}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${emp.available ? "bg-emerald-900/30 text-emerald-400" : "bg-slate-700 text-slate-500"}`}>
                          {emp.available ? "Available" : `${emp.projects || 0} project${(emp.projects || 0) !== 1 ? "s" : ""}`}
                        </span>
                        <button
                          onClick={() => onAddMemberToProject(emp, project.id)}
                          className="text-[10px] text-[#FFE600] font-bold border border-[#FFE600]/30 hover:bg-[#FFE600] hover:text-black px-2 py-0.5 rounded transition-all"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        );
      })()}

      {/* ── ANALYTICS TAB ─────────────────────────────────────────────────── */}
      {subTab === "analytics" && (
        <TabErrorBoundary>
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">

            {/* Interactive Burndown Chart */}
            <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-white text-xs font-bold uppercase tracking-widest">Sprint Burndown</h4>
                <span className="text-[10px] text-slate-500">Hover for details</span>
              </div>
              <div className="w-full bg-black/40 p-3 rounded-xl min-h-[200px] relative">
                {!hasWeeklyData ? (
                  <div className="flex items-center justify-center h-48 text-slate-500 text-xs">No data yet — simulate a week first.</div>
                ) : (() => {
                  try {
                  const logs = project.weeklyLogs.slice(0, selectedWeek).filter(l => l && typeof l.remainingPoints === "number");
                  if (logs.length === 0) return <div className="flex items-center justify-center h-48 text-slate-500 text-xs">No valid log data yet.</div>;
                  const W = 300, H = 160, PL = 32, PT = 10, PB = 24, PR = 10;
                  const chartW = W - PL - PR, chartH = H - PT - PB;
                  const maxPts = Math.max(...logs.map(l => (l.donePoints || 0) + (l.remainingPoints || 0)), 1);
                  const pts = logs.map((l, i) => {
                    const x = PL + (i / Math.max(logs.length - 1, 1)) * chartW;
                    const remaining = l.remainingPoints || 0;
                    const y = PT + (1 - remaining / maxPts) * chartH;
                    return { x, y, log: l };
                  });
                  const idealStart = { x: PL, y: PT };
                  const idealEnd = { x: PL + chartW, y: PT + chartH };
                  const last = pts[pts.length - 1];
                  const projEnd = last && avgWeeklyVelocity > 0
                    ? { x: last.x + ((last.log.remainingPoints || 0) / avgWeeklyVelocity) * (chartW / Math.max(logs.length, 1)), y: PT + chartH }
                    : null;
                  return (
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ cursor: "crosshair" }}>
                      {[0, 0.25, 0.5, 0.75, 1].map(r => (
                        <g key={r}>
                          <line x1={PL} y1={PT + r * chartH} x2={PL + chartW} y2={PT + r * chartH} stroke="#222" strokeWidth="1" />
                          <text x={PL - 3} y={PT + r * chartH + 3} fill="#555" fontSize="6" textAnchor="end">{Math.round(maxPts * (1 - r))}</text>
                        </g>
                      ))}
                      {logs.map((l, i) => (
                        <text key={i} x={PL + (i / Math.max(logs.length - 1, 1)) * chartW} y={H - 6} fill="#555" fontSize="6" textAnchor="middle">W{l.week}</text>
                      ))}
                      <line x1={PL} y1={PT} x2={PL} y2={PT + chartH} stroke="#333" strokeWidth="1" />
                      <line x1={PL} y1={PT + chartH} x2={PL + chartW} y2={PT + chartH} stroke="#333" strokeWidth="1" />
                      <line x1={idealStart.x} y1={idealStart.y} x2={idealEnd.x} y2={idealEnd.y} stroke="#444" strokeDasharray="3,3" strokeWidth="1.5" />
                      <text x={idealEnd.x - 2} y={idealEnd.y - 3} fill="#444" fontSize="6" textAnchor="end">Ideal</text>
                      {projEnd && last && (
                        <line x1={last.x} y1={last.y} x2={Math.min(projEnd.x, PL + chartW + 30)} y2={projEnd.y}
                          stroke="#ef4444" strokeDasharray="4,3" strokeWidth="1.5" opacity="0.7" />
                      )}
                      {pts.length > 1 && (
                        <polygon points={`${PL},${PT + chartH} ${pts.map(p => `${p.x},${p.y}`).join(" ")} ${pts[pts.length-1].x},${PT + chartH}`} fill="#FFE600" opacity="0.07" />
                      )}
                      {pts.length > 1 && (
                        <polyline fill="none" stroke="#FFE600" strokeWidth="2.5" points={pts.map(p => `${p.x},${p.y}`).join(" ")} strokeLinejoin="round" strokeLinecap="round" />
                      )}
                      {pts.map((p, i) => (
                        <g key={i}>
                          <circle cx={p.x} cy={p.y} r="8" fill="transparent" />
                          <circle cx={p.x} cy={p.y} r="3.5" fill="#FFE600" stroke="#000" strokeWidth="1.5" />
                          <g opacity="0" style={{ transition: "opacity 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1}
                            onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                            <rect x={Math.min(p.x - 28, W - 72)} y={p.y - 36} width={64} height={28} rx="4" fill="#1a1a1a" stroke="#FFE600" strokeWidth="0.5" />
                            <text x={Math.min(p.x, W - 40)} y={p.y - 24} fill="#FFE600" fontSize="7" textAnchor="middle" fontWeight="bold">W{p.log.week}</text>
                            <text x={Math.min(p.x, W - 40)} y={p.y - 14} fill="#aaa" fontSize="6" textAnchor="middle">{p.log.remainingPoints} pts left</text>
                            <text x={Math.min(p.x, W - 40)} y={p.y - 6} fill={(p.log.delayDays || 0) > 0 ? "#ef4444" : "#22c55e"} fontSize="6" textAnchor="middle">{(p.log.delayDays || 0) > 0 ? `+${p.log.delayDays}d delay` : "On track"}</text>
                          </g>
                        </g>
                      ))}
                      <text x={PL} y={PT + chartH + 18} fill="#555" fontSize="6">← Weeks →</text>
                    </svg>
                  );
                  } catch(e) {
                    return <div className="flex items-center justify-center h-48 text-red-400 text-xs">Chart error: {e.message}</div>;
                  }
                })()}
              </div>
            </div>

            {/* Interactive Velocity Chart */}
            <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-5 space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-white text-xs font-bold uppercase tracking-widest">Sprint Velocity</h4>
                <span className="text-[10px] text-slate-500">Hover bars for detail</span>
              </div>
              <div className="w-full bg-black/40 p-3 rounded-xl min-h-[200px] relative">
                {!hasWeeklyData ? (
                  <div className="flex items-center justify-center h-48 text-slate-500 text-xs">No data yet — simulate a week first.</div>
                ) : (() => {
                  try {
                  const logs = project.weeklyLogs.slice(0, selectedWeek).filter(l => l);
                  if (logs.length === 0) return <div className="flex items-center justify-center h-48 text-slate-500 text-xs">No log data yet.</div>;
                  const W = 300, H = 160, PL = 30, PT = 10, PB = 24;
                  const chartW = W - PL - 10, chartH = H - PT - PB;
                  const maxPts = Math.max(...logs.map(l => Math.max(Number(l.velocityTarget) || 0, Number(l.velocityActual) || 0)), 1);
                  const barGroupW = chartW / logs.length;
                  const barW = Math.min(14, barGroupW * 0.38);
                  return (
                    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
                      {[0, 0.25, 0.5, 0.75, 1].map(r => (
                        <g key={r}>
                          <line x1={PL} y1={PT + r * chartH} x2={W - 10} y2={PT + r * chartH} stroke="#222" strokeWidth="1" />
                          <text x={PL - 3} y={PT + r * chartH + 3} fill="#555" fontSize="6" textAnchor="end">{Math.round(maxPts * (1 - r))}</text>
                        </g>
                      ))}
                      <line x1={PL} y1={PT} x2={PL} y2={PT + chartH} stroke="#333" strokeWidth="1" />
                      <line x1={PL} y1={PT + chartH} x2={W - 10} y2={PT + chartH} stroke="#333" strokeWidth="1" />
                      {avgWeeklyVelocity > 0 && (
                        <>
                          <line x1={PL} y1={PT + (1 - avgWeeklyVelocity / maxPts) * chartH} x2={W - 10} y2={PT + (1 - avgWeeklyVelocity / maxPts) * chartH} stroke="#60a5fa" strokeDasharray="3,3" strokeWidth="1" opacity="0.6" />
                          <text x={W - 12} y={PT + (1 - avgWeeklyVelocity / maxPts) * chartH - 2} fill="#60a5fa" fontSize="6" textAnchor="end">avg</text>
                        </>
                      )}
                      {logs.map((log, idx) => {
                        const cx = PL + (idx + 0.5) * barGroupW;
                        const vTarget = Number(log.velocityTarget) || 0;
                        const vActual = Number(log.velocityActual) || 0;
                        const targetH = Math.max(0, (vTarget / maxPts) * chartH);
                        const actualH = Math.max(0, (vActual / maxPts) * chartH);
                        const isSelected = log.week === selectedWeek;
                        return (
                          <g key={log.week || idx}>
                            <rect x={cx - barW - 1} y={PT + chartH - targetH} width={barW} height={targetH} fill={isSelected ? "#4a4a00" : "#2a2a2a"} rx="2" stroke={isSelected ? "#FFE600" : "transparent"} strokeWidth="0.5" />
                            <rect x={cx + 1} y={PT + chartH - actualH} width={barW} height={actualH} fill={vActual >= vTarget ? "#22c55e" : "#FFE600"} rx="2" opacity="0.9" />
                            <text x={cx} y={H - 6} fill={isSelected ? "#FFE600" : "#555"} fontSize="6" textAnchor="middle">W{log.week}</text>
                          </g>
                        );
                      })}
                      <text x={PL + chartW / 2} y={H - 1} fill="#444" fontSize="6" textAnchor="middle">■ Target  ■ Actual</text>
                    </svg>
                  );
                  } catch(e) {
                    return <div className="flex items-center justify-center h-48 text-red-400 text-xs">Chart error: {e.message}</div>;
                  }
                })()}
              </div>
              {hasWeeklyData && (
                <div className="flex gap-4 text-[10px]">
                  <span className="text-slate-500">Avg velocity: <strong className="text-sky-400">{Math.round(avgWeeklyVelocity)} pts/wk</strong></span>
                  <span className="text-slate-500">Weeks simulated: <strong className="text-white">{project.weeklyLogs.length}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Upgraded Gantt Timeline */}
          <div className="bg-[#111] border border-white/8 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-white text-sm font-bold">Project Timeline</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Epic phases · sprint lanes · milestone markers · current week indicator</p>
              </div>
              <div className="flex items-center gap-3 text-[9px]">
                {[["#FFE600","In Progress"],["#22c55e","Complete"],["#ef4444","Delayed"],["#60a5fa","Planned"]].map(([c,l]) => (
                  <span key={l} className="flex items-center gap-1"><span style={{ background: c, display: "inline-block", width: 8, height: 8, borderRadius: 2 }} /><span className="text-slate-500">{l}</span></span>
                ))}
              </div>
            </div>

            {!hasWeeklyData ? (
              <div className="flex items-center gap-3 bg-black/30 rounded-lg p-4 text-slate-500 text-xs">
                <span className="text-[#FFE600] text-lg">📅</span>
                <div>
                  <p className="font-medium text-slate-400">No timeline data yet</p>
                  <p className="text-[11px] mt-0.5">Run the AI Generator and simulate at least one week to populate the timeline.</p>
                </div>
              </div>
            ) : (() => {
              try {
              const totalWeeks = project.weeklyLogs.length;
              const plannedWeeks = Math.ceil((project.plannedDays || 90) / 7);
              const displayWeeks = Math.max(totalWeeks, plannedWeeks, 1);
              const COL_W = 44, ROW_H = 34, LABEL_W = 150, SPRINT_H = 20, WEEK_H = 18;
              const sprintList = sprints.filter(sp => sp.projectId === project.id);

              const getSpan = (epicId, storyId = null) => {
                const src = storyId
                  ? projectStories.filter(s => s.id === storyId)
                  : projectStories.filter(s => s.epicId === epicId);
                if (!src.length) return { start: 1, end: Math.max(1, Math.min(2, totalWeeks)) };
                let start = Infinity, end = 0;
                src.forEach(s => {
                  const spIdx = sprintList.findIndex(sp => sp.id === s.sprintId);
                  if (spIdx >= 0) {
                    const sw = spIdx * 2 + 1, ew = sw + 1;
                    if (sw < start) start = sw;
                    if (ew > end) end = ew;
                  }
                });
                if (!isFinite(start) || end < start) return { start: 1, end: Math.max(1, Math.min(2, displayWeeks)) };
                return { start: Math.max(1, start), end: Math.min(displayWeeks, Math.max(start, end)) };
              };

              const svgH = SPRINT_H + WEEK_H + projectEpics.length * ROW_H + 28;
              const svgW = LABEL_W + displayWeeks * COL_W;

              return (
                <div className="overflow-x-auto rounded-lg bg-black/30">
                  <svg width={svgW} height={svgH} style={{ display: "block", minWidth: svgW }}>

                    {/* Sprint bands in header */}
                    {sprintList.map((sp, idx) => {
                      const startCol = idx * 2;
                      const colSpan = Math.min(2, displayWeeks - startCol);
                      if (colSpan <= 0) return null;
                      const x = LABEL_W + startCol * COL_W;
                      const w = colSpan * COL_W;
                      return (
                        <g key={sp.id}>
                          <rect x={x} y={0} width={w} height={SPRINT_H} fill={idx % 2 === 0 ? "rgba(255,230,0,0.06)" : "rgba(255,255,255,0.02)"} />
                          <line x1={x} y1={0} x2={x} y2={svgH} stroke="#1f1f1f" strokeWidth="1" />
                          <text x={x + w / 2} y={13} fill="#666" fontSize="8" textAnchor="middle" fontWeight="bold">{sp.name?.replace("Sprint ", "S") || `S${idx+1}`}</text>
                        </g>
                      );
                    })}
                    {/* Sprint band border bottom */}
                    <line x1={LABEL_W} y1={SPRINT_H} x2={svgW} y2={SPRINT_H} stroke="#222" strokeWidth="1" />

                    {/* Week column headers */}
                    {Array.from({ length: displayWeeks }).map((_, i) => {
                      const isSimulated = i < totalWeeks;
                      const isCurrent = i + 1 === selectedWeek;
                      const x = LABEL_W + i * COL_W;
                      return (
                        <g key={i}>
                          <rect x={x} y={SPRINT_H} width={COL_W} height={WEEK_H}
                            fill={isCurrent ? "rgba(255,230,0,0.12)" : isSimulated ? "rgba(255,255,255,0.015)" : "transparent"} />
                          <text x={x + COL_W / 2} y={SPRINT_H + 12}
                            fill={isCurrent ? "#FFE600" : isSimulated ? "#555" : "#333"}
                            fontSize="7" textAnchor="middle" fontWeight={isCurrent ? "bold" : "normal"}>
                            W{i + 1}{!isSimulated ? "" : ""}
                          </text>
                          {!isSimulated && (
                            <text x={x + COL_W / 2} y={SPRINT_H + 17} fill="#2a2a2a" fontSize="5" textAnchor="middle">plan</text>
                          )}
                        </g>
                      );
                    })}
                    {/* Header divider */}
                    <line x1={0} y1={SPRINT_H + WEEK_H} x2={svgW} y2={SPRINT_H + WEEK_H} stroke="#1f1f1f" strokeWidth="1" />

                    {/* Label column header */}
                    <rect x={0} y={0} width={LABEL_W} height={SPRINT_H + WEEK_H} fill="#0a0a0a" />
                    <text x={8} y={SPRINT_H / 2 + 4} fill="#444" fontSize="8" fontWeight="bold">EPIC / PHASE</text>
                    <text x={8} y={SPRINT_H + 12} fill="#333" fontSize="7">Progress</text>

                    {/* Epic rows */}
                    {projectEpics.map((ep, epIdx) => {
                      const rowY = SPRINT_H + WEEK_H + epIdx * ROW_H;
                      const { start, end } = getSpan(ep.id);
                      const epStories = projectStories.filter(s => s.epicId === ep.id);
                      const doneCount = epStories.filter(s => s.status === "Done").length;
                      const progress = epStories.length > 0 ? doneCount / epStories.length : 0;
                      const isComplete = progress >= 1;
                      const isActive = epStories.some(s => s.status === "In Progress");
                      const hasDelay = project.weeklyLogs.slice(start - 1, end).some(l => l.delayDays > 0);
                      const barColor = isComplete ? "#22c55e" : hasDelay ? "#ef4444" : isActive ? "#FFE600" : "#60a5fa";
                      const barX = LABEL_W + (start - 1) * COL_W + 4;
                      const barW = Math.max(8, (end - start + 1) * COL_W - 8);
                      const barY = rowY + 8;
                      const barH = 18;

                      return (
                        <g key={ep.id}>
                          {/* Row separator */}
                          <line x1={0} y1={rowY} x2={svgW} y2={rowY} stroke="#131313" strokeWidth="1" />
                          {/* Alternate row shading */}
                          {epIdx % 2 === 0 && <rect x={LABEL_W} y={rowY} width={svgW - LABEL_W} height={ROW_H} fill="rgba(255,255,255,0.012)" />}
                          {/* Label */}
                          <rect x={0} y={rowY} width={LABEL_W} height={ROW_H} fill="#080808" />
                          <text x={8} y={rowY + 15} fill={isComplete ? "#22c55e" : "#ccc"} fontSize="8" fontWeight="600">
                            {isComplete ? "✓ " : isActive ? "▶ " : "○ "}{ep.name.length > 17 ? ep.name.slice(0, 17) + "…" : ep.name}
                          </text>
                          <text x={8} y={rowY + 26} fill="#444" fontSize="6.5">
                            {doneCount}/{epStories.length} stories · {Math.round(progress * 100)}%
                          </text>

                          {/* Track */}
                          <rect x={LABEL_W + 4} y={barY} width={displayWeeks * COL_W - 8} height={barH} fill="#141414" rx="4" />
                          {/* Progress fill */}
                          <rect x={barX} y={barY} width={barW} height={barH} fill={barColor} rx="4" opacity="0.2" />
                          {/* Filled portion */}
                          {progress > 0 && (
                            <rect x={barX} y={barY} width={Math.max(6, barW * progress)} height={barH} fill={barColor} rx="4" opacity="0.9" />
                          )}
                          {/* Label inside bar */}
                          {barW > 30 && (
                            <text x={barX + barW / 2} y={barY + barH / 2 + 3} fill={isComplete ? "#fff" : "#000"} fontSize="7" fontWeight="bold" textAnchor="middle">
                              {ep.name.length > 12 ? ep.name.slice(0, 12) + "…" : ep.name}
                            </text>
                          )}
                          {/* Milestone diamond at end */}
                          {isComplete && (
                            <polygon
                              points={`${barX + barW},${barY + barH / 2 - 5} ${barX + barW + 5},${barY + barH / 2} ${barX + barW},${barY + barH / 2 + 5} ${barX + barW - 5},${barY + barH / 2}`}
                              fill="#22c55e" opacity="0.9"
                            />
                          )}
                          {/* Story dots */}
                          {epStories.slice(0, 6).map((st, si) => {
                            const dotColor = st.status === "Done" ? "#22c55e" : st.status === "In Progress" ? "#FFE600" : st.status === "Review" ? "#a78bfa" : "#333";
                            return (
                              <circle key={st.id} cx={barX + (si + 0.5) * (barW / Math.max(epStories.length, 1))} cy={barY + barH + 5}
                                r="2.5" fill={dotColor} opacity="0.8" />
                            );
                          })}
                        </g>
                      );
                    })}

                    {/* Current week vertical indicator */}
                    <line
                      x1={LABEL_W + (selectedWeek - 0.5) * COL_W} y1={SPRINT_H}
                      x2={LABEL_W + (selectedWeek - 0.5) * COL_W} y2={svgH - 12}
                      stroke="#FFE600" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.6"
                    />
                    <text x={LABEL_W + (selectedWeek - 0.5) * COL_W} y={svgH - 3} fill="#FFE600" fontSize="7" textAnchor="middle" fontWeight="bold">NOW</text>

                    {/* Planned end line */}
                    {plannedWeeks <= displayWeeks && (
                      <>
                        <line
                          x1={LABEL_W + plannedWeeks * COL_W} y1={SPRINT_H}
                          x2={LABEL_W + plannedWeeks * COL_W} y2={svgH - 12}
                          stroke="#6b6b6b" strokeWidth="1" strokeDasharray="2,3"
                        />
                        <text x={LABEL_W + plannedWeeks * COL_W - 2} y={svgH - 3} fill="#555" fontSize="7" textAnchor="end">Planned end</text>
                      </>
                    )}

                    {/* Empty state for no epics */}
                    {projectEpics.length === 0 && (
                      <text x={LABEL_W + (displayWeeks * COL_W) / 2} y={SPRINT_H + WEEK_H + 30} fill="#333" fontSize="9" textAnchor="middle">
                        No epics yet — run AI Generator to populate timeline
                      </text>
                    )}
                  </svg>
                </div>
              );
            } catch(e) {
              return <div className="bg-red-950/20 border border-red-800/30 rounded-lg p-4 text-red-400 text-xs">Timeline error: {e.message}</div>;
            }
            })()}

            {/* Summary row below timeline */}
            {hasWeeklyData && (
              <div className="flex items-center gap-6 pt-2 border-t border-white/6 text-[10px] text-slate-600">
                <span>Weeks simulated: <span className="text-white font-mono">{project.weeklyLogs.length}</span></span>
                <span>Planned duration: <span className="text-white font-mono">{Math.ceil((project.plannedDays || 90) / 7)} weeks</span></span>
                <span>Avg velocity: <span className="text-sky-400 font-mono">{Math.round(avgWeeklyVelocity)} pts/wk</span></span>
                {predictedDelayWeeks > 0 && <span className="text-red-400 font-medium">⚠ ~{predictedDelayWeeks}wk projected overrun</span>}
                {predictedDelayWeeks === 0 && weeksToFinish != null && <span className="text-green-400 font-medium">✓ On track — ~{weeksToFinish} weeks to complete</span>}
              </div>
            )}
          </div>
        </div>
        </TabErrorBoundary>
      )}

      {/* Risks heatmap & list */}
      {subTab === "risks" && (
        <TabErrorBoundary>
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
                    try {
                      const c = getRiskScore(r);
                      return c.x === riskFilter.x && c.y === riskFilter.y;
                    } catch { return false; }
                  })
                  .map(risk => (
                    <div key={risk.id} className="bg-black/35 border border-white/5 p-3 rounded-xl space-y-2">
                      {editingRiskId === risk.id ? (
                        <div className="space-y-2">
                          <input defaultValue={risk.title} id={`risk-title-${risk.id}`}
                            className="w-full bg-black border border-[#FFE600]/40 rounded px-2 py-1 text-xs text-white" />
                          <div className="flex gap-2">
                            <select defaultValue={risk.severity} id={`risk-sev-${risk.id}`}
                              className="bg-black border border-white/20 rounded px-2 py-1 text-xs text-white flex-1">
                              {["Low","Medium","High","Critical"].map(s => <option key={s}>{s}</option>)}
                            </select>
                            <input type="number" defaultValue={risk.probability} id={`risk-prob-${risk.id}`}
                              min="0" max="100" className="bg-black border border-white/20 rounded px-2 py-1 text-xs text-white w-20" placeholder="Prob %" />
                          </div>
                          <textarea defaultValue={risk.mitigationPlan} id={`risk-mit-${risk.id}`}
                            rows={2} className="w-full bg-black border border-white/20 rounded px-2 py-1 text-xs text-white resize-none" />
                          <div className="flex gap-2">
                            <button onClick={() => {
                              const newTitle = document.getElementById(`risk-title-${risk.id}`).value;
                              const newSev = document.getElementById(`risk-sev-${risk.id}`).value;
                              const newProb = document.getElementById(`risk-prob-${risk.id}`).value;
                              const newMit = document.getElementById(`risk-mit-${risk.id}`).value;
                              setRisks(prev => prev.map(r => r.id !== risk.id ? r : {
                                ...r, title: newTitle, severity: newSev,
                                probability: Number(newProb), mitigationPlan: newMit,
                                _originalTitle: r._originalTitle || r.title,
                                _originalSeverity: r._originalSeverity || r.severity,
                                _corrected: true
                              }));
                              logOverride(`Risk: ${risk.title}`, "severity/mitigation", `${risk.severity} / ${risk.mitigationPlan}`, `${newSev} / ${newMit}`);
                              setEditingRiskId(null);
                              addNotification(`Risk "${newTitle}" manually updated.`, "system");
                            }} className="px-3 py-1 bg-[#FFE600] text-black text-xs font-bold rounded-lg">Save</button>
                            <button onClick={() => setEditingRiskId(null)} className="px-3 py-1 bg-white/10 text-white text-xs rounded-lg">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <strong className="text-white text-xs">{risk.title}</strong>
                              {risk._corrected && <span className="ml-2 text-[9px] text-[#FFE600] border border-[#FFE600]/30 px-1 rounded">Corrected</span>}
                              {risk._originalTitle && risk._originalTitle !== risk.title && (
                                <div className="text-[9px] text-slate-600 mt-0.5">Original: {risk._originalTitle} ({risk._originalSeverity})</div>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <RiskBadge severity={risk.severity} />
                              <button onClick={() => setEditingRiskId(risk.id)}
                                className="text-[9px] text-slate-500 hover:text-[#FFE600] border border-white/10 hover:border-[#FFE600]/30 px-1.5 py-0.5 rounded transition-all">
                                ✎
                              </button>
                            </div>
                          </div>
                          <p className="text-[11px] text-slate-400">Mitigation: {risk.mitigationPlan}</p>
                          {risk.encounteredWeek && (
                            <span className="text-[9px] font-mono text-[#FFE600]">Encountered in Week {risk.encounteredWeek}</span>
                          )}
                        </>
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
        </TabErrorBoundary>
      )}

      {/* Audit Log tab */}
      {subTab === "audit" && (
        <div className="bg-[#2E2E2E]/20 border border-white/5 rounded-2xl p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-white text-xs font-bold uppercase tracking-widest">Manual Override Audit Log</h4>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500">{aiOverrideLog.length} entries</span>
              {aiOverrideLog.length > 0 && !showClearAudit && (
                <button onClick={() => { setShowClearAudit(true); setClearAuditPassword(""); setClearAuditError(""); }}
                  className="text-[10px] text-red-400 font-bold border border-red-900/30 hover:border-red-400 px-2 py-1 rounded bg-black transition-all">
                  🗑 Clear Log
                </button>
              )}
            </div>
          </div>
          {showClearAudit && (
            <div className="bg-red-950/20 border border-red-800/30 rounded-xl p-4 space-y-3">
              <p className="text-red-400 text-xs font-bold">Enter password to permanently clear all audit entries for this project:</p>
              <div className="flex items-center gap-2">
                <input type="password" value={clearAuditPassword} autoFocus
                  onChange={e => { setClearAuditPassword(e.target.value); setClearAuditError(""); }}
                  onKeyDown={e => {
                    if (e.key !== "Enter") return;
                    if (clearAuditPassword === "password") { setAiOverrideLog(prev => prev.filter(en => en.projectId !== project.id)); setShowClearAudit(false); setClearAuditPassword(""); setClearAuditError(""); }
                    else setClearAuditError("Incorrect password.");
                  }}
                  placeholder="Enter password..."
                  className="bg-black border border-red-800/40 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 w-48"
                />
                <button onClick={() => {
                  if (clearAuditPassword === "password") { setAiOverrideLog(prev => prev.filter(en => en.projectId !== project.id)); setShowClearAudit(false); setClearAuditPassword(""); setClearAuditError(""); }
                  else setClearAuditError("Incorrect password.");
                }} className="px-3 py-1.5 bg-red-700 hover:bg-red-600 text-white text-xs font-bold rounded-lg transition-all">Confirm</button>
                <button onClick={() => { setShowClearAudit(false); setClearAuditPassword(""); setClearAuditError(""); }}
                  className="px-3 py-1.5 bg-white/10 text-white text-xs rounded-lg hover:bg-white/20 transition-all">Cancel</button>
              </div>
              {clearAuditError && <p className="text-red-400 text-[11px] font-semibold">{clearAuditError}</p>}
            </div>
          )}
          {aiOverrideLog.length === 0 ? (
            <p className="text-slate-500 text-xs text-center py-8">No manual overrides recorded yet. Any edits to AI-generated values will appear here.</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {aiOverrideLog.map(entry => (
                <div key={entry.id} className="bg-black/40 border border-white/5 rounded-xl p-3 space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-[#FFE600] text-[10px] font-bold">{entry.entity}</span>
                    <span className="text-slate-600 text-[9px] font-mono">{new Date(entry.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">Field: <span className="text-white">{entry.field}</span></div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="bg-red-950/20 border border-red-800/20 rounded px-2 py-1">
                      <span className="text-red-400 font-bold block text-[9px]">ORIGINAL (AI)</span>
                      <span className="text-slate-300 break-all">{entry.oldVal}</span>
                    </div>
                    <div className="bg-green-950/20 border border-green-800/20 rounded px-2 py-1">
                      <span className="text-green-400 font-bold block text-[9px]">CORRECTED (Manual)</span>
                      <span className="text-slate-300 break-all">{entry.newVal}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-28 shrink-0">Groq API Key:</span>
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); if (e.target.value) localStorage.setItem("prismpm.groqApiKey", e.target.value); }}
                placeholder="Paste Groq key (primary)..."
                className="flex-1 bg-black border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#FFE600]"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 w-28 shrink-0">
                Mistral Key:
                <span className="text-[9px] text-slate-600 block">fallback</span>
              </span>
              <input
                type="password"
                defaultValue={localStorage.getItem("prismpm.mistralApiKey") || ""}
                onChange={e => { if (e.target.value) localStorage.setItem("prismpm.mistralApiKey", e.target.value); else localStorage.removeItem("prismpm.mistralApiKey"); }}
                placeholder="Paste Mistral key (optional fallback)..."
                className="flex-1 bg-black border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#FFE600]/50 placeholder-slate-700"
              />
            </div>
            <p className="text-[9px] text-slate-600 pl-1">If Groq hits rate limits, PrismPM automatically retries using Mistral.</p>
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

      {/* ── Simulation Review Modal (Human-in-the-Loop) ── */}
      {showSimReview && pendingSimResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-[#FFE600]/30 rounded-2xl w-full max-w-xl shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center px-6 py-4 border-b border-white/10">
              <div>
                <h3 className="text-white font-bold text-sm">Review AI Simulation — Week {pendingSimResult.week}</h3>
                <p className="text-slate-500 text-[10px] mt-0.5">Review and edit before accepting. Changes are logged in the Audit Log.</p>
              </div>
              <span className="text-[9px] text-[#FFE600] border border-[#FFE600]/30 px-2 py-1 rounded font-bold">HUMAN REVIEW</span>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Points Done (cumulative)", key: "donePoints" },
                  { label: "Points Remaining", key: "remainingPoints" },
                  { label: "Delay Days", key: "delayDays" },
                ].map(({ label, key }) => (
                  <div key={key} className="bg-black/40 border border-white/10 rounded-xl p-3">
                    <label className="text-[9px] text-slate-500 uppercase block mb-1">{label}</label>
                    <input type="number" value={pendingSimResult[key]}
                      onChange={e => { const old = pendingSimResult[key]; const val = Number(e.target.value); logOverride(`Week ${pendingSimResult.week} Simulation`, key, old, val, "human-review"); setPendingSimResult(p => ({ ...p, [key]: val })); }}
                      className="w-full bg-transparent text-white font-mono text-lg font-bold focus:outline-none border-b border-white/10 focus:border-[#FFE600]"
                    />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[{ label: "Velocity Target", key: "velocityTarget" }, { label: "Velocity Actual", key: "velocityActual" }].map(({ label, key }) => (
                  <div key={key} className="bg-black/40 border border-white/10 rounded-xl p-3">
                    <label className="text-[9px] text-slate-500 uppercase block mb-1">{label}</label>
                    <input type="number" value={pendingSimResult[key]}
                      onChange={e => { logOverride(`Week ${pendingSimResult.week}`, key, pendingSimResult[key], Number(e.target.value), "human-review"); setPendingSimResult(p => ({ ...p, [key]: Number(e.target.value) })); }}
                      className="w-full bg-transparent text-white font-mono text-lg font-bold focus:outline-none border-b border-white/10 focus:border-[#FFE600]"
                    />
                  </div>
                ))}
              </div>
              <div className="space-y-1">
                <label className="text-[9px] text-slate-500 uppercase">Week Summary</label>
                <textarea value={pendingSimResult.weekSummary}
                  onChange={e => { logOverride(`Week ${pendingSimResult.week}`, "weekSummary", pendingSimResult.weekSummary, e.target.value, "human-review"); setPendingSimResult(p => ({ ...p, weekSummary: e.target.value })); }}
                  rows={3} className="w-full bg-black border border-white/15 rounded-xl px-3 py-2 text-xs text-white resize-none focus:outline-none focus:border-[#FFE600]"
                />
              </div>
              {pendingSimResult.storyUpdates?.length > 0 && (
                <div className="space-y-1">
                  <label className="text-[9px] text-slate-500 uppercase">Story Status Updates</label>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {pendingSimResult.storyUpdates.map((su, i) => (
                      <div key={i} className="flex justify-between items-center bg-black/30 border border-white/5 rounded-lg px-3 py-2">
                        <span className="text-xs text-white truncate flex-1 mr-2">{su.title}</span>
                        <select value={su.status}
                          onChange={e => { const ns = e.target.value; logOverride(`Story: ${su.title}`, "status", su.status, ns, "human-review"); setPendingSimResult(p => ({ ...p, storyUpdates: p.storyUpdates.map((s, j) => j === i ? { ...s, status: ns } : s) })); }}
                          className="bg-[#2E2E2E] border border-white/10 text-white text-[10px] rounded px-2 py-1">
                          <option>Backlog</option><option>To Do</option><option>In Progress</option><option>Review</option><option>Done</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => applySimResult(pendingSimResult)}
                className="flex-1 py-2.5 bg-[#FFE600] text-black font-bold text-xs uppercase rounded-xl hover:bg-white transition-all">
                ✓ Accept & Apply Week {pendingSimResult.week}
              </button>
              <button onClick={() => { setPendingSimResult(null); setShowSimReview(false); }}
                className="px-5 py-2.5 bg-white/10 text-white text-xs font-bold rounded-xl hover:bg-white/20 transition-all">
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
