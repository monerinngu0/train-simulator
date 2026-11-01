import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, step, occupied, addTrain, removeTrain, reverseTrain, setTimetable, setRoute, cancelRoute, setJunctionState, signalAspect, validateNetwork } from '../src/core/simulation.ts';
import { demo } from '../src/core/demo.ts';
function run(s:ReturnType<typeof createSimulation>,seconds:number) {for(let i=0;i<seconds/0.02;i++)step(s);}
function footprint(s:ReturnType<typeof createSimulation>) {return occupied(s).map(p=>[p.trackId,Math.min(p.from,p.to),Math.max(p.from,p.to)]).sort();}
test('scheduled station stop observes dwell and departure then resumes',()=>{
    const s=createSimulation(demo);setTimetable(s,s.train,[{stationId:'west',dwell:5,departure:40}]);
    run(s,30);assert.equal(s.train.status,'停車中');assert.equal(s.train.offset,180);assert.equal(s.train.speed,0);
    run(s,9);assert.equal(s.train.offset,180);run(s,3);assert.ok(s.train.offset>180);assert.equal(s.train.stopIndex,1);
});
test('late arrival is recorded and dwelling is still honored',()=>{
    const s=createSimulation(demo);setTimetable(s,s.train,[{stationId:'west',dwell:10,arrival:1,departure:2}]);
    run(s,25);assert.ok(s.train.delay>1);assert.ok(s.train.dwellUntil!==undefined);assert.equal(s.train.offset,180);
});
test('foldback preserves footprint across a track boundary and twice restores position',()=>{
    const s=createSimulation(demo);Object.assign(s.train,{trackId:'B',offset:30,history:[{trackId:'A',offset:600,direction:1}],speed:0});
    const before=footprint(s);reverseTrain(s,s.train);assert.equal(s.train.trackId,'A');assert.equal(s.train.direction,-1);assert.deepEqual(footprint(s),before);reverseTrain(s,s.train);assert.deepEqual(footprint(s),before);
    assert.equal(s.train.trackId,'B');assert.equal(s.train.offset,30);
});
test('repeated automatic round trips continue and reverse at both endpoints',()=>{
    const s=createSimulation(demo);setTimetable(s,s.train,[{stationId:'east',dwell:2,reverse:true},{stationId:'west',dwell:2,reverse:true}],true);
    const directions=new Set<number>();for(let i=0;i<45000;i++){step(s);directions.add(s.train.direction);}assert.equal(directions.size,2);assert.ok(s.train.scheduleStart>0);assert.ok(s.train.stopIndex<2);
});
test('opposing trains cannot enter each other occupied block',()=>{
    const s=createSimulation(demo);const other=addTrain(s,'C',-1);other.mode='manual';other.brake=1;
    run(s,220);assert.equal(s.train.trackId,'B');assert.ok(s.train.offset<800);assert.equal(signalAspect(s,s.train),'red');
    assert.equal(other.trackId,'C');assert.equal(other.offset,500);
    assert.ok(!occupied(s,s.train).some(a=>occupied(s,other).some(b=>a.trackId===b.trackId)));
});
test('same block spawn is rejected and manual power obeys red signal',()=>{
    const s=createSimulation(demo);assert.throws(()=>addTrain(s,'A'));
    const other=addTrain(s,'B');other.mode='manual';other.brake=1;
    s.train.mode='manual';s.train.power=1;run(s,100);assert.equal(s.train.trackId,'A');assert.ok(s.train.offset<600);assert.equal(s.train.speed,0);
});
test('route setting is atomic and locks switches until complete train clears',()=>{
    const s=createSimulation(demo);setRoute(s,s.train,'side-east');assert.equal(s.network.junctions[0].state,'待避線');assert.equal(s.locks.length,1);
    assert.throws(()=>setJunctionState(s,'J2','本線'));
    s.train.speed=1;assert.throws(()=>cancelRoute(s,s.train));s.train.speed=0;
    cancelRoute(s,s.train);assert.equal(s.locks.length,0);
    setRoute(s,s.train,'side-east');run(s,220);assert.equal(s.train.trackId,'C');assert.equal(s.locks.length,0);
});
test('occupied route rejection leaves junctions unchanged',()=>{
    const s=createSimulation(demo);addTrain(s,'D');const before=structuredClone(s.network);
    assert.throws(()=>setRoute(s,s.train,'side-east'));assert.deepEqual(s.network,before);assert.equal(s.locks.length,0);
});
test('conflicting route reservations and entered cancellation are rejected',()=>{
    const s=createSimulation(demo);setRoute(s,s.train,'main-east');assert.throws(()=>addTrain(s,'B'));
    run(s,50);assert.equal(s.locks[0].entered,true);s.train.speed=0;assert.throws(()=>cancelRoute(s,s.train));
});
test('invalid timetable and station references fail without replacing schedule',()=>{
    const s=createSimulation(demo);assert.throws(()=>setTimetable(s,s.train,[{stationId:'missing',dwell:1}]));assert.equal(s.train.stops.length,0);
    const n=structuredClone(demo);n.stations![0].offset=-1;assert.throws(()=>validateNetwork(n));
});
test('train deletion checks stopped state and retains a selected train',()=>{
    const s=createSimulation(demo);const other=addTrain(s,'D');other.speed=1;assert.throws(()=>removeTrain(s,other));other.speed=0;s.train=other;removeTrain(s,other);assert.equal(s.trains.length,1);assert.equal(s.train.id,'01');assert.throws(()=>removeTrain(s,s.train));
});
