'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

type AuthResponse = { access_token: string; refresh_token: string };
type MetricSummary = { metric_name: string; latest: number; average: number; delta: number; threshold: number | null; alert: boolean; count: number };
type ModelRun = { id: string; metric_name: string; metric_value: number; duration_ms: number }; 
type Model = { id: string; name: string; version: string; framework: string; stage: string };
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export default function MlopsView({ auth, setAuth }: { auth: AuthResponse | null; setAuth: Dispatch<SetStateAction<AuthResponse | null>> }) {
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState<Record<string, ModelRun[]>>({});
  const [loading, setLoading] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, MetricSummary>>({});
  const [metricNames, setMetricNames] = useState<Record<string, string>>({});
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [directions, setDirections] = useState<Record<string, 'below' | 'above'>>({});

  async function authorizedGet(path: string): Promise<Response> {
    if (!auth) throw new Error('Jelentkezz be az Agents vagy a RAG oldalon.');
    const request = (accessToken: string) => fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store',
    });
    let response = await request(auth.access_token);
    if (response.status === 401) {
      const refreshed = await fetch(`${API}/auth/refresh`, {
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

  async function loadModels() {
    setError('');
    if (!auth) { setError('Jelentkezz be az Agents vagy a RAG oldalon.'); return; }
    setLoading(true);
    try {
      const response = await authorizedGet('/mlops/models');
      if (!response.ok) throw new Error(`Model Registry API: HTTP ${response.status}`);
      setModels(await response.json() as Model[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Az API nem elérhető.');
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns(modelId: string) {
    try {
      if (!auth) throw new Error('Jelentkezz be az Agents vagy a RAG oldalon.');
      const response = await authorizedGet(`/mlops/models/${encodeURIComponent(modelId)}/runs`);
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
      if (!auth) throw new Error('Jelentkezz be az Agents vagy a RAG oldalon.');
      const metricName = (metricNames[modelId] || 'accuracy').trim();
      if (!metricName) throw new Error('Adj meg egy metrikanevet.');
      const rawThreshold = (thresholds[modelId] ?? '0.8').trim();
      const parsedThreshold = rawThreshold === '' ? null : Number(rawThreshold);
      if (parsedThreshold !== null && !Number.isFinite(parsedThreshold)) {
        throw new Error('A küszöbértéknek véges számnak kell lennie.');
      }
      const direction = directions[modelId] || 'below';
      const params = new URLSearchParams({ direction });
      if (parsedThreshold !== null) params.set('threshold', String(parsedThreshold));
      const response = await authorizedGet(`/mlops/models/${encodeURIComponent(modelId)}/metrics/${encodeURIComponent(metricName)}/summary?${params}`);
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
    <p className="text-sm text-[#9AA3AE]">Verziózott modellek és deployment stage-ek a FastAPI backendről. Nem demo-adatok.</p>
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <p className="text-sm text-[#9AA3AE]">{auth ? 'Közös munkamenet: bejelentkezve.' : 'Jelentkezz be az Agents vagy a RAG oldalon. Nem kell tokent másolni.'}</p>
      <button onClick={loadModels} disabled={loading || !auth} className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-black disabled:opacity-50">{loading ? 'Lekérdezés...' : 'Modellek lekérdezése'}</button>
    </div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5"><tr><th className="p-3">Modell</th><th className="p-3">Verzió</th><th className="p-3">Framework</th><th className="p-3">Stage</th><th className="p-3">Metrikák</th></tr></thead>
        <tbody>{models.map(m => <tr key={m.id} className="border-t border-white/10"><td className="p-3">{m.name}</td><td className="p-3">{m.version}</td><td className="p-3">{m.framework}</td><td className="p-3">{m.stage}</td><td className="p-3"><button className="underline text-cyan-300" onClick={() => loadRuns(m.id)}>Futások</button><div className="mt-2 flex flex-wrap items-center gap-2">
        <input aria-label={`Metrika neve: ${m.name}`} value={metricNames[m.id] ?? 'accuracy'} onChange={e => { setMetricNames(p => ({ ...p, [m.id]: e.target.value })); setSummaries(p => { const next = { ...p }; delete next[m.id]; return next; }); }} placeholder="Metrika (pl. accuracy)" className="w-32 rounded border border-white/15 bg-[#11151C] p-1 text-xs" />
        <input aria-label={`Küszöbérték: ${m.name}`} type="number" step="any" value={thresholds[m.id] ?? '0.8'} onChange={e => { setThresholds(p => ({ ...p, [m.id]: e.target.value })); setSummaries(p => { const next = { ...p }; delete next[m.id]; return next; }); }} placeholder="Küszöb (opcionális)" className="w-28 rounded border border-white/15 bg-[#11151C] p-1 text-xs" />
        <select aria-label={`Riasztás iránya: ${m.name}`} value={directions[m.id] ?? 'below'} onChange={e => { setDirections(p => ({ ...p, [m.id]: e.target.value as 'below' | 'above' })); setSummaries(p => { const next = { ...p }; delete next[m.id]; return next; }); }} className="rounded border border-white/15 bg-[#11151C] p-1 text-xs">
          <option value="below">Alatta</option><option value="above">Felett</option>
        </select>
        <button className="underline text-cyan-300" onClick={() => loadSummary(m.id)}>Metrika lekérdezése</button>
      </div>
      {summaries[m.id] && <div className="mt-2 text-xs">
        <p>{summaries[m.id].metric_name}: {summaries[m.id].latest.toFixed(3)} · Átlag: {summaries[m.id].average.toFixed(3)} · Változás: {summaries[m.id].delta.toFixed(3)}</p>
        <p className={summaries[m.id].alert ? 'text-red-300' : 'text-emerald-300'}>{summaries[m.id].threshold === null ? 'Nincs riasztási küszöb' : summaries[m.id].alert ? 'Figyelmeztetés: küszöb átlépve' : 'Nincs riasztás'}</p>
      </div>}
      {runs[m.id] && runs[m.id].filter(run => run.metric_name === (metricNames[m.id] || 'accuracy').trim()).length > 0 && (() => {
        const selected = runs[m.id].filter(run => run.metric_name === (metricNames[m.id] || 'accuracy').trim());
        const values = selected.map(run => run.metric_value).filter(Number.isFinite);
        if (!values.length) return null;
        const min = Math.min(0, ...values);
        const max = Math.max(0, ...values);
        const span = max - min || 1;
        return <div className="mt-3 rounded-lg border border-white/10 p-3">
          <p className="mb-2 text-xs text-slate-300">Valós modellfutások · {metricNames[m.id] || 'accuracy'} · {values.length} mérés</p>
          <div role="img" aria-label={`Metrikatrend: ${values.map(v => v.toFixed(3)).join(', ')}`} className="flex h-28 items-end gap-1 overflow-x-auto">
            {values.map((value, index) => <div key={index} title={`${value.toFixed(4)}`} className="min-w-2 flex-1 rounded-t bg-cyan-400/80" style={{ height: `${Math.max(3, ((value - min) / span) * 100)}%` }} />)}
          </div>
          <p className="mt-2 text-xs text-slate-400">Min: {Math.min(...values).toFixed(3)} · Max: {Math.max(...values).toFixed(3)} · A grafikon kizárólag lekért futásokból készül.</p>
        </div>;
      })()}
      {runs[m.id] && <div className="mt-2 text-xs">{runs[m.id].length ? runs[m.id].map(run => <p key={run.id}>{run.metric_name}: {run.metric_value} ({run.duration_ms} ms)</p>) : "Nincs rögzített futás"}</div>}</td></tr>)}</tbody>
      </table>
    </div>
    {!models.length && !loading && <p className="text-sm text-[#9AA3AE]">Nincs betöltött modell. Az adatokat a backendről kell lekérni.</p>}
  </section>;
}
