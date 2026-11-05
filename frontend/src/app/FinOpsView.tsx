'use client';

import { useEffect, useState } from 'react';

type Auth = { access_token: string; refresh_token: string };
type FinOpsStatus = { pricing_configured: boolean; pricing_model: string; vercel_billing_configured: boolean; render_billing_connected: boolean };
type CloudBilling = { status?: string; totals: Array<{ currency: string; billed_cost: string }>; services: Array<{ service: string; currency: string; billed_cost: string }>; window_days: number };
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

export default function FinOpsView({ auth, onNavigate }: { auth: Auth | null; onNavigate: (page: string) => void }) {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [finopsStatus, setFinopsStatus] = useState<FinOpsStatus | null>(null);
  const [cloudBilling, setCloudBilling] = useState<CloudBilling | null>(null);
  const [cloudBillingError, setCloudBillingError] = useState('');
  const [cloudBillingLoading, setCloudBillingLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/backend/finops/status', { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(response => {
        if (!response.ok) throw new Error('FinOps státusz nem érhető el');
        return response.json() as Promise<FinOpsStatus>;
      })
      .then(data => { if (active) setFinopsStatus(data); })
      .catch(() => { if (active) setFinopsStatus(null); });
    return () => { active = false; };
  }, []);

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
        <p className="mt-2 text-sm text-slate-400">A személyes, 30 napos LLM-használat és az elszámolás lefedettsége.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <CoverageCard title="Mért használat" status="Aktív" detail="Egy- és többügynökös RAG-válaszok OpenAI tokenjei" tone="green" />
        <CoverageCard title="Tokenköltség" status={finopsStatus?.pricing_configured ? "Árazás aktív" : finopsStatus ? "Árbeállítás szükséges" : "Állapot betöltése"} detail="gpt-4.1-mini · OpenAI standard tokenárak alapján" tone={finopsStatus?.pricing_configured ? "green" : "amber"} />
        <CoverageCard title="Render-számla" status="Nincs API-bekötés" detail="A Render számlái a Render Dashboard Billing oldalán érhetők el; a nyilvános API nem kínál számlalekérő végpontot." tone="amber" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-4 text-sm text-slate-300"><span>Render számlák és aktuális költségek megtekintése:</span><a href="https://dashboard.render.com" target="_blank" rel="noreferrer" className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-slate-950">Render Dashboard megnyitása</a></div>
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4 text-sm text-slate-300">
        <strong className="text-cyan-200">Mit mér ez az oldal?</strong>
        <p className="mt-1">Sikeres, bejelentkezett RAG-válaszgenerálások tényleges tokenhasználatát az elmúlt 30 napból. Az embedding-hívások és a szolgáltatói infrastruktúra költségei külön mérés nélkül nem jelennek meg itt.</p>
      </div>
      {auth && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold">Vercel számlázás · külön szolgáltató</h3><p className="mt-1 text-xs text-slate-400">Ez a lekérés kizárólag a Vercel FOCUS költségeit mutatja; nem tartalmaz Render-számlát.</p></div>
          <button type="button" disabled={cloudBillingLoading} onClick={async () => {
            setCloudBillingLoading(true); setCloudBillingError(''); setCloudBilling(null);
            try {
              const response = await fetch('/backend/finops/cloud-billing', { cache: 'no-store', headers: { Authorization: 'Bearer ' + auth.access_token }, signal: AbortSignal.timeout(30000) });
              if (!response.ok) {
                if (response.status === 403) throw new Error('Ehhez a kimutatáshoz admin jogosultság kell.');
                if (response.status === 503) throw new Error('A Vercel API-token még nincs beállítva a backend környezetében.');
                throw new Error('A Vercel számlázási API ' + response.status + ' hibát adott.');
              }
              setCloudBilling(await response.json() as CloudBilling);
            } catch (err) { setCloudBillingError(err instanceof Error ? err.message : 'A számlázási adatok nem érhetők el.'); }
            finally { setCloudBillingLoading(false); }
          }} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{cloudBillingLoading ? 'Lekérés…' : 'Vercel-költségek lekérése'}</button>
        </div>
        {cloudBillingError && <p role="alert" className="mt-3 text-sm text-amber-200">{cloudBillingError}</p>}
        {cloudBilling && <div className="mt-4 space-y-4">
          {cloudBilling.totals.length === 0
            ? <p className="text-sm text-slate-300">A Vercel nem adott vissza elszámolt költséget az elmúlt 30 napra.</p>
            : <div className="grid gap-3 sm:grid-cols-2">{cloudBilling.totals.map(total => <Metric key={total.currency} label={'Vercel · ' + cloudBilling.window_days + ' nap · ' + total.currency} value={new Intl.NumberFormat('en-US', { style: 'currency', currency: total.currency, maximumFractionDigits: 4 }).format(Number(total.billed_cost) || 0)} />)}</div>}
          <div className="space-y-2">{cloudBilling.services.map((row, index) => <div key={row.service + '-' + row.currency + '-' + index} className="flex justify-between gap-4 border-t border-white/10 py-2 text-sm"><span>{row.service} · {row.currency}</span><span>{Number(row.billed_cost).toFixed(4)}</span></div>)}</div>
        </div>}
      </div>}
      {!auth && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200"><span>A személyes kimutatás megtekintéséhez jelentkezz be.</span><button type="button" onClick={() => onNavigate('agents')} className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-200">Belépés az Agents oldalon</button></div>}
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

function CoverageCard({ title, status, detail, tone }: { title: string; status: string; detail: string; tone: 'green' | 'amber' }) {
  const styles = tone === 'green'
    ? 'border-emerald-400/30 bg-emerald-400/[0.05] text-emerald-200'
    : 'border-amber-400/30 bg-amber-400/[0.05] text-amber-200';
  return <div className={`rounded-xl border p-4 ${styles}`}>
    <div className="text-xs uppercase tracking-wide opacity-80">{title}</div>
    <div className="mt-2 text-lg font-semibold">{status}</div>
    <p className="mt-1 text-xs leading-relaxed text-slate-300">{detail}</p>
  </div>;
}
