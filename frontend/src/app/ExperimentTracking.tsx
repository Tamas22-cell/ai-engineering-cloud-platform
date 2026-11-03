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
  const [training, setTraining] = useState(false);
  const [predictInputs, setPredictInputs] = useState<Record<string, string>>({});
  const [predictBusy, setPredictBusy] = useState<string | null>(null);
  const [predictResults, setPredictResults] = useState<Record<string, number[]>>({});
  const [comparing, setComparing] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promotionResult, setPromotionResult] = useState('');
  const [candidateRun, setCandidateRun] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<{ ready_for_staging_review: boolean; checks: Record<string, boolean> } | null>(null);
  const [comparison, setComparison] = useState<{ id: string; mae: number; rmse: number | null; r2: number | null }[]>([]);
  const [trainingResult, setTrainingResult] = useState<{ run_id: string; metrics: { mae: number; rmse: number; r2: number } } | null>(null);
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
    setTrainingResult(null);
    setPredictResults({});
    setComparison([]);
    setCandidateRun(null);
    setReadiness(null);
    setPromotionResult('');
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
          setAuth(previous => previous?.refresh_token === auth?.refresh_token ? null : previous);
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
        if (!refresh.ok) { setAuth(previous => previous?.refresh_token === auth?.refresh_token ? null : previous); throw new Error('A munkamenet lejárt. Jelentkezz be újra.'); }
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


  async function trainModel() {
    if (!selected || !canWrite || !auth || training) return;
    setTraining(true);
    setTrainingResult(null);
    setError('');
    try {
      const submit = (token: string) => fetch(`${API}/mlops/training/experiments/${encodeURIComponent(selected)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ samples: 200, noise: 0.15, seed: 42, learning_rate: 0.05, epochs: 200 }),
      });
      let response = await submit(auth.access_token);
      if (response.status === 401) {
        const refresh = await fetch(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refresh.ok) {
          setAuth(previous => previous?.refresh_token === auth.refresh_token ? null : previous);
          throw new Error('A munkamenet lejárt. Jelentkezz be újra.');
        }
        const tokens = await refresh.json() as Auth;
        setAuth(tokens);
        response = await submit(tokens.access_token);
      }
      if (!response.ok) throw new Error(`Tanítás sikertelen: HTTP ${response.status}`);
      const result = await response.json() as { run_id: string; metrics: { mae: number; rmse: number; r2: number } };
      setTrainingResult(result);
      const updated = await fetch(`${API}/mlops/experiments/${encodeURIComponent(selected)}/runs`, { cache: 'no-store' });
      if (updated.ok) setRuns(await updated.json() as Run[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nem sikerült elindítani a tanítást.');
    } finally {
      setTraining(false);
    }
  }

  async function predictRun(runId: string) {
    if (!canWrite || !auth || predictBusy) return;
    const raw = (predictInputs[runId] ?? '0, 1, 2').split(',').map(value => value.trim());
    const values = raw.map(Number);
    if (raw.length < 1 || raw.length > 1000 || raw.some(value => !value) || values.some(value => !Number.isFinite(value))) {
      setError('Adj meg 1–1000 véges számot, vesszővel elválasztva.');
      return;
    }
    setPredictBusy(runId);
    setError('');
    setPredictResults(previous => { const next = { ...previous }; delete next[runId]; return next; });
    try {
      const submit = (token: string) => fetch(`${API}/mlops/training/runs/${encodeURIComponent(runId)}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ values }),
      });
      let response = await submit(auth.access_token);
      if (response.status === 401) {
        const refresh = await fetch(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refresh.ok) {
          setAuth(previous => previous?.refresh_token === auth.refresh_token ? null : previous);
          throw new Error('A munkamenet lejárt. Jelentkezz be újra.');
        }
        const tokens = await refresh.json() as Auth;
        setAuth(tokens);
        response = await submit(tokens.access_token);
      }
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || `Prediction API: HTTP ${response.status}`);
      }
      const result = await response.json() as { predictions: number[] };
      setPredictResults(previous => ({ ...previous, [runId]: result.predictions }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Előrejelzés sikertelen.');
    } finally {
      setPredictBusy(null);
    }
  }

  async function compareRuns() {
    if (!selected || comparing) return;
    setComparing(true);
    setError('');
    setComparison([]);
    try {
      const eligible = runs.filter(run => run.status === 'completed').slice(0, 50);
      const results = await Promise.all(eligible.map(async run => {
        const response = await fetch(`${API}/mlops/experiments/runs/${encodeURIComponent(run.id)}/metrics`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Metrics API: HTTP ${response.status}`);
        const data = await response.json() as Metric[];
        const metric = (name: string) => [...data].reverse().find(item => item.name.toLowerCase() === name)?.value;
        const mae = metric('mae');
        if (mae === undefined || !Number.isFinite(mae)) return null;
        const rmse = metric('rmse');
        const r2 = metric('r2');
        return { id: run.id, mae, rmse: rmse !== undefined && Number.isFinite(rmse) ? rmse : null, r2: r2 !== undefined && Number.isFinite(r2) ? r2 : null };
      }));
      setComparison(results.filter((item): item is NonNullable<typeof item> => item !== null).sort((a, b) => a.mae - b.mae));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Összehasonlítás sikertelen.');
    } finally {
      setComparing(false);
    }
  }

  async function checkStaging(runId: string) {
    setCandidateRun(runId);
    setReadiness(null);
    setPromotionResult('');
    try {
      const response = await fetch(`${API}/mlops/experiments/runs/${encodeURIComponent(runId)}/staging-readiness`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Staging API HTTP ${response.status}`);
      setReadiness(await response.json() as { ready_for_staging_review: boolean; checks: Record<string, boolean> });
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Staging ellenőrzés sikertelen');
    }
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
      if (!refreshed.ok) { setAuth(previous => previous?.refresh_token === auth?.refresh_token ? null : previous); throw new Error('A munkamenet lejárt. Jelentkezz be újra.'); }
      const tokens = await refreshed.json() as Auth;
      setAuth(tokens);
      response = await submit(tokens.access_token);
    }
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  }

  async function promoteStaging(runId: string) {
    if (role !== 'admin' || !auth || promoting || !readiness?.ready_for_staging_review) return;
    if (!window.confirm('A regisztrált modell státusza staging lesz. Ez adatbázis-módosítás, nem modelltelepítés. Folytatod?')) return;
    setPromoting(true);
    setError('');
    setPromotionResult('');
    try {
      await authorizedWrite(`/mlops/experiments/runs/${encodeURIComponent(runId)}/promote-to-staging`, 'POST', {});
      setPromotionResult('Sikeres staging promotion: a modell regisztrációja staging állapotú. Artifact még nincs telepítve.');
      await checkStaging(runId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Staging promotion sikertelen'); }
    finally { setPromoting(false); }
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
      {canWrite && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-cyan-400/20 bg-black/20 p-3">
        <button type="button" disabled={training} onClick={() => void trainModel()} className="rounded bg-cyan-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50">{training ? 'Tanítás folyamatban...' : 'Train Model'}</button>
        <span className="text-xs text-slate-400">Szintetikus regresszió · 200 minta · 200 epoch</span>
      </div>}
      {trainingResult && <div role="status" className="rounded border border-emerald-400/30 p-3 text-sm text-emerald-200">
        Tanítás kész · MAE: {trainingResult.metrics.mae.toFixed(4)} · RMSE: {trainingResult.metrics.rmse.toFixed(4)} · R²: {trainingResult.metrics.r2.toFixed(4)}
      </div>}
      <div className="space-y-2 rounded-lg border border-white/10 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void compareRuns()} disabled={comparing || !runs.some(run => run.status === 'completed')} className="rounded border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50">{comparing ? 'Összehasonlítás...' : 'Compare Runs'}</button>
          <span className="text-xs text-slate-400">Befejezett futások rangsora MAE szerint (kisebb a jobb)</span>
        </div>
        {comparison.length > 0 && <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead><tr className="border-b border-white/10"><th className="p-2">Rang</th><th className="p-2">Run ID</th><th className="p-2">MAE</th><th className="p-2">RMSE</th><th className="p-2">R²</th></tr></thead>
            <tbody>{comparison.map((item, index) => <tr key={item.id} className={index === 0 ? 'bg-emerald-400/10' : 'border-t border-white/5'}>
              <td className="p-2">{index === 0 ? '1 · Best run' : index + 1}</td>
              <td className="p-2 font-mono">{item.id.slice(0, 12)}…</td>
              <td className="p-2">{item.mae.toFixed(4)}</td>
              <td className="p-2">{item.rmse?.toFixed(4) ?? '—'}</td>
              <td className="p-2">{item.r2?.toFixed(4) ?? '—'}</td>
            </tr>)}</tbody>
          </table>
          <button type="button" onClick={() => void checkStaging(comparison[0].id)} className="rounded border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200">Best run staging előkészítés</button>
          {candidateRun === comparison[0].id && <p className="mt-2 text-xs text-amber-200">Staging jelölt: {candidateRun}. Regisztrált modell: {models.find(m => m.id === experiments.find(e => e.id === selected)?.model_id)?.name ?? 'Nincs találat'}. Ez csak előkészítés, nem modelltelepítés.</p>}
          {candidateRun === comparison[0].id && readiness && <p className="mt-2 text-xs text-cyan-200">Backend validáció: {readiness.ready_for_staging_review ? 'Staging review kész' : 'Hiányos'} · {Object.entries(readiness.checks).map(([key, ok]) => `${key}: ${ok ? 'OK' : 'HIÁNYZIK'}`).join(' · ')}</p>}
          {candidateRun === comparison[0].id && readiness?.ready_for_staging_review && role === 'admin' && <button type="button" disabled={promoting} onClick={() => void promoteStaging(candidateRun)} className="mt-2 rounded border border-amber-400/50 px-3 py-2 text-xs text-amber-200 disabled:opacity-50">{promoting ? 'Staging promotion folyamatban...' : 'Promote to Staging (admin)'}</button>}
          {promotionResult && <p role="status" className="mt-2 text-xs text-emerald-200">{promotionResult}</p>}
          <p className="mt-2 text-xs text-slate-400">Csak az MAE metrikával rendelkező futások szerepelnek. Az összehasonlítás nem telepít modellt; különböző adatkészletek eredményei nem feltétlenül összevethetők.</p>
        </div>}
        {!comparing && comparison.length === 0 && <p className="text-xs text-slate-500">Kattints a Compare Runs gombra a metrikák betöltéséhez.</p>}
      </div>
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
        {canWrite && run.status === 'completed' && Boolean(run.hyperparameters?.model_artifact) && <div className="space-y-2 rounded border border-cyan-400/20 p-3">
          <label className="block text-xs text-slate-300">Predict · bemeneti X értékek (vesszővel elválasztva)
            <input aria-label={`Predict inputs ${run.id}`} value={predictInputs[run.id] ?? '0, 1, 2'} onChange={e => setPredictInputs(previous => ({ ...previous, [run.id]: e.target.value }))} placeholder="0, 1, 2" className="mt-1 w-full rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
          </label>
          <button type="button" disabled={predictBusy !== null} onClick={() => void predictRun(run.id)} className="rounded bg-cyan-500 px-3 py-2 text-xs font-medium text-black disabled:opacity-50">{predictBusy === run.id ? 'Számítás...' : 'Predict'}</button>
          {predictResults[run.id] && <p role="status" className="break-words text-emerald-200">Előrejelzés: {predictResults[run.id].map(value => value.toFixed(4)).join(', ')}</p>}
        </div>}
        <button type="button" onClick={() => void showMetrics(run.id)} className="text-cyan-300 underline">Metrikák megjelenítése</button>
        {metrics[run.id] && <div className="space-y-1">{metrics[run.id].length ? metrics[run.id].map(m => <p key={m.id}>{m.name}: {m.value} (step {m.step})</p>) : <p>Még nincs metrika.</p>}</div>}
      </div>)}
    </div>}
  </section>;
}
