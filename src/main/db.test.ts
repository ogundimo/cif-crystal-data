import { describe, expect, it } from 'vitest';
import { buildWhereClause } from './db';

describe('periodic-table selection query', () => {
  it('uses a single IN expression for OR semantics', () => {
    const result = buildWhereClause({ slot1: ['Fe'], slot2: [], mode: 'OR', elementSelection: { elements: [], groups: [16], periods: [4] } });
    expect(result.sql.match(/element IN/g)).toHaveLength(1);
    expect(result.params).toContain('O');
    expect(result.params).toContain('Fe');
    expect(new Set(result.params).size).toBe(result.params.length);
  });

  it('retains legacy individual-element filtering', () => {
    expect(buildWhereClause({ slot1: ['Fe'], slot2: [], mode: 'AND' }).params).toEqual(['Fe']);
  });
});
