'use client';
import {useEffect,useState} from 'react';
type Sample={endpoint:string;ms:number;ok:boolean};
export default function LiveApiObservability(){
 const [samples,setSamples]=useState<Sample[]>([]);
 const [busy,setBusy]=useState(false);
 async function measure(){
  setBusy(true);
  const results=await Promise.all(['/backend/health/live','/backend/health/ready'].map(async endpoint=>{
   const start=performance.now();
   try{
    const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(20000)});
    const data=await response.json() as {status?:string;database?:string};
    const ok=response.ok&&(endpoint.endsWith('live')?data.status==='ok':data.status==='ready'&&data.database==='connected');
    return {endpoint,ms:Math.round(performance.now()-start),ok};
   }catch{return {endpoint,ms:Math.round(performance.now()-start),ok:false};}
  }));
  setSamples(previous=>[...previous,...results].slice(-40));
  setBusy(false);
 }
 useEffect(()=>{void measure();const timer=window.setInterval(()=>void measure(),30000);return()=>window.clearInterval(timer);},[]);
 return <section className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-3">
  <div className="flex justify-between gap-2"><h3 className="font-semibold">Live API monitoring</h3><button onClick={()=>void measure()} disabled={busy} className="rounded border border-cyan-400/40 px-3 py-1 text-cyan-200">{busy?'Mérés...':'Frissítés'}</button></div>
  <p className="text-xs text-slate-400">Valós health endpoint mérések, 30 másodpercenként.</p>
  <div className="grid gap-3 sm:grid-cols-2">{['/backend/health/live','/backend/health/ready'].map(endpoint=>{
   const data=samples.filter(x=>x.endpoint===endpoint),last=data[data.length-1],max=Math.max(1,...data.map(x=>x.ms));
   const avg=data.length?Math.round(data.reduce((sum,x)=>sum+x.ms,0)/data.length):null;
   const errors=data.filter(x=>!x.ok).length;
   return <div key={endpoint} className="rounded border border-white/10 p-3 space-y-2">
    <p className="font-medium">{endpoint.endsWith('live')?'FastAPI':'PostgreSQL readiness'}</p>
    <p className="text-xs text-slate-400">{endpoint}</p>
    <p>{!last?'Ellenőrzésre vár':last.ok?'Healthy':'Unreachable / unhealthy'} · {last?last.ms+' ms':'—'}</p>
    <p className="text-xs">Átlag: {avg===null?'—':avg+' ms'} · Hibaarány: {data.length?(100*errors/data.length).toFixed(1)+'%':'—'} · {data.length} minta</p>
    <div role="img" aria-label="Mért válaszidők" className="flex h-20 items-end gap-1 border-b border-white/20">{data.map((x,i)=><div key={i} title={x.ms+' ms'} className={x.ok?'flex-1 bg-cyan-400/80':'flex-1 bg-red-400/80'} style={{height:Math.max(5,x.ms/max*100)+'%'}} />)}</div>
   </div>;
  })}</div>
  <p className="text-xs text-slate-400">Böngésző–Vercel–Render válaszidő, nem szerveroldali latency. A hibaarány csak a helyi mintákból számított; frissítéskor törlődik.</p>
 </section>;
}
