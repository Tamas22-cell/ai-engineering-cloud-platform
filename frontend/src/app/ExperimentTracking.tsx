'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

type Experiment = { id: string; name: string; model_id: string };
type Run = { id: string; status: string; hyperparameters: Record<string, unknown>; dataset_version: string | null; git_commit_sha: string | null };
type Metric = { id: string; name: string; value: number; step: number };
type Auth = { access_token: string; refresh_token: string };
type Model = { id: string; name: string; version: string };
type TrainingDataset = { fileName: string; xValues: number[]; yValues: number[] };
type InputDrift = { status: string; window_days: number; batch_count: number; sample_count: number; baseline_mean: number; baseline_std: number; observed_mean: number | null; observed_std: number | null; mean_shift_in_std: number | null; std_ratio: number | null; outlier_rate: number | null; signals: string[]; note?: string };
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export default function ExperimentTracking({ auth, setAuth, models, role }: { auth: Auth | null; setAuth: Dispatch<SetStateAction<Auth | null>>; models: Model[]; role: string | null }) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeBusy, setActiveBusy] = useState(false);
  const [activeFeedback, setActiveFeedback] = useState('');
  const [activeValues, setActiveValues] = useState('0, 1, 2');
  const [activePrediction, setActivePrediction] = useState<number[] | null>(null);
  const [activePredictBusy, setActivePredictBusy] = useState(false);
  const [artifactVersions, setArtifactVersions] = useState<{ version_id: string; run_id: string; active: boolean; integrity_ok: boolean; dataset_version?: string | null; created_at?: string }[]>([]);
  const [artifactBusy, setArtifactBusy] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState('');
  const [rollbackPreview, setRollbackPreview] = useState<Record<string, unknown> | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
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
  const [inputDrift, setInputDrift] = useState<Record<string, InputDrift>>({});
  const [driftBusy, setDriftBusy] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [promotionResult, setPromotionResult] = useState('');
  const [candidateRun, setCandidateRun] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<{ ready_for_staging_review: boolean; checks: Record<string, boolean> } | null>(null);
  const [comparison, setComparison] = useState<{ id: string; mae: number; rmse: number | null; r2: number | null }[]>([]);
  const [trainingResult, setTrainingResult] = useState<{ run_id: string; dataset?: string; train_samples?: number; test_samples?: number; metrics: { mae: number; rmse: number; r2: number } } | null>(null);
  const [trainingDataset, setTrainingDataset] = useState<TrainingDataset | null>(null);
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
      const items = await response.json() as Experiment[];
      setExperiments(items);
      // Show Active Model controls immediately when there is only one experiment.
      setSelected(previous => previous || (items.length === 1 ? items[0].id : ''));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Experiment API unavailable'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void loadExperiments(); }, [loadExperiments]);

  useEffect(() => {
    setTrainingResult(null);
    setActiveRunId(null);
    setActiveFeedback('');
    setActivePrediction(null);
    setArtifactVersions([]);
    setRollbackTarget('');
    setRollbackPreview(null);
    setPredictResults({});
    setInputDrift({});
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
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Runs unavailablek'); }
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
          throw new Error('Session expired. Please sign in again.');
        }
        const tokens = await refresh.json() as Auth;
        setAuth(tokens);
        response = await submit(tokens.access_token);
      }
      if (!response.ok) throw new Error(`Creation failed: HTTP ${response.status}`);
      setName('');
      await loadExperiments();
    } catch (e) { setError(e instanceof Error ? e.message : 'Creation failed'); }
  }


  async function createRun() {
    if (!selected || !auth || !canWrite || creatingRun) return;
    let hyperparameters: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(hyperparametersText);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Hyperparameters must be a JSON object.');
      }
      hyperparameters = parsed as Record<string, unknown>;
    } catch (e) {
      setError(e instanceof SyntaxError ? 'Invalid hyperparameter JSON.' : e instanceof Error ? e.message : 'Invalid JSON.');
      return;
    }
    const sha = gitCommitSha.trim();
    if (sha && !/^[0-9a-fA-F]{40}$/.test(sha)) {
      setError('Git commit SHA must contain exactly 40 hexadecimal characters.');
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
        if (!refresh.ok) { setAuth(previous => previous?.refresh_token === auth?.refresh_token ? null : previous); throw new Error('Session expired. Please sign in again.'); }
        const tokens = await refresh.json() as Auth;
        setAuth(tokens);
        response = await submit(tokens.access_token);
      }
      if (!response.ok) throw new Error(`Run creation: HTTP ${response.status}`);
      const updated = await fetch(`${API}/mlops/experiments/${encodeURIComponent(selected)}/runs`, { cache: 'no-store' });
      if (!updated.ok) throw new Error(`Loading runs: HTTP ${updated.status}`);
      setRuns(await updated.json() as Run[]);
      setDatasetVersion('');
      setGitCommitSha('');
      setHyperparametersText('{}');
    } catch (e) { setError(e instanceof Error ? e.message : 'Run creation failed'); }
    finally { setCreatingRun(false); }
  }


  async function loadTrainingCsv(file?: File) {
    if (!file) return;
    setTrainingDataset(null);
    setTrainingResult(null);
    setError('');
    try {
      if (file.size > 200_000) throw new Error('Training CSV must be at most 200 KB.');
      const lines = (await file.text()).replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      if (lines.length === 0) throw new Error('CSV is empty.');
      const rows = lines.map(line => line.split(',').map(value => value.trim()));
      if (rows.some(row => row.length !== 2)) throw new Error('Training CSV must contain exactly two columns: x,y.');
      if (rows[0].some(value => !Number.isFinite(Number(value)))) rows.shift();
      const values = rows.map(row => row.map(Number));
      if (values.length < 50 || values.length > 2000) throw new Error('50–2000 data rows are required (excluding header).');
      if (values.some(row => row.some(value => !Number.isFinite(value)))) throw new Error('Only finite numeric x,y values are supported.');
      setTrainingDataset({ fileName: file.name, xValues: values.map(row => row[0]), yValues: values.map(row => row[1]) });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Training CSV could not be read.');
    }
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
        body: JSON.stringify({ samples: 200, noise: 0.15, seed: 42, learning_rate: 0.05, epochs: 200, ...(trainingDataset ? { samples: trainingDataset.xValues.length, x_values: trainingDataset.xValues, y_values: trainingDataset.yValues } : {}) }),
      });
      let response = await submit(auth.access_token);
      if (response.status === 401) {
        const refresh = await fetch(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refresh.ok) {
          setAuth(previous => previous?.refresh_token === auth.refresh_token ? null : previous);
          throw new Error('Session expired. Please sign in again.');
        }
        const tokens = await refresh.json() as Auth;
        setAuth(tokens);
        response = await submit(tokens.access_token);
      }
      if (!response.ok) throw new Error(`Training failed: HTTP ${response.status}`);
      const result = await response.json() as { run_id: string; dataset?: string; train_samples?: number; test_samples?: number; metrics: { mae: number; rmse: number; r2: number } };
      setTrainingResult(result);
      const updated = await fetch(`${API}/mlops/experiments/${encodeURIComponent(selected)}/runs`, { cache: 'no-store' });
      if (updated.ok) setRuns(await updated.json() as Run[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start training.');
    } finally {
      setTraining(false);
    }
  }

  async function predictRun(runId: string) {
    if (!canWrite || !auth || predictBusy) return;
    const raw = (predictInputs[runId] ?? '0, 1, 2').split(',').map(value => value.trim());
    const values = raw.map(Number);
    if (raw.length < 1 || raw.length > 1000 || raw.some(value => !value) || values.some(value => !Number.isFinite(value))) {
      setError('Enter 1–1000 finite numbers separated by commas.');
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
          throw new Error('Session expired. Please sign in again.');
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
      await loadInputDrift(runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prediction failed.');
    } finally {
      setPredictBusy(null);
    }
  }

  async function loadInputDrift(runId: string) {
    if (!auth || driftBusy) return;
    setDriftBusy(runId);
    try {
      const response = await authenticatedGet(`/mlops/training/runs/${encodeURIComponent(runId)}/input-drift`);
      const summary = await response.json() as InputDrift;
      setInputDrift(previous => ({ ...previous, [runId]: summary }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Input drift status unavailable.');
    } finally {
      setDriftBusy(null);
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
      setError(e instanceof Error ? e.message : 'Comparison failed.');
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
      setError(e instanceof Error ? e.message : 'Staging verification failed');
    }
  }

  async function authorizedWrite(path: string, method: 'POST' | 'PATCH', payload: object) {
    if (!auth) throw new Error('Please sign in again.');
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
      if (!refreshed.ok) { setAuth(previous => previous?.refresh_token === auth?.refresh_token ? null : previous); throw new Error('Session expired. Please sign in again.'); }
      const tokens = await refreshed.json() as Auth;
      setAuth(tokens);
      response = await submit(tokens.access_token);
    }
    if (!response.ok) throw new Error(`API HTTP ${response.status}`);
  }

  async function promoteStaging(runId: string) {
    if (role !== 'admin' || !auth || promoting || !readiness?.ready_for_staging_review) return;
    if (!window.confirm('The registered model will be set to staging. This changes database state, not deployment. Continue?')) return;
    setPromoting(true);
    setError('');
    setPromotionResult('');
    try {
      await authorizedWrite(`/mlops/experiments/runs/${encodeURIComponent(runId)}/promote-to-staging`, 'POST', {});
      setPromotionResult('Staging promotion succeeded: model registration is now staged. No artifact has been deployed.');
      await checkStaging(runId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Staging promotion failed'); }
    finally { setPromoting(false); }
  }


  async function authenticatedGet(path: string) {
    if (!auth) throw new Error('Please sign in again.');
    let response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${auth.access_token}` }, cache: 'no-store' });
    if (response.status === 401) {
      const refreshed = await fetch(`${API}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: auth.refresh_token }),
      });
      if (!refreshed.ok) {
        setAuth(previous => previous?.refresh_token === auth.refresh_token ? null : previous);
        throw new Error('Session expired. Please sign in again.');
      }
      const tokens = await refreshed.json() as Auth;
      setAuth(tokens);
      response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store' });
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { detail?: string } | null;
      throw new Error(detail?.detail || `API HTTP ${response.status}`);
    }
    return response;
  }

  async function predictActive() {
    if (!selected || !auth || activePredictBusy || !activeRunId) return;
    const raw = activeValues.split(',').map(value => value.trim());
    const values = raw.map(Number);
    if (!raw.length || raw.length > 1000 || raw.some(value => !value) || values.some(value => !Number.isFinite(value))) {
      setError('Enter 1–1000 finite numbers separated by commas.'); return;
    }
    setActivePredictBusy(true); setActivePrediction(null); setError('');
    try {
      const submit = (token: string) => fetch(`${API}/mlops/training/experiments/${encodeURIComponent(selected)}/predict-active`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ values }),
      });
      let response = await submit(auth.access_token);
      if (response.status === 401) {
        const refreshed = await fetch(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refreshed.ok) { setAuth(previous => previous?.refresh_token === auth.refresh_token ? null : previous); throw new Error('Session expired. Please sign in again.'); }
        const tokens = await refreshed.json() as Auth; setAuth(tokens); response = await submit(tokens.access_token);
      }
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || `Active model predictione: HTTP ${response.status}`);
      }
      const result = await response.json() as { predictions: number[] };
      setActivePrediction(result.predictions);
    } catch (e) { setError(e instanceof Error ? e.message : 'Active model predictione failed.'); }
    finally { setActivePredictBusy(false); }
  }

  async function loadArtifactVersions() {
    if (!selected || artifactBusy) return;
    setArtifactBusy(true); setError('');
    try {
      const response = await authenticatedGet(`/mlops/training/experiments/${encodeURIComponent(selected)}/artifact-versions`);
      const data = await response.json() as { versions: typeof artifactVersions };
      setArtifactVersions(data.versions || []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Artifact versions could not be loaded.'); }
    finally { setArtifactBusy(false); }
  }

  async function previewRollback() {
    if (!selected || !rollbackTarget || rollbackBusy) return;
    setRollbackBusy(true); setRollbackPreview(null); setError('');
    try {
      const response = await authenticatedGet(`/mlops/training/experiments/${encodeURIComponent(selected)}/rollback-preview/${encodeURIComponent(rollbackTarget)}`);
      setRollbackPreview(await response.json() as Record<string, unknown>);
    } catch (e) { setError(e instanceof Error ? e.message : 'Rollback preview could not be loaded.'); }
    finally { setRollbackBusy(false); }
  }

  async function activeRequest(runId?: string) {
    if (!selected || !auth || activeBusy) return;
    if (runId && (role !== 'admin' || !window.confirm('Change the active model version? The previous version can be restored.'))) return;
    setActiveBusy(true); setError(''); setActiveFeedback('');
    try {
      const url = `${API}/mlops/training/experiments/${encodeURIComponent(selected)}/active-version${runId ? '/' + encodeURIComponent(runId) : ''}`;
      const submit = (token: string) => fetch(url, {
        method: runId ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      let response = await submit(auth.access_token);
      if (response.status === 401) {
        const refresh = await fetch(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refresh.ok) throw new Error('Session expired. Please sign in again.');
        const tokens = await refresh.json() as Auth;
        setAuth(tokens); response = await submit(tokens.access_token);
      }
      if (!response.ok) throw new Error(`Active Version API: HTTP ${response.status}`);
      const data = await response.json() as { active_run_id: string | null };
      setActiveRunId(data.active_run_id);
      setActiveFeedback(data.active_run_id
        ? `Active model version: ${data.active_run_id}${runId ? ' (successfully activated)' : ' (loaded)'}`
        : 'Request succeeded: no active model version currently exists.');
    } catch (e) {
      setActiveFeedback('');
      setError(e instanceof Error ? e.message : 'Failed to load active version');
    }
    finally { setActiveBusy(false); }
  }

  async function changeStatus(runId: string, status: string) {
    if (!selected || busyRun) return;
    setBusyRun(runId); setError('');
    try {
      await authorizedWrite(`/mlops/experiments/runs/${encodeURIComponent(runId)}/status`, 'PATCH', { status });
      const response = await fetch(`${API}/mlops/experiments/${encodeURIComponent(selected)}/runs`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Run API HTTP ${response.status}`);
      setRuns(await response.json() as Run[]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update status'); }
    finally { setBusyRun(null); }
  }

  async function recordRunMetric(runId: string) {
    if (busyRun) return;
    const input = metricInputs[runId];
    const value = Number(input?.value);
    if (!input?.name.trim() || !input.value.trim() || !Number.isFinite(value)) {
      setError('Enter a metric name and valid numeric value.'); return;
    }
    setBusyRun(runId); setError('');
    try {
      await authorizedWrite(`/mlops/experiments/runs/${encodeURIComponent(runId)}/metrics`, 'POST', {
        name: input.name.trim(), value, step: 0,
      });
      setMetricInputs(previous => ({ ...previous, [runId]: { name: '', value: '' } }));
      await showMetrics(runId);
    } catch (e) { setError(e instanceof Error ? e.message : 'Metric savinge failed'); }
    finally { setBusyRun(null); }
  }

  async function showMetrics(runId: string) {
    try {
      const response = await fetch(`${API}/mlops/experiments/runs/${encodeURIComponent(runId)}/metrics`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Metrics API: HTTP ${response.status}`);
      const data = await response.json() as Metric[];
      setMetrics(previous => ({ ...previous, [runId]: data }));
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Metrics unavailable'); }
  }

  return <section className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-semibold">Experiment Tracking 2.0</h3><p className="text-xs text-slate-400">Experiments, runs, hyperparameters and version tracking</p></div>
      <button type="button" onClick={() => void loadExperiments()} disabled={loading} className="rounded border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50">{loading ? 'Loading...' : 'Refresh'}</button>
    </div>
    {canWrite && <div className="flex flex-wrap gap-2">
      <select aria-label="Experiment model" value={modelId} onChange={e => setModelId(e.target.value)} className="rounded border border-white/15 bg-[#11151C] p-2 text-sm">
        <option value="">Select model</option>{models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.version})</option>)}
      </select>
      <input aria-label="Experiment name" value={name} maxLength={160} onChange={e => setName(e.target.value)} placeholder="Experiment name" className="rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
      <button type="button" onClick={() => void createExperiment()} disabled={!name.trim() || !modelId} className="rounded bg-cyan-500 px-3 py-2 text-xs text-black disabled:opacity-50">Create experiment</button>
    </div>}
    {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
    <select aria-label="Select experiment" value={selected} onChange={e => setSelected(e.target.value)} className="w-full rounded border border-white/15 bg-[#11151C] p-2 text-sm">
      <option value="">Select experiment ({experiments.length})</option>
      {experiments.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
    {selected && <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded border border-white/15 p-3 text-xs">
        <span>Active model: {activeRunId ? activeRunId.slice(0, 8) + '…' : 'not selected / not loaded yet'}</span>
        <button type="button" disabled={!auth || activeBusy} onClick={() => void activeRequest()} className="rounded border border-cyan-400/40 px-2 py-1 text-cyan-200 disabled:opacity-50">{activeBusy ? 'Loading...' : 'Refresh active version'}</button>
        {role === 'admin' && <select aria-label="Select active model" disabled={activeBusy} value="" onChange={e => { if (e.target.value) void activeRequest(e.target.value); }} className="rounded bg-[#11151C] p-1">
          <option value="">Activate version / rollback…</option>
          {runs.filter(run => run.status === 'completed' && !!run.hyperparameters?.model_artifact).map(run => <option key={run.id} value={run.id}>{run.id.slice(0, 8)}{run.id === activeRunId ? ' (active)' : ''}</option>)}
        </select>}
      </div>
      {activeFeedback && <p role="status" aria-live="polite" className="text-xs text-emerald-300">{activeFeedback}</p>}
      {activeRunId && auth && <div className="space-y-2 rounded border border-white/10 p-3">
        <p className="text-sm font-medium">Prediction with active model</p>
        <div className="flex flex-wrap gap-2">
          <input aria-label="Active model input values" value={activeValues} onChange={e => setActiveValues(e.target.value)} placeholder="0, 1, 2" className="min-w-48 flex-1 rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
          <button type="button" disabled={activePredictBusy} onClick={() => void predictActive()} className="rounded bg-cyan-500 px-3 py-2 text-xs text-black disabled:opacity-50">{activePredictBusy ? 'Computing...' : 'Run active model'}</button>
        </div>
        {activePrediction && <p role="status" className="break-words text-emerald-200">Result: {activePrediction.map(value => value.toFixed(4)).join(', ')}</p>}
      </div>}
      <div className="space-y-2 rounded border border-white/10 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Artifact versions and rollback verification</p>
          <button type="button" disabled={!auth || artifactBusy} onClick={() => void loadArtifactVersions()} className="rounded border border-cyan-400/40 px-2 py-1 text-xs text-cyan-200 disabled:opacity-50">{artifactBusy ? 'Loading...' : 'Refresh versions'}</button>
        </div>
        {artifactVersions.length > 0 && <div className="space-y-2 text-xs">
          {artifactVersions.map(version => <p key={version.version_id} className="break-all text-slate-300">Run: {version.run_id} · integrity: {version.integrity_ok ? 'valid' : 'invalid'}{version.active ? ' · active' : ''}</p>)}
          <div className="flex flex-wrap gap-2">
            <select aria-label="Rollback target run" value={rollbackTarget} onChange={e => { setRollbackTarget(e.target.value); setRollbackPreview(null); }} className="min-w-48 flex-1 rounded bg-[#11151C] p-2">
              <option value="">Select previous run</option>
              {artifactVersions.map(version => <option key={version.run_id} value={version.run_id}>{version.run_id.slice(0, 8)}{version.active ? ' (active)' : ''}</option>)}
            </select>
            <button type="button" disabled={!rollbackTarget || rollbackBusy} onClick={() => void previewRollback()} className="rounded border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50">{rollbackBusy ? 'Verification...' : 'Verify rollback'}</button>
          </div>
          {rollbackPreview && <div role="status" className="space-y-1 rounded bg-black/20 p-2 text-xs">
            <p className={rollbackPreview.eligible_for_activation_review === true ? 'text-emerald-300' : 'text-amber-300'}>{rollbackPreview.eligible_for_activation_review === true ? 'Eligible for activation based on verification.' : 'Verification does not allow activation.'}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap text-slate-300">{JSON.stringify(rollbackPreview.checks ?? rollbackPreview, null, 2)}</pre>
            <p className="text-slate-400">Activation requires admin access; this verification does not change the active version.</p>
            {role === 'admin' && rollbackPreview.eligible_for_activation_review === true && <button type="button" disabled={activeBusy} onClick={() => void activeRequest(rollbackTarget)} className="rounded bg-emerald-500 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50">{activeBusy ? 'Activating...' : 'Activate verified version'}</button>}
          </div>}
        </div>}
      </div>
      {!auth && <p className="text-xs text-amber-300">Sign in to load the active model.</p>}
      <p className="text-xs text-slate-400">{runs.length} run (legfeljebb 50)</p>
      {canWrite && <div className="space-y-3 rounded-lg border border-cyan-400/20 bg-black/20 p-3">
        <label className="block text-xs text-slate-300">Regression CSV (two numeric columns: x,y; 50–2000 rows; max 200 KB)
          <input type="file" accept=".csv,text/csv" disabled={training} onChange={event => void loadTrainingCsv(event.target.files?.[0])} className="mt-2 block w-full text-sm" />
        </label>
        {trainingDataset && <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-300"><span>{trainingDataset.fileName} · {trainingDataset.xValues.length} samples · raw data is transmitted only for the training request</span><button type="button" onClick={() => setTrainingDataset(null)} className="rounded border border-white/20 px-2 py-1">Remove CSV</button></div>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={training} onClick={() => void trainModel()} className="rounded bg-cyan-500 px-4 py-2 text-sm font-medium text-black disabled:opacity-50">{training ? 'Training folyamatban...' : 'Train Model'}</button>
          <span className="text-xs text-slate-400">{trainingDataset ? 'Custom CSV regression' : 'Synthetic regression · 200 samples'} · 200 epoch</span>
        </div>
      </div>}
      {trainingResult && <div role="status" className="rounded border border-emerald-400/30 p-3 text-sm text-emerald-200">
        Training complete · {trainingResult.dataset === 'uploaded_csv' ? 'Custom CSV' : 'Synthetic data'} · {trainingResult.train_samples ?? '—'} training / {trainingResult.test_samples ?? '—'} test samples · MAE: {trainingResult.metrics.mae.toFixed(4)} · RMSE: {trainingResult.metrics.rmse.toFixed(4)} · R²: {trainingResult.metrics.r2.toFixed(4)}
      </div>}
      <div className="space-y-2 rounded-lg border border-white/10 p-3">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void compareRuns()} disabled={comparing || !runs.some(run => run.status === 'completed')} className="rounded border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200 disabled:opacity-50">{comparing ? 'Comparison...' : 'Compare Runs'}</button>
          <span className="text-xs text-slate-400">Befejezett runs rangsora MAE szerint (kisebb a jobb)</span>
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
          <button type="button" onClick={() => void checkStaging(comparison[0].id)} className="rounded border border-cyan-400/40 px-3 py-2 text-xs text-cyan-200">Prepare best run for staging</button>
          {candidateRun === comparison[0].id && <p className="mt-2 text-xs text-amber-200">Staging candidate: {candidateRun}. Registered model: {models.find(m => m.id === experiments.find(e => e.id === selected)?.model_id)?.name ?? 'Not found'}. Preparation only, not model deployment.</p>}
          {candidateRun === comparison[0].id && readiness && <p className="mt-2 text-xs text-cyan-200">Backend validation: {readiness.ready_for_staging_review ? 'Ready for staging review' : 'Incomplete'} · {Object.entries(readiness.checks).map(([key, ok]) => `${key}: ${ok ? 'OK' : 'MISSING'}`).join(' · ')}</p>}
          {candidateRun === comparison[0].id && readiness?.ready_for_staging_review && role === 'admin' && <button type="button" disabled={promoting} onClick={() => void promoteStaging(candidateRun)} className="mt-2 rounded border border-amber-400/50 px-3 py-2 text-xs text-amber-200 disabled:opacity-50">{promoting ? 'Staging promotion folyamatban...' : 'Promote to Staging (admin)'}</button>}
          {promotionResult && <p role="status" className="mt-2 text-xs text-emerald-200">{promotionResult}</p>}
          <p className="mt-2 text-xs text-slate-400">Only runs with MAE metrics are shown. Comparison does not deploy models; results from different datasets may not be comparable.</p>
        </div>}
        {!comparing && comparison.length === 0 && <p className="text-xs text-slate-500">Click Compare Runs to load metrics.</p>}
      </div>
      {canWrite && <div className="space-y-3 rounded-lg border border-white/10 bg-black/20 p-3">
        <p className="text-sm font-medium text-slate-100">New run details</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-slate-300">Dataset version (optional)
            <input aria-label="Dataset version" maxLength={160} value={datasetVersion} onChange={e => setDatasetVersion(e.target.value)} placeholder="e.g. dataset-v1.2" className="w-full rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
          </label>
          <label className="space-y-1 text-xs text-slate-300">Git commit SHA (optional, 40 hex karakter)
            <input aria-label="Git commit SHA" maxLength={40} value={gitCommitSha} onChange={e => setGitCommitSha(e.target.value)} placeholder="40 karakteres commit hash" className="w-full rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
          </label>
        </div>
        <label className="block space-y-1 text-xs text-slate-300">Hyperparameters (JSON object)
          <textarea aria-label="Hyperparameters JSON" rows={3} value={hyperparametersText} onChange={e => setHyperparametersText(e.target.value)} spellCheck={false} className="w-full rounded border border-white/15 bg-[#11151C] p-2 font-mono text-sm" />
        </label>
        <button type="button" disabled={creatingRun} onClick={() => void createRun()} className="rounded bg-cyan-500 px-3 py-2 text-xs text-black disabled:opacity-50">{creatingRun ? 'Creation...' : 'Create new run'}</button>
      </div>}
      {runs.map(run => {
        const drift = inputDrift[run.id];
        return <div key={run.id} className="rounded border border-white/10 p-3 text-xs space-y-2">
        <p className="font-medium text-cyan-200">{run.id} · {run.status}</p>
        <p>Dataset: {run.dataset_version || '—'} · Commit: {run.git_commit_sha?.slice(0, 12) || '—'}</p>
        <pre className="overflow-x-auto whitespace-pre-wrap text-slate-300">{JSON.stringify(run.hyperparameters, null, 2)}</pre>
        {canWrite && <div className="flex flex-wrap gap-2">
          {(run.status === 'pending' ? ['running', 'cancelled'] : run.status === 'running' ? ['completed', 'failed', 'cancelled'] : []).map(next => (
            <button key={next} type="button" disabled={busyRun !== null} onClick={() => void changeStatus(run.id, next)} className="rounded border border-white/20 px-2 py-1 disabled:opacity-50">{next}</button>
          ))}
        </div>}
        {canWrite && (run.status === 'pending' || run.status === 'running') && <div className="flex flex-wrap gap-2">
          <input aria-label="Metric neve" maxLength={80} value={metricInputs[run.id]?.name ?? ''} onChange={e => setMetricInputs(previous => ({ ...previous, [run.id]: { name: e.target.value, value: previous[run.id]?.value ?? '' } }))} placeholder="Metric neve" className="rounded border border-white/15 bg-[#11151C] p-2" />
          <input aria-label="Metric value" type="number" step="any" value={metricInputs[run.id]?.value ?? ''} onChange={e => setMetricInputs(previous => ({ ...previous, [run.id]: { name: previous[run.id]?.name ?? '', value: e.target.value } }))} placeholder="Value" className="w-28 rounded border border-white/15 bg-[#11151C] p-2" />
          <button type="button" disabled={busyRun !== null} onClick={() => void recordRunMetric(run.id)} className="rounded border border-cyan-400/40 px-2 py-1 text-cyan-200 disabled:opacity-50">Metric savinge</button>
        </div>}
        {canWrite && run.status === 'completed' && Boolean(run.hyperparameters?.model_artifact) && <div className="space-y-2 rounded border border-cyan-400/20 p-3">
          <label className="block text-xs text-slate-300">Predict · input X values (comma-separated)
            <input aria-label={`Predict inputs ${run.id}`} value={predictInputs[run.id] ?? '0, 1, 2'} onChange={e => setPredictInputs(previous => ({ ...previous, [run.id]: e.target.value }))} placeholder="0, 1, 2" className="mt-1 w-full rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
          </label>
          <button type="button" disabled={predictBusy !== null} onClick={() => void predictRun(run.id)} className="rounded bg-cyan-500 px-3 py-2 text-xs font-medium text-black disabled:opacity-50">{predictBusy === run.id ? 'Computing...' : 'Predict'}</button>
          {predictResults[run.id] && <p role="status" className="break-words text-emerald-200">Prediction: {predictResults[run.id].map(value => value.toFixed(4)).join(', ')}</p>}
          <button type="button" disabled={driftBusy !== null} onClick={() => void loadInputDrift(run.id)} className="rounded border border-violet-400/40 px-3 py-2 text-xs text-violet-200 disabled:opacity-50">{driftBusy === run.id ? 'Measuring drift...' : 'Check input drift'}</button>
          {drift && <div className="rounded border border-white/10 bg-black/20 p-3 text-xs">
            <p className={drift.status === 'drift_detected' ? 'font-medium text-amber-200' : drift.status === 'within_expected_range' ? 'font-medium text-emerald-200' : 'font-medium text-slate-300'}>
              {drift.status === 'drift_detected' ? 'Drift detected' : drift.status === 'within_expected_range' ? 'Sample within expected range' : drift.status === 'insufficient_data' ? 'Insufficient data to classify' : drift.status === 'no_inference_data' ? 'No recorded inference data' : drift.status}
            </p>
            <p className="mt-1 text-slate-300">{drift.sample_count} values · {drift.batch_count} batch · 30 days</p>
            {drift.mean_shift_in_std !== null && <p className="mt-1 text-slate-400">Mean shift: {drift.mean_shift_in_std.toFixed(2)} standard deviations · standard deviation ratio: {(drift.std_ratio ?? 0).toFixed(2)} · &gt;3σ values: {((drift.outlier_rate ?? 0) * 100).toFixed(1)}%</p>}
            {drift.signals.length > 0 && <p className="mt-1 text-amber-200">Signals: {drift.signals.join(', ')}</p>}
            <p className="mt-1 text-slate-500">Backend stores only aggregate data, not raw inputs. Heuristic signal, not a quality guarantee.</p>
          </div>}
        </div>}
        <button type="button" onClick={() => void showMetrics(run.id)} className="text-cyan-300 underline">Show metrics</button>
        {metrics[run.id] && <div className="space-y-1">{metrics[run.id].length ? metrics[run.id].map(m => <p key={m.id}>{m.name}: {m.value} (step {m.step})</p>) : <p>No metric.</p>}</div>}
      </div>;
      })}
    </div>}
  </section>;
}
