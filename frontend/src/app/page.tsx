'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import RagView from './RagView';
import AgentsView from './AgentsView';
import MlopsView from './MlopsView';
import DataEngineeringView from './DataEngineeringView';

type SharedAuth = { access_token: string; refresh_token: string };

type ApiStatus = 'checking' | 'online' | 'offline';

type HealthResponse = {
  status: string;
  database?: string;
};

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const navItems = [
  { id: 'overview', label: 'Overview', icon: '◉' },
  { id: 'agents', label: 'Agents', icon: '⚡' },
  { id: 'rag', label: 'RAG', icon: '📚' },
  { id: 'mlops', label: 'MLOps', icon: '🧪' },
  { id: 'data', label: 'Data Eng', icon: '🔄' },
  { id: 'devops', label: 'DevOps', icon: '🚀' },
  { id: 'infra', label: 'Infrastructure', icon: '☁️' },
  { id: 'observability', label: 'Observability', icon: '📊' },
  { id: 'security', label: 'Security', icon: '🔒' },
  { id: 'skills', label: 'Skills', icon: '🎯' },
];

export default function HomePage() {
  const [active, setActive] = useState('overview');
  const [auth, setAuth] = useState<SharedAuth | null>(null);
  const [authRestored, setAuthRestored] = useState(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem('ai-engineering-auth');
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && 'access_token' in parsed && 'refresh_token' in parsed &&
            typeof parsed.access_token === 'string' && typeof parsed.refresh_token === 'string') {
          setAuth({ access_token: parsed.access_token, refresh_token: parsed.refresh_token });
        } else {
          window.sessionStorage.removeItem('ai-engineering-auth');
        }
      }
    } catch {
      window.sessionStorage.removeItem('ai-engineering-auth');
    } finally {
      setAuthRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!authRestored) return;
    try {
      if (auth) window.sessionStorage.setItem('ai-engineering-auth', JSON.stringify(auth));
      else window.sessionStorage.removeItem('ai-engineering-auth');
    } catch {
      // Private browsing can disable session storage; in-memory login still works.
    }
  }, [auth, authRestored]);
  const [ragTelemetry, setRagTelemetry] = useState<{ step_timings_ms?: Record<string, number>; usage?: { model?: string; total_tokens?: number; estimated_cost_usd?: string | null }; verified?: boolean } | null>(null);

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 shrink-0 bg-[#11151C] border-r border-white/5 flex flex-col">
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-sm font-bold">
              AI
            </div>
            <div>
              <div className="font-semibold text-sm">AI Engineering</div>
              <div className="text-[11px] text-[#9AA3AE]">
                Cloud Platform
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 grid grid-cols-2 sm:grid-cols-3 md:block gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active === item.id
                  ? 'bg-white/10 text-white'
                  : 'text-[#9AA3AE] hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Development preview · unverified
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <header className="h-14 border-b border-white/5 flex items-center justify-between px-6 bg-[#0B0E13]/80 backdrop-blur">
          <h1 className="text-lg font-semibold capitalize">
            {active.replace('-', ' ')}
          </h1>

          <div className="flex items-center gap-4 text-sm text-[#9AA3AE]">
            <span>Portfolio preview</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500" />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {active === 'overview' && <OverviewView onNavigate={setActive} />}
          {active === 'agents' && authRestored && <AgentsView auth={auth} setAuth={setAuth} />}
          {active === 'rag' && authRestored && (
            <RagView onTelemetry={setRagTelemetry} auth={auth} setAuth={setAuth} />
          )}
          {active === 'mlops' && authRestored && (
            <MlopsView auth={auth} setAuth={setAuth} />
          )}
          {active === 'data' && (
            <DataEngineeringView />
          )}
          {active === 'devops' && (
            <DevOpsView />
          )}
          {active === 'infra' && (
            <InfrastructureView />
          )}
          {active === 'observability' && (
            <ObservabilityView telemetry={ragTelemetry} auth={auth} />
          )}
          {active === 'security' && (
            <SecurityView auth={auth} setAuth={setAuth} />
          )}
          {active === 'skills' && <SkillsView />}
        </main>
      </div>
    </div>
  );
}

