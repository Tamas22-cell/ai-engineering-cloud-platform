'use client';

import { useEffect, useState, type FormEvent, type Dispatch, type SetStateAction } from 'react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
type ChatResponse = { response: string; thread_id?: string; plan?: string; execution?: string; review?: string; duration_ms?: number; step_timings_ms?: Record<string, number> };
type WorkflowRun = { id: string; thread_id: string; task: string; status: string; duration_ms: number; created_at: string; step_timings: Record<string, number> };
type AuthResponse = { access_token: string; refresh_token: string };
type AgentMode = 'demo' | 'llm' | 'tools' | 'workflow';

export default function AgentsView({ auth, setAuth }: { auth: AuthResponse | null; setAuth: Dispatch<SetStateAction<AuthResponse | null>> }) {
  const [mode, setMode] = useState<AgentMode>('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [workflow, setWorkflow] = useState<ChatResponse | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [runsError, setRunsError] = useState('');
  const [runsRefresh, setRunsRefresh] = useState(0);
  const [runFilter, setRunFilter] = useState('all');

  useEffect(() => {
    // The backend scopes saved history by authenticated user ID.
    const saved = window.localStorage.getItem('ai-platform-agent-workflow-thread');
    if (saved && /^[0-9a-f-]{36}$/i.test(saved)) setThreadId(saved);
  }, []);

  useEffect(() => {
    if (!auth) { setRuns([]); return; }
    let cancelled = false;
    async function loadRuns() {
      try {
        let response = await fetch(`${API_URL}/agents/workflow/runs`, { headers: { Authorization: `Bearer ${auth!.access_token}` } });
        if (response.status === 401) {
          const refreshed = await fetch(`${API_URL}/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: auth!.refresh_token }),
          });
          if (!refreshed.ok) {
            if (!cancelled) setAuth(null);
            throw new Error('Session expired');
          }
          const tokens = (await refreshed.json()) as AuthResponse;
          if (cancelled) return;
          setAuth(tokens);
          response = await fetch(`${API_URL}/agents/workflow/runs`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as WorkflowRun[];
        if (!cancelled) { setRuns(data); setRunsError(''); }
      } catch { if (!cancelled) setRunsError('Run history is unavailable.'); }
    }
    void loadRuns();
    return () => { cancelled = true; };
  }, [auth, runsRefresh]);

  function newConversation() {
    window.localStorage.removeItem('ai-platform-agent-workflow-thread');
    setThreadId(null);
    setWorkflow(null);
    setReply('');
    setMessage('');
  }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.detail === 'string' ? body.detail : `Sign ini hiba: ${response.status}`);
      }
      const tokens = (await response.json()) as AuthResponse;
      setAuth(tokens);
      setPassword('');
    } catch (reason) {
      setAuth(null);
      setError(reason instanceof Error ? reason.message : 'Sign in sikertelen.');
    } finally {
      setBusy(false);
    }
  }

  async function registerAccount() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const registration = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!registration.ok) {
        const body = await registration.json().catch(() => null);
        throw new Error(typeof body?.detail === 'string' ? body.detail : `Registration failed (HTTP ${registration.status})`);
      }
      const login = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!login.ok) throw new Error('Account created. Please sign in with your credentials.');
      setAuth((await login.json()) as AuthResponse);
      setPassword('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  }

  async function agentRequest(path: string, accessToken: string, signal: AbortSignal): Promise<Response> {
    return fetch(`${API_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(path === '/agents/workflow' ? { task: message.trim(), ...(threadId ? { thread_id: threadId } : {}) } : { message: message.trim() }),
      signal,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError('');
    setReply('');
    setWorkflow(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('Request timed out.'), mode === 'workflow' ? 150000 : 90000);
    try {
      if (!auth) throw new Error('Please sign in with your email first.');
      const path = mode === 'demo' ? '/agents/chat' : mode === 'llm' ? '/agents/llm-chat' : mode === 'tools' ? '/agents/tool-chat' : '/agents/workflow';
      let response = await agentRequest(path, auth!.access_token, controller.signal);
      if (response.status === 401 && auth) {
        const refreshed = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
          signal: controller.signal,
        });
        if (!refreshed.ok) {
          setAuth(null);
          throw new Error('Session expired. Please sign in again.');
        }
        const newTokens = (await refreshed.json()) as AuthResponse;
        setAuth(newTokens);
        response = await agentRequest(path, newTokens.access_token, controller.signal);
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.detail === 'string' ? body.detail : `API HTTP ${response.status}`);
      }
      const result = (await response.json()) as ChatResponse;
      if (mode === 'workflow' && result.thread_id) {
        setThreadId(result.thread_id);
        window.localStorage.setItem('ai-platform-agent-workflow-thread', result.thread_id);
      }
      if (mode === 'workflow' && result.plan && result.execution && result.review) {
        setWorkflow(result);
      } else {
        setReply((result.thread_id ? `Workflow ID: ${result.thread_id}\n\n` : '') + (result.response || 'Empty response.'));
      }
    } catch (reason) {
      setError(controller.signal.aborted ? 'Backend did not respond in time. Render startup or a long AI workflow may be responsible.' : reason instanceof Error ? reason.message : 'API request failed.');
    } finally {
      clearTimeout(timer);
      if (mode === 'workflow') setRunsRefresh(value => value + 1);
      setBusy(false);
    }
  }

  return (
    <section className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold">AI Agent Control Center</h2>
        <p className="mt-1 text-sm text-[#9AA3AE]">Live API connection. Demo mode is not an LLM response.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="font-semibold">Sign in</h3>
        {auth ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-emerald-300">Signed in</span>
            <button type="button" onClick={() => { setAuth(null); setEmail(''); setReply(''); }} className="rounded border border-white/20 px-3 py-2 text-sm">Sign out</button>
          </div>
        ) : (
          <div className="space-y-3">
            <input type="email" aria-label="Email" placeholder="Email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#11151C] p-3" />
            <input type="password" aria-label="Password" placeholder="Password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#11151C] p-3" />
            <div className="flex flex-wrap gap-3"><button type="button" disabled={busy || !email.trim() || !password} onClick={signIn} className="rounded-lg bg-cyan-500 px-4 py-2 text-black disabled:opacity-50">Sign in</button><button type="button" disabled={busy || !email.trim() || password.length < 8} onClick={registerAccount} className="rounded-lg border border-cyan-400/50 px-4 py-2 text-cyan-200 disabled:opacity-50">Create account</button></div>{error && <p role="alert" className="text-sm text-rose-300">{error}</p>}
          </div>
        )}
        <p className="text-xs text-[#9AA3AE]">Tokens are held only in the open page's memory. Expired access tokens are refreshed automatically once. Signing out here does not revoke the server session.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <label className="block text-sm">Agent mode
          <select value={mode} onChange={e => { setMode(e.target.value as AgentMode); setReply(''); setError(''); }} className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3 text-white">
            <option value="demo">Demo agent</option>
            <option value="llm">LLM agent</option>
            <option value="tools">Tool-calling agent</option>
            <option value="workflow">Planner–Executor–Reviewer workflow</option>
          </select>
        </label>
        <label className="block text-sm">Message
          <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} rows={4} placeholder="Write a message to the agent..." className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3 text-white" />
        </label>
        <button type="submit" disabled={busy || !message.trim() || (mode !== 'demo' && !auth)} className="rounded-lg bg-cyan-500 px-5 py-2 font-medium text-black disabled:opacity-50">{busy ? 'Processing...' : 'Send'}</button>
      </form>
      {mode === 'workflow' && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9AA3AE]">
        <span>{threadId ? `Saved conversation: ${threadId}` : 'New conversation – the ID will be saved after the first response.'}</span>
        <button type="button" disabled={busy} onClick={newConversation} className="rounded border border-white/20 px-3 py-2 text-sm text-white disabled:opacity-50">New conversation</button>
      </div>}
      {workflow && <div className="space-y-3" aria-label="Workflow results">
        <p className="text-xs text-[#9AA3AE]">Workflow ID: {workflow.thread_id}</p>
        {typeof workflow.duration_ms === 'number' && <p className="text-xs text-emerald-300">Run successful · Duration: {(workflow.duration_ms / 1000).toFixed(2)} s</p>}
        {workflow.step_timings_ms && <div className="flex flex-wrap gap-3 text-xs text-cyan-300">{(['planner', 'executor', 'reviewer'] as const).map(step => typeof workflow.step_timings_ms?.[step] === 'number' ? <span key={step}>{step}: {(workflow.step_timings_ms[step] / 1000).toFixed(2)} s</span> : null)}</div>}
        {([['01 · Planner – plan', workflow.plan], ['02 · Executor – execution', workflow.execution], ['03 · Reviewer – review and final response', workflow.review]] as const).map(([heading, content]) => (
          <article key={heading} className="rounded-xl border border-cyan-500/20 bg-white/5 p-4">
            <h3 className="mb-3 font-semibold text-cyan-300">{heading}</h3>
            <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
          </article>
        ))}
      </div>}
      {mode === 'workflow' && auth && <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
        
<h3 className="font-semibold">Agent Monitoring Dashboard</h3>
<button type="button" onClick={() => setRunsRefresh(n => n + 1)}
  className="rounded border border-white/20 px-3 py-2 text-xs">
  Refresh
</button>
<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
  {(['all', 'success', 'failed', 'timeout'] as const).map(status => (
    <div key={status} className="rounded border border-white/10 p-3">
      <p className="text-xs">{status}</p>
      <p className="text-xl font-semibold">
        {status === 'all' ? runs.length : runs.filter(r => r.status === status).length}
      </p>
    </div>
  ))}
</div>
<select value={runFilter} onChange={e => setRunFilter(e.target.value)}
  className="rounded bg-[#11151C] p-2 text-white">
  <option value="all">All</option>
  <option value="success">Success</option>
  <option value="failed">Failed</option>
  <option value="timeout">Timeout</option>
</select>

        {!runsError && runs.length > 0 && (() => {
          const recent = [...runs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-12);
          const maxDuration = Math.max(1, ...recent.map(run => run.duration_ms));
          const failures = runs.filter(run => run.status === 'failed' || run.status === 'timeout').length;
          const successful = runs.filter(run => run.status === 'success');
          const average = successful.length ? successful.reduce((sum, run) => sum + run.duration_ms, 0) / successful.length : null;
          const sortedDurations = successful.map(run => run.duration_ms).sort((a, b) => a - b);
          const p95 = sortedDurations.length ? sortedDurations[Math.ceil(sortedDurations.length * 0.95) - 1] : null;
          const slowThresholdMs = 15000;
          const slowCount = successful.filter(run => run.duration_ms > slowThresholdMs).length;
          return <div className="space-y-3 rounded-lg border border-white/10 p-3">
            <div className="flex flex-wrap justify-between gap-3 text-xs text-[#9AA3AE]">
              <span>Error rate (last {runs.length} futás): <strong className="text-white">{(failures / runs.length * 100).toFixed(1)}%</strong></span>
              <span>Average successful run: <strong className="text-white">{average === null ? 'No data' : `${(average / 1000).toFixed(2)} s`}</strong></span>
              <span>P95 successful runs: <strong className="text-white">{p95 === null ? 'No data' : `${(p95 / 1000).toFixed(2)} s`}</strong></span>
              <span className={slowCount ? 'text-amber-300' : 'text-[#9AA3AE]'}>Slow runs (&gt;15 s): <strong>{slowCount}</strong></span>
            </div>
            <h4 className="text-sm font-medium">Recent {recent.length} run durations</h4>
            <div role="img" aria-label="Run times: green successful, red failed, yellow timeout" className="flex h-32 items-end gap-1 border-b border-white/20 pb-1">
              {recent.map(run => <div key={run.id} title={`${new Date(run.created_at).toLocaleString('hu-HU')} · ${run.status} · ${(run.duration_ms / 1000).toFixed(2)} s`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1 h-full">
                <span className="text-[9px] text-[#9AA3AE]">{(run.duration_ms / 1000).toFixed(1)}s</span>
                <div className={`w-full max-w-10 rounded-t ${run.status === 'success' ? 'bg-emerald-400' : run.status === 'timeout' ? 'bg-amber-400' : 'bg-red-400'}`} style={{ height: `${Math.max(5, run.duration_ms / maxDuration * 100)}%` }} />
              </div>)}
            </div>
            <p className="text-xs text-[#9AA3AE]">Data is based on the latest {runs.length} saved runs, not all historical runs.</p>
          </div>;
        })()}
        {runsError && <p className="text-xs text-amber-300">{runsError}</p>}
        {!runsError && runs.length === 0 && <p className="text-xs text-[#9AA3AE]">No saved runs yet.</p>}
        {runs.filter(run => runFilter === 'all' || run.status === runFilter).map(run => <div key={run.id} className="rounded border border-white/10 p-3 text-xs">
          <div className="flex justify-between gap-3"><span className="font-medium break-words">{run.task}</span><span className={`shrink-0 ${run.status === "success" ? "text-emerald-300" : run.status === "timeout" ? "text-amber-300" : "text-red-300"}`}>{run.status === "success" ? "Success" : run.status === "timeout" ? "Timeout" : "Failed"}</span></div>
          <p className="mt-1 text-[#9AA3AE]">{new Date(run.created_at).toLocaleString('hu-HU')} · {(run.duration_ms / 1000).toFixed(2)} s</p>
          <details className="mt-2 rounded border border-white/10 p-2">
            <summary className="cursor-pointer text-cyan-300">Run details</summary>
            <div className="mt-2 space-y-2 text-[#9AA3AE]">
              <p className="break-all">Run ID: {run.id}</p>
              <p className="break-all">Conversation ID: {run.thread_id}</p>
              <p>Status: {run.status === 'success' ? 'Success' : run.status === 'timeout' ? 'Timeout' : 'Failed'}</p>
              <p>Total time: {run.duration_ms.toFixed(2)} ms</p>
              {(['planner', 'executor', 'reviewer'] as const).map(step => (
                <p key={step}>{step === 'planner' ? 'Planner' : step === 'executor' ? 'Executor' : 'Reviewer'}: {typeof run.step_timings?.[step] === 'number' ? `${run.step_timings[step].toFixed(2)} ms` : 'No measurements'}</p>
              ))}
            </div>
          </details>
        </div>)}
      </section>}
      {reply && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><h3 className="mb-2 font-semibold">Agent responsea</h3><p className="whitespace-pre-wrap break-words text-sm">{reply}</p></div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm text-red-300">{error}</div>}
      <p className="text-xs text-[#9AA3AE]">LLM and tool agents require an OpenAI API key configured on the backend.</p>
    </section>
  );
}
