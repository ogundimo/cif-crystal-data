import { describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { buildWhereClause, clearAllEntries } from './db';

describe('periodic-table selection query', () => {
  it('resolves elements, groups, and periods within one textbox using OR', () => {
    const result = buildWhereClause({
      slot1: ['Fe'],
      slot2: [],
      mode: 'AND',
      elementSelections: [{ elements: ['Fe'], groups: [16], periods: [4] }]
    });
    expect(result.sql.match(/element IN/g)).toHaveLength(1);
    expect(result.params).toContain('O');
    expect(result.params).toContain('Fe');
    expect(new Set(result.params).size).toBe(result.params.length);
  });

  it('combines independently resolved textboxes with the selected mode', () => {
    const result = buildWhereClause({
      slot1: ['Fe'],
      slot2: ['O'],
      mode: 'AND',
      elementSelections: [
        { elements: ['Fe'], groups: [8], periods: [] },
        { elements: ['O'], groups: [16], periods: [] }
      ]
    });
    expect(result.sql.match(/element IN/g)).toHaveLength(2);
    expect(result.sql).toContain(' AND ');
    expect(result.params).toEqual(['Fe', 'Ru', 'Os', 'Hs', 'O', 'S', 'Se', 'Te', 'Po', 'Lv']);
  });

  it('retains legacy individual-element filtering', () => {
    expect(buildWhereClause({ slot1: ['Fe'], slot2: [], mode: 'AND' }).params).toEqual(['Fe']);
  });

  it('clears entries inside a transaction and reports the deleted count', () => {
    const statements: string[] = [];
    let transactionRan = false;
    const database = {
      transaction: (operation: () => number) => () => {
        transactionRan = true;
        return operation();
      },
      prepare: (sql: string) => {
        statements.push(sql);
        return { run: () => ({ changes: 3 }) };
      }
    } as unknown as Database.Database;

    expect(clearAllEntries(database)).toBe(3);
    expect(transactionRan).toBe(true);
    expect(statements).toEqual(['DELETE FROM entries']);
  });
});
