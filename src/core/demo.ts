import type { Network } from './simulation.ts';
export const demo: Network = {
    ports: ['a','b','c','d','e','f','g','h'].map(id => ({id})),
    tracks: [
        {id:'A',ports:['a','b'],length:600,speedLimit:25,points:[[80,180],[300,180]]},
        {id:'B',ports:['c','d'],length:800,speedLimit:22,points:[[300,180],[730,180]]},
        {id:'C',ports:['e','f'],length:600,speedLimit:25,points:[[730,180],[950,180]]},
        {id:'D',ports:['g','h'],length:900,speedLimit:12,points:[[300,180],[380,80],[650,80],[730,180]]}
    ],
    junctions: [
        {id:'J1',state:'本線',states:{'本線':[['b','c']],'待避線':[['b','g']]}},
        {id:'J2',state:'本線',states:{'本線':[['d','e']],'待避線':[['h','e']]}}
    ]
};
