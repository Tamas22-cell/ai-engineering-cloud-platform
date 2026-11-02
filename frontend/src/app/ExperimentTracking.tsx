'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

type Experiment = { id: string; name: string; model_id: string };
type Run = { id: string; status: string; hyperparameters: Record<string, unknown>; dataset_version: string | null; git_commit_sha: string | null };
type Metric = { id: string; name: string; value: number; step: number };
type Auth = { access_token: string; refresh_token: string };
type Model = { id: string; name: string; version: string };
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export default function ExperimentTracking({ auth, setAuth, models, role }: { auth: Auth | null; setAuth: Dispatch<SetStateAction<Auth | null>>; models: Model[]; role: string | null }) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selected, setSelected] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metric[]>>({});
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const canWrite = !!auth && (role === 'admin' || role === 'developer');

  const loadExperiments = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API}/mlops/experiments`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Experiment API: HTTP ${response.status}`);
      setExperiments(await response.json() as Experiment[]);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Experiment API nem elérhető'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadExperiments(); }, [loadExperiments]);

  useEffect(() => {
    if (!selected) { setRuns([]); setMetrics({}); return; }
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`${API}/mlops/experiments/${encodeURIComponent(selected)}/runs`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Run API: HTTP ${response.status}`);
        const data = await response.json() as Run[];
        if (!cancelled) { setRuns(data); setMetrics({}); setError(''); }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Futások nem elérhetők'); }
    }
    void load();
    return () => { cancelled = true; };
  }, [selected]);

  async function createExperiment() {
    if (!canWrite || !modelId || !name.trim() || !auth) return;
    try {
      const payload = JSON.stringify({ name: name.trim(), model_id: modelId });
      const submit = (token: string) => fetch(`${API}/mlops/experiments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: payload,
      });
      let response = await submit(auth.access_token);
      if (response.status === 401) {
        const refresh = await fetch(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refresh.ok) {
          setAuth(null);
          throw new Error('A munkamenet lejárt. Jelentkezz be újra.');
        }
        const tokens = await refresh.json() as Auth;
        setAuth(tokens);
        response = await submit(tokens.access_token);
      }
      if (!response.ok) throw new Error(`Létrehozás sikertelen: HTTP ${response.status}`);
      setName('');
      await loadExperiments();
    } catch (e) { setError(e instanceof Error ? e.message : 'Létrehozás sikertelen'); }
  }

  async function showMetrics(runId: string) {
    try {
      const response = await fetch(`${API}/mlops/experiments/runs/${encodeURIComponent(runId)}/metrics`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Metrics API: HTTP ${response.status}`);
      const data = await response.json() as Metric[];
      setMetrics(previous => ({ ...previous, [runId]: data }));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Metrikák nem elérhetők'); }
  }

  return <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold">Experiment Tracking 2.0</h3><p className="text-xs text-slate-400">Kísérletek, futások, hyperparaméterek és verziókövetés</p></div>
      <button type="button" onClick={() => void loadExperiments()} disabled={loading} className="rounded border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50">{loading ? 'Betöltés...' : 'Frissítés'}</button>
    </div>
    {canWrite && <div className="flex flex-wrap gap-2">
      <select aria-label="Kísérlet modellje" value={modelId} onChange={e => setModelId(e.target.value)} className="rounded border border-white/15 bg-[#11151C] p-2 text-sm">
        <option value="">Válassz modellt</option>{models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.version})</option>)}
      </select>
      <input aria-label="Kísérlet neve" value={name} maxLength={160} onChange={e => setName(e.target.value)} placeholder="Kísérlet neve" className="rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
      <button type="button" onClick={() => void createExperiment()} disabled={!name.trim() || !modelId} className="rounded bg-cyan-500 px-3 py-2 text-xs text-black disabled:opacity-50">Kísérlet létrehozása</button>
    </div>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <select aria-label="Kísérlet kiválasztása" value={selected} onChange={e => setSelected(e.target.value)} className="w-full rounded border border-white/15 bg-[#11151C] p-2 text-sm">
      <option value="">Válassz kísérletet ({experiments.length})</option>
      {experiments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
    {selected && <div className="space-y-2">
      <p className="text-xs text-slate-400">{runs.length} futás (legfeljebb 50)</p>
      {runs.map(run => <div key={run.id} className="rounded border border-white/10 p-3 text-xs space-y-2">
        <p className="font-medium text-cyan-200">{run.id} · {run.status}</p>
        <p>Dataset: {run.dataset_version || '—'} · Commit: {run.git_commit_sha?.slice(0, 12) || '—'}</p>
        <pre className="overflow-x-auto whitespace-pre-wrap text-slate-300">{JSON.stringify(run.hyperparameters, null, 2)}</pre>
        <button type="button" onClick={() => void showMetrics(run.id)} className="text-cyan-300 underline">Metrikák megjelenítése</button>
        {metrics[run.id] && <div className="space-y-1">{metrics[run.id].length ? metrics[run.id].map(m => <p key={m.id}>{m.name}: {m.value} (step {m.step})</p>) : <p>Még nincs metrika.</p>}</div>}
      </div>)}
    </div>}
  </section>;
}
