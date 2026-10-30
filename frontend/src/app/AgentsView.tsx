'use client';

import { useState, type FormEvent } from 'react';

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
type ChatResponse = { response: string };
type AuthResponse = { access_token: string; refresh_token: string };
type AgentMode = 'demo' | 'llm' | 'tools';

export default function AgentsView() {
  const [mode, setMode] = useState<AgentMode>('demo');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [auth, setAuth] = useState<AuthResponse | null>(null);
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
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
      body: JSON.stringify({ message: message.trim() }),
      signal,
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || busy) return;
    setBusy(true);
    setError('');
    setReply('');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);
    try {
      if (mode !== 'demo' && !auth) throw new Error('Előbb jelentkezz be az e-mail-címeddel.');
      const path = mode === 'demo' ? '/agents/chat' : mode === 'llm' ? '/agents/llm-chat' : '/agents/tool-chat';
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
          </select>
        </label>
        <label className="block text-sm">Üzenet
          <textarea value={message} onChange={e => setMessage(e.target.value)} maxLength={4000} rows={4} placeholder="Írj egy üzenetet az agentnek..." className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3 text-white" />
        </label>
        <button type="submit" disabled={busy || !message.trim() || (mode !== 'demo' && !auth)} className="rounded-lg bg-cyan-500 px-5 py-2 font-medium text-black disabled:opacity-50">{busy ? 'Feldolgozás...' : 'Küldés'}</button>
      </form>
      {reply && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"><h3 className="mb-2 font-semibold">Agent válasza</h3><p className="whitespace-pre-wrap break-words text-sm">{reply}</p></div>}
      {error && <div role="alert" className="rounded-xl border border-red-500/30 p-4 text-sm text-red-300">{error}</div>}
      <p className="text-xs text-[#9AA3AE]">Az LLM és tool agent működéséhez a backend OpenAI API-kulcsa is szükséges.</p>
    </section>
  );
}
