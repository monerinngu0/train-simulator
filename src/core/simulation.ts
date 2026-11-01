export type Direction = 1 | -1;
export interface Port { id: string }
export interface Track { id: string; ports: [string, string]; length: number; speedLimit: number; points: [number, number][] }
export interface Junction { id: string; state: string; states: Record<string, [string, string][]> }
export interface Network { ports: Port[]; tracks: Track[]; junctions: Junction[] }
export interface Position { trackId: string; offset: number; direction: Direction }
export interface Train extends Position { length: number; speed: number; power: number; brake: number; mode: 'manual' | 'auto'; targetSpeed: number; history: Position[] }
export interface Simulation { network: Network; train: Train; time: number }
export const DT = 0.02;
export function validateNetwork(n: Network) {
    if (!n || !Array.isArray(n.ports) || !Array.isArray(n.tracks) || !Array.isArray(n.junctions)) throw Error('ネットワーク形式が不正です');
    const ports = new Set(n.ports.map(p => p.id));
    if (ports.size !== n.ports.length || new Set(n.tracks.map(t => t.id)).size !== n.tracks.length) throw Error('IDが重複しています');
    const used = new Set<string>();
    for (const t of n.tracks) {
        if (!Number.isFinite(t.length) || t.length <= 0 || !Number.isFinite(t.speedLimit) || t.speedLimit <= 0 || t.ports.length !== 2 || t.ports.some(p => !ports.has(p) || used.has(p)) || t.ports[0] === t.ports[1] || t.points.length < 2 || t.points.some(p => p.length !== 2 || p.some(v => !Number.isFinite(v)))) throw Error('線路の定義が不正です');
        t.ports.forEach(p => used.add(p));
    }
    const junctionPorts = new Set<string>();
    for (const j of n.junctions) {
        if (!j.states[j.state]) throw Error('接続状態が不正です');
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
function next(s: Simulation): Position | undefined {
    const t = track(s), exit = t.ports[s.train.direction === 1 ? 1 : 0];
    const pair = s.network.junctions.flatMap(j => j.states[j.state]).find(p => p.includes(exit));
    if (!pair) return;
    const entry = pair[0] === exit ? pair[1] : pair[0];
    const dest = s.network.tracks.find(t => t.ports.includes(entry))!;
    return { trackId: dest.id, offset: dest.ports[0] === entry ? 0 : dest.length, direction: dest.ports[0] === entry ? 1 : -1 };
}
export function step(s: Simulation) {
    const tr = s.train, t = track(s), remaining = tr.direction === 1 ? t.length - tr.offset : tr.offset;
    const end = !next(s);
    // Automatic mode regulates speed and brakes for the buffer stop. Manual mode has a hard end boundary.
    const target = Math.min(tr.targetSpeed, t.speedLimit, end ? Math.sqrt(2 * 0.8 * Math.max(0, remaining - 1)) : Infinity);
    const acceleration = tr.mode === 'auto' ? Math.max(-1, Math.min(0.7, (target - tr.speed) * 2)) : tr.power * 0.7 - tr.brake * 1.2;
    const old = tr.speed;
    tr.speed = Math.max(0, Math.min(t.speedLimit, old + acceleration * DT));
    let distance = (old + tr.speed) / 2 * DT;
    while (distance > 0) {
        const current = track(s), left = tr.direction === 1 ? current.length - tr.offset : tr.offset;
        if (distance < left) { tr.offset += tr.direction * distance; break; }
        tr.offset += tr.direction * left; distance -= left;
        const dest = next(s);
        if (!dest) { tr.speed = 0; break; }
        tr.history.unshift({ trackId: tr.trackId, offset: tr.offset, direction: tr.direction });
        Object.assign(tr, dest);
        tr.speed = Math.min(tr.speed, track(s).speedLimit);
        let length = tr.direction === 1 ? tr.offset : track(s).length - tr.offset;
        tr.history = tr.history.filter(p => { const keep = length < tr.length; length += s.network.tracks.find(t => t.id === p.trackId)!.length; return keep; });
    }
    s.time += DT;
}
export function occupied(s: Simulation): {trackId: string; from: number; to: number}[] {
    let left = s.train.length;
    const result = [];
    for (const p of [s.train, ...s.train.history]) {
        const t = s.network.tracks.find(t => t.id === p.trackId)!;
        const amount = Math.min(left, p.direction === 1 ? p.offset : t.length - p.offset);
        result.push({ trackId: p.trackId, from: p.offset, to: p.offset - p.direction * amount });
        left -= amount;
        if (left <= 0) break;
    }
    return result;
}
export function createSimulation(network: Network): Simulation {
    validateNetwork(network);
    if (!network.tracks.length) throw Error('線路が必要です');
    return { network: structuredClone(network), train: {trackId: network.tracks[0].id, offset: Math.min(100, network.tracks[0].length), direction: 1, length: 80, speed: 0, power: 0, brake: 0, mode: 'auto', targetSpeed: 20, history: []}, time: 0 };
}
