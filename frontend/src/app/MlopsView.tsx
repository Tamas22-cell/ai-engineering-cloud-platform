'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

type AuthResponse = { access_token: string; refresh_token: string };
type MetricSummary = { metric_name: string; latest: number; average: number; delta: number; threshold: number | null; alert: boolean; count: number };
type ModelRun = { id: string; metric_name: string; metric_value: number; duration_ms: number }; 
type CurrentUser = { email: string; role: string; is_active: boolean };
type Model = { id: string; name: string; version: string; framework: string; stage: string };
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

async function fetchWithTimeout(input: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Az API 15 másodpercen belül nem válaszolt. Próbáld újra később.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default function MlopsView({ auth, setAuth }: { auth: AuthResponse | null; setAuth: Dispatch<SetStateAction<AuthResponse | null>> }) {
  const [models, setModels] = useState<Model[]>([]);
  const [profile, setProfile] = useState<{ email: string; role: string } | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [checkingUser, setCheckingUser] = useState(false);
  const [newName, setNewName] = useState('');
  const [newVersion, setNewVersion] = useState('1.0.0');
  const [newFramework, setNewFramework] = useState('PyTorch');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState<Record<string, ModelRun[]>>({});
  const [loading, setLoading] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [recordingModel, setRecordingModel] = useState<string | null>(null);
  const [runValues, setRunValues] = useState<Record<string, string>>({});
  const [summaries, setSummaries] = useState<Record<string, MetricSummary>>({});
  const [metricNames, setMetricNames] = useState<Record<string, string>>({});
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [directions, setDirections] = useState<Record<string, 'below' | 'above'>>({});

  useEffect(() => {
    if (!auth) { setCurrentUser(null); setProfile(null); return; }
    let cancelled = false;
    async function checkPermissions() {
      try {
        let response = await fetchWithTimeout(`${API}/auth/me`, { headers: { Authorization: `Bearer ${auth!.access_token}` }, cache: 'no-store' });
        if (response.status === 401) {
          const refreshed = await fetchWithTimeout(`${API}/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: auth!.refresh_token }) });
          if (refreshed.ok) {
            const tokens = await refreshed.json() as AuthResponse;
            if (!cancelled) setAuth(tokens);
            response = await fetchWithTimeout(`${API}/auth/me`, { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: 'no-store' });
          } else if (!cancelled) { setAuth(null); return; }
        }
        if (response.ok && !cancelled) setCurrentUser(await response.json() as CurrentUser);
      } catch { /* The manual role check remains available if the API is temporarily offline. */ }
    }
    void checkPermissions();
    return () => { cancelled = true; };
  }, [auth]);

  async function authorizedGet(path: string): Promise<Response> {
    if (!auth) throw new Error('Jelentkezz be az Agents vagy a RAG oldalon.');
    const request = (accessToken: string) => fetchWithTimeout(`${API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    });
    let response = await request(auth.access_token);
    if (response.status === 401) {
      const refreshed = await fetchWithTimeout(`${API}/auth/refresh`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: auth.refresh_token }),
      });
      if (!refreshed.ok) {
        setAuth(null);
        throw new Error('A munkamenet lejárt. Jelentkezz be újra.');
      }
      const tokens = (await refreshed.json()) as AuthResponse;
      setAuth(tokens);
      response = await request(tokens.access_token);
    }
    return response;
  }

  async function createModel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth) { setError('Jelentkezz be először.'); return; }
    if (!currentUser || !['admin', 'developer'].includes(currentUser.role)) { setError('Modellt csak admin vagy developer regisztrálhat.'); return; }
    if (!newName.trim() || !newVersion.trim() || !newFramework.trim()) {
      setError('Minden mező kitöltése kötelező.'); return;
    }
    setCreating(true);
    setError('');
    try {
      const request = (token: string) => fetchWithTimeout(`${API}/mlops/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), version: newVersion.trim(), framework: newFramework.trim() }),
      });
      let response = await request(auth.access_token);
      if (response.status === 401) {
        const refreshed = await fetchWithTimeout(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refreshed.ok) { setAuth(null); throw new Error('A munkamenet lejárt. Jelentkezz be újra.'); }
        const tokens = (await refreshed.json()) as AuthResponse;
        setAuth(tokens);
        response = await request(tokens.access_token);
      }
      if (!response.ok) {
        if (response.status === 403) throw new Error('Modellt csak admin vagy developer szerepkörrel lehet regisztrálni.');
        if (response.status === 409) throw new Error('Ez a modellverzió már regisztrálva van.');
        throw new Error(`Modellregisztráció sikertelen: HTTP ${response.status}`);
      }
      const model = (await response.json()) as Model;
      setModels(previous => [model, ...previous.filter(m => m.id !== model.id)]);
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nem sikerült regisztrálni a modellt.');
    } finally {
      setCreating(false);
    }
  }

  async function checkRole() {
    setCheckingUser(true);
    setError('');
    try {
      const response = await authorizedGet('/auth/me');
      if (!response.ok) throw new Error(`Fiókellenőrzés: HTTP ${response.status}`);
      setCurrentUser((await response.json()) as CurrentUser);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nem sikerült ellenőrizni a fiókot.');
    } finally {
      setCheckingUser(false);
    }
  }

  async function loadProfile() {
    setError('');
    setProfileLoading(true);
    try {
      const response = await authorizedGet('/auth/me');
      if (!response.ok) throw new Error(`Fiókadatok: HTTP ${response.status}`);
      const data = await response.json() as { email: string; role: string };
      setProfile({ email: data.email, role: data.role });
    } catch (e) {
      setProfile(null);
      setError(e instanceof Error ? e.message : 'Nem sikerült lekérdezni a fiókot.');
    } finally {
      setProfileLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadPublicModels() {
      setLoading(true);
      try {
        const response = await fetchWithTimeout(`${API}/mlops/models`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Model Registry API: HTTP ${response.status}`);
        const data = await response.json() as Model[];
        if (!cancelled) { setModels(data); setModelsLoaded(true); setError(''); }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'A modelllista nem elérhető.');
      } finally { if (!cancelled) setLoading(false); }
    }
    void loadPublicModels();
    return () => { cancelled = true; };
  }, []);

  async function loadModels() {
    setError('');
    setLoading(true);
    try {
      const response = await fetchWithTimeout(`${API}/mlops/models`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Model Registry API: HTTP ${response.status}`);
      setModels(await response.json() as Model[]);
      setModelsLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Az API nem elérhető.');
    } finally {
      setLoading(false);
    }
  }

  async function recordMetric(modelId: string) {
    if (!auth) { setError('Jelentkezz be először.'); return; }
    if (!currentUser || !['admin', 'developer'].includes(currentUser.role)) { setError('Metrikát csak admin vagy developer rögzíthet.'); return; }
    const metricValue = Number(runValues[modelId] ?? '');
    if (!(runValues[modelId] ?? '').trim() || !Number.isFinite(metricValue)) {
      setError('Adj meg egy érvényes, véges metrikaértéket.'); return;
    }
    const metricName = (metricNames[modelId] || 'accuracy').trim();
    if (!metricName) { setError('Adj meg metrikanevet.'); return; }
    setRecordingModel(modelId);
    setError('');
    try {
      const request = (token: string) => fetchWithTimeout(`${API}/mlops/models/${encodeURIComponent(modelId)}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ metric_name: metricName, metric_value: metricValue, duration_ms: 0 }),
      });
      let response = await request(auth.access_token);
      if (response.status === 401) {
        const refreshed = await fetchWithTimeout(`${API}/auth/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.refresh_token }),
        });
        if (!refreshed.ok) { setAuth(null); throw new Error('A munkamenet lejárt.'); }
        const tokens = await refreshed.json() as AuthResponse;
        setAuth(tokens);
        response = await request(tokens.access_token);
      }
      if (!response.ok) {
        if (response.status === 403) throw new Error('Metrikát csak admin vagy developer rögzíthet.');
        throw new Error(`Metrikarögzítés sikertelen: HTTP ${response.status}`);
      }
      setRunValues(previous => ({ ...previous, [modelId]: '' }));
      await loadRuns(modelId);
      await loadSummary(modelId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Metrikarögzítés sikertelen.');
    } finally {
      setRecordingModel(null);
    }
  }

  async function loadRuns(modelId: string) {
    try {
      const response = await fetchWithTimeout(`${API}/mlops/models/${encodeURIComponent(modelId)}/runs`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Model run API: HTTP ${response.status}`);
      const data = (await response.json()) as ModelRun[];
      setRuns(previous => ({ ...previous, [modelId]: data }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A metrikák nem elérhetők.');
    }
  }

  async function loadSummary(modelId: string) {
    try {
      const metricName = (metricNames[modelId] || 'mae').trim();
      if (!metricName) throw new Error('Adj meg egy metrikanevet.');
      const rawThreshold = (thresholds[modelId] ?? '').trim();
      const parsedThreshold = rawThreshold === '' ? null : Number(rawThreshold);
      if (parsedThreshold !== null && !Number.isFinite(parsedThreshold)) {
        throw new Error('A küszöbértéknek véges számnak kell lennie.');
      }
      const direction = directions[modelId] || 'below';
      const params = new URLSearchParams({ direction });
      if (parsedThreshold !== null) params.set('threshold', String(parsedThreshold));
      const response = await fetchWithTimeout(`${API}/mlops/models/${encodeURIComponent(modelId)}/metrics/${encodeURIComponent(metricName)}/summary?${params}`, { cache: 'no-store' });
      if (response.status === 404) { setSummaries(previous => { const next = { ...previous }; delete next[modelId]; return next; }); throw new Error(`Ehhez a metrikához még nincs mérés: ${metricName}`); }
      if (!response.ok) throw new Error(`Metric summary: HTTP ${response.status}`);
      const data = (await response.json()) as MetricSummary;
      setSummaries(previous => ({ ...previous, [modelId]: data }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A metrika nem elérhető.');
    }
  }

  return <section className="max-w-4xl space-y-5">
    <h2 className="text-xl font-semibold">MLOps / Model Registry</h2>
    <p className="text-sm text-[#9AA3AE]">Nyilvános, automatikusan frissülő modelllista a FastAPI backendről. Modellmódosításhoz bejelentkezés szükséges.</p>
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <p className="text-sm text-[#9AA3AE]">{auth ? 'Közös munkamenet: bejelentkezve.' : 'Jelentkezz be az Agents vagy a RAG oldalon. Nem kell tokent másolni.'}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={checkRole} disabled={!auth || checkingUser} className="rounded-lg border border-cyan-400/50 px-4 py-2 text-sm text-cyan-200 disabled:opacity-50">{checkingUser ? 'Ellenőrzés...' : 'Saját jogosultság ellenőrzése'}</button>
        {currentUser && <p className="text-sm text-slate-200">Fiók: {currentUser.email} · Szerepkör: <strong>{currentUser.role}</strong> · {currentUser.is_active ? 'Aktív' : 'Inaktív'}</p>}
      </div>
      <button onClick={loadProfile} disabled={!auth || profileLoading} className="mr-2 rounded-lg border border-cyan-500/50 px-4 py-2 text-cyan-200 disabled:opacity-50">{profileLoading ? 'Ellenőrzés...' : 'Fiókom és jogosultságom'}</button>
      {profile && <p className="text-sm text-slate-200">Bejelentkezett fiók: <strong>{profile.email}</strong> · Szerepkör: <strong>{profile.role}</strong></p>}
      <button onClick={loadModels} disabled={loading} className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-black disabled:opacity-50">{loading ? 'Lekérdezés...' : 'Modellek lekérdezése'}</button>
    </div>
    <form onSubmit={createModel} className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <h3 className="font-semibold">Új modell regisztrálása</h3>
      {currentUser && !['admin', 'developer'].includes(currentUser.role) && <p role="status" className="text-sm text-amber-300">A {currentUser.role} szerepkör csak olvasási jogosultsággal rendelkezik. Regisztrációhoz admin vagy developer fiók szükséges.</p>}
      <p className="text-xs text-slate-400">Valós Model Registry API · admin/developer jogosultság szükséges.</p>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Modell neve" required maxLength={120} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Modell neve" className="min-w-40 flex-1 rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
        <input aria-label="Modell verziója" required maxLength={80} value={newVersion} onChange={e => setNewVersion(e.target.value)} placeholder="Verzió" className="w-28 rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
        <input aria-label="Framework" required maxLength={60} value={newFramework} onChange={e => setNewFramework(e.target.value)} placeholder="Framework" className="w-32 rounded border border-white/15 bg-[#11151C] p-2 text-sm" />
      </div>
      <button type="submit" disabled={!auth || creating || !currentUser || !['admin', 'developer'].includes(currentUser.role)} className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-black disabled:opacity-50">{creating ? 'Regisztrálás...' : 'Modell regisztrálása'}</button>
    </form>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5"><tr><th className="p-3">Modell</th><th className="p-3">Verzió</th><th className="p-3">Framework</th><th className="p-3">Stage</th><th className="p-3">Metrikák</th></tr></thead>
        <tbody>{models.map(m => <tr key={m.id} className="border-t border-white/10"><td className="p-3">{m.name}</td><td className="p-3">{m.version}</td><td className="p-3">{m.framework}</td><td className="p-3">{m.stage}</td><td className="p-3"><button className="underline text-cyan-300" onClick={() => loadRuns(m.id)}>Futások</button><div className="mt-2 flex flex-wrap items-center gap-2">
        <input aria-label={`Metrika neve: ${m.name}`} value={metricNames[m.id] ?? (m.name === 'Synthetic Regression Baseline' ? 'mae' : 'accuracy')} onChange={e => { setMetricNames(p => ({ ...p, [m.id]: e.target.value })); setSummaries(p => { const next = { ...p }; delete next[m.id]; return next; }); }} placeholder="Metrika (pl. accuracy)" className="w-32 rounded border border-white/15 bg-[#11151C] p-1 text-xs" />
        <input aria-label={`Küszöbérték: ${m.name}`} type="number" step="any" value={thresholds[m.id] ?? ''} onChange={e => { setThresholds(p => ({ ...p, [m.id]: e.target.value })); setSummaries(p => { const next = { ...p }; delete next[m.id]; return next; }); }} placeholder="Küszöb (opcionális)" className="w-28 rounded border border-white/15 bg-[#11151C] p-1 text-xs" />
        <select aria-label={`Riasztás iránya: ${m.name}`} value={directions[m.id] ?? 'below'} onChange={e => { setDirections(p => ({ ...p, [m.id]: e.target.value as 'below' | 'above' })); setSummaries(p => { const next = { ...p }; delete next[m.id]; return next; }); }} className="rounded border border-white/15 bg-[#11151C] p-1 text-xs">
          <option value="below">Alatta</option><option value="above">Felett</option>
        </select>
        <button className="underline text-cyan-300" onClick={() => loadSummary(m.id)}>Metrika lekérdezése</button>
        <input aria-label={`Új metrikaérték: ${m.name}`} type="number" step="any" value={runValues[m.id] ?? ''} onChange={e => setRunValues(p => ({ ...p, [m.id]: e.target.value }))} placeholder="Új érték" className="w-24 rounded border border-white/15 bg-[#11151C] p-1 text-xs" />
        <button disabled={!auth || recordingModel === m.id || !currentUser || !['admin', 'developer'].includes(currentUser.role)} className="rounded bg-cyan-500 px-2 py-1 text-xs text-black disabled:opacity-50" onClick={() => recordMetric(m.id)}>{recordingModel === m.id ? "Mentés..." : "Mérés rögzítése"}</button>
      </div>
      {summaries[m.id] && <div className="mt-2 text-xs">
        <p>{summaries[m.id].metric_name}: {summaries[m.id].latest.toFixed(3)} · Átlag: {summaries[m.id].average.toFixed(3)} · Változás: {summaries[m.id].delta.toFixed(3)}</p>
        <p className={summaries[m.id].alert ? 'text-red-300' : 'text-emerald-300'}>{summaries[m.id].threshold === null ? 'Nincs riasztási küszöb' : summaries[m.id].alert ? 'Figyelmeztetés: küszöb átlépve' : 'Nincs riasztás'}</p>
      </div>}
      {runs[m.id] && (() => {
        const selectedMetric = (metricNames[m.id] ?? (m.name === 'Synthetic Regression Baseline' ? 'mae' : 'accuracy')).trim();
        const selected = runs[m.id].filter(run => run.metric_name === selectedMetric);
        const values = [...selected].reverse().map(run => run.metric_value).filter(Number.isFinite);
        const allMetrics = [...new Set(runs[m.id].map(run => run.metric_name))];
        const min = values.length ? Math.min(...values) : 0;
        const max = values.length ? Math.max(...values) : 0;
        const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
        const span = max - min || 1;
        return <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-slate-950/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm text-slate-100">Mérési dashboard</strong>
            <span className="text-xs text-slate-400">{runs[m.id].length} tárolt futás · szintetikus tesztadatok</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {allMetrics.map(metric => <button key={metric} type="button" onClick={() => setMetricNames(prev => ({ ...prev, [m.id]: metric }))} className={`rounded-md border px-3 py-1 text-xs ${metric === selectedMetric ? 'border-cyan-400 bg-cyan-400/15 text-cyan-200' : 'border-white/15 text-slate-300'}`}>{metric.toUpperCase()}</button>)}
          </div>
          {values.length ? <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([['Mérések', String(values.length)], ['Átlag', average.toFixed(4)], ['Minimum', min.toFixed(4)], ['Maximum', max.toFixed(4)]] as const).map(([label, value]) => <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-2"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-base font-semibold tabular-nums text-slate-100">{value}</p></div>)}
            </div>
            <div role="img" aria-label={`${selectedMetric} trend: ${values.map(v => v.toFixed(3)).join(', ')}`} className="flex h-36 items-end gap-1 rounded-lg border border-white/10 bg-black/20 p-3">
              {values.map((value, index) => <div key={index} title={`Mérés ${index + 1}: ${value.toFixed(4)}`} className="min-w-1 flex-1 rounded-t bg-cyan-400/80" style={{ height: `${Math.max(5, ((value - min) / span) * 85 + 15)}%` }} />)}
            </div>
            <p className="text-xs text-slate-400">{selectedMetric.toUpperCase()} · {values.length} mérés · a grafikon az API-ból lekért futásokon alapul.</p>
          </> : <p className="text-xs text-slate-400">Ehhez a metrikához még nincs mérés.</p>}
          <details className="rounded-lg border border-white/10 p-2">
            <summary className="cursor-pointer text-xs font-medium text-cyan-200">Nyers mérési előzmények ({runs[m.id].length})</summary>
            <div className="mt-2 max-h-52 space-y-1 overflow-y-auto text-xs text-slate-300">
              {runs[m.id].map(run => <p key={run.id} className="tabular-nums">{run.metric_name.toUpperCase()}: {run.metric_value.toFixed(5)} ({run.duration_ms} ms)</p>)}
            </div>
          </details>
        </div>;
      })()}
      </td></tr>)}</tbody>
      </table>
    </div>
    {!modelsLoaded && !loading && <p className="text-sm text-[#9AA3AE]">A nyilvános modelladatok betöltése még nem sikerült. Kattints a Modellek lekérdezése gombra.</p>}
    {modelsLoaded && !models.length && !loading && <p className="text-sm text-[#9AA3AE]">A Model Registry API sikeresen válaszolt, de még nincs regisztrált modell.</p>}
  </section>;
}
