import { useState } from 'react';
import { setTimetable } from './core/simulation.ts';
import type { Simulation, Train, Stop } from './core/simulation.ts';
export function Timetable({sim, train, onChange}: {sim: Simulation; train: Train; onChange:()=>void}) {
    const [stops,setStops] = useState<Stop[]>(()=>structuredClone(train.stops));
    const [repeat,setRepeat] = useState(train.repeat), [error,setError] = useState('');
    const change = (i: number, patch: Partial<Stop>) => setStops(stops.map((s,j)=>i===j?{...s,...patch}:s));
    return <details className="timetable"><summary>停車駅・ダイヤを編集</summary><p>上から順に停車します。時刻は「適用」からの秒数。空欄は時刻指定なし。自動運転で停車位置を制御します。</p>
        {stops.map((s,i)=><fieldset key={i}><legend>停車 {i+1}</legend><label>駅<select value={s.stationId} onChange={e=>change(i,{stationId:e.target.value})}>{sim.network.stations?.map(station=><option key={station.id} value={station.id}>{station.name}</option>)}</select></label><label>停車時間 秒<input type="number" min="0" value={s.dwell} onChange={e=>change(i,{dwell:+e.target.value})}/></label>{(['arrival','departure'] as const).map((field)=><label key={field}>{field==='arrival'?'到着予定 秒':'発車予定 秒'}<input type="number" min="0" value={s[field]??''} onChange={e=>change(i,{[field]:e.target.value===''?undefined:+e.target.value})}/></label>)}<label><input type="checkbox" checked={s.reverse??false} onChange={e=>change(i,{reverse:e.target.checked})}/> 折返し</label><button onClick={()=>setStops(stops.filter((_,j)=>j!==i))}>削除</button><button disabled={i===0} onClick={()=>{const n=[...stops];[n[i-1],n[i]]=[n[i],n[i-1]];setStops(n);}}>上へ</button></fieldset>)}
        <button disabled={!sim.network.stations?.length} onClick={()=>setStops([...stops,{stationId:sim.network.stations![0].id,dwell:10}])}>停車駅を追加</button><label><input type="checkbox" checked={repeat} onChange={e=>setRepeat(e.target.checked)}/> 繰り返す</label><button onClick={()=>{try{setTimetable(sim,train,stops,repeat);setError('');onChange();}catch(err){setError(err instanceof Error?err.message:'ダイヤが不正です');}}}>ダイヤを適用</button>{error&&<p role="alert">{error}</p>}
    </details>;
}
