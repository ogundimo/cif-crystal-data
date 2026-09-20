import {expect,it} from 'vitest';
import {progressScale,progressCycleTicks} from './RefinementProgressPlot';
it('uses readable intervals for low residuals and retains all visible values',()=>{
 expect(progressScale([14]).ticks).toEqual([0,3,6,9,12,15]);
 expect(progressScale([9]).ticks).toEqual([0,2,4,6,8,10]);
 expect(progressScale([4.3]).ticks).toEqual([0,1,2,3,4,5]);
 expect(progressScale([43,2]).max).toBeGreaterThanOrEqual(43);
});

it('spaces cycle labels at readable integer intervals as the visible range changes',()=>{
 expect(progressCycleTicks([0,246])).toEqual([0,50,100,150,200]);
 expect(progressCycleTicks([0,20])).toEqual([0,5,10,15,20]);
 expect(progressCycleTicks([11,17])).toEqual([12,14,16]);
 expect(progressCycleTicks([0,4])).toEqual([0,1,2,3,4]);
});
