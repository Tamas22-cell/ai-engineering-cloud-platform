'use client';

import { useEffect, useState } from 'react';

type Auth = { access_token: string; refresh_token: string };
type UsageReport = {
  window_days: number;
  source: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  priced_requests: number;
  estimated_cost_usd: string;
  daily: Array<{ date: string; requests: number; tokens: number; priced_requests: number; estimated_cost_usd: string }>;
  note: string;
};

export default function FinOpsView({ auth }: { auth: Auth | null }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!auth?.access_token) {
      setLoading(false);
      return;
    }
    fetch('/backend/finops/usage', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${auth.access_token}` },
      signal: AbortSignal.timeout(20000),
    }).then(async response => {
      if (!response.ok) throw new Error(response.status === 401 ? 'A munkamenet lejárt. Jelentkezz be újra az Agents vagy RAG oldalon.' : `Az API ${response.status} hibát adott.`);
      return response.json() as Promise<UsageReport>;
    }).then(data => { if (active) setReport(data); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'A kimutatás nem érhető el.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth]);

  const usd = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(Number(value) || 0);

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-cyan-300">FinOps · tényleges használat</p>
        <h2 className="mt-2 text-2xl font-semibold">LLM-használat az elmúlt 30 napban</h2>
        <p className="mt-2 text-sm text-slate-400">A kimutatás a sikeres, bejelentkezett RAG válaszgenerálások OpenAI tokenhasználatát méri. Nem tartalmazza a felhőszolgáltató számlázását vagy az embedding hívásokat.</p>
      </div>

      {!auth && <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200">A személyes kimutatás megtekintéséhez jelentkezz be az Agents vagy RAG oldalon.</div>}
      {loading && <p className="text-sm text-slate-400">Használati adatok betöltése…</p>}
      {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div>}
      {report && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="RAG-kérések" value={report.requests.toLocaleString()} />
          <Metric label="Bemeneti tokenek" value={report.input_tokens.toLocaleString()} />
          <Metric label="Kimeneti tokenek" value={report.output_tokens.toLocaleString()} />
          <Metric label="Becsült, árazott költség" value={usd(report.estimated_cost_usd)} />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          Költségáras kérés: {report.priced_requests} / {report.requests}. A költség csak azokra a kérésekre számolható, amelyekhez mindkét tokenár be van állítva. {report.note}
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-white/5 text-slate-300"><tr><th className="p-3">UTC dátum</th><th className="p-3">Kérések</th><th className="p-3">Tokenek</th><th className="p-3">Árazott kérések</th><th className="p-3">Becsült költség</th></tr></thead>
            <tbody>{report.daily.map(day => <tr key={day.date} className="border-t border-white/10 text-slate-200"><td className="p-3">{day.date}</td><td className="p-3">{day.requests}</td><td className="p-3">{day.tokens.toLocaleString()}</td><td className="p-3">{day.priced_requests}</td><td className="p-3">{usd(day.estimated_cost_usd)}</td></tr>)}
              {report.daily.length === 0 && <tr><td className="p-4 text-slate-400" colSpan={5}>Még nincs rögzített RAG-használat az időszakban.</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs text-slate-400">{label}</div><div className="mt-2 text-xl font-semibold text-cyan-200">{value}</div></div>;
}