function OverviewView({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [databaseStatus, setDatabaseStatus] = useState('Unknown');

  useEffect(() => {
    let active = true;
    async function checkBackend() {
      try {
        const live = await fetch('/backend/health/live', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!active) return;
        if (!live.ok) throw new Error(`HTTP ${live.status}`);
        setApiStatus('online');
      } catch {
        if (!active) return;
        setApiStatus('offline');
        setDatabaseStatus('Unavailable');
        return;
      }

      try {
        const ready = await fetch('/backend/health/ready', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!active) return;
        const data: HealthResponse = await ready.json();
        setDatabaseStatus(ready.ok && data.status === 'ready' && data.database === 'connected' ? 'Connected' : 'Not ready');
      } catch {
        if (active) setDatabaseStatus('Unavailable');
      }
    }

    void checkBackend();
    const interval = window.setInterval(() => void checkBackend(), 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const modules = [
    {
      title: 'AI Agent Orchestration',
      detail: 'Tool calling, workflow orchestration, guardrails',
      state: 'Implemented in repository · runtime unverified',
    },
    {
      title: 'RAG & Knowledge Retrieval',
      detail: 'Upload, chunking, indexing and retrieval API; evaluation not verified',
      state: 'Implemented in repository · runtime unverified',
    },
    {
      title: 'MLOps',
      detail: 'Registry, runs, metric summaries and threshold checks; drift monitoring pending',
      state: 'Implemented in repository · runtime unverified',
    },
    {
      title: 'Data Engineering · CSV Quality Profiler',
      detail: 'Live CSV upload, schema inspection, missing values, unique values and duplicate-row checks. Browser-only processing.',
      state: 'Implemented · Open Data Eng to run a local CSV analysis',
    },
    {
      title: 'Cloud & CI/CD',
      detail: 'GitHub Actions and Docker configs; Kubernetes / Terraform not verified',
      state: 'In progress · CI result unverified',
    },
    {
      title: 'Observability',
      detail: 'OpenTelemetry and Langfuse production traces',
      state: 'Unverified',
    },
    {
      title: 'Security & Access',
      detail: 'JWT authentication and RBAC implemented; production access tests pending',
      state: 'Implemented in repository · production unverified',
    },
    {
      title: 'FinOps',
      detail: 'Cloud spend based on provider billing APIs',
      state: 'Not connected',
    },
  ];

  const platformValue =
    apiStatus === 'checking'
      ? 'Checking...'
      : apiStatus === 'online'
        ? 'Online'
        : 'Offline';

  const platformDetail =
    apiStatus === 'online'
      ? `FastAPI reachable · PostgreSQL: ${databaseStatus}`
      : apiStatus === 'checking'
        ? 'Connecting to backend...'
        : 'FastAPI unreachable from this browser';

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 p-6">
        <span className="text-xs uppercase tracking-widest text-cyan-300">
          Tamas Nemeth · Engineering portfolio
        </span>

        <h2 className="text-3xl font-semibold mt-3">
          AI Engineering Cloud Platform
        </h2>

        <p className="text-[#B8C6D6] mt-3 leading-relaxed">
          Public frontend deployed on Vercel. Backend liveness and database readiness
          are checked separately. Agent, RAG and MLOps code exists in GitHub;
          production API integrations and monitoring remain unverified.
        </p>

        <a
          className="inline-block mt-4 text-cyan-300 underline"
          href="https://quantum-ai-showcase.vercel.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          View my Showcase
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Platform status"
          value={platformValue}
          detail={platformDetail}
          accent={apiStatus === 'online' ? 'emerald' : 'cyan'}
        />

        <MetricCard
          label="Live AI agents"
          value="Code available"
          detail={apiStatus === 'online' ? 'Backend reachable · agent requests not verified' : 'Agent API implemented · backend offline'}
          accent="violet"
        />

        <MetricCard
          label="Langfuse traces"
          value="Unverified"
          detail="No production export configured"
          accent="amber"
        />

        <MetricCard
          label="Authorization / RBAC"
          value="Implemented"
          detail="JWT/RBAC in code · production access unverified"
          accent="amber"
        />
      </div>

      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-5">
        <div className="text-xs uppercase tracking-widest text-cyan-300">New working module</div>
        <h3 className="mt-2 text-xl font-semibold">Data Engineering · CSV Quality Profiler</h3>
        <p className="mt-2 text-sm text-[#B8C6D6]">Analyze a real CSV in your browser: missing values, duplicate rows, column uniqueness and sample values. No backend upload required.</p>
        <button type="button" onClick={() => onNavigate('data')} className="mt-4 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-400">Open Data Engineering</button>
      </div>

      <h3 className="text-lg font-semibold">Engineering modules</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.map((module) => (
          <Card key={module.title} title={module.title}>
            <p className="text-[#9AA3AE] text-sm min-h-10">
              {module.detail}
            </p>
            <div className="mt-3 text-amber-300 text-xs">
              {module.state}
            </div>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">
        Verification policy: only successful real tests and authenticated
        integrations can change a module to Verified. Demo data is never
        presented as production telemetry.
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  const accents: Record<string, string> = {
    emerald: 'border-emerald-500/30 bg-emerald-500/5',
    cyan: 'border-cyan-500/30 bg-cyan-500/5',
    violet: 'border-violet-500/30 bg-violet-500/5',
    amber: 'border-amber-500/30 bg-amber-500/5',
  };

  return (
    <div className={`rounded-xl border p-4 ${accents[accent]}`}>
      <div className="text-xs text-[#9AA3AE]">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="text-[11px] text-[#9AA3AE] mt-1">{detail}</div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#11151C] p-4">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      {children}
    </div>
  );
}

function MiniChart({ color }: { color: string }) {
  const bars = [45, 62, 48, 78, 55, 68, 52];
  const bg = color === 'cyan' ? 'bg-cyan-400/70' : 'bg-violet-400/70';

  return (
    <div className="h-32 flex items-end gap-1.5 px-1">
      {bars.map((height, index) => (
        <div
          key={index}
          className={`flex-1 ${bg} rounded-t-sm`}
          style={{ height: `${height}%` }}
        />
      ))}
    </div>
  );
}

function Placeholder({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[#11151C] p-8 text-center max-w-2xl">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="text-[#9AA3AE] mt-2">
        This module will be implemented in {phase}.
      </p>
      <p className="text-xs text-[#9AA3AE] mt-4">
        No fake metrics are shown. Integration status: Not Connected
      </p>
    </div>
  );
}

function SkillsView() {
  const skills = [
    { name: 'Python Backend', status: 'In Progress', phase: 'Phase 1' },
    { name: 'Cloud Engineering (Azure)', status: 'Planned', phase: 'Phase 5' },
    { name: 'Docker / Kubernetes', status: 'Planned', phase: 'Phase 2 / 6' },
    { name: 'CI/CD', status: 'Planned', phase: 'Phase 2' },
    { name: 'AI Agent Development', status: 'Planned', phase: 'Phase 3' },
    { name: 'RAG Engineering', status: 'Planned', phase: 'Phase 3' },
    { name: 'MLOps', status: 'Planned', phase: 'Phase 4' },
    { name: 'Testing & Security', status: 'In Progress', phase: 'Phase 1–2' },
  ];

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-[#9AA3AE]">
        Competencies tracked by completed technical tasks and verified tests,
        not invented percentages.
      </p>

      <div className="rounded-xl border border-white/5 bg-[#11151C] divide-y divide-white/5">
        {skills.map((skill) => (
          <div
            key={skill.name}
            className="flex items-center justify-between px-4 py-3 text-sm"
          >
            <div>
              <div className="font-medium">{skill.name}</div>
              <div className="text-xs text-[#9AA3AE]">
                {skill.phase}
              </div>
            </div>

            <span
              className={`text-xs px-2 py-0.5 rounded ${
                skill.status === 'In Progress'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-white/5 text-[#9AA3AE]'
              }`}
            >
              {skill.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
type AgentRunMonitor = { id: string; task: string; status: string; duration_ms: number; created_at: string; step_timings: Record<string, number> };
function ObservabilityView({ telemetry, auth }: { telemetry: { step_timings_ms?: Record<string, number>; usage?: { model?: string; total_tokens?: number; estimated_cost_usd?: string | null }; verified?: boolean } | null; auth: SharedAuth | null }) {
  const [agentRuns, setAgentRuns] = useState<AgentRunMonitor[]>([]);
  const [monitorStatus, setMonitorStatus] = useState('Bejelentkezés szükséges az Agent Monitoring előzményekhez.');
  useEffect(() => {
    if (!auth) { setAgentRuns([]); setMonitorStatus('Bejelentkezés szükséges az Agent Monitoring előzményekhez.'); return; }
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`${API_URL}/agents/workflow/runs`, { headers: { Authorization: `Bearer ${auth!.access_token}` }, cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as AgentRunMonitor[];
        if (!cancelled) { setAgentRuns(data); setMonitorStatus(data.length ? '' : 'Még nincs mentett Agent workflow futás.'); }
      } catch (error) {
        if (!cancelled) setMonitorStatus(error instanceof Error ? `Agent Monitoring nem elérhető: ${error.message}` : 'Agent Monitoring nem elérhető.');
      }
    }
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [auth]);
  const steps = ['planner', 'retriever', 'synthesizer', 'reviewer'];
  return <section className="max-w-5xl space-y-5">
    <div className="rounded-xl border border-cyan-500/20 bg-white/5 p-5"><h2 className="text-xl font-semibold">Multi-Agent RAG Observability</h2><p className="mt-2 text-sm text-slate-400">A legutóbbi RAG-kérdés valós LangGraph futási adatai ebben a böngészőmunkamenetben. Nincs szimulált telemetria.</p></div>
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
      <h3 className="font-semibold">Agent Monitoring · mentett workflow futások</h3>
      <p className="text-xs text-slate-400">Valós, felhasználóhoz kötött PostgreSQL futási előzmények · automatikus frissítés 30 másodpercenként.</p>
      {monitorStatus && <p className="text-sm text-amber-200">{monitorStatus}</p>}
      {agentRuns.length > 0 && <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-white/5 p-3"><p className="text-xs text-slate-400">Futások</p><strong>{agentRuns.length}</strong></div>
          <div className="rounded-lg bg-white/5 p-3"><p className="text-xs text-slate-400">Sikeres</p><strong>{agentRuns.filter(r => r.status === 'success').length}</strong></div>
          <div className="rounded-lg bg-white/5 p-3"><p className="text-xs text-slate-400">Átlagos idő</p><strong>{(agentRuns.reduce((n, r) => n + r.duration_ms, 0) / agentRuns.length).toFixed(0)} ms</strong></div>
        </div>
        <details className="rounded-lg border border-white/10 p-3">
          <summary className="cursor-pointer text-sm text-cyan-300">Workflow előzmények ({agentRuns.length})</summary>
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {agentRuns.map(run => <div key={run.id} className="rounded border border-white/10 p-2 text-xs">
              <p className="font-medium">{run.status} · {run.duration_ms.toFixed(0)} ms · {new Date(run.created_at).toLocaleString('hu-HU')}</p>
              <p className="mt-1 break-words text-slate-400">{run.task}</p>
              <p className="mt-1 text-slate-400">{Object.entries(run.step_timings || {}).map(([name, ms]) => `${name}: ${ms.toFixed(0)} ms`).join(' · ')}</p>
            </div>)}
          </div>
        </details>
      </>}
    </div>
    {!telemetry?.step_timings_ms ? <div className="rounded-xl border border-amber-500/20 p-5 text-amber-200">Még nincs mért futás ebben a munkamenetben. Menj a RAG oldalra, jelentkezz be, és tegyél fel egy kérdést a feltöltött PDF-ről.</div> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{steps.map(step => <div key={step} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-sm capitalize text-slate-300">{step}</p><p className="mt-2 text-2xl font-semibold">{telemetry.step_timings_ms?.[step] == null ? 'Nincs adat' : `${telemetry.step_timings_ms[step].toFixed(1)} ms`}</p></div>)}</div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2"><h3 className="font-semibold">Legutóbbi kérdés összesítése</h3><p>Forrásellenőrzés: {telemetry.verified ? 'Sikeres' : 'Nem igazolt'}</p><p>LLM modell: {telemetry.usage?.model ?? 'Nem jelentett'}</p><p>LLM tokenek: {telemetry.usage?.total_tokens ?? 'Nem jelentett'}</p><p>Becsült LLM költség: {telemetry.usage?.estimated_cost_usd == null ? 'Nincs konfigurálva' : `$${telemetry.usage.estimated_cost_usd}`}</p><p className="text-xs text-slate-400">A tokenköltség nem tartalmazza automatikusan az embedding és infrastruktúra költségeit. Az adatok oldalfrissítéskor elvesznek.</p></div>
    </>}
  </section>;
}

function DevOpsView() {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [database, setDatabase] = useState('Checking...');
  const [checkedAt, setCheckedAt] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      setStatus('checking');
      try {
        const live = await fetch('/backend/health/live', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!live.ok) throw new Error('Backend unavailable');
        if (cancelled) return;
        setStatus('online');
        try {
          const ready = await fetch('/backend/health/ready', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
          const result = await ready.json() as HealthResponse;
          if (!cancelled) setDatabase(ready.ok && result.status === 'ready' && result.database === 'connected' ? 'Connected' : 'Not ready');
        } catch {
          if (!cancelled) setDatabase('Unavailable');
        }
      } catch {
        if (!cancelled) { setStatus('offline'); setDatabase('Unavailable'); }
      } finally {
        if (!cancelled) setCheckedAt(new Date().toLocaleTimeString());
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [refresh]);

  return (
    <section className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">DevOps & CI/CD</h2><p className="text-sm text-slate-400">Valós idejű backend- és adatbázis-ellenőrzés; CI/CD állapot a szolgáltatóknál.</p></div>
        <button type="button" onClick={() => setRefresh(n => n + 1)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200">Állapot frissítése</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">FastAPI / Render</h3><p className="mt-2 text-xl font-semibold" role="status">{status === 'checking' ? 'Checking...' : status === 'online' ? 'Online' : 'Offline / unreachable'}</p><p className="mt-2 text-xs text-slate-400">/backend/health/live</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">PostgreSQL readiness</h3><p className="mt-2 text-xl font-semibold" role="status">{database}</p><p className="mt-2 text-xs text-slate-400">/backend/health/ready</p></div>
      </div>
      <p className="text-xs text-slate-400">{checkedAt ? `Utolsó ellenőrzés: ${checkedAt}` : 'Ellenőrzés folyamatban'}. A hálózati hiba nem bizonyítja, hogy a szolgáltatás leállt.</p>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h3 className="font-semibold">CI/CD és deployment</h3>
        <p className="text-sm text-slate-400">A GitHub Actions és Vercel aktuális buildállapotát a szolgáltatók saját felülete mutatja. Itt nem jelenítünk meg nem ellenőrzött sikeres státuszt.</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a className="text-cyan-300 underline" href="https://github.com/Tamas22-cell/ai-engineering-cloud-platform/actions" target="_blank" rel="noopener noreferrer">GitHub Actions</a>
          <a className="text-cyan-300 underline" href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Vercel deployments</a>
          <a className="text-cyan-300 underline" href="https://dashboard.render.com/" target="_blank" rel="noopener noreferrer">Render dashboard</a>
        </div>
      </div>
    </section>
  );
}

function InfrastructureView() {
  const [api, setApi] = useState<'checking' | 'online' | 'unreachable'>('checking');
  const [db, setDb] = useState('Checking...');
  const [checkedAt, setCheckedAt] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      setApi('checking');
      setDb('Checking...');
      try {
        const live = await fetch('/backend/health/live', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!live.ok) throw new Error('Backend health check failed');
        if (cancelled) return;
        setApi('online');
        try {
          const ready = await fetch('/backend/health/ready', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
          const result = await ready.json() as HealthResponse;
          if (!cancelled) setDb(ready.ok && result.status === 'ready' && result.database === 'connected' ? 'Connected' : 'Not ready');
        } catch {
          if (!cancelled) setDb('Unavailable');
        }
      } catch {
        if (!cancelled) { setApi('unreachable'); setDb('Unavailable'); }
      } finally {
        if (!cancelled) setCheckedAt(new Date().toLocaleTimeString());
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [refresh]);

  return (
    <section className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Cloud Infrastructure</h2><p className="text-sm text-slate-400">Ellenőrizhető szolgáltatásállapotok, biztonságosan, publikus health endpointokon keresztül.</p></div>
        <button type="button" onClick={() => setRefresh(n => n + 1)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200">Állapot frissítése</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">Vercel / Frontend</h3><p className="mt-2 text-xl font-semibold">Page loaded</p><p className="mt-2 text-xs text-slate-400">Ez csak az aktuális oldal betöltését igazolja, nem a deployment státuszát.</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">Render / FastAPI</h3><p className="mt-2 text-xl font-semibold" role="status">{api === 'checking' ? 'Checking...' : api === 'online' ? 'Online' : 'Unreachable'}</p><p className="mt-2 text-xs text-slate-400">/backend/health/live</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">PostgreSQL</h3><p className="mt-2 text-xl font-semibold" role="status">{db}</p><p className="mt-2 text-xs text-slate-400">/backend/health/ready</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">Redis</h3><p className="mt-2 text-xl font-semibold">Not verified</p><p className="mt-2 text-xs text-slate-400">Nincs publikus Redis readiness ellenőrzés. A szolgáltatás állapotát nem találgatjuk.</p></div>
      </div>
      <p className="text-xs text-slate-400">{checkedAt ? `Utolsó ellenőrzés: ${checkedAt}` : 'Ellenőrzés folyamatban'}. A hálózati hiba önmagában nem bizonyítja a leállást.</p>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h3 className="font-semibold">Szolgáltatói vezérlőpultok</h3>
        <p className="text-sm text-slate-400">Deployment állapot és infrastruktúra-beállítások a szolgáltatóknál ellenőrizhetők. Titkos API-kulcsokat nem helyezünk a böngészőbe.</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <a className="text-cyan-300 underline" href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Vercel</a>
          <a className="text-cyan-300 underline" href="https://dashboard.render.com/web/srv-dbi7tqafngtc73ciacu0" target="_blank" rel="noopener noreferrer">Render API</a>
          <a className="text-cyan-300 underline" href="https://dashboard.render.com/" target="_blank" rel="noopener noreferrer">Render databases</a>
        </div>
      </div>
    </section>
  );
}

type SecurityAccount = { id: string; email: string; role: string; is_active: boolean };

function SecurityView({ auth, setAuth }: { auth: SharedAuth | null; setAuth: (value: SharedAuth | null) => void }) {
  const [account, setAccount] = useState<SecurityAccount | null>(null);
  const [state, setState] = useState<'loading' | 'signed-out' | 'verified' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [publicHealth, setPublicHealth] = useState('Checking...');

  useEffect(() => {
    let cancelled = false;
    setPublicHealth('Checking...');
    async function check() {
      try {
        const res = await fetch('/backend/health/live', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!cancelled) setPublicHealth(res.ok ? 'Online' : 'Unreachable');
      } catch {
        if (!cancelled) setPublicHealth('Unreachable');
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    if (!auth) { setAccount(null); setState('signed-out'); return; }
    const initialAuth = auth;
    async function load() {
      setState('loading');
      setMessage('');
      try {
        let current = initialAuth;
        let res = await fetch('/backend/auth/me', { headers: { Authorization: `Bearer ${current.access_token}` }, cache: 'no-store' });
        if (res.status === 401 && current.refresh_token) {
          const rotated = await fetch('/backend/auth/refresh', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: current.refresh_token }),
          });
          if (rotated.ok) {
            const tokens = await rotated.json() as SharedAuth;
            current = tokens;
            if (!cancelled) setAuth(tokens);
            res = await fetch('/backend/auth/me', { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store' });
          } else if (rotated.status === 401) {
            if (!cancelled) { setAuth(null); setAccount(null); setState('signed-out'); }
            return;
          } else {
            throw new Error('Session refresh unavailable');
          }
        }
        if (res.status === 401) {
          if (!cancelled) { setAuth(null); setAccount(null); setState('signed-out'); }
          return;
        }
        if (!res.ok) throw new Error(`Account verification failed (HTTP ${res.status})`);
        const user = await res.json() as SecurityAccount;
        if (!cancelled) { setAccount(user); setState('verified'); }
      } catch (err) {
        if (!cancelled) { setAccount(null); setState('error'); setMessage(err instanceof Error ? err.message : 'Network error'); }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [auth, refresh, setAuth]);

  return (
    <section className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">Security & Access</h2><p className="text-sm text-slate-400">Publikus rendszerállapot bejelentkezés nélkül; személyes jogosultságok csak hitelesítve.</p></div>
        <button type="button" onClick={() => setRefresh(n => n + 1)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200">Újraellenőrzés</button>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">Public backend health</h3><p className="mt-2 text-xl font-semibold" role="status">{publicHealth}</p><p className="mt-2 text-xs text-slate-400">/backend/health/live – ez nem JWT/RBAC biztonsági teszt.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm text-slate-400">Authentication / JWT</h3>
          <p className="mt-2 text-xl font-semibold" role="status">{state === 'loading' ? 'Checking...' : state === 'verified' ? 'Verified' : state === 'signed-out' ? 'Optional account check' : 'Verification unavailable'}</p>
          <p className="mt-2 text-xs text-slate-400">A fiók hitelesítése a /backend/auth/me API-val történik, nem a token böngészős dekódolásával.</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5">
          <h3 className="text-sm text-slate-400">Role-based access (RBAC)</h3>
          <p className="mt-2 text-xl font-semibold">{account ? account.role : 'Login required for role'}</p>
          <p className="mt-2 text-xs text-slate-400">A szerepkört a backend adja vissza. A jogosultságokat a backend érvényesíti.</p>
        </div>
      </div>
      {account && <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2"><h3 className="font-semibold">Authenticated account</h3><p className="text-sm text-slate-300">Email: {account.email}</p><p className="text-sm text-slate-300">Account: {account.is_active ? 'Active' : 'Disabled'}</p></div>}
      {state === 'signed-out' && <p className="text-sm text-amber-200">A publikus státusz bejelentkezés nélkül működik. A saját szerepkör ellenőrzéséhez opcionálisan jelentkezz be.</p>}
      {state === 'error' && <p className="text-sm text-amber-200">{message}. Ez nem bizonyítja, hogy a fiók érvénytelen.</p>}
      <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="font-semibold">Security scope</h3><p className="mt-2 text-sm text-slate-400">A felület nem jelenít meg jelszót, hozzáférési tokent vagy refresh tokent. Auditnaplók, MFA és penetrációs tesztek állapota itt még nincs ellenőrizve.</p></div>
    </section>
  );
}
