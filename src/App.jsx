import { useState, useEffect, useRef } from "react";

const EY = {
  yellow: "#FFE600",
  black: "#000000",
  white: "#FFFFFF",
  darkGray: "#2E2E2E",
  lightGray: "#E5E5E5",
};

// ─── Groq API helper ───────────────────────────────────────────────────────
const GROQ_MODELS = ["llama-3.1-8b-instant", "llama-3.1-70b-versatile"];

async function callGroq(prompt, systemPrompt = "", apiKey = "") {
  const key = apiKey || localStorage.getItem("prismpm.groqApiKey") || import.meta.env.VITE_GROQ_API_KEY || "";
  if (!key) {
    throw new Error("Groq API key is missing. Add it in the BRD Generator panel.");
  }

  let lastError = null;

  for (const model of GROQ_MODELS) {
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
          max_tokens: 1000,
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
  }

  throw lastError || new Error("Groq request failed.");
}

// ─── Seed Data ──────────────────────────────────────────────────────────────
const INITIAL_PROJECTS = [
  {
    id: 1, name: "FinanceFlow Overhaul", client: "NexaBank Ltd", clientStars: 5,
    pm: "Sarah Chen", ba: "Marcus Webb", type: "Enterprise Banking",
    status: "At Risk", progress: 62, plannedDays: 120, elapsed: 95,
    description: "Core banking system modernisation with API-first architecture.",
    risks: [
      { id: 1, title: "Regulatory compliance gap", severity: "Critical", impact: "Timeline +3 weeks", probability: 80, category: "Compliance" },
      { id: 2, title: "Legacy API deprecation", severity: "High", impact: "Rework 40% of integrations", probability: 65, category: "Technical" },
      { id: 3, title: "Key dev leaving Q3", severity: "Medium", impact: "Knowledge transfer needed", probability: 45, category: "Resource" },
    ],
    tasks: [
      { id: 1, name: "Requirements sign-off", status: "Done", due: "2025-02-10", assignee: "Marcus Webb" },
      { id: 2, name: "API architecture design", status: "Done", due: "2025-03-01", assignee: "Dev Team" },
      { id: 3, name: "Core module development", status: "In Progress", due: "2025-05-15", assignee: "Dev Team" },
      { id: 4, name: "UAT preparation", status: "Delayed", due: "2025-05-01", assignee: "QA Team" },
      { id: 5, name: "Regulatory review", status: "Blocked", due: "2025-04-20", assignee: "Compliance" },
    ],
    team: [
      { name: "Sarah Chen", role: "PM", skillStars: 5, specialty: "Fintech" },
      { name: "Marcus Webb", role: "BA", skillStars: 4, specialty: "Banking" },
      { name: "Dev Patel", role: "Lead Dev", skillStars: 5, specialty: "APIs" },
      { name: "Aisha Omar", role: "QA", skillStars: 3, specialty: "Manual Testing" },
      { name: "Luca Rossi", role: "Architect", skillStars: 4, specialty: "Cloud" },
    ],
    compatibilityScore: 82,
    budget: 280000, spent: 195000,
  },
  {
    id: 2, name: "RetailPulse Mobile", client: "Zephyr Retail Group", clientStars: 3,
    pm: "James Okonkwo", ba: "Priya Sharma", type: "Mobile App",
    status: "On Track", progress: 38, plannedDays: 90, elapsed: 34,
    description: "Customer-facing loyalty & shopping mobile app for iOS and Android.",
    risks: [
      { id: 1, title: "App store review delays", severity: "Medium", impact: "Launch pushed 2 weeks", probability: 55, category: "External" },
      { id: 2, title: "Push notification scope creep", severity: "Low", impact: "Extra 5 dev days", probability: 30, category: "Scope" },
    ],
    tasks: [
      { id: 1, name: "UI/UX wireframes", status: "Done", due: "2025-03-15", assignee: "Design Team" },
      { id: 2, name: "Backend API setup", status: "In Progress", due: "2025-04-10", assignee: "Dev Team" },
      { id: 3, name: "iOS development", status: "In Progress", due: "2025-05-20", assignee: "iOS Dev" },
      { id: 4, name: "Android development", status: "Not Started", due: "2025-05-20", assignee: "Android Dev" },
      { id: 5, name: "Beta testing", status: "Not Started", due: "2025-06-01", assignee: "QA Team" },
    ],
    team: [
      { name: "James Okonkwo", role: "PM", skillStars: 4, specialty: "Mobile" },
      { name: "Priya Sharma", role: "BA", skillStars: 4, specialty: "Retail" },
      { name: "Mei Lin", role: "iOS Dev", skillStars: 5, specialty: "Swift" },
      { name: "Tunde Adeyemi", role: "Android Dev", skillStars: 3, specialty: "Kotlin" },
    ],
    compatibilityScore: 76,
    budget: 95000, spent: 28000,
  },
  {
    id: 3, name: "HealthHub Platform", client: "MedCore Solutions", clientStars: 4,
    pm: "Sarah Chen", ba: "Elena Volkov", type: "Healthcare SaaS",
    status: "Behind", progress: 20, plannedDays: 150, elapsed: 60,
    description: "Telehealth and patient management SaaS platform with HL7 FHIR compliance.",
    risks: [
      { id: 1, title: "HIPAA compliance audit", severity: "Critical", impact: "Full halt if failed", probability: 40, category: "Compliance" },
      { id: 2, title: "FHIR integration complexity", severity: "High", impact: "Timeline +4 weeks", probability: 70, category: "Technical" },
      { id: 3, title: "Client changing requirements", severity: "High", impact: "Scope unstable", probability: 75, category: "Scope" },
      { id: 4, title: "No dedicated security resource", severity: "Medium", impact: "Risk exposure", probability: 60, category: "Resource" },
    ],
    tasks: [
      { id: 1, name: "HIPAA compliance framework", status: "In Progress", due: "2025-04-30", assignee: "Security" },
      { id: 2, name: "Patient portal design", status: "In Progress", due: "2025-04-15", assignee: "Design" },
      { id: 3, name: "FHIR API integration", status: "Not Started", due: "2025-06-01", assignee: "Dev Team" },
      { id: 4, name: "Telehealth video module", status: "Not Started", due: "2025-07-15", assignee: "Dev Team" },
      { id: 5, name: "Clinical UAT", status: "Not Started", due: "2025-08-01", assignee: "MedCore Team" },
    ],
    team: [
      { name: "Sarah Chen", role: "PM", skillStars: 5, specialty: "Healthcare IT" },
      { name: "Elena Volkov", role: "BA", skillStars: 5, specialty: "HL7/FHIR" },
      { name: "Raj Mehta", role: "Lead Dev", skillStars: 4, specialty: "Healthcare APIs" },
      { name: "Aisha Omar", role: "QA", skillStars: 3, specialty: "Healthcare" },
      { name: "Carlos Herrera", role: "Security", skillStars: 3, specialty: "Compliance" },
    ],
    compatibilityScore: 68,
    budget: 420000, spent: 71000,
  },
];

