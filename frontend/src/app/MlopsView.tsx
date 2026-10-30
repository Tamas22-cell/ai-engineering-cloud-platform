'use client';

import { useState } from 'react';

type ModelRun = { id: string; metric_name: string; metric_value: number; duration_ms: number }; 
type Model = { id: string; name: string; version: string; framework: string; stage: string };
const API = (process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export default function MlopsView() {
  const [token, setToken] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState<Record<string, ModelRun[]>>({});
  const [loading, setLoading] = useState(false);

  async function loadModels() {
    setError('');
    if (!token.trim()) { setError('JWT token szükséges.'); return; }
    setLoading(true);
    try {
      const response = await fetch(`${API}/mlops/models`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: 'no-store',
      });
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
      if (!token.trim()) throw new Error('JWT token szükséges.');
      const response = await fetch(`${API}/mlops/models/${encodeURIComponent(modelId)}/runs`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Model run API: HTTP ${response.status}`);
      setRuns(previous => ({ ...previous, [modelId]: (await response.json()) as ModelRun[] }));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A metrikák nem elérhetők.');
    }
  }

  return <section className="max-w-4xl space-y-5">
    <h2 className="text-xl font-semibold">MLOps / Model Registry</h2>
    <p className="text-sm text-[#9AA3AE]">Verziózott modellek és deployment stage-ek a FastAPI backendről. Nem demo-adatok.</p>
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3">
      <label className="block text-sm">JWT hozzáférési token
        <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)}
          className="mt-2 w-full rounded-lg border border-white/15 bg-[#11151C] p-3" placeholder="Access token"/>
      </label>
      <button onClick={loadModels} disabled={loading} className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-black disabled:opacity-50">{loading ? 'Lekérdezés...' : 'Modellek lekérdezése'}</button>
    </div>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/5"><tr><th className="p-3">Modell</th><th className="p-3">Verzió</th><th className="p-3">Framework</th><th className="p-3">Stage</th><th className="p-3">Metrikák</th></tr></thead>
        <tbody>{models.map(m => <tr key={m.id} className="border-t border-white/10"><td className="p-3">{m.name}</td><td className="p-3">{m.version}</td><td className="p-3">{m.framework}</td><td className="p-3">{m.stage}</td><td className="p-3"><button className="underline text-cyan-300" onClick={() => loadRuns(m.id)}>Futások</button>{runs[m.id] && <div className="mt-2 text-xs">{runs[m.id].length ? runs[m.id].map(run => <p key={run.id}>{run.metric_name}: {run.metric_value} ({run.duration_ms} ms)</p>) : "Nincs rögzített futás"}</div>}</td></tr>)}</tbody>
      </table>
    </div>
    {!models.length && !loading && <p className="text-sm text-[#9AA3AE]">Nincs betöltött modell. Az adatokat a backendről kell lekérni.</p>}
  </section>;
}
