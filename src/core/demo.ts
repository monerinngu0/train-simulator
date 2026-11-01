import type { Network } from './simulation.ts';
export const demo: Network = {
    ports: ['a','b','c','d','e','f','g','h'].map(id => ({id})),
    tracks: [
        {id:'A',ports:['a','b'],length:600,speedLimit:25,points:[[80,180],[300,180]]},
        {id:'B',ports:['c','d'],length:800,speedLimit:22,points:[[300,180],[730,180]]},
        {id:'C',ports:['e','f'],length:600,speedLimit:25,points:[[730,180],[950,180]]},
        {id:'D',ports:['g','h'],length:900,speedLimit:12,points:[[300,180],[380,80],[650,80],[730,180]]}
    ],
    stations: [{id:'west',name:'西駅',trackId:'A',offset:180},{id:'central',name:'中央駅',trackId:'B',offset:400},{id:'siding',name:'中央駅・待避線',trackId:'D',offset:450},{id:'east',name:'東駅',trackId:'C',offset:420}],
    routes: [
        {id:'main-east',name:'東行・本線',trackIds:['A','B','C'],junctions:{J1:'本線',J2:'本線'}},
        {id:'side-east',name:'東行・待避線',trackIds:['A','D','C'],junctions:{J1:'待避線',J2:'待避線'}},
        {id:'main-west',name:'西行・本線',trackIds:['C','B','A'],junctions:{J1:'本線',J2:'本線'}},
        {id:'side-west',name:'西行・待避線',trackIds:['C','D','A'],junctions:{J1:'待避線',J2:'待避線'}}
    ],
    junctions: [
        {id:'J1',state:'本線',states:{'本線':[['b','c']],'待避線':[['b','g']]}},
        {id:'J2',state:'本線',states:{'本線':[['d','e']],'待避線':[['h','e']]}}
    ]
};
