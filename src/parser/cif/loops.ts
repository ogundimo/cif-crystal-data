import type { ParsedAtomSite, ParsedSymmetryOperation, ParsedAtomSiteAnisotropic, ParsedPublAuthor } from './types';
import { nullableText, nullableNumber, normalizeAddress } from './values';

export function parseAtomSiteRows(headers: string[], values: string[]): ParsedAtomSite[] {
  const normalized = headers.map((header) => header.toLowerCase());
  if (!normalized.includes('_atom_site_label') && !normalized.includes('_atom_site_type_symbol')) {
    return [];
  }
  const indexOf = (tag: string) => normalized.indexOf(tag.toLowerCase());
  const valueAt = (row: string[], tag: string): string | undefined => {
    const index = indexOf(tag);
    return index === -1 ? undefined : row[index];
  };
  const rows: ParsedAtomSite[] = [];
  for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
    const row = values.slice(offset, offset + headers.length);
    const multiplicity = nullableNumber(valueAt(row, '_atom_site_symmetry_multiplicity'));
    rows.push({
      siteLabel: nullableText(valueAt(row, '_atom_site_label')),
      typeSymbol: nullableText(valueAt(row, '_atom_site_type_symbol')),
      symmetryMultiplicity:
        multiplicity !== null && Number.isInteger(multiplicity) ? multiplicity : null,
      wyckoffSymbol: nullableText(valueAt(row, '_atom_site_Wyckoff_symbol')),
      fractX: nullableNumber(valueAt(row, '_atom_site_fract_x')),
      fractY: nullableNumber(valueAt(row, '_atom_site_fract_y')),
      fractZ: nullableNumber(valueAt(row, '_atom_site_fract_z')),
      occupancy: nullableNumber(valueAt(row, '_atom_site_occupancy')),
      uIsoOrEquiv: nullableNumber(valueAt(row, '_atom_site_u_iso_or_equiv')),
      bIsoOrEquiv: nullableNumber(valueAt(row, '_atom_site_b_iso_or_equiv'))
    });
  }
  return rows;
}

export function parseSymmetryOperationRows(headers: string[], values: string[]): ParsedSymmetryOperation[] {
  const normalized = headers.map((header) => header.toLowerCase());
  const operationIndex = normalized.findIndex((header) =>
    header === '_space_group_symop_operation_xyz' || header === '_symmetry_equiv_pos_as_xyz');
  if (operationIndex === -1) return [];
  const idIndex = normalized.findIndex((header) =>
    header === '_space_group_symop_id' || header === '_symmetry_equiv_pos_site_id');
  const rows: ParsedSymmetryOperation[] = [];
  for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
    const row = values.slice(offset, offset + headers.length);
    const operationXyz = nullableText(row[operationIndex]);
    if (operationXyz === null) continue;
    rows.push({
      operationId: idIndex === -1 ? null : nullableText(row[idIndex]),
      operationXyz
    });
  }
  return rows;
}

export function parseAtomSiteAnisotropicRows(headers: string[], values: string[]): ParsedAtomSiteAnisotropic[] {
  const normalized = headers.map((header) => header.toLowerCase());
  const labelIndex = normalized.indexOf('_atom_site_aniso_label');
  if (labelIndex === -1) return [];
  const valueAt = (row: string[], tag: string): string | undefined => {
    const index = normalized.indexOf(tag);
    return index === -1 ? undefined : row[index];
  };
  const rows: ParsedAtomSiteAnisotropic[] = [];
  for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
    const row = values.slice(offset, offset + headers.length);
    const siteLabel = nullableText(row[labelIndex]);
    if (siteLabel === null) continue;
    rows.push({
      siteLabel,
      u11: nullableNumber(valueAt(row, '_atom_site_aniso_u_11')),
      u22: nullableNumber(valueAt(row, '_atom_site_aniso_u_22')),
      u33: nullableNumber(valueAt(row, '_atom_site_aniso_u_33')),
      u12: nullableNumber(valueAt(row, '_atom_site_aniso_u_12')),
      u13: nullableNumber(valueAt(row, '_atom_site_aniso_u_13')),
      u23: nullableNumber(valueAt(row, '_atom_site_aniso_u_23')),
      b11: nullableNumber(valueAt(row, '_atom_site_aniso_b_11')),
      b22: nullableNumber(valueAt(row, '_atom_site_aniso_b_22')),
      b33: nullableNumber(valueAt(row, '_atom_site_aniso_b_33')),
      b12: nullableNumber(valueAt(row, '_atom_site_aniso_b_12')),
      b13: nullableNumber(valueAt(row, '_atom_site_aniso_b_13')),
      b23: nullableNumber(valueAt(row, '_atom_site_aniso_b_23'))
    });
  }
  return rows;
}

export function parsePublAuthorRows(headers: string[], values: string[]): ParsedPublAuthor[] {
  const normalized = headers.map((header) => header.toLowerCase());
  const nameIndex = normalized.findIndex((header) =>
    header === '_citation_author_name' || header === '_publ_author_name');
  if (nameIndex === -1) return [];
  const addressIndex = normalized.indexOf('_publ_author_address');
  const rows: ParsedPublAuthor[] = [];
  for (let offset = 0; offset + headers.length <= values.length; offset += headers.length) {
    const row = values.slice(offset, offset + headers.length);
    const name = nullableText(row[nameIndex]);
    if (name === null) continue;
    rows.push({
      name,
      address: addressIndex === -1 ? null : normalizeAddress(nullableText(row[addressIndex]))
    });
  }
  return rows;
}
