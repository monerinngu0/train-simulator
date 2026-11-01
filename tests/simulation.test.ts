import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, step, occupied, validateNetwork } from '../src/core/simulation.ts';
import { demo } from '../src/core/demo.ts';
test('crosses connected tracks and retains rear occupancy',()=>{
    const s=createSimulation(demo);s.train.offset=599.9;s.train.speed=10;
    step(s);assert.equal(s.train.trackId,'B');assert.ok(s.train.offset>0);
    assert.deepEqual(occupied(s).map(x=>x.trackId),['B','A']);
    assert.ok(Math.abs(occupied(s).reduce((sum,p)=>sum+Math.abs(p.to-p.from),0)-80)<1e-6);
});
test('automatic train stops at the end without leaving the track',()=>{
    const s=createSimulation(demo);for(let i=0;i<20000;i++)step(s);
    assert.equal(s.train.trackId,'C');assert.ok(s.train.offset<=600);assert.ok(s.train.offset>598);assert.ok(s.train.speed<0.01);
});
test('manual brake brings train to rest',()=>{
    const s=createSimulation(demo);Object.assign(s.train,{mode:'manual',speed:12,brake:1});
    for(let i=0;i<600;i++)step(s);assert.equal(s.train.speed,0);assert.ok(s.train.offset>100);
});
test('manual train cannot run beyond buffer stop',()=>{
    const s=createSimulation(demo);Object.assign(s.train,{trackId:'C',offset:599,mode:'manual',speed:20,power:1});
    for(let i=0;i<100;i++)step(s);assert.equal(s.train.offset,600);assert.equal(s.train.speed,0);
});
test('entry through far port reverses local direction',()=>{
    const n=structuredClone(demo);n.junctions[0].states.connected=[['b','d']];n.junctions.splice(1);
    const s=createSimulation(n);s.train.offset=599.9;s.train.speed=10;step(s);
    assert.equal(s.train.trackId,'B');assert.equal(s.train.direction,-1);assert.ok(s.train.offset<800);
});
test('invalid ports and duplicate identities are rejected',()=>{
    const n=structuredClone(demo);n.tracks[0].ports[0]='missing';assert.throws(()=>validateNetwork(n));
    const m=structuredClone(demo);m.tracks[1].id='A';assert.throws(()=>validateNetwork(m));
});
test('fixed steps give repeatable results and do not mutate input',()=>{
    const a=createSimulation(demo),b=createSimulation(demo);for(let i=0;i<500;i++){step(a);step(b);}assert.deepEqual(a,b);assert.equal(demo.tracks[0].length,600);
});
