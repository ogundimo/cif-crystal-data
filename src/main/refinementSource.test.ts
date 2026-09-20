import { describe, expect, it, vi } from 'vitest';
import { parseCif } from '../parser/cifParser';
import type { EntryRow, AtomSiteRow, AtomSiteAnisotropicRow, SymmetryOperationRow } from '../shared/types';
import { resolveRefinementSource, storedStructureCif } from './refinementSource';

describe('refinement CIF recovery', () => {
  it('reads the exact selected block when the original file is available', async () => {
    const read = vi.fn().mockResolvedValue('data_original\n');
    const stored = vi.fn();
    expect(await resolveRefinementSource('original.cif', 2, read, stored)).toEqual({text:'data_original\n',warnings:[]});
    expect(read).toHaveBeenCalledWith('original.cif',2);
    expect(stored).not.toHaveBeenCalled();
  });
  it.each(['ENOENT','ENOTDIR','EACCES'])('recovers from %s with explicit provenance', async code => {
    const result = await resolveRefinementSource('old OneDrive/location.cif',0,vi.fn().mockRejectedValue(Object.assign(new Error('missing'),{code})),()=>'data_stored\n');
    expect(result.text).toBe('data_stored\n');
    expect(result.warnings[0]).toContain('structure saved in the database');
  });
  it('also works for legacy entries with no source path', async () => {
    expect((await resolveRefinementSource(null,0,vi.fn(),()=>'cached')).text).toBe('cached');
  });
  it('does not silently hide a changed or invalid data block', async () => {
    await expect(resolveRefinementSource('source.cif',3,vi.fn().mockRejectedValue(new Error('Block unavailable')),()=>'cached')).rejects.toThrow('Block unavailable');
  });
  it('preserves stored lengths, angles, symmetry, occupancy and displacement data', () => {
    const entry = {formula:'Na1Cl1',cell_a:.564,cell_b:.564,cell_c:.564,cell_a_angstrom:5.64,cell_b_angstrom:5.64,cell_c_angstrom:5.64,cell_angle_alpha:90,cell_angle_beta:90,cell_angle_gamma:90,space_group:'P 1',sg_number:1} as EntryRow;
    const atoms = [{site_label:'Na1',type_symbol:'Na',fract_x:.1,fract_y:.2,fract_z:.3,occupancy:.8,u_iso_or_equiv:.02,b_iso_or_equiv:null}] as AtomSiteRow[];
    const ops = [{operation_id:'1',operation_xyz:'x,y,z'}] as SymmetryOperationRow[];
    const aniso = [{site_label:'Na1',u_11:.01,u_22:.02,u_33:.03,u_12:.001,u_13:.002,u_23:.003,b_11:null,b_22:null,b_33:null,b_12:null,b_13:null,b_23:null}] as AtomSiteAnisotropicRow[];
    const restored = parseCif(storedStructureCif(entry,atoms,ops,aniso));
    expect(restored.atomSites[0]).toMatchObject({siteLabel:'Na1',fractX:.1,fractY:.2,fractZ:.3,occupancy:.8,uIsoOrEquiv:.02});
    expect(restored.symmetryOperations[0].operationXyz).toBe('x,y,z');
    expect(restored.atomSiteAnisotropic[0]).toMatchObject({u11:.01,u22:.02,u33:.03,u12:.001,u13:.002,u23:.003});
    expect(storedStructureCif(entry,[],[],[])).toContain('_cell_length_a\n5.64');
  });
});
