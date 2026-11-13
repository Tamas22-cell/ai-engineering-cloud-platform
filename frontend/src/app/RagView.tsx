'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

type DocumentItem = { id: string; filename: string; file_size: number; created_at: string };
type AskResponse = { answer: string; sources: { id: number; source: string; page: number }[]; verified?: boolean; usage?: { model?: string; input_tokens?: number; output_tokens?: number; total_tokens?: number; estimated_cost_usd?: string | null }; step_timings_ms?: Record<string, number> };
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

type AuthResponse = { access_token: string; refresh_token: string };

export default function RagView({ onTelemetry, auth, setAuth }: { onTelemetry?: (data: { step_timings_ms?: Record<string, number>; usage?: AskResponse['usage']; verified?: boolean }) => void; auth: AuthResponse | null; setAuth: Dispatch<SetStateAction<AuthResponse | null>> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [demoQuestion, setDemoQuestion] = useState('');
  const [demoAnswer, setDemoAnswer] = useState('');
  const [authError, setAuthError] = useState('');

  async function signIn() {
    setAuthError('');
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error('Login failed. Check your credentials.');
      setAuth((await response.json()) as AuthResponse);
      setPassword('');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Login error');
    }
  }

  function askDemo() {
    const question = demoQuestion.trim().toLowerCase();
    if (!question) return;
    if (question.includes('rag') || question.includes('keres') || question.includes('retriev')) {
      setDemoAnswer('Minta dokumentum [1]: A RAG releváns szövegrészeket keres egy dokumentumgyűjteményben, majd ezek alapján állít elő választ. Ez a válasz előre definiált demonstráció, nem éles LLM-hívás.');
    } else if (question.includes('agent') || question.includes('langgraph')) {
      setDemoAnswer('Minta dokumentum [2]: A multi-agent RAG négy lépése: Planner → Retriever → Synthesizer → Reviewer. Ez egy statikus bemutató válasz, nem éles dokumentumkeresés.');
    } else {
      setDemoAnswer('A két nyilvános mintadokumentumban nincs erre előre definiált válasz. Próbáld: „What is RAG?” vagy „Hogyan működik a multi-agent RAG?”');
    }
  }
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [message, setMessage] = useState('A privát RAG-hoz jelentkezz be az Agents vagy a RAG oldalon.');
  const [busy, setBusy] = useState(false);

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    if (!auth) throw new Error('Jelentkezz be a RAG oldalon.');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${auth.access_token}`);
    let response = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
    if (response.status === 401) {
      const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: auth.refresh_token }) });
      if (!refreshed.ok) { setAuth(null); throw new Error('Session expired. Please sign in again.'); }
      const tokens = (await refreshed.json()) as AuthResponse;
      setAuth(tokens);
      headers.set('Authorization', `Bearer ${tokens.access_token}`);
      response = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const detail = typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`;
      throw new Error(detail);
    }
    if (response.status === 204) return null;
    return response.json();
  }, [auth, setAuth]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Ismeretlen hiba történt.'); }
    finally { setBusy(false); }
  }, []);

  const loadDocuments = useCallback(async () => {
    const data = await request('/rag/documents') as { documents?: DocumentItem[] };
    setDocuments(Array.isArray(data.documents) ? data.documents : []);
    setMessage('Document list loaded.');
  }, [request]);

  useEffect(() => {
    if (!auth) { setDocuments([]); setAnswer(null); return; }
    void run(loadDocuments);
  }, [auth, loadDocuments, run]);

  async function upload() {
    if (!file) { setMessage('Select a PDF file first.'); return; }
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 10 * 1024 * 1024) {
      setMessage('PDF files must be 10 MB or smaller.'); return;
    }
    const form = new FormData();
    form.append('file', file);
    const uploaded = await request('/rag/upload', { method: 'POST', body: form });
    setMessage(`Uploaded: ${uploaded.filename}. Indexing in progress...`);
    const indexed = await request(`/rag/index/${encodeURIComponent(uploaded.document_id)}`, { method: 'POST' });
    await loadDocuments();
    setMessage(`Successfully processed: ${indexed.chunks_indexed} szövegrész indexelve.`);
    setFile(null);
  }

  async function removeDocument(doc: DocumentItem) {
    if (!window.confirm(`Biztosan törlöd ezt a dokumentumot és az indexelt részeit? ${doc.filename}`)) return;
    await request(`/rag/documents/${encodeURIComponent(doc.id)}`, { method: 'DELETE' });
    setDocuments(previous => previous.filter(item => item.id !== doc.id));
    setAnswer(null);
    setMessage(`Deleted: ${doc.filename}`);
  }

  async function ask() {
    if (!question.trim()) { setMessage('Enter a question.'); return; }
    const data = await request('/rag/multi-agent/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.trim(), top_k: 5 }),
    });
    setAnswer(data);
    onTelemetry?.(data);
    setMessage(data.verified ? 'Forráshivatkozásokkal ellenőrzött válasz.' : 'AI-válasz megérkezett; a források ellenőrzése nem sikerült.');
  }

  return (
    <section className="max-w-4xl space-y-5">
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-xl font-semibold">Multi-Agent RAG Knowledge System</h2>
        <p className="mt-2 text-sm text-slate-400">PDF feltöltés, dokumentumindexelés és LangGraph Multi-Agent RAG: Planner → Retriever → Synthesizer → Reviewer.</p>
        <p className="mt-4 text-sm text-slate-300">{auth ? 'Privát RAG: bejelentkezve.' : 'A privát RAG az Agents bejelentkezését használja.'}</p>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-white/5 p-5 space-y-3">
        <h3 className="font-semibold">Public RAG demo · no login required</h3>
        <p className="text-sm text-slate-400">Két előre definiált mintadokumentum alapján működő, statikus bemutató. Nem használ OpenAI API-t, nem keres adatbázisban és nem fogad PDF-et.</p>
        <p className="text-xs text-slate-300">[1] RAG alapok · [2] Multi-agent workflow</p>
        <input aria-label="Demo kérdés" value={demoQuestion} onChange={e => setDemoQuestion(e.target.value)} placeholder="What is RAG?" className="w-full rounded-lg border border-white/15 bg-[#101723] p-3 text-sm text-white" />
        <button type="button" onClick={askDemo} disabled={!demoQuestion.trim()} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white disabled:opacity-40">Demo kipróbálása</button>
        {demoAnswer && <p className="rounded-lg bg-black/30 p-3 text-sm text-slate-200" role="status">{demoAnswer}</p>}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h3 className="font-semibold">Private RAG · shared login</h3>
        {auth ? <div className="flex items-center gap-3"><span className="text-sm text-emerald-300">RAG: Signed in</span><button type="button" onClick={() => { setAuth(null); setDocuments([]); setAnswer(null); }} className="rounded border border-white/20 px-3 py-2 text-sm">Kijelentkezés</button></div> : <><input type="email" autoComplete="username" aria-label="RAG e-mail" placeholder="E-mail" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#101723] p-3 text-sm" /><input type="password" autoComplete="current-password" aria-label="RAG jelszó" placeholder="Jelszó" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-white/15 bg-[#101723] p-3 text-sm" /><button type="button" disabled={!email.trim() || !password} onClick={() => void signIn()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm disabled:opacity-40">RAG bejelentkezés</button></>}
        {authError && <p role="alert" className="text-sm text-red-300">{authError}</p>}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="font-semibold">PDF dokumentum</h3>
        <input aria-label="PDF kiválasztása" type="file" accept=".pdf,application/pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm" />
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={busy || !file || !auth} onClick={() => void run(upload)}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Upload and index</button>
          <button type="button" disabled={busy || !auth} onClick={() => void run(loadDocuments)}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm disabled:opacity-40">Refresh documents</button>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {documents.map(doc => <li key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 p-3"><span className="break-all">{doc.filename}</span><span className="flex items-center gap-3"><span className="text-xs text-slate-400">{Math.ceil(doc.file_size / 1024)} KB · {new Date(doc.created_at).toLocaleDateString('hu-HU')}</span><button type="button" disabled={busy} onClick={() => void run(() => removeDocument(doc))} className="rounded border border-red-400/40 px-3 py-1 text-xs text-red-300 disabled:opacity-40" aria-label={`Dokumentum törlése: ${doc.filename}`}>Törlés</button></span></li>)}
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="rag-question" className="font-semibold">Question about documents</label><span className="text-xs text-slate-400">{documents.length} saját dokumentum</span></div>
        {!documents.length && auth && <p className="text-xs text-amber-200">Upload and index at least one PDF before asking.</p>}
        <textarea id="rag-question" value={question} maxLength={4000} onChange={e => setQuestion(e.target.value)}
          placeholder="What do the uploaded documents contain?" rows={3}
          className="mt-3 w-full rounded-lg border border-white/15 bg-[#101723] p-3 text-sm text-white" />
        <button type="button" disabled={busy || !auth || !documents.length || !question.trim()} onClick={() => void run(ask)}
          className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium disabled:opacity-40">Ask</button>
        {answer?.step_timings_ms && <div className="mt-4 rounded-lg border border-cyan-500/20 bg-black/20 p-4"><h4 className="font-semibold text-cyan-300">LangGraph agent futási idők · élő mérés</h4><div className="mt-3 grid grid-cols-2 gap-3">{(['planner','retriever','synthesizer','reviewer'] as const).map(step => <div key={step} className="rounded-lg bg-white/5 p-3"><div className="text-xs uppercase text-slate-400">{step}</div><div className="text-lg font-semibold">{answer.step_timings_ms?.[step] == null ? 'Nincs adat' : `${answer.step_timings_ms[step].toFixed(1)} ms`}</div></div>)}</div><p className="mt-2 text-xs text-slate-400">Mért végrehajtási idők, nem becslések. Tokenek és költség a válasz alatt.</p></div>}
        {answer && <div className="mt-4 space-y-3 rounded-lg bg-black/30 p-4 text-sm text-slate-200"><p className="whitespace-pre-wrap">{answer.answer}</p><p className={answer.verified ? 'text-green-300' : 'text-amber-300'}>{answer.verified ? 'Forráshivatkozások ellenőrizve' : 'Nem igazolt válasz – ellenőrizd a dokumentumokat'}</p>{answer.usage && <p className="text-xs text-cyan-300">AI tokenek · {answer.usage.model ?? "ismeretlen modell"} · bemenet: {answer.usage.input_tokens ?? 0} · kimenet: {answer.usage.output_tokens ?? 0} · összesen: {answer.usage.total_tokens ?? 0}{answer.usage.estimated_cost_usd != null ? ` · becsült költség: ${answer.usage.estimated_cost_usd}` : " · költség nincs konfigurálva"}</p>}<ul className="space-y-1">{(answer.sources ?? []).map(source => <li key={source.id}>[{source.id}] {source.source}, {source.page}. oldal</li>)}</ul></div>}
      </div>
      <p role="status" aria-live="polite" className="text-sm text-cyan-300">{busy ? 'Processing...' : message}</p>
    </section>
  );
}
