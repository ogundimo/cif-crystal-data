import { describe, expect, it } from 'vitest';
import { validateRefinementSettings, type RefinementSettings } from './refinement';

const valid: RefinementSettings = {
  method: 'lebail', spaceGroup: 'F m -3 m', cell: [5.64,5.64,5.64,90,90,90],
  wavelength: 1.5406, range: [10,80], geometry: 'debye_scherrer', radius: null,
  polarization: .5, zero: 0, profile: {u:0,v:0,w:.01,x:.01,y:0}, shape:'tchz_pv',
  backgroundTerms: 3, maxIterations: 100, maxPasses: 8, extractionCycles: 10,
  refineCell:true, refineProfile:true, refineZero:false, refineCoordinates:false,
  refineBiso:false, refineOccupancy:false, parameterEdits:{}
};
describe('refinement input boundary',()=>{
  it('requires a measurement geometry and a radius for a flat plate',()=>{
    expect(()=>validateRefinementSettings({...valid,geometry:''})).toThrow('geometry');
    expect(()=>validateRefinementSettings({...valid,geometry:'bragg_brentano'})).toThrow('radius');
    expect(validateRefinementSettings({...valid,geometry:'bragg_brentano',radius:240}).radius).toBe(240);
  });
  it('rejects invalid cells, missing numbers and reversed ranges',()=>{
    expect(()=>validateRefinementSettings({...valid,cell:[5,5,5,10,10,170]})).toThrow('volume');
    expect(()=>validateRefinementSettings({...valid,zero:NaN})).toThrow('Zero shift');
    expect(()=>validateRefinementSettings({...valid,range:[80,5]})).toThrow('increase');
  });
  it('bounds work and only accepts finite parameter overrides',()=>{
    expect(()=>validateRefinementSettings({...valid,maxPasses:1000})).toThrow('passes');
    expect(()=>validateRefinementSettings({...valid,parameterEdits:{'phases.0.scale':Infinity}})).toThrow('parameter edit');
    expect(()=>validateRefinementSettings({...valid,parameterEdits:[]})).toThrow('parameter edits');
  });
  it('strips renderer-supplied filesystem fields',()=>{
    const checked=validateRefinementSettings({...valid,outputBase:'C:/untrusted',resumePath:'C:/untrusted'});
    expect(checked).not.toHaveProperty('outputBase');
    expect(checked).not.toHaveProperty('resumePath');
  });
});
