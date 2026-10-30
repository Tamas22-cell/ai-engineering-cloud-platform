'use client';

import { useState, type FormEvent } from 'react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

type ChatResponse = { response: string };
type AgentMode = 'demo' | 'llm' | 'tools';

export default function AgentsView() {
  const [mode, setMode] = useState<AgentMode>('demo');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError('');
    setReply('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      if (mode !== 'demo' && !token.trim()) {
        throw new Error('Az LLM és a tool agent használatához bejelentkezési token szükséges.');
      }
      const path = mode === 'demo' ? '/agents/chat' : mode === 'llm' ? '/agents/llm-chat' : '/agents/tool-chat';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (mode !== 'demo') headers.Authorization = `Bearer ${token.trim()}`;
      const response = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: message.trim() }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.detail === 'string' ? body.detail : `API HTTP ${response.status}`);
      }
      const result: ChatResponse = await response.json();
      setReply(result.response || 'A válasz üres.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Az API-hívás sikertelen.');
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  return (
    <section className="max-w-3xl space-y-5">
      <div>
        <h2 className="text-xl font-semibold">AI Agent Control Center</h2>
        <p className="mt-1 text-sm text-[#9AA3AE]">Valódi backend API-hívások. A demo mód nem LLM-válasz.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-white/10 bg-white/5 p-5">
        <label className="block text-sm">Agent mód
          <select value={mode} onChange={(event) => { setMode(event.target.value as AgentMode); setReply(''); setError(''); }} className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3 text-white">
            <option value="demo">Demo agent (API ellenőrzés)</option>
            <option value="llm">LLM agent (bejelentkezés szükséges)</option>
            <option value="tools">Tool-calling agent (bejelentkezés szükséges)</option>
          </select>
        </label>
        {mode !== 'demo' && <label className="block text-sm">JWT hozzáférési token
          <input value={token} onChange={(event) => setToken(event.target.value)} type="password" autoComplete="off" placeholder="Bearer token értéke" className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3 text-white" />
          <span className="mt-1 block text-xs text-[#9AA3AE]">Csak a backendnek küldjük a kéréssel; nem mentjük helyi tárhelyre.</span>
        </label>}
        <label className="block text-sm">Üzenet
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={4000} rows={4} placeholder="Írj egy üzenetet az agentnek..." className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3 text-white" />
        </label>
        <button type="submit" disabled={busy || !message.trim()} className="rounded-lg bg-cyan-500 px-5 py-2 font-medium text-black disabled:opacity-50">{busy ? 'Feldolgozás...' : 'Küldés az agentnek'}</button>
      </form>
      {reply && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><h3 className="mb-2 font-semibold">Agent válasza</h3><p className="whitespace-pre-wrap break-words text-sm">{reply}</p></div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm text-red-300">{error}</div>}
      <p className="text-xs text-[#9AA3AE]">A publikus Vercel-oldalon az LLM és a tool mód csak akkor működik, ha az éles FastAPI backend elérhető és az API-kulcs konfigurált.</p>
    </section>
  );
}
