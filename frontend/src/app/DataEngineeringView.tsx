'use client';

import { useState } from 'react';

type Profile = { name: string; rows: number; columns: { name: string; missing: number; unique: number; examples: string[] }[]; duplicateRows: number; error?: string };

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(cell); cell = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); if (row.some(value => value !== '')) rows.push(row);
      row = []; cell = '';
    } else cell += char;
  }
  if (quoted) throw new Error('Unclosed CSV quotation mark');
  row.push(cell);
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

export default function DataEngineeringView() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);

  function downloadReport() {
    if (!profile || profile.error) return;
    const report = {
      generated_at: new Date().toISOString(),
      source_file: profile.name,
      summary: { rows: profile.rows, columns: profile.columns.length, duplicate_rows: profile.duplicateRows },
      columns: profile.columns.map(column => ({
        name: column.name,
        missing_values: column.missing,
        missing_percent: profile.rows ? Number((column.missing / profile.rows * 100).toFixed(2)) : 0,
        unique_values: column.unique,
        examples: column.examples,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${profile.name.replace(/\.csv$/i, '')}-quality-report.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 5_000_000) throw new Error('Maximum file size: 5 MB');
      const raw = await file.text();
      const records = parseCsv(raw.replace(/^\uFEFF/, ''));
      if (records.length < 2) throw new Error('CSV must contain a header and at least one data row');
      const headers = records[0];
      if (headers.some(h => !h.trim()) || new Set(headers).size !== headers.length) throw new Error('Column names must be unique and non-empty');
      const data = records.slice(1);
      if (data.some(row => row.length !== headers.length)) throw new Error('Inconsistent number of columns');
      const columns = headers.map((name, index) => {
        const values = data.map(row => row[index].trim());
        return { name, missing: values.filter(v => !v).length, unique: new Set(values.filter(Boolean)).size, examples: [...new Set(values.filter(Boolean))].slice(0, 3) };
      });
      const duplicateRows = data.length - new Set(data.map(row => JSON.stringify(row))).size;
      setProfile({ name: file.name, rows: data.length, columns, duplicateRows });
    } catch (error) {
      setProfile({ name: file.name, rows: 0, columns: [], duplicateRows: 0, error: error instanceof Error ? error.message : 'CSV parsing failed' });
    } finally { setBusy(false); }
  }

  return <section className="max-w-5xl space-y-5">
    <div className="rounded-xl border border-cyan-500/20 bg-white/5 p-5">
      <h2 className="text-xl font-semibold">Data Engineering · CSV Quality Profiler</h2>
      <p className="mt-2 text-sm text-slate-400">Local browser analysis: schema, missing values, unique values and duplicate rows. Data is not uploaded to the backend.</p>
    </div>
    <label className="block rounded-xl border border-dashed border-white/20 p-5 text-sm">
      Select a CSV file (UTF-8, comma-separated, max 5 MB)
      <input aria-label="Select CSV file" type="file" accept=".csv,text/csv" className="mt-3 block w-full text-sm" disabled={busy} onChange={event => void handleFile(event.target.files?.[0])} />
    </label>
    {busy && <p role="status">Analyzing CSV...</p>}
    {profile?.error && <p role="alert" className="text-amber-300">{profile.error}</p>}
    {profile && !profile.error && <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([['File', profile.name], ['Rows', String(profile.rows)], ['Columns', String(profile.columns.length)], ['Duplicate rows', String(profile.duplicateRows)]] as const).map(([label, value]) =>
          <div key={label} className="rounded-lg border border-white/10 p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 break-words font-semibold">{value}</p></div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Column quality report</h3>
        <button type="button" onClick={downloadReport} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-cyan-400">Download JSON report</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm"><thead className="bg-white/5"><tr><th className="p-3">Column</th><th className="p-3">Missing</th><th className="p-3">Unique</th><th className="p-3">Examples</th></tr></thead>
          <tbody>{profile.columns.map(column => <tr key={column.name} className="border-t border-white/10"><td className="p-3 font-medium">{column.name}</td><td className="p-3">{column.missing} ({(column.missing / profile.rows * 100).toFixed(1)}%)</td><td className="p-3">{column.unique}</td><td className="p-3 break-all text-slate-400">{column.examples.join(', ') || '—'}</td></tr>)}</tbody>
        </table>
      </div>
    </>}
  </section>;
}
