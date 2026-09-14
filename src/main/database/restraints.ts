import type { RestraintRow, SearchFilter } from '../../shared/types';
import { getDb } from './connection';
import { buildWhereClause, resolveFilterElementGroups } from './query';

function countForFilter(filter: SearchFilter): number {
  const { sql, params } = buildWhereClause(filter);
  const row = getDb()
    .prepare(`SELECT COUNT(*) as c FROM entries WHERE ${sql}`)
    .get(...params) as { c: number };
  return row.c;
}

/** Compute live "restraints" rows: one per active filter field, plus a combined total. */
export function computeRestraints(filter: SearchFilter): RestraintRow[] {
  const rows: RestraintRow[] = [];

  const slot1 = filter.slot1 ?? [];
  const slot2 = filter.slot2 ?? [];
  const slot3 = filter.slot3 ?? [];
  const slot4 = filter.slot4 ?? [];
  const elementGroups = resolveFilterElementGroups(filter);
  if (elementGroups.length) {
    const content = elementGroups
      .map((group) => `${group.exclude ? 'NOT ' : ''}(${group.elements.join(' OR ')})`)
      .join(filter.elementSelections ? ' AND ' : ` ${filter.mode} `);
    const n = countForFilter({
      slot1,
      slot2,
      slot3,
      slot4,
      mode: filter.mode,
      elementSelections: filter.elementSelections,
      elementSelection: filter.elementSelection
    });
    rows.push({ field: 'Elements', content, entries: n });
  }

  if (filter.aMin !== undefined || filter.aMax !== undefined) {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', aMin: filter.aMin, aMax: filter.aMax });
    rows.push({
      field: 'Cell length a',
      content: `${filter.aMin ?? '...'} - ${filter.aMax ?? '...'} Å`,
      entries: n
    });
  }
  if (filter.bMin !== undefined || filter.bMax !== undefined) {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', bMin: filter.bMin, bMax: filter.bMax });
    rows.push({
      field: 'Cell length b',
      content: `${filter.bMin ?? '...'} - ${filter.bMax ?? '...'} Å`,
      entries: n
    });
  }
  if (filter.cMin !== undefined || filter.cMax !== undefined) {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', cMin: filter.cMin, cMax: filter.cMax });
    rows.push({
      field: 'Cell length c',
      content: `${filter.cMin ?? '...'} - ${filter.cMax ?? '...'} Å`,
      entries: n
    });
  }

  if (filter.sgQuery && filter.sgQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', sgQuery: filter.sgQuery, sgExclude: filter.sgExclude });
    rows.push({ field: 'Space group number', content: filter.sgExclude ? `NOT('${filter.sgQuery}')` : filter.sgQuery, entries: n });
  }

  if (filter.spaceGroupQuery && filter.spaceGroupQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', spaceGroupQuery: filter.spaceGroupQuery, spaceGroupExclude: filter.spaceGroupExclude });
    rows.push({ field: 'Space group', content: filter.spaceGroupExclude ? `NOT('${filter.spaceGroupQuery}')` : filter.spaceGroupQuery, entries: n });
  }

  if (filter.referenceQuery && filter.referenceQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', referenceQuery: filter.referenceQuery, referenceExclude: filter.referenceExclude });
    rows.push({ field: 'Reference', content: filter.referenceExclude ? `NOT('${filter.referenceQuery}')` : filter.referenceQuery, entries: n });
  }

  if (filter.level && filter.level.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', level: filter.level });
    rows.push({ field: 'Level struct. studies', content: filter.level, entries: n });
  }

  if (filter.elementCountQuery && filter.elementCountQuery.trim() !== '') {
    const n = countForFilter({ slot1: [], slot2: [], mode: 'AND', elementCountQuery: filter.elementCountQuery, elementCountExclude: filter.elementCountExclude });
    rows.push({ field: 'Number of elements', content: filter.elementCountExclude ? `NOT('${filter.elementCountQuery}')` : filter.elementCountQuery, entries: n });
  }

  if (rows.length > 0) {
    const total = countForFilter(filter);
    rows.push({ field: 'Total', content: `(${rows.map((r) => r.field).join(' AND ')})`, entries: total });
  }

  return rows;
}
