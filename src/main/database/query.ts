import type { SearchFilter } from '../../shared/types';
import { resolveElementSelection } from '../../shared/periodicTableData';

function buildElementCondition(
  elements: string[],
  exclude = false
): { sql: string; params: string[] } {
  if (elements.length === 0) return { sql: '1=1', params: [] };
  const placeholders = elements.map(() => '?').join(',');
  return {
    sql: `id ${exclude ? 'NOT IN' : 'IN'} (SELECT entry_id FROM entry_elements WHERE element IN (${placeholders}))`,
    params: elements
  };
}

function parseSgQuery(sgQuery: string | undefined): { sql: string; params: (string | number)[] } {
  if (!sgQuery || sgQuery.trim() === '') return { sql: '1=1', params: [] };
  const trimmed = sgQuery.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return { sql: 'sg_number BETWEEN ? AND ?', params: [Number(rangeMatch[1]), Number(rangeMatch[2])] };
  }
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return { sql: 'sg_number = ?', params: [n] };
  }
  return { sql: '1=1', params: [] };
}

function parseElementCountQuery(query: string | undefined): { sql: string; params: number[] } {
  if (!query || query.trim() === '') return { sql: '1=1', params: [] };
  const trimmed = query.trim();
  const rangeMatch = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
  if (rangeMatch) {
    return {
      sql: 'id IN (SELECT entry_id FROM entry_elements GROUP BY entry_id HAVING COUNT(DISTINCT element) BETWEEN ? AND ?)',
      params: [Number(rangeMatch[1]), Number(rangeMatch[2])]
    };
  }
  const n = Number(trimmed);
  if (Number.isFinite(n)) {
    return {
      sql: 'id IN (SELECT entry_id FROM entry_elements GROUP BY entry_id HAVING COUNT(DISTINCT element) = ?)',
      params: [n]
    };
  }
  return { sql: '1=1', params: [] };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

interface ResolvedElementGroup {
  elements: string[];
  exclude: boolean;
}

export function resolveFilterElementGroups(filter: SearchFilter): ResolvedElementGroup[] {
  if (filter.elementSelections) {
    return filter.elementSelections
      .map((selection) => ({
        elements: resolveElementSelection(selection),
        exclude: Boolean(selection.exclude)
      }))
      .filter((group) => group.elements.length > 0);
  }

  const legacyResolved = filter.elementSelection ? resolveElementSelection(filter.elementSelection) : [];
  const firstElementGroup = [...new Set([...(filter.slot1 ?? []), ...legacyResolved])];
  return [
    { elements: firstElementGroup, exclude: Boolean(filter.elementSelection?.exclude) },
    { elements: filter.slot2 ?? [], exclude: false },
    { elements: filter.slot3 ?? [], exclude: false },
    { elements: filter.slot4 ?? [], exclude: false }
  ].filter((group) => group.elements.length > 0);
}

export function buildWhereClause(filter: SearchFilter): { sql: string; params: (string | number)[] } {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  const elementGroups = resolveFilterElementGroups(filter);
  if (elementGroups.length > 0) {
    const groupClauses: string[] = [];
    for (const group of elementGroups) {
      const c = buildElementCondition(group.elements, group.exclude);
      groupClauses.push(c.sql);
      params.push(...c.params);
    }
    if (groupClauses.length > 1) {
      const joiner = filter.elementSelections ? ' AND ' : filter.mode === 'OR' ? ' OR ' : ' AND ';
      clauses.push(`(${groupClauses.join(joiner)})`);
    } else {
      clauses.push(groupClauses[0]);
    }
  }

  if (filter.aMin !== undefined) {
    clauses.push('cell_a >= ?');
    params.push(filter.aMin / 10);
  }
  if (filter.aMax !== undefined) {
    clauses.push('cell_a <= ?');
    params.push(filter.aMax / 10);
  }
  if (filter.bMin !== undefined) {
    clauses.push('cell_b >= ?');
    params.push(filter.bMin / 10);
  }
  if (filter.bMax !== undefined) {
    clauses.push('cell_b <= ?');
    params.push(filter.bMax / 10);
  }
  if (filter.cMin !== undefined) {
    clauses.push('cell_c >= ?');
    params.push(filter.cMin / 10);
  }
  if (filter.cMax !== undefined) {
    clauses.push('cell_c <= ?');
    params.push(filter.cMax / 10);
  }

  const sg = parseSgQuery(filter.sgQuery);
  if (sg.sql !== '1=1') {
    clauses.push(filter.sgExclude ? `NOT (${sg.sql})` : sg.sql);
    params.push(...sg.params);
  }

  if (filter.spaceGroupQuery && filter.spaceGroupQuery.trim() !== '') {
    clauses.push(`LOWER(space_group) ${filter.spaceGroupExclude ? 'NOT LIKE' : 'LIKE'} ? ESCAPE '\\'`);
    params.push(`%${escapeLike(filter.spaceGroupQuery.trim().toLowerCase())}%`);
  }

  if (filter.referenceQuery && filter.referenceQuery.trim() !== '') {
    clauses.push(`LOWER(reference) ${filter.referenceExclude ? 'NOT LIKE' : 'LIKE'} ? ESCAPE '\\'`);
    params.push(`%${escapeLike(filter.referenceQuery.trim().toLowerCase())}%`);
  }

  if (filter.level && filter.level.trim() !== '') {
    clauses.push('level_struct_studies = ?');
    params.push(filter.level);
  }

  const ec = parseElementCountQuery(filter.elementCountQuery);
  if (ec.sql !== '1=1') {
    clauses.push(filter.elementCountExclude ? `NOT (${ec.sql})` : ec.sql);
    params.push(...ec.params);
  }

  return { sql: clauses.length ? clauses.join(' AND ') : '1=1', params };
}
