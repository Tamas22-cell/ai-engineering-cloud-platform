'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import RagView from './RagView';
import AgentsView from './AgentsView';

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
          {active === 'overview' && <OverviewView />}
          {active === 'agents' && <AgentsView />}
          {active === 'rag' && (
            <RagView />
          )}
          {active === 'mlops' && (
            <Placeholder title="MLOps & Model Registry" phase="Phase 4" />
          )}
          {active === 'data' && (
            <Placeholder title="Data Engineering" phase="Phase 4" />
          )}
          {active === 'devops' && (
            <Placeholder title="DevOps & CI/CD" phase="Phase 2 / 5" />
          )}
          {active === 'infra' && (
            <Placeholder title="Cloud Infrastructure" phase="Phase 5" />
          )}
          {active === 'observability' && (
            <Placeholder title="Observability" phase="Phase 5" />
          )}
          {active === 'security' && (
            <Placeholder title="Security Dashboard" phase="Phase 1 / 5" />
          )}
          {active === 'skills' && <SkillsView />}
        </main>
      </div>
    </div>
  );
}

function OverviewView() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [databaseStatus, setDatabaseStatus] = useState('Unknown');

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackend() {
      try {
        const response = await fetch(`${API_URL}/health/ready`, {
          signal: controller.signal,
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: HealthResponse = await response.json();

        if (data.status === 'ready' && data.database === 'connected') {
          setApiStatus('online');
          setDatabaseStatus('Connected');
        } else {
          setApiStatus('offline');
          setDatabaseStatus(data.database ?? 'Unknown');
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        console.error('Backend health check failed:', error);
        setApiStatus('offline');
        setDatabaseStatus('Unavailable');
      }
    }

    void checkBackend();

    const interval = window.setInterval(() => {
      void checkBackend();
    }, 15000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  const modules = [
    {
      title: 'AI Agent Orchestration',
      detail: 'Tool calling, workflow orchestration, guardrails',
      state: 'Planned',
    },
    {
      title: 'RAG & Knowledge Retrieval',
      detail: 'Ingestion, embeddings, citations, evaluation',
      state: 'Planned',
    },
    {
      title: 'MLOps',
      detail: 'Model registry, experiment tracking, drift monitoring',
      state: 'Local prototype',
    },
    {
      title: 'Data Pipelines',
      detail: 'ETL, quality checks, batch ingestion',
      state: 'Planned',
    },
    {
      title: 'Cloud & CI/CD',
      detail: 'GitHub Actions, Docker, Kubernetes, Terraform',
      state: 'In progress',
    },
    {
      title: 'Observability',
      detail: 'OpenTelemetry and Langfuse production traces',
      state: 'Unverified',
    },
    {
      title: 'Security & Access',
      detail: 'Authentication, RBAC, least privilege',
      state: 'Unverified',
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
      ? `FastAPI · PostgreSQL ${databaseStatus}`
      : apiStatus === 'checking'
        ? 'Connecting to backend...'
        : 'Backend unavailable or database not ready';

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
          Public development preview. Local FastAPI and database health
          are checked live when available. AI agents, production metrics,
          cloud credentials and monitoring are not yet connected.
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
          value="Not linked"
          detail="Requires agent runtime and API setup"
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
          value="Unverified"
          detail="No production access tests"
          accent="amber"
        />
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