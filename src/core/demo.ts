import type { Network } from './simulation.ts';
export const demo: Network = {
    ports: ['a','b','c','d','e','f'].map(id => ({id})),
    tracks: [
        {id:'A',ports:['a','b'],length:600,speedLimit:25,points:[[80,180],[300,180]]},
        {id:'B',ports:['c','d'],length:800,speedLimit:22,points:[[300,180],[380,100],[650,100],[730,180]]},
        {id:'C',ports:['e','f'],length:600,speedLimit:25,points:[[730,180],[950,180]]}
    ],
    junctions:[{id:'J1',state:'connected',states:{connected:[['b','c']]}},{id:'J2',state:'connected',states:{connected:[['d','e']]}}]
};
