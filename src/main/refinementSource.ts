import type { EntryRow, AtomSiteRow, AtomSiteAnisotropicRow, SymmetryOperationRow } from '../shared/types';

export interface RefinementSource { text: string; warnings: string[] }

function token(value: string | number | null): string {
  if (value === null || (typeof value === 'number' && !Number.isFinite(value))) return '?';
  if (typeof value === 'number') return String(value);
  if (!value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`;
  if (!value.includes('"') && !/[\r\n]/.test(value)) return `"${value}"`;
  if (/^;/m.test(value)) throw new Error('Stored CIF text cannot be represented safely. Reimport the original CIF.');
  return `;${value}\n;`;
}

/** Serialize the selected database entry, never a different file with a similar name. */
export function storedStructureCif(entry: EntryRow, atoms: AtomSiteRow[], symmetry: SymmetryOperationRow[], anisotropic: AtomSiteAnisotropicRow[]): string {
  const lines = ['data_stored_structure', '# Reconstructed from the imported CIF database entry.'];
  const tag = (key: string, value: string | number | null) => lines.push(key, token(value));
  tag('_chemical_formula_sum', entry.formula.split(/(?=[A-Z])/).join(' '));
  tag('_cell_length_a', entry.cell_a_angstrom ?? entry.cell_a * 10);
  tag('_cell_length_b', entry.cell_b_angstrom ?? entry.cell_b * 10);
  tag('_cell_length_c', entry.cell_c_angstrom ?? entry.cell_c * 10);
  tag('_cell_angle_alpha', entry.cell_angle_alpha);
  tag('_cell_angle_beta', entry.cell_angle_beta);
  tag('_cell_angle_gamma', entry.cell_angle_gamma);
  tag('_space_group_name_H-M_alt', entry.space_group);
  if (entry.sg_number > 0) tag('_space_group_IT_number', entry.sg_number);
  if (symmetry.length) {
    lines.push('loop_', '_space_group_symop_id', '_space_group_symop_operation_xyz');
    symmetry.forEach((op,i) => lines.push(token(op.operation_id ?? String(i+1)), token(op.operation_xyz)));
  }
  if (atoms.length) {
    lines.push('loop_', ...['label','type_symbol','fract_x','fract_y','fract_z','occupancy','U_iso_or_equiv','B_iso_or_equiv'].map(k=>'_atom_site_'+k));
    atoms.forEach((a,i) => lines.push(...[a.site_label ?? `${a.type_symbol ?? 'Site'}${i+1}`, a.type_symbol, a.fract_x, a.fract_y, a.fract_z, a.occupancy, a.u_iso_or_equiv, a.b_iso_or_equiv].map(token)));
  }
  if (anisotropic.length) {
    const keys = ['u_11','u_22','u_33','u_12','u_13','u_23','b_11','b_22','b_33','b_12','b_13','b_23'] as const;
    lines.push('loop_', '_atom_site_aniso_label', ...keys.map(k=>'_atom_site_aniso_'+k));
    anisotropic.forEach(a=>lines.push(token(a.site_label), ...keys.map(k=>token(a[k]))));
  }
  return lines.join('\n')+'\n';
}

export async function resolveRefinementSource(path: string | null, block: number, readBlock: (path: string, block: number)=>Promise<string>, stored: ()=>string): Promise<RefinementSource> {
  if (path) {
    try { return { text: await readBlock(path,block), warnings: [] }; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!code || !['ENOENT','ENOTDIR','EACCES','EPERM','EIO'].includes(code)) throw error;
    }
  }
  return { text: stored(), warnings: ['The original CIF file is unavailable. Refinement uses the structure saved in the database at import (cell, symmetry, atom sites and stored displacement parameters). Reimport the CIF to use later edits to that file.'] };
}
