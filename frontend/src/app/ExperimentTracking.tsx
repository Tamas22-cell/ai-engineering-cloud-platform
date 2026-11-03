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
  const [creatingRun, setCreatingRun] = useState(false);
  const [datasetVersion, setDatasetVersion] = useState('');
  const [gitCommitSha, setGitCommitSha] = useState('');
  const [hyperparametersText, setHyperparametersText] = useState('{}');
  const [busyRun, setBusyRun] = useState<string | null>(null);
  const [metricInputs, setMetricInputs] = useState<Record<string, { name: string; value: string }>>({});
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


  async function createRun() {
    if (!selected || !auth || !canWrite || creatingRun) return;
    let hyperparameters: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(hyperparametersText);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('A hiperparamétereknek JSON objektumnak kell lenniük.');
      }
      hyperparameters = parsed as Record<string, unknown>;
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Hibás hiperparaméter JSON.' : e instanceof Error ? e.message : 'Hibás JSON.');
      return;
    }
    const sha = gitCommitSha.trim();
    if (sha && !/^[0-9a-fA-F]{40}$/.test(sha)) {
      setError('A Git commit SHA pontosan 40 hexadecimális karakter legyen.');
      return;
    }
    setCreatingRun(true);
    setError('');
    try {
      const submit = (token: string) => fetch(`${API}/mlops/experiments/${encodeURIComponent(selected)}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hyperparameters, dataset_version: datasetVersion.trim() || null, git_commit_sha: sha || null }),
      });
      let response = await submit(auth.access_token);
      if (response.status === 401) {
        const refresh = await fetch(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refresh.ok) { setAuth(null); throw new Error('A munkamenet lejárt. Jelentkezz be újra.'); }
        const tokens = await refresh.json() as Auth;
        setAuth(tokens);
        response = await submit(tokens.access_token);
      }
      if (!response.ok) throw new Error(`Futás létrehozása: HTTP ${response.status}`);
      const updated = await fetch(`${API}/mlops/experiments/${encodeURIComponent(selected)}/runs`, { cache: 'no-store' });
      if (!updated.ok) throw new Error(`Futások lekérdezése: HTTP ${updated.status}`);
      setRuns(await updated.json() as Run[]);
      setDatasetVersion('');
      setGitCommitSha('');
      setHyperparametersText('{}');
    } catch (e) { setError(e instanceof Error ? e.message : 'Futás létrehozása sikertelen'); }
    finally { setCreatingRun(false); }
  }


  async function authorizedWrite(path: string, method: 'POST' | 'PATCH', payload: object) {
    if (!auth) throw new Error('Jelentkezz be újra.');
    const submit = (token: string) => fetch(`${API}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    let response = await submit(auth.access_token);
    if (response.status === 401) {
      const refreshed = await fetch(`${API}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: auth.refresh_token }),
      });
      if (!refreshed.ok) { setAuth(null); throw new Error('A munkamenet lejárt. Jelentkezz be újra.'); }
      const tokens = await refreshed.json() as Auth;
      setAuth(tokens);
      response = await submit(tokens.access_token);
    }
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  }

  async function changeStatus(runId: string, status: string) {
    if (!selected || busyRun) return;
    setBusyRun(runId); setError('');
    try {
      await authorizedWrite(`/mlops/experiments/runs/${encodeURIComponent(runId)}/status`, 'PATCH', { status });
      const response = await fetch(`${API}/mlops/experiments/${encodeURIComponent(selected)}/runs`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Run API HTTP ${response.status}`);
      setRuns(await response.json() as Run[]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Státusz módosítása sikertelen'); }
    finally { setBusyRun(null); }
  }

  async function recordRunMetric(runId: string) {
    if (busyRun) return;
    const input = metricInputs[runId];
    const value = Number(input?.value);
    if (!input?.name.trim() || !input.value.trim() || !Number.isFinite(value)) {
      setError('Adj meg metrikanevet és érvényes számértéket.'); return;
    }
    setBusyRun(runId); setError('');
    try {
      await authorizedWrite(`/mlops/experiments/runs/${encodeURIComponent(runId)}/metrics`, 'POST', {
        name: input.name.trim(), value, step: 0,
      });
      setMetricInputs(previous => ({ ...previous, [runId]: { name: '', value: '' } }));
      await showMetrics(runId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Metrika mentése sikertelen'); }
    finally { setBusyRun(null); }
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
      {canWrite && <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="text-sm font-medium text-slate-100">Új futás adatai</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-300">Dataset verzió (opcionális)
            <input aria-label="Dataset verzió" maxLength={160} value={datasetVersion} onChange={e => setDatasetVersion(e.target.value)} placeholder="pl. dataset-v1.2" className="w-full rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs text-slate-300">Git commit SHA (opcionális, 40 hex karakter)
            <input aria-label="Git commit SHA" maxLength={40} value={gitCommitSha} onChange={e => setGitCommitSha(e.target.value)} placeholder="40 karakteres commit hash" className="w-full rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
          </label>
        </div>
        <label className="block space-y-1 text-xs text-slate-300">Hiperparaméterek (JSON objektum)
          <textarea aria-label="Hiperparaméterek JSON" rows={3} value={hyperparametersText} onChange={e => setHyperparametersText(e.target.value)} spellCheck={false} className="w-full rounded border border-white/15 bg-[#11151C] p-2 font-mono text-sm" />
        </label>
        <button type="button" disabled={creatingRun} onClick={() => void createRun()} className="rounded bg-cyan-500 px-3 py-2 text-xs text-black disabled:opacity-50">{creatingRun ? 'Létrehozás...' : 'Új futás létrehozása'}</button>
      </div>}
      {runs.map(run => <div key={run.id} className="rounded border border-white/10 p-3 text-xs space-y-2">
        <p className="font-medium text-cyan-200">{run.id} · {run.status}</p>
        <p>Dataset: {run.dataset_version || '—'} · Commit: {run.git_commit_sha?.slice(0, 12) || '—'}</p>
        <pre className="overflow-x-auto whitespace-pre-wrap text-slate-300">{JSON.stringify(run.hyperparameters, null, 2)}</pre>
        {canWrite && <div className="flex flex-wrap gap-2">
          {(run.status === 'pending' ? ['running', 'cancelled'] : run.status === 'running' ? ['completed', 'failed', 'cancelled'] : []).map(next => (
            <button key={next} type="button" disabled={busyRun !== null} onClick={() => void changeStatus(run.id, next)} className="rounded border border-white/20 px-2 py-1 disabled:opacity-50">{next}</button>
          ))}
        </div>}
        {canWrite && (run.status === 'pending' || run.status === 'running') && <div className="flex flex-wrap gap-2">
          <input aria-label="Metrika neve" maxLength={80} value={metricInputs[run.id]?.name ?? ''} onChange={e => setMetricInputs(previous => ({ ...previous, [run.id]: { name: e.target.value, value: previous[run.id]?.value ?? '' } }))} placeholder="Metrika neve" className="rounded border border-white/15 bg-[#11151C] p-2" />
          <input aria-label="Metrika értéke" type="number" step="any" value={metricInputs[run.id]?.value ?? ''} onChange={e => setMetricInputs(previous => ({ ...previous, [run.id]: { name: previous[run.id]?.name ?? '', value: e.target.value } }))} placeholder="Érték" className="w-28 rounded border border-white/15 bg-[#11151C] p-2" />
          <button type="button" disabled={busyRun !== null} onClick={() => void recordRunMetric(run.id)} className="rounded border border-cyan-400/40 px-2 py-1 text-cyan-200 disabled:opacity-50">Metrika mentése</button>
        </div>}
        <button type="button" onClick={() => void showMetrics(run.id)} className="text-cyan-300 underline">Metrikák megjelenítése</button>
        {metrics[run.id] && <div className="space-y-1">{metrics[run.id].length ? metrics[run.id].map(m => <p key={m.id}>{m.name}: {m.value} (step {m.step})</p>) : <p>Még nincs metrika.</p>}</div>}
      </div>)}
    </div>}
  </section>;
}
