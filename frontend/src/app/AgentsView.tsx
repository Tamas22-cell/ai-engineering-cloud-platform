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
        const response = await fetch(`${API_URL}/agents/workflow/runs`, { headers: { Authorization: `Bearer ${auth!.access_token}` } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as WorkflowRun[];
        if (!cancelled) { setRuns(data); setRunsError(''); }
      } catch { if (!cancelled) setRunsError('A futási előzmények nem érhetők el.'); }
    }
    void loadRuns();
    return () => { cancelled = true; };
  }, [auth, workflow]);

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
        throw new Error(typeof body?.detail === 'string' ? body.detail : `Bejelentkezési hiba: ${response.status}`);
      }
      const tokens = (await response.json()) as AuthResponse;
      setAuth(tokens);
      setPassword('');
    } catch (reason) {
      setAuth(null);
      setError(reason instanceof Error ? reason.message : 'Bejelentkezés sikertelen.');
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
    const timer = setTimeout(() => controller.abort('A kérés időkorlátja lejárt.'), mode === 'workflow' ? 150000 : 90000);
    try {
      if (mode !== 'demo' && !auth) throw new Error('Előbb jelentkezz be az e-mail-címeddel.');
      const path = mode === 'demo' ? '/agents/chat' : mode === 'llm' ? '/agents/llm-chat' : mode === 'tools' ? '/agents/tool-chat' : '/agents/workflow';
      let response = await agentRequest(path, mode === 'demo' ? '' : auth!.access_token, controller.signal);
      if (response.status === 401 && mode !== 'demo' && auth) {
        const refreshed = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
          signal: controller.signal,
        });
        if (!refreshed.ok) {
          setAuth(null);
          throw new Error('A munkamenet lejárt. Jelentkezz be újra.');
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
        setReply((result.thread_id ? `Workflow ID: ${result.thread_id}\n\n` : '') + (result.response || 'A válasz üres.'));
      }
    } catch (reason) {
      setError(controller.signal.aborted ? 'A backend nem válaszolt időben. A Render felébredése vagy az AI workflow túl hosszú futása okozhatja.' : reason instanceof Error ? reason.message : 'Az API-hívás sikertelen.');
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <section className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold">AI Agent Control Center</h2>
        <p className="mt-1 text-sm text-[#9AA3AE]">Éles API-kapcsolat. A demo mód nem LLM-válasz.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="font-semibold">Bejelentkezés</h3>
        {auth ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-emerald-300">Bejelentkezve</span>
            <button type="button" onClick={() => { setAuth(null); setEmail(''); setReply(''); }} className="rounded border border-white/20 px-3 py-2 text-sm">Kilépés a felületről</button>
          </div>
        ) : (
          <div className="space-y-3">
            <input type="email" aria-label="E-mail" placeholder="E-mail" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#11151C] p-3" />
            <input type="password" aria-label="Jelszó" placeholder="Jelszó" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#11151C] p-3" />
            <button type="button" disabled={busy || !email.trim() || !password} onClick={signIn} className="rounded-lg bg-cyan-500 px-4 py-2 text-black disabled:opacity-50">Bejelentkezés</button>
          </div>
        )}
        <p className="text-xs text-[#9AA3AE]">A tokeneket csak a megnyitott oldal memóriájában tartjuk. Lejárt hozzáférési token esetén egyszer automatikusan frissítünk. A kilépés innen nem vonja vissza a szerveroldali munkamenetet.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <label className="block text-sm">Agent mód
          <select value={mode} onChange={e => { setMode(e.target.value as AgentMode); setReply(''); setError(''); }} className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3 text-white">
            <option value="demo">Demo agent</option>
            <option value="llm">LLM agent</option>
            <option value="tools">Tool-calling agent</option>
            <option value="workflow">Planner–Executor–Reviewer workflow</option>
          </select>
        </label>
        <label className="block text-sm">Üzenet
          <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} rows={4} placeholder="Írj egy üzenetet az agentnek..." className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3 text-white" />
        </label>
        <button type="submit" disabled={busy || !message.trim() || (mode !== 'demo' && !auth)} className="rounded-lg bg-cyan-500 px-5 py-2 font-medium text-black disabled:opacity-50">{busy ? 'Feldolgozás...' : 'Küldés'}</button>
      </form>
      {mode === 'workflow' && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9AA3AE]">
        <span>{threadId ? `Mentett beszélgetés: ${threadId}` : 'Új beszélgetés – az első válasz után mentjük az azonosítót.'}</span>
        <button type="button" disabled={busy} onClick={newConversation} className="rounded border border-white/20 px-3 py-2 text-sm text-white disabled:opacity-50">Új beszélgetés</button>
      </div>}
      {workflow && <div className="space-y-3" aria-label="Workflow eredmények">
        <p className="text-xs text-[#9AA3AE]">Workflow ID: {workflow.thread_id}</p>
        {typeof workflow.duration_ms === 'number' && <p className="text-xs text-emerald-300">Futás sikeres · Időtartam: {(workflow.duration_ms / 1000).toFixed(2)} s</p>}
        {workflow.step_timings_ms && <div className="flex flex-wrap gap-3 text-xs text-cyan-300">{(['planner', 'executor', 'reviewer'] as const).map(step => typeof workflow.step_timings_ms?.[step] === 'number' ? <span key={step}>{step}: {(workflow.step_timings_ms[step] / 1000).toFixed(2)} s</span> : null)}</div>}
        {([['01 · Planner – terv', workflow.plan], ['02 · Executor – végrehajtás', workflow.execution], ['03 · Reviewer – ellenőrzés és végső válasz', workflow.review]] as const).map(([heading, content]) => (
          <article key={heading} className="rounded-xl border border-cyan-500/20 bg-white/5 p-4">
            <h3 className="mb-3 font-semibold text-cyan-300">{heading}</h3>
            <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
          </article>
        ))}
      </div>}
      {mode === 'workflow' && auth && <section className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="font-semibold">Korábbi agentfuttatások</h3>
        {runsError && <p className="text-xs text-amber-300">{runsError}</p>}
        {!runsError && runs.length === 0 && <p className="text-xs text-[#9AA3AE]">Még nincs mentett futás.</p>}
        {runs.map(run => <div key={run.id} className="rounded border border-white/10 p-3 text-xs">
          <div className="flex justify-between gap-3"><span className="font-medium break-words">{run.task}</span><span className="shrink-0 text-emerald-300">{run.status}</span></div>
          <p className="mt-1 text-[#9AA3AE]">{new Date(run.created_at).toLocaleString('hu-HU')} · {(run.duration_ms / 1000).toFixed(2)} s</p>
        </div>)}
      </section>}
      {reply && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><h3 className="mb-2 font-semibold">Agent válasza</h3><p className="whitespace-pre-wrap break-words text-sm">{reply}</p></div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm text-red-300">{error}</div>}
      <p className="text-xs text-[#9AA3AE]">Az LLM és tool agent működéséhez a backend OpenAI API-kulcsa is szükséges.</p>
    </section>
  );
}
