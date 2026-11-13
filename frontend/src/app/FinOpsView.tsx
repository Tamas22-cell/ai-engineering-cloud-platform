'use client';

import { useEffect, useState } from 'react';

type Auth = { access_token: string; refresh_token: string };
type FinOpsStatus = { pricing_configured: boolean; pricing_model: string; vercel_billing_configured: boolean; render_billing_connected: boolean };
type CloudBilling = { status?: string; totals: Array<{ currency: string; billed_cost: string }>; services: Array<{ service: string; currency: string; billed_cost: string }>; window_days: number };
type RenderBillingEntry = { id: string; period: string; amount: string; currency: string; invoice_number: string | null; note: string | null; created_at: string };
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
  const [cloudBillingNotice, setCloudBillingNotice] = useState('');
  const [cloudBillingLoading, setCloudBillingLoading] = useState(false);
  const [renderEntries, setRenderEntries] = useState<RenderBillingEntry[]>([]);
  const [renderPeriod, setRenderPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [renderAmount, setRenderAmount] = useState('');
  const [renderCurrency, setRenderCurrency] = useState('USD');
  const [renderInvoiceNumber, setRenderInvoiceNumber] = useState('');
  const [renderNote, setRenderNote] = useState('');
  const [renderEntryError, setRenderEntryError] = useState('');
  const [renderEntryLoading, setRenderEntryLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/backend/finops/status', { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      .then(response => {
        if (!response.ok) throw new Error('FinOps status unavailable');
        return response.json() as Promise<FinOpsStatus>;
      })
      .then(data => { if (active) setFinopsStatus(data); })
      .catch(() => { if (active) setFinopsStatus(null); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!auth?.access_token) return;
    fetch('/backend/finops/render-billing', {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${auth.access_token}` },
      signal: AbortSignal.timeout(15000),
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || `Render invoice data: HTTP ${response.status}`);
      return data as RenderBillingEntry[];
    }).then(data => { if (active) setRenderEntries(data); })
      .catch(err => { if (active) setRenderEntryError(err instanceof Error ? err.message : 'Render invoice data unavailable.'); });
    return () => { active = false; };
  }, [auth]);

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
      if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Sign in again in Agents or RAG.' : `API returned HTTP ${response.status}.`);
      return response.json() as Promise<UsageReport>;
    }).then(data => { if (active) setReport(data); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'Usage report unavailable.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [auth]);

  const usd = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 6 }).format(Number(value) || 0);

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest text-cyan-300">FinOps · actual usage</p>
        <h2 className="mt-2 text-2xl font-semibold">LLM usage over the last 30 days</h2>
        <p className="mt-2 text-sm text-slate-400">Personal LLM usage and billing coverage for the last 30 days.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <CoverageCard title="Measured usage" status="Active" detail="OpenAI tokens for single- and multi-agent RAG responses" tone="green" />
        <CoverageCard title="Token costs" status={finopsStatus?.pricing_configured ? "Pricing active" : finopsStatus ? "Pricing setup required" : "Loading status"} detail="gpt-4.1-mini · based on standard OpenAI token pricing" tone={finopsStatus?.pricing_configured ? "green" : "amber"} />
        <CoverageCard title="Render invoices" status={finopsStatus?.render_billing_connected ? "Billing connected" : "Managed in Render"} detail={finopsStatus?.render_billing_connected ? "Render billing integration is connected." : "Official invoices are available in Render. Manual records are optional."} tone="green" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300"><span>Official invoices and current costs are available in Render.</span><a href="https://dashboard.render.com" target="_blank" rel="noreferrer" className="rounded-lg border border-white/15 bg-white/10 px-4 py-2 font-semibold text-white hover:bg-white/15">View Render invoices (new tab)</a></div>
      {auth && <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="mb-3">
          <h3 className="font-semibold">Recorded Render invoices</h3>
          <p className="mt-1 text-xs text-slate-400">Only manually saved copies are listed. You can skip $0 invoices.</p>
        </div>
        <details>
          <summary className="mb-3 cursor-pointer text-sm font-medium text-slate-200">Add invoice manually (optional)</summary>
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" onSubmit={async event => {
          event.preventDefault(); setRenderEntryLoading(true); setRenderEntryError('');
          try {
            const response = await fetch('/backend/finops/render-billing', {
              method: 'POST', cache: 'no-store',
              headers: { Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ period: renderPeriod, amount: renderAmount, currency: renderCurrency, invoice_number: renderInvoiceNumber, note: renderNote }),
              signal: AbortSignal.timeout(20000),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.detail || `Saving Render invoice: HTTP ${response.status}`);
            setRenderEntries(current => [data as RenderBillingEntry, ...current]);
            setRenderAmount(''); setRenderInvoiceNumber(''); setRenderNote('');
          } catch (err) { setRenderEntryError(err instanceof Error ? err.message : 'Could not save the Render invoice.'); }
          finally { setRenderEntryLoading(false); }
        }}>
          <label className="text-xs text-slate-300">Billing month<input required type="month" value={renderPeriod} onChange={event => setRenderPeriod(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-300">Amount<input required type="number" min="0" step="0.01" value={renderAmount} onChange={event => setRenderAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
          <label className="text-xs text-slate-300">Currency<select value={renderCurrency} onChange={event => setRenderCurrency(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white"><option>USD</option><option>EUR</option><option>HUF</option></select></label>
          <label className="text-xs text-slate-300">Invoice number (optional)<input value={renderInvoiceNumber} onChange={event => setRenderInvoiceNumber(event.target.value)} maxLength={100} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
          <div className="flex items-end"><button disabled={renderEntryLoading} className="w-full rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{renderEntryLoading ? 'Save…' : 'Save invoice'}</button></div>
          <label className="text-xs text-slate-300 sm:col-span-2 lg:col-span-5">Note (optional)<input value={renderNote} onChange={event => setRenderNote(event.target.value)} maxLength={500} className="mt-1 block w-full rounded-lg border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white" /></label>
        </form>
        </details>
        {renderEntryError && <p role="alert" className="mt-3 text-sm text-amber-200">{renderEntryError}</p>}
        <div className="mt-4 overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-white/5 text-slate-300"><tr><th className="p-3">Month</th><th className="p-3">Amount</th><th className="p-3">Invoice number</th><th className="p-3">Note</th><th className="p-3">Action</th></tr></thead>
            <tbody>{renderEntries.map(entry => <tr key={entry.id} className="border-t border-white/10 text-slate-200"><td className="p-3">{entry.period}</td><td className="p-3">{Number(entry.amount).toFixed(2)} {entry.currency}</td><td className="p-3">{entry.invoice_number || '—'}</td><td className="p-3">{entry.note || '—'}</td><td className="p-3"><button type="button" onClick={async () => {
              try {
                const response = await fetch('/backend/finops/render-billing/' + encodeURIComponent(entry.id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + auth.access_token }, signal: AbortSignal.timeout(15000) });
                if (!response.ok) throw new Error();
                setRenderEntries(current => current.filter(row => row.id !== entry.id));
              } catch { setRenderEntryError('Could not delete the invoice entry.'); }
            }} className="text-rose-300 hover:text-rose-200">Delete</button></td></tr>)}
              {renderEntries.length === 0 && <tr><td className="p-3 text-slate-400" colSpan={5}>No recorded Render invoices.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}
      <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/[0.04] p-4 text-sm text-slate-300">
        <strong className="text-cyan-200">What does this page measure?</strong>
        <p className="mt-1">Actual token usage from successful authenticated RAG responses in the last 30 days. Embedding calls and provider infrastructure costs are excluded unless measured separately.</p>
      </div>
      {auth && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h3 className="font-semibold">Vercel billing · separate provider</h3><p className="mt-1 text-xs text-slate-400">This query shows Vercel FOCUS costs only; it does not include Render invoices.</p></div>
          <button type="button" disabled={cloudBillingLoading} onClick={async () => {
            setCloudBillingLoading(true); setCloudBillingError(''); setCloudBillingNotice(''); setCloudBilling(null);
            try {
              const response = await fetch('/backend/finops/cloud-billing', { cache: 'no-store', headers: { Authorization: 'Bearer ' + auth.access_token }, signal: AbortSignal.timeout(30000) });
              if (!response.ok) {
                if (response.status === 403) throw new Error('Admin access is required for this report.');
                if (response.status === 503) throw new Error('The Vercel API token is not configured in the backend.');
                if (response.status === 401) throw new Error('Session expired. Sign in again on the Agents page.');
                const data = await response.json().catch(() => null);
                const messages: Record<string, string> = {
                  vercel_token_invalid: 'Vercel rejected the configured server token.',
                  vercel_billing_forbidden: 'The Vercel token cannot access team billing.',
                  vercel_rate_limited: 'Vercel is rate limiting requests. Try again later.',
                  vercel_billing_not_found: 'Vercel Billing API is unavailable for this team (404). FOCUS billing requires a Pro/Enterprise team; verify team and token permissions or check Vercel Usage.',
                  vercel_billing_unavailable: 'Vercel billing service returned an error.',
                  vercel_billing_timeout: 'Vercel billing request timed out.',
                  vercel_billing_unreadable: 'Server could not read Vercel billing data.',
                };
                const code = data?.detail?.code;
                throw new Error((typeof code === 'string' && Object.prototype.hasOwnProperty.call(messages, code) ? messages[code] : undefined)
                  ?? `Billing request failed (HTTP ${response.status}).`);
              }
              if (response.ok) setCloudBilling(await response.json() as CloudBilling);
            } catch (err) { setCloudBillingError(err instanceof Error ? err.message : 'Billing data unavailable.'); }
            finally { setCloudBillingLoading(false); }
          }} className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-50">{cloudBillingLoading ? 'Loading…' : 'Fetch Vercel costs'}</button>
        </div>
        {cloudBillingNotice && <p className="mt-3 text-sm text-slate-300">{cloudBillingNotice} <a className="text-cyan-300 underline" href="https://vercel.com/dashboard" target="_blank" rel="noreferrer">Open Vercel dashboard</a></p>}
         {cloudBillingError && <p role="alert" className="mt-3 text-sm text-amber-200">{cloudBillingError}</p>}
        {cloudBilling && <div className="mt-4 space-y-4">
          {cloudBilling.totals.length === 0
            ? <p className="text-sm text-slate-300">Vercel returned no billing items for the last 30 days.</p>
            : <div className="grid gap-3 sm:grid-cols-2">{cloudBilling.totals.map(total => <Metric key={total.currency} label={'Vercel · ' + cloudBilling.window_days + ' days · ' + total.currency} value={new Intl.NumberFormat('en-US', { style: 'currency', currency: total.currency, maximumFractionDigits: 4 }).format(Number(total.billed_cost) || 0)} />)}</div>}
          <div className="space-y-2">{cloudBilling.services.map((row, index) => <div key={row.service + '-' + row.currency + '-' + index} className="flex justify-between gap-4 border-t border-white/10 py-2 text-sm"><span>{row.service} · {row.currency}</span><span>{Number(row.billed_cost).toFixed(4)}</span></div>)}</div>
        </div>}
      </div>}
      {!auth && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/5 p-4 text-sm text-amber-200"><span>Sign in to view your personal report.</span><button type="button" onClick={() => onNavigate('agents')} className="rounded-lg bg-amber-300 px-4 py-2 font-semibold text-slate-950 hover:bg-amber-200">Sign in on Agents</button></div>}
      {loading && <p className="text-sm text-slate-400">Loading usage data…</p>}
      {error && <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div>}
      {report && <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="RAG requests" value={report.requests.toLocaleString()} />
          <Metric label="Bemeneti tokenek" value={report.input_tokens.toLocaleString()} />
          <Metric label="Kimeneti tokenek" value={report.output_tokens.toLocaleString()} />
          <Metric label="Estimated priced cost" value={usd(report.estimated_cost_usd)} />
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          Priced requests: {report.priced_requests} / {report.requests}. Costs can only be calculated when both token prices are configured. {report.note}
        </div>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-white/5 text-slate-300"><tr><th className="p-3">UTC date</th><th className="p-3">Requests</th><th className="p-3">Tokens</th><th className="p-3">Priced requests</th><th className="p-3">Estimated cost</th></tr></thead>
            <tbody>{report.daily.map(day => <tr key={day.date} className="border-t border-white/10 text-slate-200"><td className="p-3">{day.date}</td><td className="p-3">{day.requests}</td><td className="p-3">{day.tokens.toLocaleString()}</td><td className="p-3">{day.priced_requests}</td><td className="p-3">{usd(day.estimated_cost_usd)}</td></tr>)}
              {report.daily.length === 0 && <tr><td className="p-4 text-slate-400" colSpan={5}>No recorded RAG usage in this period.</td></tr>}
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