const INITIAL_TEAM_MEMBERS = [
  { name: "Sarah Chen", role: "PM", skillStars: 5, specialty: "Fintech / Healthcare IT", projects: 2, available: false },
  { name: "James Okonkwo", role: "PM", skillStars: 4, specialty: "Mobile / Consumer Apps", projects: 1, available: true },
  { name: "Maya Singh", role: "PM", skillStars: 5, specialty: "ERP / Operations", projects: 3, available: true },
  { name: "Omar Khalid", role: "PM", skillStars: 4, specialty: "Cloud / Data Delivery", projects: 2, available: true },
  { name: "Nadia Rahman", role: "PM", skillStars: 5, specialty: "Transformation / PMO", projects: 2, available: true },
  { name: "Ethan Brooks", role: "PM", skillStars: 4, specialty: "Delivery / Client Success", projects: 1, available: true },
  { name: "Fatima Noor", role: "PM", skillStars: 5, specialty: "Healthcare / Regulatory", projects: 3, available: false },
  { name: "Marcus Webb", role: "BA", skillStars: 4, specialty: "Banking / ERP", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Priya Sharma", role: "BA", skillStars: 4, specialty: "Retail / eCommerce", projects: 1, available: true, assignedPm: "James Okonkwo" },
  { name: "Elena Volkov", role: "BA", skillStars: 5, specialty: "Healthcare / HL7", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Farah Ali", role: "BA", skillStars: 5, specialty: "Operations / Process Mapping", projects: 2, available: true, assignedPm: "Maya Singh" },
  { name: "Daniel Kim", role: "BA", skillStars: 4, specialty: "Finance / Process Analysis", projects: 2, available: true, assignedPm: "Omar Khalid" },
  { name: "Sofia Mendes", role: "BA", skillStars: 5, specialty: "Change / Stakeholder Management", projects: 1, available: true, assignedPm: "Nadia Rahman" },
  { name: "Owen Price", role: "BA", skillStars: 4, specialty: "Data / Requirements", projects: 3, available: false, assignedPm: "Ethan Brooks" },
  { name: "Dev Patel", role: "Lead Dev", skillStars: 5, specialty: "APIs / Cloud", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Raj Mehta", role: "Lead Dev", skillStars: 4, specialty: "Healthcare APIs", projects: 1, available: false, assignedPm: "Sarah Chen" },
  { name: "Lina Hassan", role: "Lead Dev", skillStars: 5, specialty: "Platform / Integration", projects: 2, available: true, assignedPm: "Maya Singh" },
  { name: "Chris Nolan", role: "Lead Dev", skillStars: 4, specialty: "Cloud Native / DevOps", projects: 1, available: true, assignedPm: "Omar Khalid" },
  { name: "Aarav Patel", role: "Lead Dev", skillStars: 5, specialty: "Microservices / Architecture", projects: 3, available: false, assignedPm: "Fatima Noor" },
  { name: "Mei Lin", role: "iOS Dev", skillStars: 5, specialty: "Swift / iOS", projects: 1, available: false, assignedPm: "James Okonkwo" },
  { name: "Grace Turner", role: "iOS Dev", skillStars: 4, specialty: "UIKit / SwiftUI", projects: 2, available: true, assignedPm: "Nadia Rahman" },
  { name: "Hiro Tanaka", role: "iOS Dev", skillStars: 5, specialty: "Mobile Performance", projects: 1, available: true, assignedPm: "Ethan Brooks" },
  { name: "Zara Khan", role: "iOS Dev", skillStars: 4, specialty: "App Store Delivery", projects: 2, available: false, assignedPm: "Fatima Noor" },
  { name: "Tunde Adeyemi", role: "Android Dev", skillStars: 3, specialty: "Kotlin", projects: 1, available: true, assignedPm: "James Okonkwo" },
  { name: "Mila Petrova", role: "Android Dev", skillStars: 4, specialty: "Jetpack Compose", projects: 2, available: true, assignedPm: "Maya Singh" },
  { name: "Noah Bennett", role: "Android Dev", skillStars: 5, specialty: "Android Architecture", projects: 1, available: false, assignedPm: "Omar Khalid" },
  { name: "Layla Ahmed", role: "Android Dev", skillStars: 4, specialty: "Kotlin Multiplatform", projects: 3, available: true, assignedPm: "Nadia Rahman" },
  { name: "Aisha Omar", role: "QA", skillStars: 3, specialty: "Manual / Healthcare", projects: 2, available: false, assignedPm: "Sarah Chen" },
  { name: "Nina Carter", role: "QA", skillStars: 4, specialty: "Automation / E2E", projects: 1, available: true, assignedPm: "Maya Singh" },
  { name: "Ben Lawson", role: "QA", skillStars: 4, specialty: "Test Strategy / UAT", projects: 2, available: true, assignedPm: "Ethan Brooks" },
  { name: "Keiko Sato", role: "QA", skillStars: 5, specialty: "Automation / Selenium", projects: 1, available: false, assignedPm: "Fatima Noor" },
  { name: "Musa Ibrahim", role: "QA", skillStars: 3, specialty: "Regression / Functional", projects: 3, available: true, assignedPm: "Nadia Rahman" },
  { name: "Luca Rossi", role: "Architect", skillStars: 4, specialty: "Cloud / AWS", projects: 1, available: true, assignedPm: "Omar Khalid" },
  { name: "Priyanka Das", role: "Architect", skillStars: 5, specialty: "Solution Design", projects: 2, available: true, assignedPm: "Sarah Chen" },
  { name: "Mateo Silva", role: "Architect", skillStars: 4, specialty: "Enterprise Architecture", projects: 1, available: false, assignedPm: "Maya Singh" },
  { name: "Olivia Hart", role: "Architect", skillStars: 5, specialty: "Security Architecture", projects: 3, available: true, assignedPm: "Fatima Noor" },
  { name: "Carlos Herrera", role: "Security", skillStars: 3, specialty: "Compliance / HIPAA", projects: 1, available: true, assignedPm: "Sarah Chen" },
  { name: "Zain Malik", role: "Security", skillStars: 4, specialty: "AppSec / Risk", projects: 1, available: false, assignedPm: "Omar Khalid" },
  { name: "Riley Evans", role: "Security", skillStars: 5, specialty: "Cloud Security / IAM", projects: 2, available: true, assignedPm: "Nadia Rahman" },
  { name: "Hana Okafor", role: "Security", skillStars: 4, specialty: "Threat Modeling", projects: 1, available: true, assignedPm: "Ethan Brooks" },
  { name: "Julian Costa", role: "Security", skillStars: 5, specialty: "AppSec / Pen Testing", projects: 3, available: false, assignedPm: "Fatima Noor" },
];

// ─── Utility helpers ────────────────────────────────────────────────────────
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
    "Done": "bg-[#E5E5E5] text-[#000000] border-[#E5E5E5]/40",
    "In Progress": "bg-[#FFE600]/20 text-[#000000] border-[#FFE600]/40",
    "Not Started": "bg-[#2E2E2E] text-[#E5E5E5] border-[#E5E5E5]/20",
    "Delayed": "bg-[#FFE600]/15 text-[#FFE600] border-[#FFE600]/30",
    "Blocked": "bg-[#000000] text-[#FFE600] border-[#FFE600]/40",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${map[status] || map["Not Started"]}`}>
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
  return <span className={`px-2 py-0.5 rounded border text-xs font-mono font-bold ${map[severity]}`}>{severity}</span>;
};

const ProgressBar = ({ value, color = "indigo", animated = false }) => {
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
  <div className="flex items-center gap-2 text-[#FFE600] text-sm">
    <div className="w-4 h-4 border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
    AI is thinking...
  </div>
);

const PM_STORAGE_KEY = "prismpm.team";

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

const formatMemberScore = (member) => `${scoreMember(member)}/100`;

// ─── Pulse Ring Component ────────────────────────────────────────────────────
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
        {progress}%
      </text>
    </svg>
  );
};

// ─── Dashboard Tab ───────────────────────────────────────────────────────────
function DashboardTab({ projects, onSelectProject }) {
  const totalBudget = projects.reduce((a, p) => a + p.budget, 0);
  const totalSpent = projects.reduce((a, p) => a + p.spent, 0);
  const criticalRisks = projects.flatMap(p => p.risks.filter(r => r.severity === "Critical"));
  const delayed = projects.flatMap(p => p.tasks.filter(t => t.status === "Delayed" || t.status === "Blocked"));

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Projects", value: projects.length, icon: "◈", color: "text-indigo-400" },
          { label: "Critical Risks", value: criticalRisks.length, icon: "⚠", color: "text-rose-400" },
          { label: "Delayed Tasks", value: delayed.length, icon: "⏱", color: "text-amber-400" },
          { label: "Budget Utilisation", value: `${Math.round((totalSpent / totalBudget) * 100)}%`, icon: "💰", color: "text-emerald-400" },
        ].map((k) => (
          <div key={k.label} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-lg ${k.color}`}>{k.icon}</span>
              <span className="text-slate-400 text-xs uppercase tracking-widest">{k.label}</span>
            </div>
            <div className={`font-mono font-bold text-2xl ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Project Cards */}
      <div>
        <h2 className="text-slate-300 font-semibold mb-3 text-sm uppercase tracking-widest">Portfolio Overview</h2>
        <div className="grid gap-4">
          {projects.map((p) => (
            <div key={p.id}
              className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/90 transition-all group"
              onClick={() => onSelectProject(p)}>
              <div className="flex items-start gap-4">
                <PulseRing progress={p.progress} status={p.status} size={72} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <h3 className="font-semibold text-white text-base group-hover:text-indigo-300 transition-colors">{p.name}</h3>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-slate-400 text-xs">{p.client}</span>
                    <span className="text-slate-600">·</span>
                    <Stars count={p.clientStars} size="sm" color="amber" />
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400 text-xs">PM: {p.pm}</span>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-slate-400">
                    <span>Day {p.elapsed}/{p.plannedDays}</span>
                    <span className={p.risks.some(r => r.severity === "Critical") ? "text-rose-400 font-medium" : ""}>
                      {p.risks.length} risk{p.risks.length !== 1 ? "s" : ""}
                      {p.risks.some(r => r.severity === "Critical") ? " ⚠ CRITICAL" : ""}
                    </span>
                    <span>Team compatibility: <span className={p.compatibilityScore >= 75 ? "text-emerald-400" : p.compatibilityScore >= 55 ? "text-amber-400" : "text-rose-400"} style={{ fontFamily: "monospace" }}>{p.compatibilityScore}%</span></span>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-slate-400 text-xs mb-1">Budget</div>
                  <div className="font-mono text-sm text-white">${(p.spent / 1000).toFixed(0)}k <span className="text-slate-500">/ ${(p.budget / 1000).toFixed(0)}k</span></div>
                  <ProgressBar value={(p.spent / p.budget) * 100} />
                </div>
              </div>
              {/* Risk mini-bar */}
              {p.risks.some(r => r.severity === "Critical" || r.severity === "High") && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 flex flex-wrap gap-2">
                  {p.risks.filter(r => r.severity === "Critical" || r.severity === "High").map(r => (
                    <span key={r.id} className={`text-xs px-2 py-0.5 rounded ${r.severity === "Critical" ? "bg-rose-500/15 text-rose-400" : "bg-orange-500/15 text-orange-400"}`}>
                      {r.severity === "Critical" ? "🔴" : "🟠"} {r.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Project Detail Tab ──────────────────────────────────────────────────────
function ProjectDetail({ project, onBack, onDeleteProject }) {
  const [aiSummary, setAiSummary] = useState(null);
  const [aiTimeline, setAiTimeline] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");

  const generateSummary = async () => {
    setLoading(true);
    try {
      const result = await callGroq(
        `Analyse this project and give an executive summary with key recommendations.
Project: ${project.name}
Client: ${project.client} (${project.clientStars}/5 star importance)
Status: ${project.status}, Progress: ${project.progress}%
Timeline: Day ${project.elapsed} of ${project.plannedDays}
Risks: ${JSON.stringify(project.risks)}
Tasks: ${JSON.stringify(project.tasks)}
Budget: $${project.spent} spent of $${project.budget}
Team compatibility: ${project.compatibilityScore}%

Return JSON: { "summary": "string (3-4 sentences)", "topRecommendations": ["string","string","string"], "healthScore": number 0-100, "immediateActions": ["string","string"] }`,
      );
      setAiSummary(result);
    } catch (e) { setAiSummary({ summary: "Could not generate summary.", topRecommendations: [], healthScore: 50, immediateActions: [] }); }
    setLoading(false);
  };

  const generateTimeline = async () => {
    setLoadingTimeline(true);
    try {
      const result = await callGroq(
        `Predict the timeline outcome for this project.
Project: ${project.name}, Status: ${project.status}
Planned: ${project.plannedDays} days, Elapsed: ${project.elapsed} days, Progress: ${project.progress}%
Delayed tasks: ${project.tasks.filter(t => t.status === "Delayed" || t.status === "Blocked").length}
Critical risks: ${project.risks.filter(r => r.severity === "Critical").length}
High risks: ${project.risks.filter(r => r.severity === "High").length}

Return JSON: { "predictedTotalDays": number, "delayDays": number, "confidence": number 0-100, "completionDate": "string", "keyDelayFactors": ["string","string"], "mitigationSuggestions": ["string","string","string"], "optimisticDays": number, "pessimisticDays": number }`,
      );
      setAiTimeline(result);
    } catch (e) { setAiTimeline(null); }
    setLoadingTimeline(false);
  };

  const sections = ["overview", "tasks", "risks", "team", "ai insights"];

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-indigo-400 text-sm transition-colors">
          ← Back to Dashboard
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Are you sure you want to delete the project "${project.name}"? This action cannot be undone.`)) {
              onDeleteProject(project.id);
            }
          }}
          className="px-3 py-1.5 bg-red-600/20 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white rounded-lg text-xs transition-colors"
        >
          🗑 Delete Project
        </button>
      </div>

      {/* Header */}
      <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-start gap-5 flex-wrap">
          <PulseRing progress={project.progress} status={project.status} size={90} />
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h2 className="text-xl font-bold text-white">{project.name}</h2>
              <StatusBadge status={project.status} />
            </div>
            <p className="text-slate-400 text-sm mb-3">{project.description}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-slate-400">Client: <span className="text-white">{project.client}</span> <Stars count={project.clientStars} size="sm" /></span>
              <span className="text-slate-400">PM: <span className="text-white">{project.pm}</span></span>
              <span className="text-slate-400">BA: <span className="text-white">{project.ba}</span></span>
              <span className="text-slate-400">Type: <span className="text-indigo-300">{project.type}</span></span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center min-w-fit">
            <div className="bg-slate-700/40 rounded-lg p-3">
              <div className="text-slate-400 text-xs mb-1">Timeline</div>
              <div className="font-mono text-sm text-white">Day {project.elapsed}<span className="text-slate-500">/{project.plannedDays}</span></div>
            </div>
            <div className="bg-slate-700/40 rounded-lg p-3">
              <div className="text-slate-400 text-xs mb-1">Budget Used</div>
              <div className="font-mono text-sm text-white">{Math.round((project.spent / project.budget) * 100)}%</div>
            </div>
            <div className="bg-slate-700/40 rounded-lg p-3">
              <div className="text-slate-400 text-xs mb-1">Team Compat.</div>
              <div className={`font-mono text-sm font-bold ${project.compatibilityScore >= 75 ? "text-emerald-400" : project.compatibilityScore >= 55 ? "text-amber-400" : "text-rose-400"}`}>{project.compatibilityScore}%</div>
            </div>
            <div className="bg-slate-700/40 rounded-lg p-3">
              <div className="text-slate-400 text-xs mb-1">Risks</div>
              <div className={`font-mono text-sm font-bold ${project.risks.some(r => r.severity === "Critical") ? "text-rose-400" : "text-amber-400"}`}>{project.risks.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section Nav */}
      <div className="flex gap-1 bg-slate-800/40 border border-slate-700/40 p-1 rounded-xl overflow-x-auto">
        {sections.map(s => (
          <button key={s} onClick={() => setActiveSection(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize whitespace-nowrap transition-all ${activeSection === s ? "bg-indigo-600 text-white shadow" : "text-slate-400 hover:text-white"}`}>
            {s}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {activeSection === "overview" && (
        <div className="space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-slate-300 text-sm font-semibold mb-4 uppercase tracking-widest">Task Summary</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {["Done", "In Progress", "Not Started", "Delayed", "Blocked"].map(s => {
                const count = project.tasks.filter(t => t.status === s).length;
                return (
                  <div key={s} className="text-center">
                    <div className={`font-mono font-bold text-xl ${s === "Blocked" ? "text-rose-400" : s === "Delayed" ? "text-amber-400" : s === "Done" ? "text-emerald-400" : s === "In Progress" ? "text-indigo-400" : "text-slate-400"}`}>{count}</div>
                    <div className="text-slate-500 text-xs">{s}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Budget bar */}
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5">
            <h3 className="text-slate-300 text-sm font-semibold mb-3 uppercase tracking-widest">Budget Health</h3>
            <div className="flex justify-between text-sm text-slate-400 mb-2">
              <span>Spent: <span className="text-white font-mono">${project.spent.toLocaleString()}</span></span>
              <span>Total: <span className="text-white font-mono">${project.budget.toLocaleString()}</span></span>
            </div>
            <ProgressBar value={(project.spent / project.budget) * 100} />
            <div className="mt-2 text-xs text-slate-500">
              Remaining: ${(project.budget - project.spent).toLocaleString()} · {Math.round(((project.budget - project.spent) / project.budget) * 100)}% of budget
            </div>
          </div>
        </div>
      )}

      {/* TASKS */}
      {activeSection === "tasks" && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-700/50">
            <h3 className="text-slate-300 text-sm font-semibold uppercase tracking-widest">Task Tracker</h3>
          </div>
          <div className="divide-y divide-slate-700/30">
            {project.tasks.map(task => (
              <div key={task.id} className={`flex items-center gap-4 p-4 hover:bg-slate-700/20 transition-colors ${(task.status === "Delayed" || task.status === "Blocked") ? "bg-rose-500/5" : ""}`}>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-white text-sm font-medium">{task.name}</span>
                    {(task.status === "Delayed" || task.status === "Blocked") && (
                      <span className="text-rose-400 text-xs font-bold animate-pulse">⚠ TIMELINE RISK</span>
                    )}
                  </div>
                  <div className="text-slate-500 text-xs">Assignee: {task.assignee} · Due: {task.due}</div>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RISKS */}
      {activeSection === "risks" && (
        <div className="space-y-3">
          {project.risks.sort((a, b) => {
            const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
            return order[a.severity] - order[b.severity];
          }).map(risk => (
            <div key={risk.id}
              className={`bg-slate-800/60 border rounded-xl p-4 ${risk.severity === "Critical" ? "border-rose-500/40 bg-rose-500/5" : risk.severity === "High" ? "border-orange-500/30" : "border-slate-700/50"}`}>
              <div className="flex items-start gap-3">
                <div className="text-2xl">{risk.severity === "Critical" ? "🔴" : risk.severity === "High" ? "🟠" : risk.severity === "Medium" ? "🟡" : "🔵"}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-white font-semibold text-sm">{risk.title}</span>
                    <RiskBadge severity={risk.severity} />
                    <span className="text-slate-500 text-xs border border-slate-600 px-2 py-0.5 rounded">{risk.category}</span>
                  </div>
                  <div className="text-slate-400 text-sm mb-2">
                    Impact: <span className={risk.severity === "Critical" ? "text-rose-300" : "text-amber-300"}>{risk.impact}</span>
                  </div>
                  {risk.severity === "Critical" || risk.severity === "High" ? (
                    <div className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-2 py-1 inline-block">
                      ⚠ THIS RISK MAY AFFECT PROJECT COMPLETION TIMELINE
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-slate-500 text-xs">Probability:</span>
                    <div className="flex-1 max-w-32 bg-slate-700/50 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full ${risk.probability >= 60 ? "bg-rose-500" : risk.probability >= 40 ? "bg-amber-500" : "bg-blue-500"}`}
                        style={{ width: `${risk.probability}%` }} />
                    </div>
                    <span className="font-mono text-xs text-slate-400">{risk.probability}%</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TEAM */}
      {activeSection === "team" && (
        <div className="space-y-4">
          <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 text-sm font-semibold uppercase tracking-widest">Team Compatibility Score</h3>
              <div className={`font-mono font-bold text-2xl ${project.compatibilityScore >= 75 ? "text-emerald-400" : project.compatibilityScore >= 55 ? "text-amber-400" : "text-rose-400"}`}>
                {project.compatibilityScore}%
              </div>
            </div>
            <ProgressBar value={project.compatibilityScore} />
            <p className="text-slate-500 text-xs mt-2">
              {project.compatibilityScore >= 75 ? "Strong team alignment. Skillsets complement project requirements well." :
                project.compatibilityScore >= 55 ? "Moderate compatibility. Some skill gaps identified — consider upskilling or adding resources." :
                  "Low compatibility score. Risk of delivery issues due to skill/role misalignment."}
            </p>
          </div>
          <div className="grid gap-3">
            {project.team.map((member, i) => (
              <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm">
                  {member.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium text-sm">{member.name}</div>
                  <div className="text-slate-400 text-xs">{member.role} · {member.specialty}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-400 text-xs mb-0.5">Skill Rating</div>
                  <Stars count={member.skillStars} size="sm" color="indigo" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI INSIGHTS */}
      {activeSection === "ai insights" && (
        <div className="space-y-4">
          {/* AI Summary */}
          <div className="bg-slate-800/60 border border-indigo-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
                <span className="text-indigo-400">✦</span> AI Project Summary
              </h3>
              {!aiSummary && !loading && (
                <button onClick={generateSummary}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs rounded-lg transition-colors">
                  Generate
                </button>
              )}
            </div>
            {loading && <Spinner />}
            {aiSummary && (
              <div className="space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-slate-400 text-xs">Health Score:</span>
                  <span className={`font-mono font-bold text-lg ${aiSummary.healthScore >= 70 ? "text-emerald-400" : aiSummary.healthScore >= 50 ? "text-amber-400" : "text-rose-400"}`}>{aiSummary.healthScore}/100</span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{aiSummary.summary}</p>
                {aiSummary.immediateActions?.length > 0 && (
                  <div>
                    <div className="text-rose-400 text-xs font-bold uppercase mb-2">Immediate Actions Required</div>
                    <ul className="space-y-1">
                      {aiSummary.immediateActions.map((a, i) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-rose-400 mt-0.5">→</span>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiSummary.topRecommendations?.length > 0 && (
                  <div>
                    <div className="text-indigo-400 text-xs font-bold uppercase mb-2">Recommendations</div>
                    <ul className="space-y-1">
                      {aiSummary.topRecommendations.map((r, i) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-indigo-400 mt-0.5">✦</span>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Timeline Prediction */}
          <div className="bg-slate-800/60 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-300 text-sm font-semibold uppercase tracking-widest flex items-center gap-2">
                <span className="text-amber-400">⏱</span> AI Timeline Prediction
              </h3>
              {!aiTimeline && !loadingTimeline && (
                <button onClick={generateTimeline}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs rounded-lg transition-colors">
                  Predict
                </button>
              )}
            </div>
            {loadingTimeline && <Spinner />}
            {aiTimeline && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-slate-700/40 rounded-lg p-3">
                    <div className="text-slate-400 text-xs mb-1">Planned</div>
                    <div className="font-mono font-bold text-white text-lg">{project.plannedDays}d</div>
                  </div>
                  <div className="bg-slate-700/40 rounded-lg p-3">
                    <div className="text-slate-400 text-xs mb-1">Predicted</div>
                    <div className={`font-mono font-bold text-lg ${aiTimeline.delayDays > 0 ? "text-rose-400" : "text-emerald-400"}`}>{aiTimeline.predictedTotalDays}d</div>
                  </div>
                  <div className="bg-slate-700/40 rounded-lg p-3">
                    <div className="text-slate-400 text-xs mb-1">Delay</div>
                    <div className={`font-mono font-bold text-lg ${aiTimeline.delayDays > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                      {aiTimeline.delayDays > 0 ? `+${aiTimeline.delayDays}d` : "On time"}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Optimistic: <span className="font-mono text-emerald-400">{aiTimeline.optimisticDays}d</span></span>
                  <span>Confidence: <span className="font-mono text-indigo-400">{aiTimeline.confidence}%</span></span>
                  <span>Pessimistic: <span className="font-mono text-rose-400">{aiTimeline.pessimisticDays}d</span></span>
                </div>
                <div className="text-xs text-slate-400">Predicted completion: <span className="text-white">{aiTimeline.completionDate}</span></div>
                {aiTimeline.keyDelayFactors?.length > 0 && (
                  <div>
                    <div className="text-amber-400 text-xs font-bold uppercase mb-2">Key Delay Factors</div>
                    <ul className="space-y-1">
                      {aiTimeline.keyDelayFactors.map((f, i) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-amber-400">⚠</span>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {aiTimeline.mitigationSuggestions?.length > 0 && (
                  <div>
                    <div className="text-emerald-400 text-xs font-bold uppercase mb-2">Mitigation Suggestions</div>
                    <ul className="space-y-1">
                      {aiTimeline.mitigationSuggestions.map((s, i) => (
                        <li key={i} className="text-sm text-slate-300 flex gap-2"><span className="text-emerald-400">✓</span>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Team Tab ────────────────────────────────────────────────────────────────
function ProjectCreateForm({ projectManagers, businessAnalysts, onSubmit }) {
  const [form, setForm] = useState({
    name: "",
    client: "",
    pmName: projectManagers[0]?.name || "",
    baName: businessAnalysts[0]?.name || "",
    type: "Enterprise Software",
    status: "On Track",
    plannedDays: 90,
    budget: 150000,
    description: "",
    clientStars: 3,
  });

  const updateField = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.client.trim() || !form.pmName) return;

    const pmMember = projectManagers.find(m => m.name === form.pmName);
    const baMember = businessAnalysts.find(m => m.name === form.baName);

    const initialTeam = [];
    if (pmMember) {
      initialTeam.push({
        name: pmMember.name,
        role: "PM",
        skillStars: pmMember.skillStars,
        specialty: pmMember.specialty,
      });
    }
    if (baMember && form.baName) {
      initialTeam.push({
        name: baMember.name,
        role: "BA",
        skillStars: baMember.skillStars,
        specialty: baMember.specialty,
      });
    }

    const newProject = {
      id: Date.now(),
      name: form.name.trim(),
      client: form.client.trim(),
      clientStars: Math.max(1, Math.min(5, Number(form.clientStars) || 3)),
      pm: form.pmName,
      ba: form.baName || "TBD",
      type: form.type.trim(),
      status: form.status,
      progress: 0,
      plannedDays: Math.max(1, Number(form.plannedDays) || 60),
      elapsed: 0,
      description: form.description.trim() || "New project created in the team panel.",
      risks: [],
      tasks: [],
      team: initialTeam,
      compatibilityScore: 100,
      budget: Math.max(0, Number(form.budget) || 100000),
      spent: 0,
    };

    onSubmit(newProject);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Project name</div>
          <input value={form.name} onChange={e => updateField("name", e.target.value)} placeholder="Example: FinanceFlow Overhaul" className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600]" required />
        </div>
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Client company</div>
          <input value={form.client} onChange={e => updateField("client", e.target.value)} placeholder="Example: NexaBank Ltd" className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600]" required />
        </div>
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Project manager</div>
          <select value={form.pmName} onChange={e => updateField("pmName", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]" required>
            <option value="" disabled>Select PM</option>
            {projectManagers.map(pm => (
              <option key={pm.name} value={pm.name}>{pm.name} ({pm.specialty})</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Business analyst</div>
          <select value={form.baName} onChange={e => updateField("baName", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]">
            <option value="">No BA Assigned</option>
            {businessAnalysts.map(ba => (
              <option key={ba.name} value={ba.name}>{ba.name} ({ba.specialty})</option>
            ))}
          </select>
        </div>
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Project type</div>
          <input value={form.type} onChange={e => updateField("type", e.target.value)} placeholder="Example: Mobile App" className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600]" />
        </div>
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Status</div>
          <select value={form.status} onChange={e => updateField("status", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]">
            <option>On Track</option>
            <option>At Risk</option>
            <option>Behind</option>
          </select>
        </div>
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Client priority (1-5)</div>
          <input type="number" min="1" max="5" value={form.clientStars} onChange={e => updateField("clientStars", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]" />
        </div>
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Total budget ($)</div>
          <input type="number" min="0" value={form.budget} onChange={e => updateField("budget", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]" />
        </div>
        <div>
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Planned duration (days)</div>
          <input type="number" min="1" value={form.plannedDays} onChange={e => updateField("plannedDays", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]" />
        </div>
      </div>
      <div>
        <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Short description</div>
        <textarea value={form.description} onChange={e => updateField("description", e.target.value)} rows={2} placeholder="Brief summary of project scope..." className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600] resize-none" />
      </div>
      <button type="submit" className="w-full py-2.5 bg-[#FFE600] hover:bg-[#FFFFFF] text-[#000000] font-semibold rounded-lg transition-colors text-sm">
        Create Project & Start Allocating
      </button>
    </form>
  );
}

function ProjectAllocationManager({ project, roster, onAddMemberToProject, onDropMemberFromProject, onDeleteProject }) {
  const pmObj = roster.find(e => e.role === "PM" && e.name === project.pm) || { name: project.pm, specialty: "" };
  const assignedTeam = project.team || [];
  const unassignedEmployees = roster.filter(emp => 
    !assignedTeam.some(m => m.name === emp.name && m.role === emp.role)
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  const roles = ["All", "BA", "Lead Dev", "iOS Dev", "Android Dev", "QA", "Architect", "Security"];

  const filteredRoster = unassignedEmployees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          emp.specialty.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "All" || emp.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-4">
      <div className="bg-[#000000] border border-[#E5E5E5]/10 rounded-xl p-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <div className="text-white font-semibold text-sm">{project.name}</div>
          <div className="text-[#E5E5E5] text-xs">PM: {project.pm} · BA: {project.ba}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[#E5E5E5] text-xs">Current Compatibility</div>
            <div className="font-mono text-lg font-bold text-[#FFE600]">{project.compatibilityScore}%</div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Are you sure you want to delete the project "${project.name}"? This action cannot be undone.`)) {
                onDeleteProject(project.id);
              }
            }}
            className="px-2.5 py-1.5 bg-red-600/20 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white rounded-lg text-xs transition-colors flex-shrink-0"
          >
            🗑 Delete Project
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-4 space-y-3">
          <h4 className="text-white font-semibold text-sm flex items-center justify-between border-b border-[#E5E5E5]/10 pb-2">
            <span>Project Team ({assignedTeam.length})</span>
            <span className="text-xs text-[#E5E5E5] font-normal">Active Members</span>
          </h4>
          
          {assignedTeam.length > 0 ? (
            <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {assignedTeam.map((member, i) => {
                const isPmOrBa = member.role === "PM" || (member.name === project.ba && member.role === "BA");
                
                return (
                  <div key={i} className="bg-[#000000] border border-[#E5E5E5]/10 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-white font-medium text-xs flex items-center gap-1.5 flex-wrap">
                        {member.name}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2E2E2E] text-[#E5E5E5]">{member.role}</span>
                      </div>
                      <div className="text-[#E5E5E5]/80 text-[10px]">{member.specialty}</div>
                    </div>
                    
                    {isPmOrBa ? (
                      <span className="text-[10px] text-[#FFE600]/60 font-semibold px-2 py-1">Core Leader</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onDropMemberFromProject(member, project.id)}
                        className="px-2 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded text-xs transition-colors"
                      >
                        Drop
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-[#E5E5E5] text-xs border border-dashed border-[#E5E5E5]/15 rounded-lg p-4 text-center">
              No team members assigned yet.
            </div>
          )}
        </div>

        <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-4 space-y-3">
          <h4 className="text-white font-semibold text-sm border-b border-[#E5E5E5]/10 pb-2">
            Available Roster
          </h4>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="bg-[#000000] border border-[#E5E5E5]/20 rounded px-2 py-1 text-white text-xs placeholder-[#E5E5E5]/40 focus:outline-none focus:border-[#FFE600]"
            />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="bg-[#000000] border border-[#E5E5E5]/20 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#FFE600]"
            >
              {roles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
            {filteredRoster.length > 0 ? (
              filteredRoster.map((emp) => {
                const compat = calculateCompatibility(emp, pmObj);
                return (
                  <div key={`${emp.name}::${emp.role}`} className="bg-[#000000] border border-[#E5E5E5]/10 rounded-lg p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-white font-medium text-xs flex items-center gap-1.5 flex-wrap">
                        {emp.name}
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2E2E2E] text-[#E5E5E5]">{emp.role}</span>
                      </div>
                      <div className="text-[#E5E5E5]/80 text-[10px] truncate">{emp.specialty}</div>
                      <div className="text-[10px] text-[#E5E5E5]/50 flex gap-2">
                        <span>Projects: {emp.projects}</span>
                        <span>·</span>
                        <span className={compat >= 75 ? "text-emerald-400" : compat >= 55 ? "text-amber-400" : "text-rose-400"}>Compat: {compat}%</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAddMemberToProject(emp, project.id)}
                      className="px-2 py-1 bg-[#FFE600]/15 hover:bg-[#FFE600] text-[#FFE600] hover:text-[#000000] border border-[#FFE600]/30 rounded text-xs transition-colors flex-shrink-0"
                    >
                      Add
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="text-[#E5E5E5] text-xs text-center py-4">
                No matching members found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TeamTab({
  employees,
  onAddMember,
  projects,
  onAddMemberToProject,
  onDropMemberFromProject,
  onCreateProject,
  onDeleteProject
}) {
  const roster = Array.isArray(employees) ? employees : [];
  const [filter, setFilter] = useState("All");
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedMemberName, setSelectedMemberName] = useState("");
  const [form, setForm] = useState(() => ({
    name: "",
    role: "BA",
    specialty: "",
    assignedPm: roster.find(e => e.role === "PM")?.name || "",
    skillStars: 4,
    projects: 1,
    available: true,
  }));

  const projectManagers = roster.filter(e => e.role === "PM");
  const businessAnalysts = roster.filter(e => e.role === "BA");
  const teamRoles = ["BA", "Lead Dev", "iOS Dev", "Android Dev", "QA", "Architect", "Security"];
  const visibleRoles = ["All", ...teamRoles];
  const browsableRoles = teamRoles.filter(role => roster.some(member => member.role === role));
  const roleMembers = selectedRole ? roster.filter(member => member.role === selectedRole) : [];
  const selectedMember = roleMembers.find(member => member.name === selectedMemberName) || null;
  const totalMembers = roster.filter(e => e.role !== "PM").length;

  const [selectedAllocationProjectId, setSelectedAllocationProjectId] = useState("");
  const [showProjectCreate, setShowProjectCreate] = useState(false);

  const handleLocalDeleteProject = (projectId) => {
    onDeleteProject(projectId);
    setSelectedAllocationProjectId("");
  };

  useEffect(() => {
    if (!selectedRole) {
      if (selectedMemberName) setSelectedMemberName("");
      return;
    }

    const nextRoleMembers = roster.filter(member => member.role === selectedRole);
    if (!nextRoleMembers.some(member => member.name === selectedMemberName)) {
      setSelectedMemberName(nextRoleMembers[0]?.name || "");
    }
  }, [roster, selectedRole, selectedMemberName]);

  const handleFormChange = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.assignedPm) return;

    onAddMember({
      id: Date.now(),
      name: form.name.trim(),
      role: form.role,
      specialty: form.specialty.trim() || form.role,
      assignedPm: form.assignedPm,
      skillStars: Math.max(1, Math.min(5, Number(form.skillStars) || 4)),
      projects: Math.max(0, Number(form.projects) || 0),
      available: Boolean(form.available),
    });

    setForm({
      name: "",
      role: "BA",
      specialty: "",
      assignedPm: projectManagers[0]?.name || "",
      skillStars: 4,
      projects: 1,
      available: true,
    });
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-white font-semibold text-base">Project Team Allocation</h3>
            <p className="text-[#E5E5E5] text-sm">Select an active project to add or drop team members, or create a new project.</p>
          </div>
          <div className="text-xs text-[#E5E5E5] uppercase tracking-widest text-right">
            Manage Assignments
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Select Project</div>
            <select
              value={selectedAllocationProjectId}
              onChange={e => {
                const val = e.target.value;
                setSelectedAllocationProjectId(val);
                if (val === "new") {
                  setShowProjectCreate(true);
                } else {
                  setShowProjectCreate(false);
                }
              }}
              className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]"
            >
              <option value="">-- Choose an Active Project --</option>
              <option value="new" className="text-[#FFE600] font-semibold">+ Create New Project...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} ({p.client})</option>
              ))}
            </select>
          </div>
        </div>

        {showProjectCreate && (
          <div className="border-t border-[#E5E5E5]/10 pt-4 mt-2">
            <ProjectCreateForm
              projectManagers={projectManagers}
              businessAnalysts={businessAnalysts}
              onSubmit={(newProjectData) => {
                onCreateProject(newProjectData);
                setSelectedAllocationProjectId(String(newProjectData.id));
                setShowProjectCreate(false);
              }}
            />
          </div>
        )}

        {selectedAllocationProjectId && selectedAllocationProjectId !== "new" && (
          <div className="border-t border-[#E5E5E5]/10 pt-4 mt-2 space-y-4">
            {(() => {
              const activeProj = projects.find(p => p.id === Number(selectedAllocationProjectId));
              if (!activeProj) return null;
              
              return (
                <ProjectAllocationManager
                  project={activeProj}
                  roster={roster}
                  onAddMemberToProject={onAddMemberToProject}
                  onDropMemberFromProject={onDropMemberFromProject}
                  onDeleteProject={handleLocalDeleteProject}
                />
              );
            })()}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-white font-semibold text-base">Add New Team Member to Roster</h3>
            <p className="text-[#E5E5E5] text-sm">Choose a project manager first, then add the team member under that manager.</p>
          </div>
          <div className="text-xs text-[#E5E5E5] uppercase tracking-widest">PM assignment required</div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Project manager</div>
            <select value={form.assignedPm} onChange={e => handleFormChange("assignedPm", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]">
              <option value="" disabled>Select a PM</option>
              {projectManagers.map(pm => (
                <option key={pm.name} value={pm.name}>{pm.name} · {pm.specialty}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Team member name</div>
            <input value={form.name} onChange={e => handleFormChange("name", e.target.value)} placeholder="Example: Jordan Smith" className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600]" />
          </div>
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Role</div>
            <select value={form.role} onChange={e => handleFormChange("role", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]">
              {teamRoles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Specialty</div>
            <input value={form.specialty} onChange={e => handleFormChange("specialty", e.target.value)} placeholder="Example: Automation / E2E" className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600]" />
          </div>
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Skill rating (1-5)</div>
            <input type="number" min="1" max="5" value={form.skillStars} onChange={e => handleFormChange("skillStars", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]" />
          </div>
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Active projects</div>
            <input type="number" min="0" value={form.projects} onChange={e => handleFormChange("projects", e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]" />
          </div>
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Availability</div>
            <select value={form.available ? "yes" : "no"} onChange={e => handleFormChange("available", e.target.value === "yes")} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]">
              <option value="yes">Available</option>
              <option value="no">Allocated</option>
            </select>
          </div>
        </div>

        <button type="submit" disabled={!projectManagers.length} className="w-full py-2.5 bg-[#FFE600] hover:bg-[#FFFFFF] disabled:opacity-50 disabled:cursor-not-allowed text-[#000000] font-semibold rounded-lg transition-colors text-sm">
          Add Team Member to Roster
        </button>
      </form>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-4">
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1">Project managers</div>
          <div className="font-mono font-bold text-2xl text-[#FFE600]">{projectManagers.length}</div>
        </div>
        <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-4">
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1">Team members</div>
          <div className="font-mono font-bold text-2xl text-[#FFFFFF]">{totalMembers}</div>
        </div>
        <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-4">
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1">Allocated members</div>
          <div className="font-mono font-bold text-2xl text-[#E5E5E5]">{roster.filter(e => e.role !== "PM" && e.assignedPm).length}</div>
        </div>
        <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-4">
          <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1">Roles</div>
          <div className="font-mono font-bold text-2xl text-[#FFE600]">{visibleRoles.length - 1}</div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {visibleRoles.map(role => (
          <button key={role} onClick={() => setFilter(role)} className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${filter === role ? "bg-[#FFE600] text-[#000000]" : "bg-[#2E2E2E] text-[#E5E5E5] hover:text-white"}`}>
            {role}
          </button>
        ))}
      </div>

      <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-white font-semibold text-base">Browse Team by Role</h3>
            <p className="text-[#E5E5E5] text-sm">Pick a role first, then choose a team member from that role.</p>
          </div>
          <div className="text-xs text-[#E5E5E5] uppercase tracking-widest">Role linked dropdowns</div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Role</div>
            <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]">
              <option value="" disabled>Select a role</option>
              {browsableRoles.map(role => <option key={role} value={role}>{role}</option>)}
            </select>
          </div>
          <div>
            <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5">Team member</div>
            <select value={selectedMember?.name || ""} onChange={e => setSelectedMemberName(e.target.value)} className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600]" disabled={!roleMembers.length}>
              {roleMembers.map(member => <option key={member.name} value={member.name}>{member.name}</option>)}
            </select>
          </div>
        </div>

        {selectedMember ? (
          <div className="grid md:grid-cols-[1.4fr_0.9fr] gap-4">
            <div className="bg-[#000000] border border-[#E5E5E5]/10 rounded-xl p-4 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full border flex items-center justify-center font-bold text-sm flex-shrink-0 ${selectedMember.available ? "bg-[#FFE600]/15 border-[#FFE600]/30 text-[#FFE600]" : "bg-[#2E2E2E] border-[#E5E5E5]/20 text-[#FFFFFF]"}`}>
                {selectedMember.name.split(" ").map(n => n[0]).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-white font-medium text-sm">{selectedMember.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full border bg-[#2E2E2E] border-[#E5E5E5]/20 text-[#E5E5E5]">{selectedMember.role}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${selectedMember.available ? "bg-[#FFE600]/15 border-[#FFE600]/30 text-[#FFE600]" : "bg-[#000000] border-[#E5E5E5]/20 text-[#E5E5E5]"}`}>
                    {selectedMember.available ? "Available" : "Allocated"}
                  </span>
                </div>
                <div className="text-[#E5E5E5] text-xs mt-0.5">{selectedMember.specialty}</div>
                <div className="text-[#E5E5E5]/70 text-xs">Active on {selectedMember.projects} project{selectedMember.projects !== 1 ? "s" : ""}</div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="bg-[#000000] border border-[#E5E5E5]/10 rounded-xl p-3">
                <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1">Skill rating</div>
                <Stars count={selectedMember.skillStars} size="sm" color="indigo" />
                <div className="font-mono text-xs text-[#E5E5E5]/70">{selectedMember.skillStars}/5</div>
              </div>
              <div className="bg-[#000000] border border-[#E5E5E5]/10 rounded-xl p-3">
                <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1">Member score</div>
                <div className="font-mono text-xl text-[#FFE600]">{scoreMember(selectedMember)}/100</div>
              </div>
              <div className="bg-[#000000] border border-[#E5E5E5]/10 rounded-xl p-3">
                <div className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1">PM compatibility</div>
                <div className="font-mono text-xl text-[#FFFFFF]">{calculateCompatibility(selectedMember, projectManagers.find(pm => pm.name === (selectedMember.assignedPm || projectManagers[0]?.name)) || projectManagers[0] || { name: "", specialty: "" })}%</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-[#E5E5E5] text-sm border border-dashed border-[#E5E5E5]/20 rounded-lg p-4">
            No team members found for the selected role.
          </div>
        )}

        <div className="grid gap-2">
          {roleMembers.map(member => (
            <button
              key={member.name}
              type="button"
              onClick={() => setSelectedMemberName(member.name)}
              className={`text-left bg-[#000000] border rounded-xl p-4 transition-colors ${selectedMember?.name === member.name ? "border-[#FFE600]/50" : "border-[#E5E5E5]/10 hover:border-[#E5E5E5]/30"}`}
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-white text-sm font-medium">{member.name}</div>
                  <div className="text-[#E5E5E5] text-xs">PM: {member.assignedPm || "Unassigned"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[#E5E5E5] text-xs">Score {formatMemberScore(member)}</div>
                  <div className="text-[#FFE600] text-xs">Compat. {calculateCompatibility(member, projectManagers.find(pm => pm.name === member.assignedPm) || projectManagers[0] || { name: "", specialty: "" })}%</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── BRD Generator Tab ───────────────────────────────────────────────────────
function BRDTab() {
  const [form, setForm] = useState({ clientName: "", requirements: "", projectType: "Enterprise Software" });
  const [brd, setBrd] = useState(null);
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("prismpm.groqApiKey") || "");
  const [apiError, setApiError] = useState("");

  const projectTypes = ["Enterprise Software", "Mobile App", "Healthcare SaaS", "E-Commerce", "Data Analytics", "API Integration", "CRM / ERP", "Cloud Migration", "Custom Portal"];

  useEffect(() => {
    try {
      if (apiKey.trim()) {
        localStorage.setItem("prismpm.groqApiKey", apiKey.trim());
      } else {
        localStorage.removeItem("prismpm.groqApiKey");
      }
    } catch {
      // Ignore storage failures.
    }
  }, [apiKey]);

  const generateBRD = async () => {
    if (!form.clientName || !form.requirements) return;
    setLoading(true);
    setBrd(null);
    setApiError("");
    try {
      const result = await callGroq(
        `Generate a professional Business Requirements Document (BRD) for the following:
Client Name: ${form.clientName}
Project Type: ${form.projectType}
Requirements: ${form.requirements}

Return JSON with this exact structure:
{
  "executiveSummary": "string (2-3 sentences)",
  "businessObjectives": ["string", "string", "string", "string"],
  "projectScope": {
    "inScope": ["string", "string", "string", "string"],
    "outOfScope": ["string", "string"]
  },
  "stakeholders": [
    {"role": "string", "name": "string (use TBD if unknown)", "responsibility": "string"},
    {"role": "string", "name": "string", "responsibility": "string"},
    {"role": "string", "name": "string", "responsibility": "string"},
    {"role": "string", "name": "string", "responsibility": "string"}
  ],
  "functionalRequirements": ["string", "string", "string", "string", "string"],
  "nonFunctionalRequirements": ["string", "string", "string"],
  "assumptions": ["string", "string", "string", "string"],
  "constraints": ["string", "string"],
  "successCriteria": ["string", "string", "string"],
  "estimatedTimeline": "string",
  "riskSummary": ["string", "string", "string"]
}`,
          "You are an expert project management AI assistant. Always respond with valid JSON only, no markdown, no extra text.",
          apiKey,
        );
      setBrd(result);
    } catch (e) {
      setBrd(null);
      setApiError(e instanceof Error ? e.message : "Could not generate BRD.");
    } finally {
      setLoading(false);
    }
  };

  const exportBRD = () => {
    if (!brd) return;
    const lines = [
      `BUSINESS REQUIREMENTS DOCUMENT`,
      `================================`,
      `Client: ${form.clientName}`,
      `Project Type: ${form.projectType}`,
      `Generated: ${new Date().toLocaleDateString()}`,
      ``,
      `EXECUTIVE SUMMARY`,
      `-----------------`,
      brd.executiveSummary,
      ``,
      `BUSINESS OBJECTIVES`,
      `-------------------`,
      ...(brd.businessObjectives || []).map((o, i) => `${i + 1}. ${o}`),
      ``,
      `SCOPE - IN SCOPE`,
      `----------------`,
      ...(brd.projectScope?.inScope || []).map(s => `• ${s}`),
      ``,
      `SCOPE - OUT OF SCOPE`,
      `--------------------`,
      ...(brd.projectScope?.outOfScope || []).map(s => `• ${s}`),
      ``,
      `STAKEHOLDERS`,
      `------------`,
      ...(brd.stakeholders || []).map(s => `• ${s.role} (${s.name}): ${s.responsibility}`),
      ``,
      `FUNCTIONAL REQUIREMENTS`,
      `-----------------------`,
      ...(brd.functionalRequirements || []).map((r, i) => `FR${i + 1}: ${r}`),
      ``,
      `NON-FUNCTIONAL REQUIREMENTS`,
      `---------------------------`,
      ...(brd.nonFunctionalRequirements || []).map((r, i) => `NFR${i + 1}: ${r}`),
      ``,
      `ASSUMPTIONS`,
      `-----------`,
      ...(brd.assumptions || []).map((a, i) => `${i + 1}. ${a}`),
      ``,
      `CONSTRAINTS`,
      `-----------`,
      ...(brd.constraints || []).map(c => `• ${c}`),
      ``,
      `SUCCESS CRITERIA`,
      `----------------`,
      ...(brd.successCriteria || []).map(s => `✓ ${s}`),
      ``,
      `ESTIMATED TIMELINE: ${brd.estimatedTimeline}`,
      ``,
      `RISK SUMMARY`,
      `------------`,
      ...(brd.riskSummary || []).map(r => `⚠ ${r}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `BRD_${form.clientName.replace(/\s+/g, "_")}.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
          <span className="text-[#FFE600]">✦</span> AI BRD Generator
        </h3>
        <p className="text-[#E5E5E5] text-sm mb-5">Enter project details and let AI generate a full Business Requirements Document.</p>
        <div className="space-y-4">
          <div>
            <label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5 block">Groq API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="Paste your Groq API key here"
              className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600] transition-colors"
            />
            <p className="text-[#E5E5E5]/70 text-xs mt-1">Stored locally in your browser. Needed for BRD generation.</p>
          </div>
          <div>
            <label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5 block">Client Name *</label>
            <input
              value={form.clientName}
              onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
              placeholder="e.g. Acme Corporation"
              className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600] transition-colors"
            />
          </div>
          <div>
            <label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5 block">Project Type</label>
            <select
              value={form.projectType}
              onChange={e => setForm(f => ({ ...f, projectType: e.target.value }))}
              className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-[#FFE600] transition-colors">
              {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-1.5 block">Requirements *</label>
            <textarea
              value={form.requirements}
              onChange={e => setForm(f => ({ ...f, requirements: e.target.value }))}
              placeholder="Describe the client's needs, goals, and any known requirements..."
              rows={4}
              className="w-full bg-[#000000] border border-[#E5E5E5]/20 rounded-lg px-3 py-2.5 text-white text-sm placeholder-[#E5E5E5]/50 focus:outline-none focus:border-[#FFE600] transition-colors resize-none"
            />
          </div>
          <button
            onClick={generateBRD}
            disabled={loading || !form.clientName || !form.requirements || !apiKey}
            className="w-full py-2.5 bg-[#FFE600] hover:bg-[#FFFFFF] disabled:opacity-50 disabled:cursor-not-allowed text-[#000000] font-medium rounded-lg transition-all text-sm">
            {loading ? "Generating BRD..." : "✦ Generate BRD with AI"}
          </button>
        </div>
      </div>

      {apiError && (
        <div className="bg-[#000000] border border-[#FFE600]/30 rounded-xl p-4 text-sm text-[#E5E5E5]">
          <span className="text-[#FFE600] font-semibold">BRD error:</span> {apiError}
        </div>
      )}

      {loading && (
        <div className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-8 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[#FFE600] border-t-transparent rounded-full animate-spin" />
          <p className="text-[#E5E5E5] text-sm">AI is generating your BRD…</p>
        </div>
      )}

      {brd && !loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">Generated BRD: {form.clientName}</h3>
            <button onClick={exportBRD} className="px-3 py-1.5 bg-[#E5E5E5]/10 hover:bg-[#E5E5E5]/20 border border-[#E5E5E5]/30 text-white text-xs rounded-lg transition-colors">
              ↓ Export .txt
            </button>
          </div>

          {/* Sections */}
          {[
            {
              title: "Executive Summary", color: "yellow", icon: "◈",
              content: <p className="text-[#E5E5E5] text-sm leading-relaxed">{brd.executiveSummary}</p>
            },
            {
              title: "Business Objectives", color: "yellow", icon: "✦",
              content: <ol className="space-y-2">{(brd.businessObjectives || []).map((o, i) => (
                <li key={i} className="flex gap-3 text-sm text-[#E5E5E5]"><span className="text-[#FFE600] font-mono font-bold">{String(i + 1).padStart(2, "0")}</span>{o}</li>
              ))}</ol>
            },
            {
              title: "Project Scope", color: "yellow", icon: "◉",
              content: <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[#FFE600] text-xs font-bold uppercase mb-2">In Scope</div>
                  <ul className="space-y-1">{(brd.projectScope?.inScope || []).map((s, i) => <li key={i} className="text-[#E5E5E5] text-sm flex gap-2"><span className="text-[#FFE600]">✓</span>{s}</li>)}</ul>
                </div>
                <div>
                  <div className="text-[#E5E5E5] text-xs font-bold uppercase mb-2">Out of Scope</div>
                  <ul className="space-y-1">{(brd.projectScope?.outOfScope || []).map((s, i) => <li key={i} className="text-[#E5E5E5] text-sm flex gap-2"><span className="text-[#2E2E2E]">✗</span>{s}</li>)}</ul>
                </div>
              </div>
            },
            {
              title: "Stakeholders", color: "yellow", icon: "◆",
              content: <div className="space-y-2">{(brd.stakeholders || []).map((s, i) => (
                <div key={i} className="flex gap-3 p-3 bg-[#000000] rounded-lg text-sm border border-[#E5E5E5]/10">
                  <span className="text-[#FFE600] font-medium min-w-28">{s.role}</span>
                  <span className="text-[#FFFFFF]">{s.name}</span>
                  <span className="text-[#E5E5E5]">·</span>
                  <span className="text-[#E5E5E5] flex-1">{s.responsibility}</span>
                </div>
              ))}</div>
            },
            {
              title: "Functional Requirements", color: "yellow", icon: "⬡",
              content: <ol className="space-y-2">{(brd.functionalRequirements || []).map((r, i) => (
                <li key={i} className="flex gap-3 text-sm text-[#E5E5E5]"><span className="text-[#000000] font-mono text-xs font-bold bg-[#FFE600] px-2 py-0.5 rounded">FR{i + 1}</span>{r}</li>
              ))}</ol>
            },
            {
              title: "Non-Functional Requirements", color: "yellow", icon: "⬡",
              content: <ol className="space-y-2">{(brd.nonFunctionalRequirements || []).map((r, i) => (
                <li key={i} className="flex gap-3 text-sm text-[#E5E5E5]"><span className="text-[#000000] font-mono text-xs font-bold bg-[#E5E5E5] px-2 py-0.5 rounded">NFR{i + 1}</span>{r}</li>
              ))}</ol>
            },
            {
              title: "Assumptions", color: "gray", icon: "◌",
              content: <ul className="space-y-1">{(brd.assumptions || []).map((a, i) => <li key={i} className="text-[#E5E5E5] text-sm flex gap-2"><span className="text-[#2E2E2E]">·</span>{a}</li>)}</ul>
            },
            {
              title: "Success Criteria", color: "yellow", icon: "✓",
              content: <ul className="space-y-1">{(brd.successCriteria || []).map((s, i) => <li key={i} className="text-[#E5E5E5] text-sm flex gap-2"><span className="text-[#FFE600]">✓</span>{s}</li>)}</ul>
            },
            {
              title: "Risk Summary", color: "yellow", icon: "⚠",
              content: <ul className="space-y-1">{(brd.riskSummary || []).map((r, i) => <li key={i} className="text-[#E5E5E5] text-sm flex gap-2"><span className="text-[#FFE600]">⚠</span>{r}</li>)}</ul>
            },
          ].map(section => (
            <div key={section.title} className="bg-[#2E2E2E] border border-[#E5E5E5]/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={section.color === "yellow" ? "text-[#FFE600]" : "text-[#E5E5E5]"}>{section.icon}</span>
                <h4 className="text-white font-semibold text-sm">{section.title}</h4>
                {section.title === "Risk Summary" && <span className="text-xs text-[#FFE600] font-bold">(Review carefully)</span>}
              </div>
              {section.content}
              {section.title === "Risk Summary" && brd.estimatedTimeline && (
                <div className="mt-3 pt-3 border-t border-[#E5E5E5]/20 text-sm text-[#E5E5E5]">
                  Estimated Timeline: <span className="text-white font-medium">{brd.estimatedTimeline}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim().toLowerCase();
    
    if (cleanUser === "admin" && cleanPass === "admin") {
      onLogin();
    } else {
      setError("Invalid credentials. Please use 'admin' for both.");
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      background: EY.black,
      backgroundImage: `
        radial-gradient(circle at center, rgba(255, 230, 0, 0.1) 0%, transparent 70%),
        linear-gradient(180deg, #000000 0%, #1A1A1A 100%)
      `,
      padding: "20px"
    }}>
      <div style={{
        width: "100%",
        maxWidth: 400,
        background: "rgba(46, 46, 46, 0.4)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(229, 229, 229, 0.1)",
        borderRadius: 20,
        padding: "40px 30px",
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.5)"
      }}>
        <div style={{ textAlign: "center", marginBottom: 35 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, color: EY.yellow, letterSpacing: "-0.5px" }}>
            PRISM<span style={{ color: EY.white, fontWeight: 700 }}>PM</span>
          </div>
          <div style={{ fontSize: 11, color: EY.lightGray, marginTop: 4, letterSpacing: "0.15em", textTransform: "uppercase" }}>
            Enterprise AI Management
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {error && (
            <div style={{
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#EF4444",
              fontSize: 12,
              padding: "10px 12px",
              borderRadius: 8,
              textAlign: "center"
            }}>
              {error}
            </div>
          )}

          <div>
            <label style={{ color: EY.lightGray, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter admin username"
              required
              style={{
                width: "100%",
                background: "rgba(0, 0, 0, 0.5)",
                border: "1px solid rgba(229, 229, 229, 0.2)",
                borderRadius: 10,
                padding: "12px 16px",
                color: EY.white,
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.2s ease"
              }}
              onFocus={e => e.target.style.borderColor = EY.yellow}
              onBlur={e => e.target.style.borderColor = "rgba(229, 229, 229, 0.2)"}
            />
          </div>

          <div>
            <label style={{ color: EY.lightGray, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", display: "block", marginBottom: 8 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: "100%",
                background: "rgba(0, 0, 0, 0.5)",
                border: "1px solid rgba(229, 229, 229, 0.2)",
                borderRadius: 10,
                padding: "12px 16px",
                color: EY.white,
                fontSize: 14,
                outline: "none",
                transition: "border-color 0.2s ease"
              }}
              onFocus={e => e.target.style.borderColor = EY.yellow}
              onBlur={e => e.target.style.borderColor = "rgba(229, 229, 229, 0.2)"}
            />
          </div>

          <button
            type="submit"
            style={{
              background: EY.yellow,
              color: EY.black,
              border: "none",
              borderRadius: 10,
              padding: "14px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s ease",
              marginTop: 10
            }}
            onMouseEnter={e => {
              e.target.style.background = EY.white;
              e.target.style.boxShadow = `0 0 15px ${EY.yellow}`;
            }}
            onMouseLeave={e => {
              e.target.style.background = EY.yellow;
              e.target.style.boxShadow = "none";
            }}
          >
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try {
      return localStorage.getItem("prismpm.isLoggedIn") === "true";
    } catch {
      return false;
    }
  });

  const handleLogin = () => {
    setIsLoggedIn(true);
    try {
      localStorage.setItem("prismpm.isLoggedIn", "true");
    } catch {}
  };

  const [tab, setTab] = useState("dashboard");
  const [selectedProject, setSelectedProject] = useState(null);
  const [projects, setProjects] = useState(() => {
    try {
      const storedProjects = localStorage.getItem("prismpm.projects");
      return storedProjects ? JSON.parse(storedProjects) : INITIAL_PROJECTS;
    } catch {
      return INITIAL_PROJECTS;
    }
  });
  const [employees, setEmployees] = useState(() => {
    try {
      const storedTeam = localStorage.getItem(PM_STORAGE_KEY);
      const parsedTeam = storedTeam ? JSON.parse(storedTeam) : INITIAL_TEAM_MEMBERS;
      return mergeTeamRoster(parsedTeam);
    } catch {
      return INITIAL_TEAM_MEMBERS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("prismpm.projects", JSON.stringify(projects));
    } catch {
      // Ignore storage failures and keep the in-memory list working.
    }
  }, [projects]);

  useEffect(() => {
    try {
      localStorage.setItem(PM_STORAGE_KEY, JSON.stringify(employees));
    } catch {
      // Ignore storage failures and keep the in-memory list working.
    }
  }, [employees]);

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: "◈" },
    { id: "team", label: "Team", icon: "◆" },
    { id: "brd", label: "BRD Generator", icon: "✦" },
  ];

  const handleSelectProject = (p) => {
    setSelectedProject(p);
    setTab("project");
  };

  const handleBack = () => {
    setSelectedProject(null);
    setTab("dashboard");
  };

  const handleAddTeamMember = (member) => {
    setEmployees(currentEmployees => [member, ...currentEmployees]);
    setTab("team");
  };

  const handleCreateProject = (project) => {
    const nextEmployees = employees.map(e => {
      const isInitialMember = project.team.some(m => m.name === e.name && m.role === e.role);
      if (isInitialMember) {
        const nextProjects = (e.projects || 0) + 1;
        return { ...e, projects: nextProjects, available: false };
      }
      return e;
    });

    setEmployees(nextEmployees);

    setProjects(currentProjects => {
      const compatibilityScore = updateProjectCompatibility(project.team, project.pm, nextEmployees);
      const updatedProject = { ...project, compatibilityScore };
      return [updatedProject, ...currentProjects];
    });

    setTab("team");
  };

  const handleAddMemberToProject = (member, projectId) => {
    const nextEmployees = employees.map(e => {
      if (e.name === member.name && e.role === member.role) {
        const nextProjects = (e.projects || 0) + 1;
        return { ...e, projects: nextProjects, available: false };
      }
      return e;
    });

    setEmployees(nextEmployees);

    setProjects(currentProjects => currentProjects.map(p => {
      if (p.id !== projectId) return p;
      if (p.team.some(m => m.name === member.name && m.role === member.role)) return p;
      
      const newTeam = [...p.team, {
        name: member.name,
        role: member.role,
        skillStars: member.skillStars,
        specialty: member.specialty
      }];
      
      const compatibilityScore = updateProjectCompatibility(newTeam, p.pm, nextEmployees);
      return { ...p, team: newTeam, compatibilityScore };
    }));
  };

  const handleDropMemberFromProject = (member, projectId) => {
    const nextEmployees = employees.map(e => {
      if (e.name === member.name && e.role === member.role) {
        const nextProjects = Math.max(0, (e.projects || 0) - 1);
        return { ...e, projects: nextProjects, available: nextProjects === 0 };
      }
      return e;
    });

    setEmployees(nextEmployees);

    setProjects(currentProjects => currentProjects.map(p => {
      if (p.id !== projectId) return p;
      
      const newTeam = p.team.filter(m => !(m.name === member.name && m.role === member.role));
      const compatibilityScore = updateProjectCompatibility(newTeam, p.pm, nextEmployees);
      return { ...p, team: newTeam, compatibilityScore };
    }));
  };

  const handleDeleteProject = (projectId) => {
    const projectToDelete = projects.find(p => p.id === projectId);
    
    if (projectToDelete && projectToDelete.team) {
      setEmployees(currentEmployees => currentEmployees.map(e => {
        const isAllocated = projectToDelete.team.some(m => m.name === e.name && m.role === e.role);
        if (isAllocated) {
          const nextProjects = Math.max(0, (e.projects || 0) - 1);
          return { ...e, projects: nextProjects, available: nextProjects === 0 };
        }
        return e;
      }));
    }

    setProjects(currentProjects => currentProjects.filter(p => p.id !== projectId));
    setSelectedProject(null);
    setTab("dashboard");
  };

  if (!isLoggedIn) {
    return (
      <div style={{ fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: EY.black, color: EY.white }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;700&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
        `}</style>
        <LoginPage onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", minHeight: "100vh", background: EY.black, color: EY.white }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Syne:wght@700;800&family=JetBrains+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: #FFE600; color: #000000; }
        ::-webkit-scrollbar { width: 6px; } 
        ::-webkit-scrollbar-track { background: #000000; } 
        ::-webkit-scrollbar-thumb { background: #FFE600; border-radius: 3px; }
        .animate-spin { animation: spin 1s linear infinite; }
        .animate-pulse { animation: pulse 2s cubic-bezier(0.4,0,0.6,1) infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }
        .transition-all { transition: all 0.2s ease; }
        .transition-colors { transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease; }
        select option { background: #2E2E2E; color: #FFFFFF; }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <aside style={{ width: 220, background: EY.darkGray, borderRight: `1px solid ${EY.lightGray}33`, display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "24px 20px 16px" }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, color: EY.yellow, letterSpacing: "-0.5px" }}>
              PRISM<span style={{ color: EY.white, fontWeight: 700 }}>PM</span>
            </div>
            <div style={{ fontSize: 10, color: EY.lightGray, marginTop: 2, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              AI Project Intelligence
            </div>
          </div>

          <nav style={{ padding: "8px 12px", flex: 1 }}>
            {navItems.map(item => (
              <button key={item.id}
                onClick={() => { setTab(item.id); setSelectedProject(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  marginBottom: 4, textAlign: "left", fontSize: 13, fontWeight: 500,
                  transition: "all 0.15s ease",
                  background: tab === item.id ? `${EY.yellow}1A` : "transparent",
                  color: tab === item.id ? EY.white : EY.lightGray,
                  borderLeft: tab === item.id ? `2px solid ${EY.yellow}` : "2px solid transparent",
                }}>
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          {/* Project quick-links */}
          <div style={{ padding: "12px", borderTop: `1px solid ${EY.lightGray}33` }}>
            <div style={{ fontSize: 9, color: EY.lightGray, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8, paddingLeft: 4 }}>
              Active Projects
            </div>
            {projects.map(p => (
              <button key={p.id} onClick={() => handleSelectProject(p)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                  marginBottom: 2, background: "transparent", textAlign: "left",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(255,230,0,0.08)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: p.status === "On Track" ? EY.yellow : p.status === "At Risk" ? EY.lightGray : EY.white,
                  boxShadow: `0 0 6px ${p.status === "On Track" ? EY.yellow : p.status === "At Risk" ? EY.lightGray : EY.white}`,
                }} />
                <span style={{ fontSize: 11, color: EY.lightGray, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
              </button>
            ))}
          </div>

          {/* Logout */}
          <div style={{ padding: "12px", borderTop: `1px solid ${EY.lightGray}33`, marginTop: "auto" }}>
            <button
              onClick={() => {
                setIsLoggedIn(false);
                try {
                  localStorage.removeItem("prismpm.isLoggedIn");
                } catch {}
              }}
              style={{
                display: "flex", alignItems: "center", gap: 10, width: "100%",
                padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                textAlign: "left", fontSize: 13, fontWeight: 500, transition: "all 0.15s ease",
                background: "transparent", color: EY.yellow,
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,230,0,0.08)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <span>🚪</span> Logout
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, overflow: "auto" }}>
          {/* Top bar */}
          <header style={{ padding: "16px 28px", borderBottom: `1px solid ${EY.lightGray}33`, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, background: "rgba(0,0,0,0.96)", backdropFilter: "blur(8px)", zIndex: 10 }}>
            <div>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 800, color: EY.white }}>
                {tab === "dashboard" ? "Project Portfolio" : tab === "team" ? "Team Directory" : tab === "brd" ? "BRD Generator" : selectedProject?.name || "Project"}
              </h1>
              <p style={{ fontSize: 12, color: EY.lightGray, marginTop: 2 }}>
                {tab === "dashboard" ? `${projects.length} active projects · ${projects.flatMap(p => p.risks.filter(r => r.severity === "Critical")).length} critical risks` :
                  tab === "team" ? `${employees.length} team members` :
                    tab === "brd" ? "Generate AI-powered BRDs in seconds" :
                      selectedProject ? `${selectedProject.client} · ${selectedProject.type}` : ""}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: EY.lightGray }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: EY.yellow, display: "inline-block", boxShadow: `0 0 6px ${EY.yellow}` }} />
              AI Connected
            </div>
          </header>

          {/* Content */}
          <div style={{ padding: "24px 28px", maxWidth: 1000 }}>
            {tab === "dashboard" && (
              <div className="space-y-5">
                <DashboardTab projects={projects} onSelectProject={handleSelectProject} />
              </div>
            )}
            {tab === "team" && (
              <TeamTab
                employees={employees}
                onAddMember={handleAddTeamMember}
                projects={projects}
                onAddMemberToProject={handleAddMemberToProject}
                onDropMemberFromProject={handleDropMemberFromProject}
                onCreateProject={handleCreateProject}
                onDeleteProject={handleDeleteProject}
              />
            )}
            {tab === "brd" && <BRDTab />}
            {tab === "project" && selectedProject && <ProjectDetail project={selectedProject} onBack={handleBack} onDeleteProject={handleDeleteProject} />}
          </div>
        </main>
      </div>
    </div>
  );
}