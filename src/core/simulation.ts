export type Direction = 1 | -1;
export interface Port { id: string }
export interface Track { id: string; ports: [string, string]; length: number; speedLimit: number; points: [number, number][] }
export interface Junction { id: string; state: string; states: Record<string, [string, string][]> }
export interface Station { id: string; name: string; trackId: string; offset: number }
export interface Stop { stationId: string; dwell: number; arrival?: number; departure?: number; reverse?: boolean }
export interface Route { id: string; name: string; trackIds: string[]; junctions: Record<string, string> }
export interface Network { ports: Port[]; tracks: Track[]; junctions: Junction[]; stations?: Station[]; routes?: Route[] }
export interface RouteLock { routeId: string; trainId: string; entered: boolean }
export interface Position { trackId: string; offset: number; direction: Direction; available?: number }
export interface Train extends Position { length: number; speed: number; power: number; brake: number; mode: 'manual' | 'auto'; targetSpeed: number; history: Position[]; id: string; stops: Stop[]; stopIndex: number; dwellUntil?: number; status: string; delay: number; repeat: boolean; scheduleStart: number }
export interface Simulation { network: Network; train: Train; trains: Train[]; locks: RouteLock[]; time: number }
export const DT = 0.02;
export function validateNetwork(n: Network) {
    if (!n || !Array.isArray(n.ports) || !Array.isArray(n.tracks) || !Array.isArray(n.junctions)) throw Error('ネットワーク形式が不正です');
    const ports = new Set(n.ports.map(p => p.id));
    if (ports.size !== n.ports.length || new Set(n.tracks.map(t => t.id)).size !== n.tracks.length || new Set(n.junctions.map(j => j.id)).size !== n.junctions.length) throw Error('IDが重複しています');
    const used = new Set<string>();
    for (const t of n.tracks) {
        if (!Number.isFinite(t.length) || t.length <= 0 || !Number.isFinite(t.speedLimit) || t.speedLimit <= 0 || t.ports.length !== 2 || t.ports.some(p => !ports.has(p) || used.has(p)) || t.ports[0] === t.ports[1] || t.points.length < 2 || t.points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v))) || !t.points.some(p => p[0] !== t.points[0][0] || p[1] !== t.points[0][1])) throw Error('線路の定義が不正です');
        t.ports.forEach(p => used.add(p));
    }
    for (const station of n.stations ?? []) {
        const t = n.tracks.find(t => t.id === station.trackId);
        if (!t || !Number.isFinite(station.offset) || station.offset < 0 || station.offset > t.length || !station.id || !station.name) throw Error('駅の定義が不正です');
    }
    if (new Set(n.stations?.map(x => x.id)).size !== (n.stations?.length ?? 0)) throw Error('駅IDが重複しています');
    for (const r of n.routes ?? []) {
        if (!r.trackIds.length || r.trackIds.some(id => !n.tracks.some(t => t.id === id)) || Object.entries(r.junctions).some(([id,state]) => !Object.hasOwn(n.junctions.find(j => j.id === id)?.states ?? {}, state))) throw Error('進路の定義が不正です');
    }
    if (new Set(n.routes?.map(x => x.id)).size !== (n.routes?.length ?? 0)) throw Error('進路IDが重複しています');
    const junctionPorts = new Set<string>();
    for (const j of n.junctions) {
        if (!j.id || !Object.hasOwn(j.states, j.state) || Object.values(j.states).some(pairs => !pairs.length)) throw Error('接続状態が不正です');
        const own = new Set<string>();
        for (const pairs of Object.values(j.states)) {
            const active = new Set<string>();
            for (const pair of pairs) for (const p of pair) {
                if (pair.length !== 2 || pair[0] === pair[1] || !used.has(p) || active.has(p) || junctionPorts.has(p)) throw Error('Port接続が不正です');
                active.add(p); own.add(p);
            }
        }
        own.forEach(p => junctionPorts.add(p));
    }
}
function track(s: Simulation) { return s.network.tracks.find(t => t.id === s.train.trackId)!; }
function next(s: Simulation, position: Position = s.train): Position | undefined {
    const t = s.network.tracks.find(t => t.id === position.trackId)!, exit = t.ports[position.direction === 1 ? 1 : 0];
    const pair = s.network.junctions.flatMap(j => j.states[j.state]).find(p => p.includes(exit));
    if (!pair) return;
    const entry = pair[0] === exit ? pair[1] : pair[0];
    const dest = s.network.tracks.find(t => t.ports.includes(entry))!;
    return { trackId: dest.id, offset: dest.ports[0] === entry ? 0 : dest.length, direction: dest.ports[0] === entry ? 1 : -1 };
}
// Follow the selected connections, stopping before revisiting a directed track.
export function selectedRoute(s: Simulation): Position[] {
    const result: Position[] = [];
    const seen = new Set<string>();
    let position: Position | undefined = { trackId: s.train.trackId, offset: s.train.offset, direction: s.train.direction };
    while (position && !seen.has(`${position.trackId}:${position.direction}`)) {
        seen.add(`${position.trackId}:${position.direction}`);
        result.push(position);
        position = next(s, position);
    }
    return result;
}
export function junctionLocked(s: Simulation, junctionId: string): boolean {
    const j = s.network.junctions.find(j => j.id === junctionId);
    if (!j) throw Error('分岐器が見つかりません');
    const ports = new Set(Object.values(j.states).flat(2));
    // Protect 15 m on every leg, including the train's rear across track boundaries.
    return s.locks.some(lock => Object.hasOwn(s.network.routes!.find(r => r.id === lock.routeId)!.junctions, junctionId)) || s.trains.some(train => occupied(s, train).some(seg => {
        const t = s.network.tracks.find(t => t.id === seg.trackId)!;
        return (ports.has(t.ports[0]) && Math.min(seg.from, seg.to) <= 15)
            || (ports.has(t.ports[1]) && Math.max(seg.from, seg.to) >= t.length - 15);
    }));
}
export function setJunctionState(s: Simulation, junctionId: string, state: string) {
    const j = s.network.junctions.find(j => j.id === junctionId);
    if (!j || !Object.hasOwn(j.states, state)) throw Error('分岐器の状態が不正です');
    if (j.state === state) return;
    if (junctionLocked(s, junctionId)) throw Error('列車が分岐器付近を占有しています');
    j.state = state;
}
function automaticTarget(s: Simulation): number {
    let distance = 0, target = s.train.targetSpeed;
    const route = selectedRoute(s);
    for (const p of route) {
        const t = s.network.tracks.find(t => t.id === p.trackId)!;
        // Leave response margin for the proportional speed controller before a lower limit.
        target = Math.min(target, distance === 0 ? t.speedLimit : Math.max(0, Math.sqrt(t.speedLimit ** 2 + 2 * 0.8 * distance) - 0.5));
        distance += p.direction === 1 ? t.length - p.offset : p.offset;
    }
    if (!next(s, route.at(-1)!)) target = Math.min(target, Math.sqrt(2 * 0.8 * Math.max(0, distance - 1)));
    return target;
}
function view(s: Simulation, train: Train): Simulation { return { ...s, train }; }
function blocked(s: Simulation, train: Train, trackId: string): boolean {
    return s.trains.some(other => other.id !== train.id && occupied(s, other).some(seg => seg.trackId === trackId))
        || s.locks.some(lock => lock.trainId !== train.id && s.network.routes!.find(r => r.id === lock.routeId)!.trackIds.includes(trackId));
}
export function signalAspect(s: Simulation, train: Train): 'green' | 'red' {
    const dest = next(view(s, train));
    return dest && !blocked(s, train, dest.trackId) ? 'green' : 'red';
}
export function nextStop(s: Simulation, train: Train): { station: Station; distance: number; stop: Stop } | undefined {
    const stop = train.stops[train.stopIndex];
    if (!stop) return;
    const station = s.network.stations?.find(x => x.id === stop.stationId);
    if (!station) return;
    let distance = 0;
    for (const p of selectedRoute(view(s, train))) {
        const t = s.network.tracks.find(t => t.id === p.trackId)!;
        const local = (station.offset - p.offset) * p.direction;
        if (station.trackId === p.trackId && local >= -0.05) return {station, distance: distance + Math.max(0, local), stop};
        distance += p.direction === 1 ? t.length - p.offset : p.offset;
    }
}
export function reverseTrain(s: Simulation, train: Train) {
    if (train.speed > 0.01 || train.dwellUntil !== undefined) throw Error('停止・停車扱い終了後に折り返してください');
    const segments = occupied(s, train).filter(seg => Math.abs(seg.to - seg.from) > 1e-8).reverse();
    if (!segments.length) throw Error('編成の位置を特定できません');
    const positions = segments.map(seg => ({trackId: seg.trackId, offset: seg.to, direction: (seg.from >= seg.to ? -1 : 1) as Direction, available: Math.abs(seg.from - seg.to)}));
    Object.assign(train, positions[0]);
    delete train.available;
    train.history = positions.slice(1);
    train.power = 0; train.brake = 0;
}
export function setTimetable(s: Simulation, train: Train, stops: Stop[], repeat = false) {
    for (const stop of stops) {
        if (!s.network.stations?.some(x => x.id === stop.stationId) || !Number.isFinite(stop.dwell) || stop.dwell < 0 || [stop.arrival, stop.departure].some(t => t !== undefined && (!Number.isFinite(t) || t < 0)) || (stop.arrival !== undefined && stop.departure !== undefined && stop.departure < stop.arrival)) throw Error('停車駅・時刻が不正です');
    }
    train.stops = structuredClone(stops); train.stopIndex = 0; train.dwellUntil = undefined; train.repeat = repeat; train.scheduleStart = s.time;
}
export function setRoute(s: Simulation, train: Train, routeId: string) {
    const route = s.network.routes?.find(r => r.id === routeId);
    if (!route || route.trackIds[0] !== train.trackId) throw Error('進路の始点に列車がいません');
    if (s.locks.some(l => l.trainId === train.id)) throw Error('設定済みの進路を解放してください');
    if (route.trackIds.some(id => blocked(s, train, id))) throw Error('進路に他の列車または予約があります');
    for (const [id] of Object.entries(route.junctions)) if (junctionLocked(s, id)) throw Error('分岐器が占有または鎖錠されています');
    const candidate = structuredClone(s.network);
    for (const [id,state] of Object.entries(route.junctions)) candidate.junctions.find(j => j.id === id)!.state = state;
    const path = selectedRoute({...s, network: candidate, train});
    if (!route.trackIds.every((id,i) => path[i]?.trackId === id)) throw Error('列車の方向と進路が一致しません');
    s.network = candidate;
    s.locks.push({routeId, trainId: train.id, entered: false});
}
export function cancelRoute(s: Simulation, train: Train) {
    const lock = s.locks.find(l => l.trainId === train.id);
    if (!lock) return;
    if (train.speed > 0.01 || lock.entered) throw Error('走行中・進入後の進路は取消できません');
    s.locks = s.locks.filter(l => l !== lock);
}
export function addTrain(s: Simulation, trackId: string, direction: Direction = 1): Train {
    const t = s.network.tracks.find(t => t.id === trackId);
    if (!t || blocked(s, {id: ''} as Train, trackId)) throw Error('空いている線路を選んでください');
    let id = 1; while (s.trains.some(t => t.id === String(id).padStart(2,'0'))) id++;
    const train: Train = {id: String(id).padStart(2,'0'), trackId, offset: direction === 1 ? Math.min(100,t.length) : Math.max(0,t.length-100), direction, length: Math.min(80,t.length), speed: 0, power: 0, brake: 0, mode: 'auto', targetSpeed: 20, history: [], stops: [], stopIndex: 0, status: '停車', delay: 0, repeat: false, scheduleStart: s.time};
    s.trains.push(train); return train;
}
export function removeTrain(s: Simulation, train: Train) {
    if (s.trains.length === 1 || train.speed > 0.01 || s.locks.some(l => l.trainId === train.id)) throw Error('停止・進路解放後に削除してください（最低1編成）');
    s.trains = s.trains.filter(t => t !== train); if (s.train === train) s.train = s.trains[0];
}
export function step(s: Simulation) {
    for (const train of s.trains) {
        const v = view(s, train);
        if (train.dwellUntil !== undefined) {
            train.status = '停車中'; train.speed = 0;
            if (s.time + 1e-6 < train.dwellUntil) continue;
            const stop = train.stops[train.stopIndex];
            train.dwellUntil = undefined;
            if (stop?.reverse) reverseTrain(s, train);
            train.stopIndex++;
            if (train.repeat && train.stopIndex === train.stops.length) { train.stopIndex = 0; train.scheduleStart = s.time; }
            train.dwellUntil = undefined;
        }
        const t = track(v);
        let boundary = Infinity, traversed = 0;
        for (const p of selectedRoute(v)) {
            if (blocked(s, train, p.trackId)) { boundary = Math.max(0, traversed - 1); break; }
            const rt = s.network.tracks.find(t => t.id === p.trackId)!;
            traversed += p.direction === 1 ? rt.length - p.offset : p.offset;
        }
        const stop = nextStop(s, train);
        const stationDistance = train.mode === 'auto' && stop ? stop.distance : Infinity;
        const target = Math.min(train.mode === 'auto' ? automaticTarget(v) : Infinity, Math.sqrt(2 * 0.8 * Math.max(0, boundary - 0.5)), Math.sqrt(2 * 0.8 * Math.max(0, stationDistance - 0.1)));
        const acceleration = train.mode === 'auto' ? Math.max(-1, Math.min(0.7, (target - train.speed) * 2)) : Math.min(train.power * 0.7 - train.brake * 1.2, Number.isFinite(target) ? (target - train.speed) * 2 : Infinity);
        const old = train.speed;
        train.speed = Math.max(0, Math.min(t.speedLimit, old + acceleration * DT));
        if (target === 0 && train.speed < 0.001) train.speed = 0;
        let distance = Math.min((old + train.speed) / 2 * DT, boundary, stationDistance);
        train.status = boundary < 2 ? '信号待ち' : train.speed > 0.01 ? '走行中' : '停車';
        while (distance > 1e-10) {
            const current = track(v), left = train.direction === 1 ? current.length - train.offset : train.offset;
            if (distance < left) { train.offset += train.direction * distance; break; }
            train.offset += train.direction * left; distance -= left;
            const dest = next(v);
            if (!dest || blocked(s, train, dest.trackId)) { train.speed = 0; break; }
            train.history.unshift({trackId: train.trackId, offset: train.offset, direction: train.direction});
            Object.assign(train, dest); delete train.available;
            train.speed = Math.min(train.speed, track(v).speedLimit);
            let length = train.direction === 1 ? train.offset : track(v).length - train.offset;
            train.history = train.history.filter(p => { const keep = length < train.length; length += p.available ?? s.network.tracks.find(t => t.id === p.trackId)!.length; return keep; });
        }
        if (boundary <= 1e-7) train.speed = 0;
        const arrived = nextStop(s, train);
        if (arrived && train.trackId === arrived.station.trackId && arrived.distance < 0.2 && train.speed < 0.15) {
            train.speed = 0; train.offset = arrived.station.offset;
            train.delay = Math.max(0, s.time - (arrived.stop.arrival !== undefined ? train.scheduleStart + arrived.stop.arrival : s.time));
            train.dwellUntil = Math.max(s.time + arrived.stop.dwell, arrived.stop.departure !== undefined ? train.scheduleStart + arrived.stop.departure : 0);
            train.status = '停車中';
        }
    }
    s.locks = s.locks.filter(lock => {
        const train = s.trains.find(t => t.id === lock.trainId)!;
        const route = s.network.routes!.find(r => r.id === lock.routeId)!;
        if (train.trackId !== route.trackIds[0]) lock.entered = true;
        return !(lock.entered && train.trackId === route.trackIds.at(-1) && occupied(s, train).every(seg => seg.trackId === train.trackId));
    });
    s.time += DT;
}
export function occupied(s: Simulation, train: Train = s.train): {trackId: string; from: number; to: number}[] {
    let left = train.length;
    const result = [];
    for (const p of [train, ...train.history]) {
        const t = s.network.tracks.find(t => t.id === p.trackId)!;
        const amount = Math.min(left, p.available ?? Infinity, p.direction === 1 ? p.offset : t.length - p.offset);
        result.push({ trackId: p.trackId, from: p.offset, to: p.offset - p.direction * amount });
        left -= amount;
        if (left <= 0) break;
    }
    return result;
}
export function createSimulation(network: Network): Simulation {
    validateNetwork(network);
    if (!network.tracks.length) throw Error('線路が必要です');
    const s = {network: structuredClone(network), trains: [], locks: [], time: 0} as unknown as Simulation;
    s.train = addTrain(s, network.tracks[0].id);
    return s;
}
