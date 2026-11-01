import { useState } from 'react';
import type { Network, Track } from './core/simulation.ts';
import { validateNetwork } from './core/simulation.ts';
export function Editor({network, onApply, onClose}: {network: Network; onApply: (n: Network) => void; onClose: () => void}) {
    const [draft, setDraft] = useState(() => structuredClone(network));
    const [start,setStart] = useState<[number,number]>();
    const [drawing,setDrawing] = useState(false), [selected,setSelected] = useState(network.tracks[0]?.id ?? '');
    const [name,setName] = useState('新駅'), [offset,setOffset] = useState(200);
    const [ports,setPorts] = useState(['','','']), [error,setError] = useState('');
    const [routeName,setRouteName] = useState('新進路'), [routeTracks,setRouteTracks] = useState('');
    const [states,setStates] = useState<Record<string,string>>({});
    function edit(fn: (n: Network) => void) { const n = structuredClone(draft); fn(n); setDraft(n); }
    function id(prefix: string, ids: string[]) { let i=1; while(ids.includes(prefix+i)) i++; return prefix+i; }
    const track = draft.tracks.find(t => t.id === selected);
    const used = new Set(draft.junctions.flatMap(j => Object.values(j.states).flat(2)));
    const freePorts = draft.tracks.flatMap(t => t.ports).filter(p => !used.has(p));
    function addConnection() {
        if (!ports[0] || !ports[1] || new Set(ports.filter(Boolean)).size !== ports.filter(Boolean).length) {setError('異なる端点を選んでください');return;}
        edit(n => n.junctions.push({id:id('J', n.junctions.map(j=>j.id)),state:'本線',states:ports[2] ? {'本線':[[ports[0],ports[1]]],'待避線':[[ports[0],ports[2]]]} : {'本線':[[ports[0],ports[1]]]}}));
        setPorts(['','','']);setError('');
    }
    return <section className="editor"><div className="section-title">配線編集 <button onClick={onClose}>閉じる</button></div>
        <p>「線路を描く」を選び、図上の始点と終点をクリック。既存の線路はクリックして選択できます。適用すると運転を初期化します。</p>
        <button aria-pressed={drawing} onClick={()=>{setDrawing(!drawing);setStart(undefined);}}>線路を描く</button>
        <svg preserveAspectRatio="none" viewBox="0 0 1030 320" aria-label="配線編集キャンバス" onClick={e=>{if(!drawing)return;const box=e.currentTarget.getBoundingClientRect();const p:[number,number]=[Math.round((e.clientX-box.left)/box.width*1030),Math.round((e.clientY-box.top)/box.height*320)];if(!start){setStart(p);return;}if(Math.hypot(p[0]-start[0],p[1]-start[1])<10)return;const nextId=id('T',draft.tracks.map(t=>t.id));edit(n=>{const a=nextId+'a',b=nextId+'b';n.ports.push({id:a},{id:b});n.tracks.push({id:nextId,ports:[a,b],length:600,speedLimit:20,points:[start,p]});});setSelected(nextId);setStart(undefined);setDrawing(false);}}>
            {draft.tracks.map(t=><g key={t.id}><polyline points={t.points.map(p=>p.join(',')).join(' ')} stroke={t.id===selected?'#f4cc60':'#657488'} strokeWidth="6" fill="none" onClick={e=>{if(!drawing){e.stopPropagation();setSelected(t.id);}}}/>{t.points.filter((_,i)=>i===0||i===t.points.length-1).map((p,i)=><text key={i} x={p[0]} y={p[1]+22} textAnchor="middle" fill="#a9b6c7" fontSize="12">{t.ports[i]}</text>)}</g>)}
            {start&&<circle cx={start[0]} cy={start[1]} r="6" fill="#77cbb2"/>}
        </svg>
        <div className="edit-grid"><fieldset><legend>線路</legend><label>選択<select value={selected} onChange={e=>setSelected(e.target.value)}>{draft.tracks.map(t=><option key={t.id}>{t.id}</option>)}</select></label>{track&&<><label>長さ m<input type="number" min="100" value={track.length} onChange={e=>edit(n=>{n.tracks.find(t=>t.id===selected)!.length=+e.target.value;})}/></label><label>制限速度 km/h<input type="number" min="1" value={Math.round(track.speedLimit*3.6)} onChange={e=>edit(n=>{n.tracks.find(t=>t.id===selected)!.speedLimit=+e.target.value/3.6;})}/></label><button onClick={()=>{edit(n=>{const removing=new Set(track.ports);n.tracks=n.tracks.filter(t=>t.id!==selected);n.ports=n.ports.filter(p=>!removing.has(p.id));n.junctions=n.junctions.filter(j=>!Object.values(j.states).flat(2).some(p=>removing.has(p)));n.stations=n.stations?.filter(s=>s.trackId!==selected);n.routes=[];});setSelected(draft.tracks.find(t=>t.id!==selected)?.id??'');}}>選択線路を削除</button></>}</fieldset>
        <fieldset><legend>接続・分岐器</legend>{['共通端点','本線側端点','待避線側端点（任意）'].map((label,i)=><label key={i}>{label}<select value={ports[i]} onChange={e=>setPorts(ports.map((p,j)=>i===j?e.target.value:p))}><option value="">未選択</option>{freePorts.map(p=><option key={p}>{p}</option>)}</select></label>)}<button onClick={addConnection}>接続を追加</button>{draft.junctions.map(j=><div key={j.id}>{j.id} <button onClick={()=>edit(n=>{n.junctions=n.junctions.filter(x=>x.id!==j.id);n.routes=[];})}>削除</button></div>)}</fieldset>
        <fieldset><legend>駅・ホーム</legend><label>駅名<input value={name} onChange={e=>setName(e.target.value)}/></label><label>選択線路の停車位置 m<input type="number" min="0" max={track?.length} value={offset} onChange={e=>setOffset(+e.target.value)}/></label><button disabled={!track} onClick={()=>{if(!track||!name.trim()||offset<80||offset>track.length-80){setError('停車位置は両端から80 m以上離してください');return;}edit(n=>{n.stations??=[];n.stations.push({id:id('S',n.stations.map(s=>s.id)),name:name.trim(),trackId:selected,offset});});setError('');}}>選択線路に駅を追加</button>{draft.stations?.map(s=><div key={s.id}>{s.name}（{s.trackId}・{s.offset} m）<button onClick={()=>edit(n=>{n.stations=n.stations?.filter(x=>x.id!==s.id);})}>削除</button></div>)}</fieldset>
        <fieldset><legend>進路</legend><label>進路名<input value={routeName} onChange={e=>setRouteName(e.target.value)}/></label><label>経由線路（例：A,B,C）<input value={routeTracks} onChange={e=>setRouteTracks(e.target.value)}/></label>{draft.junctions.map(j=><label key={j.id}>{j.id}<select value={states[j.id]??j.state} onChange={e=>setStates({...states,[j.id]:e.target.value})}>{Object.keys(j.states).map(state=><option key={state}>{state}</option>)}</select></label>)}<button onClick={()=>{const trackIds=routeTracks.split(',').map(s=>s.trim());if(!routeName.trim()||trackIds.some(id=>!draft.tracks.some(t=>t.id===id))){setError('存在する線路を順に指定してください');return;}edit(n=>{n.routes??=[];n.routes.push({id:id('R',n.routes.map(r=>r.id)),name:routeName.trim(),trackIds,junctions:Object.fromEntries(n.junctions.map(j=>[j.id,states[j.id]??j.state]))});});setError('');}}>進路を追加</button>{draft.routes?.map(r=><div key={r.id}>{r.name}<button onClick={()=>edit(n=>{n.routes=n.routes?.filter(x=>x.id!==r.id);})}>削除</button></div>)}</fieldset></div>
        {error&&<p role="alert">{error}</p>}<button className="primary" onClick={()=>{try{validateNetwork(draft);if(!draft.tracks.length||draft.tracks.some(t=>t.length<100))throw Error('線路は100 m以上にしてください');onApply(draft);}catch(e){setError(e instanceof Error?e.message:'配線が不正です');}}}>この配線を適用</button>
    </section>;
}
