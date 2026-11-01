import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, step, occupied, validateNetwork, setJunctionState, junctionLocked, selectedRoute } from '../src/core/simulation.ts';
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
    const n=structuredClone(demo);n.junctions[0].states['本線']=[['b','d']];n.junctions.splice(1);
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
test('both switch states lead through their selected branch to C',()=>{
    for(const [state, branch] of [['本線','B'],['待避線','D']]) {
        const s=createSimulation(demo);
        setJunctionState(s,'J1',state);setJunctionState(s,'J2',state);
        assert.deepEqual(selectedRoute(s).map(p=>p.trackId),['A',branch,'C']);
        s.train.offset=599.9;s.train.speed=10;step(s);assert.equal(s.train.trackId,branch);
        for(let i=0;i<20000;i++)step(s);
        assert.equal(s.train.trackId,'C');assert.ok(s.train.speed<0.01);
    }
});
test('switch stays locked until the rear clears all protected legs',()=>{
    const s=createSimulation(demo);s.train.offset=584;
    assert.equal(junctionLocked(s,'J1'),false);
    s.train.offset=585;assert.equal(junctionLocked(s,'J1'),true);
    assert.throws(()=>setJunctionState(s,'J1','待避線'));
    s.train.offset=599.9;s.train.speed=10;step(s);
    assert.equal(junctionLocked(s,'J1'),true);
    assert.throws(()=>setJunctionState(s,'J1','待避線'));
    s.train.offset=95;assert.equal(junctionLocked(s,'J1'),true);
    s.train.offset=96;assert.equal(junctionLocked(s,'J1'),false);
    setJunctionState(s,'J1','待避線');assert.equal(s.network.junctions[0].state,'待避線');
});
test('mismatched exit stops automatic train on the disconnected branch',()=>{
    const s=createSimulation(demo);setJunctionState(s,'J1','待避線');
    assert.deepEqual(selectedRoute(s).map(p=>p.trackId),['A','D']);
    for(let i=0;i<20000;i++)step(s);
    assert.equal(s.train.trackId,'D');assert.ok(s.train.offset>898 && s.train.offset<900);assert.ok(s.train.speed<0.01);
});
test('automatic train brakes before entering low-speed branch',()=>{
    const s=createSimulation(demo);setJunctionState(s,'J1','待避線');setJunctionState(s,'J2','待避線');
    let approachSpeed=0;
    for(let i=0;i<10000 && s.train.trackId==='A';i++) {
        approachSpeed=s.train.speed;step(s);
    }
    assert.equal(s.train.trackId,'D');assert.ok(approachSpeed<12.1);
});
test('unknown state does not mutate switch and input network stays independent',()=>{
    const s=createSimulation(demo);assert.throws(()=>setJunctionState(s,'J1','unknown'));
    setJunctionState(s,'J1','待避線');assert.equal(demo.junctions[0].state,'本線');
});
test('route traversal terminates on a loop',()=>{
    const n=structuredClone(demo);n.junctions.push({id:'loop',state:'on',states:{on:[['f','a']]}});
    const s=createSimulation(n);assert.deepEqual(selectedRoute(s).map(p=>p.trackId),['A','B','C']);
    for(let i=0;i<10000;i++)step(s);assert.ok(s.train.speed>0);
});
test('reverse traversal uses selected turnout connection',()=>{
    const s=createSimulation(demo);setJunctionState(s,'J1','待避線');setJunctionState(s,'J2','待避線');
    Object.assign(s.train,{trackId:'C',offset:0.1,direction:-1,speed:10});step(s);
    assert.equal(s.train.trackId,'D');assert.equal(s.train.direction,-1);
    assert.equal(junctionLocked(s,'J2'),true);
    assert.deepEqual(selectedRoute(s).map(p=>p.trackId),['D','A']);
});
