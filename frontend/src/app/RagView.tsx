'use client';

import { useState } from 'react';

type DocumentItem = { id: string; filename: string; file_size: number; created_at: string };
type AskResponse = { answer: string; sources: { id: number; source: string; page: number }[]; verified?: boolean };
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export default function RagView() {
  const [token, setToken] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskResponse | null>(null);
  const [message, setMessage] = useState('A RAG API védett; a használathoz érvényes hozzáférési token szükséges.');
  const [busy, setBusy] = useState(false);

  async function request(path: string, options: RequestInit = {}) {
    if (!token.trim()) throw new Error('Hiányzik a hozzáférési token. A backend jogosultságát nem kapcsoljuk ki.');
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${token.trim()}`);
    const response = await fetch(`${API_URL}${path}`, { ...options, headers, cache: 'no-store' });
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
        <label className="mt-5 block text-sm text-slate-300" htmlFor="rag-token">Hozzáférési token (csak ebben az ablakban, nem mentjük el)</label>
        <input id="rag-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}
          placeholder="JWT access token" className="mt-2 w-full rounded-lg border border-white/15 bg-[#101723] p-3 text-sm text-white" />
        <p className="mt-2 text-xs text-amber-200">Bejelentkezés nélkül a védett API nem érhető el. A frontend nem kerüli meg a backend biztonságát.</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/5 p-5">
        <h3 className="font-semibold">PDF dokumentum</h3>
        <input aria-label="PDF kiválasztása" type="file" accept=".pdf,application/pdf"
          onChange={e => setFile(e.target.files?.[0] ?? null)} className="mt-3 block w-full text-sm" />
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" disabled={busy || !file || !token.trim()} onClick={() => void run(upload)}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Feltöltés és indexelés</button>
          <button type="button" disabled={busy || !token.trim()} onClick={() => void run(loadDocuments)}
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
        <button type="button" disabled={busy || !token.trim() || !question.trim()} onClick={() => void run(ask)}
          className="mt-3 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium disabled:opacity-40">Kérdezés</button>
        {answer && <div className="mt-4 space-y-3 rounded-lg bg-black/30 p-4 text-sm text-slate-200"><p className="whitespace-pre-wrap">{answer.answer}</p><p className={answer.verified ? 'text-green-300' : 'text-amber-300'}>{answer.verified ? 'Forráshivatkozások ellenőrizve' : 'Nem igazolt válasz – ellenőrizd a dokumentumokat'}</p><ul className="space-y-1">{(answer.sources ?? []).map(source => <li key={source.id}>[{source.id}] {source.source}, {source.page}. oldal</li>)}</ul></div>}
      </div>
      <p role="status" aria-live="polite" className="text-sm text-cyan-300">{busy ? 'Feldolgozás...' : message}</p>
    </section>
  );
}
