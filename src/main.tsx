import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createSimulation, step, occupied, junctionLocked, setJunctionState, selectedRoute, addTrain, removeTrain, reverseTrain, setRoute, cancelRoute, nextStop, signalAspect, setTimetable, DT } from './core/simulation.ts';
import type { Track, Network, Junction } from './core/simulation.ts';
import { demo } from './core/demo.ts';
import './style.css';
import { Editor } from './Editor.tsx';
import { Timetable } from './Timetable.tsx';
function point(t: Track, offset: number) {
    const lengths = t.points.slice(1).map((p,i) => Math.hypot(p[0]-t.points[i][0],p[1]-t.points[i][1]));
    let d = offset/t.length * lengths.reduce((a,b)=>a+b,0);
    for(let i=0;i<lengths.length;i++) {
        if(d<=lengths[i]) {const f=d/lengths[i];return [t.points[i][0]+f*(t.points[i+1][0]-t.points[i][0]), t.points[i][1]+f*(t.points[i+1][1]-t.points[i][1])];}
        d-=lengths[i];
    }
    return t.points.at(-1)!;
}
function portPoint(network: Network, port: string) {
    const track = network.tracks.find(t => t.ports.includes(port))!;
    return point(track, track.ports[0] === port ? 0 : track.length);
}
function junctionPoint(network: Network, j: Junction) {
    const pairs = Object.values(j.states).flat();
    const ports = pairs.flat();
    const common = ports.find(p => pairs.every(pair => pair.includes(p))) ?? ports[0];
    return portPoint(network, common);
}
function initial(network: Network = demo) {
    const s = createSimulation(network);
    if (network === demo) setTimetable(s, s.train, [{stationId:'central',dwell:8,arrival:70},{stationId:'east',dwell:10,arrival:130,reverse:true},{stationId:'central',dwell:8,arrival:210},{stationId:'west',dwell:10,arrival:280,reverse:true}],true);
    return s;
}
function App() {
    const [sim] = useState(() => ({current: initial()}));
    const canvas = useRef<HTMLCanvasElement>(null);
    const [running,setRunning]=useState(false), [rate,setRate]=useState(1), [,refresh]=useState(0), [error,setError]=useState('');
    const [editing,setEditing]=useState(false), [spawnTrack,setSpawnTrack]=useState('D'), [spawnDirection,setSpawnDirection]=useState<1|-1>(1), [version,setVersion]=useState(0);
    const accumulator=useRef(0);
    const tr=sim.current.train;
    useEffect(()=>{
        let frame=0, previous=performance.now();
        function render(now:number) {
            if(running) {
                accumulator.current+=Math.min((now-previous)/1000,0.1)*rate;
                while(accumulator.current>=DT){step(sim.current);accumulator.current-=DT;}
            }
            previous=now;
            const c=canvas.current, ctx=c?.getContext('2d');
            if(c && ctx) {
                const rect=c.getBoundingClientRect(), dpr=devicePixelRatio || 1;
                if(c.width!==Math.round(rect.width*dpr)||c.height!==Math.round(rect.height*dpr)){c.width=Math.round(rect.width*dpr);c.height=Math.round(rect.height*dpr);}
                ctx.setTransform(c.width/1030,0,0,c.height/320,0,0);ctx.clearRect(0,0,1030,320);
                ctx.lineCap='round';ctx.lineJoin='round';
                for(const t of sim.current.network.tracks) {
                    ctx.beginPath();t.points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle='#657488';ctx.lineWidth=5;ctx.stroke();
                    const p=point(t,t.length/2);ctx.fillStyle='#a9b6c7';ctx.font='14px sans-serif';ctx.textAlign='center';ctx.fillText(`${t.id} · ${t.length} m`,p[0],p[1]+32);
                }
                for (const j of sim.current.network.junctions) {
                    for (const port of j.states[j.state].flat()) {
                        const t = sim.current.network.tracks.find(t => t.ports.includes(port))!;
                        const start = t.ports[0] === port ? 0 : t.length;
                        const end = start === 0 ? Math.min(90, t.length) : Math.max(0, t.length - 90);
                        ctx.beginPath();
                        for (let i = 0; i <= 12; i++) {
                            const p = point(t, start + (end - start) * i / 12);
                            i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
                        }
                        ctx.strokeStyle = '#77cbb2'; ctx.lineWidth = 6; ctx.stroke();
                    }
                }
                for (const station of sim.current.network.stations ?? []) {
                    const t = sim.current.network.tracks.find(t => t.id === station.trackId)!, p = point(t, station.offset);
                    ctx.fillStyle='#8e9db3'; ctx.fillRect(p[0]-18,p[1]-13,36,5);
                    ctx.fillStyle='#e8edf3'; ctx.font='13px sans-serif';ctx.textAlign='center';ctx.fillText(station.name,p[0],p[1]-24);
                }
                for (const t of sim.current.network.tracks) for (const dir of [1,-1] as const) {
                    const p=point(t,dir===1?t.length-20:20);
                    const green=signalAspect(sim.current,{...sim.current.train,trackId:t.id,direction:dir})==='green';
                    ctx.beginPath();ctx.arc(p[0],p[1]+(dir===1?12:-12),4,0,Math.PI*2);ctx.fillStyle=green?'#77cbb2':'#f38787';ctx.fill();
                }
                for (const train of sim.current.trains) for(const seg of occupied(sim.current,train)) {
                    const t=sim.current.network.tracks.find(t=>t.id===seg.trackId)!;
                    ctx.beginPath();for(let i=0;i<=40;i++){const p=point(t,seg.from+(seg.to-seg.from)*i/40);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);}ctx.strokeStyle=train===sim.current.train?'#f4cc60':'#a99cf4';ctx.lineWidth=11;ctx.stroke();
                }
                for (const j of sim.current.network.junctions) {
                    if (Object.keys(j.states).length < 2) continue;
                    const p = junctionPoint(sim.current.network, j), locked = junctionLocked(sim.current, j.id);
                    ctx.beginPath(); ctx.arc(p[0], p[1], 8, 0, Math.PI * 2);
                    ctx.fillStyle = locked ? '#f4cc60' : '#77cbb2'; ctx.fill();
                    ctx.fillStyle = '#a9b6c7'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
                    ctx.fillText(`${j.id} · ${j.state}${locked ? '（占有）' : ''}`, p[0], p[1] + 56);
                }
                for (const train of sim.current.trains) {
                    const p=point(sim.current.network.tracks.find(t=>t.id===train.trackId)!,train.offset);
                    ctx.fillStyle=train===sim.current.train?'#f4cc60':'#a99cf4';ctx.font='bold 16px sans-serif';ctx.fillText(train.id,p[0],p[1]-40);
                }
            }
            refresh(n=>n+1);frame=requestAnimationFrame(render);
        }
        frame=requestAnimationFrame(render);return()=>cancelAnimationFrame(frame);
    },[running,rate]);
    function action(fn:()=>void) { try { fn();setError('');refresh(n=>n+1); } catch(err) {setError(err instanceof Error?err.message:'操作できませんでした');} }
    function reset() { const n=sim.current.network, stops=structuredClone(sim.current.trains[0].stops), repeat=sim.current.trains[0].repeat;sim.current=initial(n);setTimetable(sim.current,sim.current.train,stops,repeat);accumulator.current=0;setRunning(false);setVersion(v=>v+1); }
    function changeJunction(id: string, state: string) {
        try { setJunctionState(sim.current, id, state); setError(''); }
        catch (err) { setError(err instanceof Error ? err.message : '切替できませんでした'); }
        refresh(n => n + 1);
    }
    function save(){const blob=new Blob([JSON.stringify(sim.current.network,null,4)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='network.json';a.click();URL.revokeObjectURL(url);}
    return <main>
        <header><div><span className="eyebrow">TRAIN SIMULATOR / 01</span><h1>鉄道シミュレーター</h1></div><span className="clock">{new Date(sim.current.time*1000).toISOString().slice(11,19)}</span></header>
        <nav><button className="primary" onClick={()=>setRunning(!running)}>{running?'一時停止':'再生'}</button><button onClick={()=>{step(sim.current);refresh(n=>n+1);}} disabled={running}>1ステップ</button><button onClick={()=>{reset();}}>リセット</button><label>時間倍率 <select value={rate} onChange={e=>setRate(+e.target.value)}>{[0.5,1,2,5,10].map(n=><option key={n} value={n}>{n}×</option>)}</select></label></nav>
        <section className="fleet"><label>操作する列車 <select aria-label="操作する列車" value={tr.id} onChange={e=>{sim.current.train=sim.current.trains.find(t=>t.id===e.target.value)!;refresh(n=>n+1);}}>{sim.current.trains.map(t=><option key={t.id} value={t.id}>{t.id} · {t.status}</option>)}</select></label><label>配置線路<select aria-label="配置線路" value={spawnTrack} onChange={e=>setSpawnTrack(e.target.value)}>{sim.current.network.tracks.map(t=><option key={t.id}>{t.id}</option>)}</select></label><select aria-label="配置方向" value={spawnDirection} onChange={e=>setSpawnDirection(+e.target.value as 1|-1)}><option value="1">正方向</option><option value="-1">逆方向</option></select><button onClick={()=>action(()=>{sim.current.train=addTrain(sim.current,spawnTrack,spawnDirection);})}>列車を追加</button><button onClick={()=>action(()=>removeTrain(sim.current,tr))}>選択列車を削除</button></section>
        <section className="diagram"><div className="section-title">配線図 <span>黄：列車 ／ 緑：分岐器の開通方向</span></div><canvas ref={canvas} aria-label="線路と列車01、分岐器の開通方向を示す配線図" onClick={e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const j = sim.current.network.junctions.find(j => {
                if (Object.keys(j.states).length < 2) return false;
                const p = junctionPoint(sim.current.network, j);
                return Math.hypot(e.clientX - rect.left - p[0] / 1030 * rect.width, e.clientY - rect.top - p[1] / 320 * rect.height) <= 22;
            });
            if (j) { const states = Object.keys(j.states); changeJunction(j.id, states[(states.indexOf(j.state) + 1) % states.length]); }
        }}/><p>分岐器の丸印または下のボタンで切替。占有・進路鎖錠中の分岐器は切替できません。信号は選択列車から見た次の閉塞の状態です。</p></section>
        <section className="junctions" aria-label="分岐器操作">
            {sim.current.network.junctions.filter(j => Object.keys(j.states).length > 1).map(j => {
                const locked = junctionLocked(sim.current, j.id);
                return <div key={j.id}><span>{j.id}</span>{Object.keys(j.states).map(state => <button key={state} aria-pressed={j.state === state} disabled={locked} onClick={() => changeJunction(j.id, state)}>{state}</button>)}<small>{locked ? '占有中' : '切替可'}</small></div>;
            })}
            <p className="route">現在の経路：{selectedRoute(sim.current).map(p => p.trackId).join(' → ')}</p>
        </section>
        <section className="routes" aria-label="進路設定">{sim.current.network.routes?.map(route=><button key={route.id} disabled={route.trackIds[0]!==tr.trackId} onClick={()=>action(()=>setRoute(sim.current,tr,route.id))}>{route.name}</button>)}<button onClick={()=>action(()=>cancelRoute(sim.current,tr))}>進路を取消</button><p>{sim.current.locks.length?sim.current.locks.map(l=>`列車${l.trainId}：${sim.current.network.routes!.find(r=>r.id===l.routeId)!.name}（鎖錠）`).join(' ／ '):'設定中の進路なし'}</p></section>
        <section className="controls"><div><h2>列車 {tr.id} · {tr.status}</h2><div className="speed">{(tr.speed*3.6).toFixed(1)} <small>km/h</small></div><p>線路 {tr.trackId} ／ {tr.offset.toFixed(1)} m ／ 編成長 {tr.length} m</p><p>{nextStop(sim.current,tr)?`次駅：${nextStop(sim.current,tr)!.station.name} · ${nextStop(sim.current,tr)!.distance.toFixed(0)} m`:(tr.stops[tr.stopIndex]?'次の停車駅へ到達できません。経路を確認してください。':'停車駅の指定なし')} ／ 遅れ {tr.delay.toFixed(0)} 秒</p>{tr.dwellUntil!==undefined&&<p>発車まで {Math.max(0,tr.dwellUntil-sim.current.time).toFixed(0)} 秒</p>}<button disabled={tr.speed>0.01 || tr.dwellUntil!==undefined} onClick={()=>action(()=>reverseTrain(sim.current,tr))}>停止中に折返す</button></div><div><label>運転モード <select value={tr.mode} onChange={e=>{tr.mode=e.target.value as typeof tr.mode;tr.power=0;tr.brake=0;}}><option value="auto">自動</option><option value="manual">手動</option></select></label>{tr.mode==='auto'?<label>目標速度：{Math.round(tr.targetSpeed*3.6)} km/h<input type="range" min="0" max="90" value={tr.targetSpeed*3.6} onChange={e=>tr.targetSpeed=+e.target.value/3.6}/></label>:<><label>力行：{Math.round(tr.power*100)}%<input type="range" min="0" max="1" step="0.1" value={tr.power} onChange={e=>{tr.power=+e.target.value;tr.brake=0;}}/></label><label>ブレーキ：{Math.round(tr.brake*100)}%<input type="range" min="0" max="1" step="0.1" value={tr.brake} onChange={e=>{tr.brake=+e.target.value;tr.power=0;}}/></label></>}<button onClick={()=>{tr.mode='manual';tr.power=0;tr.brake=1;}}>非常ブレーキ</button></div></section>
        <Timetable key={`${version}-${tr.id}`} sim={sim.current} train={tr} onChange={()=>refresh(n=>n+1)}/>
        {editing&&<Editor network={sim.current.network} onClose={()=>setEditing(false)} onApply={n=>action(()=>{sim.current=initial(n);accumulator.current=0;setVersion(v=>v+1);setSpawnTrack(n.tracks[0].id);setEditing(false);})}/>}
        <footer><button onClick={()=>{setRunning(false);setEditing(true);}}>配線を編集</button><button onClick={save}>配線をJSON保存</button><label className="file">JSON読込<input type="file" accept=".json,application/json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const next=createSimulation(JSON.parse(await file.text()));sim.current=next;setVersion(v=>v+1);setSpawnTrack(next.network.tracks[0].id);accumulator.current=0;setRunning(false);setError('');}catch(err){setError(err instanceof Error?err.message:'読み込めませんでした');}e.target.value='';}}/></label><span>固定刻み 20 ms · {sim.current.trains.length}編成</span></footer>{error&&<p role="alert">{error}</p>}
    </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
