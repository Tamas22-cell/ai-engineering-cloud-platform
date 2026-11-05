'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import RagView from './RagView';
import AgentsView from './AgentsView';
import MlopsView from './MlopsView';
import LiveApiObservability from './LiveApiObservability';
import DataEngineeringView from './DataEngineeringView';
import FinOpsView from './FinOpsView';

type SharedAuth = { access_token: string; refresh_token: string };

type ApiStatus = 'checking' | 'online' | 'offline';

type HealthResponse = {
  status: string;
  database?: string;
};

type IntegrationHealth = { redis: 'connected' | 'disconnected'; langfuse: 'configured' | 'not_configured' };

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
  { id: 'finops', label: 'FinOps', icon: '💰' },
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
            Production frontend · live checks by module
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
            <span>AI Engineering workspace</span>
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
          {active === 'skills' && <SkillsView onNavigate={setActive} />}
        </main>
      </div>
    </div>
  );
}

function OverviewView({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [databaseStatus, setDatabaseStatus] = useState('Unknown');
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationHealth | null>(null);

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

      try {
        const integrations = await fetch('/backend/health/integrations', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
        if (!integrations.ok) throw new Error(`HTTP ${integrations.status}`);
        const result = await integrations.json() as IntegrationHealth;
        if (active) setIntegrationStatus(result);
      } catch {
        if (active) setIntegrationStatus(null);
      }
    }

    void checkBackend();
    const interval = window.setInterval(() => void checkBackend(), 15000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  const modules = [
    {
      title: 'AI Agent Orchestration',
      detail: 'Authenticated chat modes and saved workflow runs; availability is shown in Agents.',
      state: 'Available in Agents · sign-in required',
    },
    {
      title: 'RAG & Knowledge Retrieval',
      detail: 'PDF upload, indexing and source-linked retrieval; account required.',
      state: 'Available in RAG · sign-in required',
    },
    {
      title: 'MLOps',
      detail: 'Synthetic training, verified artifact versions, active inference, rollback preflight and aggregate input-drift signals.',
      state: 'Available in MLOps · activation admin-only',
    },
    {
      title: 'Data Engineering · CSV Quality Profiler',
      detail: 'Live CSV upload, schema inspection, missing values, unique values and duplicate-row checks. Browser-only processing.',
      state: 'Implemented · Open Data Eng to run a local CSV analysis',
    },
    {
      title: 'Cloud & CI/CD',
      detail: 'Live GitHub Actions runs; Kubernetes / Terraform not verified.',
      state: 'Partly connected · open DevOps for current runs',
    },
    {
      title: 'Observability',
      detail: 'RAG timings and saved Agent runs; Langfuse OTLP export is configured with an authenticated delivery probe.',
      state: 'FastAPI request spans · Langfuse export state in Observability',
    },
    {
      title: 'Security & Access',
      detail: 'JWT authentication and backend-enforced viewer, developer and admin roles; security review still pending.',
      state: 'JWT/RBAC implemented · privileged actions role-gated',
    },
    {
      title: 'FinOps',
      detail: 'Per-user measured RAG token usage and optional cost estimate; provider cloud billing is not connected.',
      state: 'Available in FinOps · sign-in required',
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
          Live engineering workspace
        </span>

        <h2 className="text-3xl font-semibold mt-3">
          AI Engineering Cloud Platform
        </h2>

        <p className="text-[#B8C6D6] mt-3 leading-relaxed">
          Use this workspace for agent workflows, private PDF RAG, model training and versioning, and CSV quality analysis. Each module shows its own API and account status; sample data is never presented as production telemetry.
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
          value={integrationStatus ? integrationStatus.langfuse === 'configured' ? 'Configured' : 'Not configured' : 'Checking...'}
          detail={integrationStatus?.langfuse === 'configured' ? 'FastAPI OTLP export enabled · trace delivery not yet confirmed' : 'Live integration health is checked by the backend'}
          accent={integrationStatus?.langfuse === 'configured' ? 'cyan' : 'amber'}
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

function SkillsView({ onNavigate }: { onNavigate: (page: string) => void }) {
  const skills = [
    { name: 'Python Backend', detail: 'FastAPI szolgáltatás, hitelesítés és valós health ellenőrzés.', status: 'API állapot élő', page: 'overview' },
    { name: 'Cloud Infrastructure', detail: 'Vercel frontend, Render API és PostgreSQL állapotellenőrzés.', status: 'Részben összekötve', page: 'infra' },
    { name: 'Docker / Kubernetes', detail: 'Docker konfiguráció elérhető; Kubernetes állapot nincs igazolva.', status: 'Részben kész', page: 'devops' },
    { name: 'CI/CD', detail: 'GitHub Actions legutóbbi futásai közvetlenül megjelennek.', status: 'Élő futások', page: 'devops' },
    { name: 'AI Agent Development', detail: 'Agent chat és mentett workflow előzmények.', status: 'Bejelentkezés kell', page: 'agents' },
    { name: 'RAG Engineering', detail: 'PDF feltöltés, indexelés, kérdezés és forráshivatkozás.', status: 'Bejelentkezés kell', page: 'rag' },
    { name: 'MLOps', detail: 'Tanítás, artifact-verziók, aktív predikció és ellenőrzött visszaállítás.', status: 'Admin aktiválás', page: 'mlops' },
    { name: 'Security & Access', detail: 'JWT-fiók és backend által visszaadott szerepkör; mély audit külön feladat.', status: 'Részben kész', page: 'security' },
  ];

  return (
    <section className="max-w-4xl space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Platform funkciók és készültség</h2>
        <p className="mt-1 text-sm text-[#9AA3AE]">A lista a jelenlegi alkalmazás funkcióit mutatja. A bejelentkezéshez vagy külső szolgáltatáshoz kötött részeket külön jelöljük.</p>
      </div>
      <div className="rounded-xl border border-white/5 bg-[#11151C] divide-y divide-white/5">
        {skills.map(skill => (
          <div key={skill.name} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="font-medium">{skill.name}</div>
              <div className="mt-1 text-xs text-[#9AA3AE]">{skill.detail}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded ${skill.status === 'Élő futások' || skill.status === 'API állapot élő' ? 'bg-emerald-500/15 text-emerald-300' : skill.status === 'Bejelentkezés kell' || skill.status === 'Admin aktiválás' ? 'bg-cyan-500/15 text-cyan-200' : 'bg-amber-500/15 text-amber-300'}`}>{skill.status}</span>
              <button type="button" onClick={() => onNavigate(skill.page)} className="rounded border border-white/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5">Megnyitás</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
type AgentRunMonitor = { id: string; task: string; status: string; duration_ms: number; created_at: string; step_timings: Record<string, number> };
function ObservabilityView({ telemetry, auth }: { telemetry: { step_timings_ms?: Record<string, number>; usage?: { model?: string; total_tokens?: number; estimated_cost_usd?: string | null }; verified?: boolean } | null; auth: SharedAuth | null }) {
  const [agentRuns, setAgentRuns] = useState<AgentRunMonitor[]>([]);
  const [monitorStatus, setMonitorStatus] = useState('Bejelentkezés szükséges az Agent Monitoring előzményekhez.');
  const [traceExportStatus, setTraceExportStatus] = useState('Checking...');
  const [traceProbeBusy, setTraceProbeBusy] = useState(false);
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
  useEffect(() => {
    let cancelled = false;
    async function checkTraceExport() {
      try {
        const response = await fetch('/backend/health/integrations', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as IntegrationHealth;
        if (!cancelled) setTraceExportStatus(data.langfuse === 'configured' ? 'Kulcsok konfigurálva · fogadás még nem igazolt' : 'Nincs konfigurálva');
      } catch {
        if (!cancelled) setTraceExportStatus('Állapot nem kérdezhető le');
      }
    }
    void checkTraceExport();
    return () => { cancelled = true; };
  }, []);
  async function verifyLangfuseDelivery() {
    if (!auth || traceProbeBusy) return;
    setTraceProbeBusy(true);
    try {
      const response = await fetch('/backend/health/integrations/langfuse-probe', {
        method: 'POST',
        headers: { Authorization: `Bearer ${auth.access_token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json() as { status?: string; checked_at?: string; detail?: string };
      if (!response.ok) {
        const message = response.status === 401 ? 'A munkamenet lejárt · jelentkezz be újra'
          : response.status === 403 ? 'Admin vagy developer szerepkör szükséges'
          : result.detail ?? `Langfuse-próba sikertelen (HTTP ${response.status})`;
        setTraceExportStatus(message);
        return;
      }
      setTraceExportStatus(result.status === 'delivered'
        ? `Tesztspan fogadva · ${result.checked_at ? new Date(result.checked_at).toLocaleTimeString('hu-HU') : 'most'}`
        : 'A Langfuse nem igazolta vissza a tesztspant');
    } catch {
      setTraceExportStatus('A Langfuse-próba nem érte el az API-t');
    } finally {
      setTraceProbeBusy(false);
    }
  }

  const steps = ['planner', 'retriever', 'synthesizer', 'reviewer'];
  return <section className="max-w-5xl space-y-5">
    <div className="rounded-xl border border-cyan-500/20 bg-white/5 p-5"><h2 className="text-xl font-semibold">Multi-Agent RAG Observability</h2><p className="mt-2 text-sm text-slate-400">A legutóbbi RAG-kérdés valós LangGraph futási adatai ebben a böngészőmunkamenetben. Nincs szimulált telemetria.</p></div>
    <LiveApiObservability />
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <h3 className="font-semibold">Langfuse trace export</h3>
      <p className="mt-2 text-sm text-cyan-200" role="status">{traceExportStatus}</p>
      <p className="mt-1 text-xs text-slate-400">A próba kizárólag technikai span-t küld; kérdés-, token- és dokumentumszöveg nem kerül bele.</p>
      {auth ? <button type="button" onClick={() => void verifyLangfuseDelivery()} disabled={traceProbeBusy} className="mt-3 rounded border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200 disabled:opacity-50">{traceProbeBusy ? 'Tesztspan küldése…' : 'Langfuse-fogadás ellenőrzése'}</button> : <p className="mt-3 text-xs text-amber-200">A próba indításához jelentkezz be admin vagy developer fiókkal.</p>}
    </div>
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
  const [integrations, setIntegrations] = useState<IntegrationHealth | null>(null);
  const [checkedAt, setCheckedAt] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [ciRuns, setCiRuns] = useState<CiRun[]>([]);
  const [ciStatus, setCiStatus] = useState<'loading' | 'available' | 'unavailable'>('loading');

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
        try {
          const response = await fetch('/backend/health/integrations', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error('Integration health unavailable');
          const result = await response.json() as IntegrationHealth;
          if (!cancelled) setIntegrations(result);
        } catch {
          if (!cancelled) setIntegrations(null);
        }
      } catch {
        if (!cancelled) { setStatus('offline'); setDatabase('Unavailable'); setIntegrations(null); }
      } finally {
        if (!cancelled) setCheckedAt(new Date().toLocaleTimeString());
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    setCiStatus('loading');
    async function loadCiRuns() {
      try {
        const response = await fetch('https://api.github.com/repos/Tamas22-cell/ai-engineering-cloud-platform/actions/runs?per_page=5', {
          headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
          cache: 'no-store',
          signal: AbortSignal.timeout(12000),
        });
        if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
        const data = await response.json() as CiRunsResponse;
        if (!cancelled) { setCiRuns(data.workflow_runs ?? []); setCiStatus('available'); }
      } catch {
        if (!cancelled) { setCiRuns([]); setCiStatus('unavailable'); }
      }
    }
    void loadCiRuns();
    return () => { cancelled = true; };
  }, [refresh]);

  return (
    <section className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-semibold">DevOps & CI/CD</h2><p className="text-sm text-slate-400">Valós idejű backend- és adatbázis-ellenőrzés; CI/CD állapot a szolgáltatóknál.</p></div>
        <button type="button" onClick={() => setRefresh(n => n + 1)} className="rounded-lg border border-cyan-400/40 px-3 py-2 text-sm text-cyan-200">Állapot frissítése</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">FastAPI / Render</h3><p className="mt-2 text-xl font-semibold" role="status">{status === 'checking' ? 'Checking...' : status === 'online' ? 'Online' : 'Offline / unreachable'}</p><p className="mt-2 text-xs text-slate-400">/backend/health/live</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">PostgreSQL readiness</h3><p className="mt-2 text-xl font-semibold" role="status">{database}</p><p className="mt-2 text-xs text-slate-400">/backend/health/ready</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">Redis</h3><p className="mt-2 text-xl font-semibold" role="status">{integrations ? integrations.redis === 'connected' ? 'Connected' : 'Disconnected' : status === 'offline' ? 'Unavailable' : 'Checking...'}</p><p className="mt-2 text-xs text-slate-400">/backend/health/integrations · live ping</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">Langfuse</h3><p className="mt-2 text-xl font-semibold" role="status">{integrations ? integrations.langfuse === 'configured' ? 'Configured' : 'Not configured' : status === 'offline' ? 'Unavailable' : 'Checking...'}</p><p className="mt-2 text-xs text-slate-400">Kulcsok beállítva; trace-kézbesítés külön ellenőrzendő.</p></div>
      </div>
      <p className="text-xs text-slate-400">{checkedAt ? `Utolsó ellenőrzés: ${checkedAt}` : 'Ellenőrzés folyamatban'}. A hálózati hiba nem bizonyítja, hogy a szolgáltatás leállt.</p>
      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">GitHub Actions · legutóbbi buildfutások</h3>
          <a className="text-sm text-cyan-300 underline" href="https://github.com/Tamas22-cell/ai-engineering-cloud-platform/actions" target="_blank" rel="noopener noreferrer">Összes futás megnyitása</a>
        </div>
        <p className="text-xs text-slate-400" role="status">{ciStatus === 'loading' ? 'CI-állapot betöltése…' : ciStatus === 'available' ? 'GitHubtól lekért, valós workflow-adatok.' : 'A GitHub Actions állapota most nem kérdezhető le.'}</p>
        {ciRuns.length > 0 && <div className="divide-y divide-white/10 rounded-lg border border-white/10">
          {ciRuns.map(run => {
            const label = run.status === 'completed' ? (run.conclusion === 'success' ? 'Sikeres' : run.conclusion === 'failure' ? 'Sikertelen' : run.conclusion ?? 'Befejeződött') : run.status === 'in_progress' ? 'Fut' : run.status;
            const tone = run.status !== 'completed' ? 'text-cyan-200' : run.conclusion === 'success' ? 'text-emerald-300' : 'text-amber-300';
            return <a key={run.id} href={run.html_url} target="_blank" rel="noopener noreferrer" className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-white/5">
              <span><span className="font-medium">{run.name}</span><span className="ml-2 text-xs text-slate-400">{run.head_sha.slice(0, 7)} · {new Date(run.created_at).toLocaleString('hu-HU')}</span></span>
              <span className={`text-xs ${tone}`}>{label}</span>
            </a>;
          })}
        </div>}
        {ciStatus === 'available' && ciRuns.length === 0 && <p className="text-sm text-slate-400">Még nincs megjeleníthető workflow-futás.</p>}
        <div className="flex flex-wrap gap-4 border-t border-white/10 pt-3 text-sm">
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
  const [redis, setRedis] = useState('Checking...');
  const [langfuse, setLangfuse] = useState('Checking...');
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
    async function checkIntegrations() {
      try {
        const response = await fetch('/backend/health/integrations', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json() as IntegrationHealth;
        if (!cancelled) {
          setRedis(data.redis === 'connected' ? 'Connected' : 'Disconnected');
          setLangfuse(data.langfuse === 'configured' ? 'Keys configured · export not verified' : 'Not configured');
        }
      } catch {
        if (!cancelled) { setRedis('Unavailable'); setLangfuse('Status unavailable'); }
      }
    }
    void check();
    void checkIntegrations();
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
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">Redis</h3><p className="mt-2 text-xl font-semibold" role="status">{redis}</p><p className="mt-2 text-xs text-slate-400">Valós PING a backendből; a kapcsolati adatok nem kerülnek a böngészőbe.</p></div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-5"><h3 className="text-sm text-slate-400">Langfuse exporter</h3><p className="mt-2 text-xl font-semibold" role="status">{langfuse}</p><p className="mt-2 text-xs text-slate-400">A kulcsok megléte konfigurációt jelez, nem bizonyítja a trace-ek fogadását.</p></div>
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
type CiRun = { id: number; name: string; status: string; conclusion: string | null; html_url: string; head_sha: string; created_at: string };
type CiRunsResponse = { workflow_runs?: CiRun[] };

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
