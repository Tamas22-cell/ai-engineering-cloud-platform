'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

type DocumentItem = { id: string; filename: string; file_size: number; created_at: string };
type AskResponse = { answer: string; sources: { id: number; source: string; page: number }[]; verified?: boolean; usage?: { model?: string; input_tokens?: number; output_tokens?: number; total_tokens?: number; estimated_cost_usd?: string | null } };
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

type AuthResponse = { access_token: string; refresh_token: string };

export default function RagView({ auth, setAuth }: { auth: AuthResponse | null; setAuth: Dispatch<SetStateAction<AuthResponse | null>> }) {
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [message, setMessage] = useState('A RAG API védett; jelentkezz be az Agents oldalon.');
  const [busy, setBusy] = useState(false);

  async function request(path: string, options: RequestInit = {}) {
    if (!auth) throw new Error('Jelentkezz be az Agents oldalon.');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${auth.access_token}`);
    let response = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
    if (response.status === 401) {
      const refreshed = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: auth.refresh_token }) });
      if (!refreshed.ok) { setAuth(null); throw new Error('Lejárt a munkamenet. Jelentkezz be újra az Agents oldalon.'); }
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
    return response.json();
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Ismeretlen hiba történt.'); }
    finally { setBusy(false); }
  }

  async function loadDocuments() {
    const data = await request('/rag/documents');
    setDocuments(Array.isArray(data.documents) ? data.documents : []);
    setMessage('Dokumentumlista betöltve.');
  }

  async function upload() {
    if (!file) { setMessage('Először válassz PDF-fájlt.'); return; }
    if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 10 * 1024 * 1024) {
      setMessage('Csak legfeljebb 10 MB-os PDF tölthető fel.'); return;
    }
    const form = new FormData();
    form.append('file', file);
    const uploaded = await request('/rag/upload', { method: 'POST', body: form });
    setMessage(`Feltöltve: ${uploaded.filename}. Indexelés folyamatban...`);
    const indexed = await request(`/rag/index/${encodeURIComponent(uploaded.document_id)}`, { method: 'POST' });
    await loadDocuments();
    setMessage(`Sikeres feldolgozás: ${indexed.chunks_indexed} szövegrész indexelve.`);
    setFile(null);
  }

  async function ask() {
    if (!question.trim()) { setMessage('Írj be egy kérdést.'); return; }
    const data = await request('/rag/multi-agent/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question.trim(), top_k: 5 }),
    });
    setAnswer(data);
    setMessage(data.verified ? 'Forráshivatkozásokkal ellenőrzött válasz.' : 'AI-válasz megérkezett; a források ellenőrzése nem sikerült.');
  }

  return (
    <section className="max-w-4xl space-y-5">
      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h2 className="text-xl font-semibold">Multi-Agent RAG Knowledge System</h2>
        <p className="mt-2 text-sm text-slate-400">PDF feltöltés, dokumentumindexelés és LangGraph Multi-Agent RAG: Planner → Retriever → Synthesizer → Reviewer.</p>
        <p className="mt-4 text-sm text-slate-300">{auth ? 'Bejelentkezve · az Agents munkamenetét használjuk.' : 'Jelentkezz be az Agents menüben a RAG használatához.'}</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="font-semibold">PDF dokumentum</h3>
        <input aria-label="PDF kiválasztása" type="file" accept=".pdf,application/pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm" />
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={busy || !file || !auth} onClick={() => void run(upload)}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Feltöltés és indexelés</button>
          <button type="button" disabled={busy || !auth} onClick={() => void run(loadDocuments)}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm disabled:opacity-40">Dokumentumok frissítése</button>
        </div>
        <ul className="mt-4 space-y-2 text-sm text-slate-300">
          {documents.map(doc => <li key={doc.id} className="rounded-lg bg-black/20 p-3">{doc.filename} · {Math.ceil(doc.file_size / 1024)} KB</li>)}
        </ul>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <label htmlFor="rag-question" className="font-semibold">Kérdés a dokumentumokról</label>
        <textarea id="rag-question" value={question} maxLength={4000} onChange={e => setQuestion(e.target.value)}
          placeholder="Mit tartalmaznak a feltöltött dokumentumok?" rows={3}
          className="mt-3 w-full rounded-lg border border-white/15 bg-[#101723] p-3 text-sm text-white" />
        <button type="button" disabled={busy || !auth || !question.trim()} onClick={() => void run(ask)}
          className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium disabled:opacity-40">Kérdezés</button>
        {answer && <div className="mt-4 space-y-3 rounded-lg bg-black/30 p-4 text-sm text-slate-200"><p className="whitespace-pre-wrap">{answer.answer}</p><p className={answer.verified ? 'text-green-300' : 'text-amber-300'}>{answer.verified ? 'Forráshivatkozások ellenőrizve' : 'Nem igazolt válasz – ellenőrizd a dokumentumokat'}</p>{answer.usage && <p className="text-xs text-cyan-300">AI tokenek · {answer.usage.model ?? "ismeretlen modell"} · bemenet: {answer.usage.input_tokens ?? 0} · kimenet: {answer.usage.output_tokens ?? 0} · összesen: {answer.usage.total_tokens ?? 0}{answer.usage.estimated_cost_usd != null ? ` · becsült költség: ${answer.usage.estimated_cost_usd}` : " · költség nincs konfigurálva"}</p>}<ul className="space-y-1">{(answer.sources ?? []).map(source => <li key={source.id}>[{source.id}] {source.source}, {source.page}. oldal</li>)}</ul></div>}
      </div>
      <p role="status" aria-live="polite" className="text-sm text-cyan-300">{busy ? 'Feldolgozás...' : message}</p>
    </section>
  );
}
