import { describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { buildWhereClause, clearAllEntries, createEntryWriter } from './db';
import type { CifEntry } from '../parser/cifParser';

const sampleEntry: CifEntry = {
  formula: 'Fe1O1',
  elements: [
    { element: 'Fe', count: 1 },
    { element: 'O', count: 1 }
  ],
  cell_a: 0.1,
  cell_b: 0.2,
  cell_c: 0.3,
  sg_number: 1,
  space_group: 'P1',
  reference: 'Test reference',
  level: 'Complete structure determined'
};

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

  it('treats LIKE metacharacters in text searches as literal characters', () => {
    const result = buildWhereClause({
      slot1: [],
      slot2: [],
      mode: 'AND',
      spaceGroupQuery: 'P_1%',
      referenceQuery: '100%_complete'
    });

    expect(result.sql.match(/ESCAPE/g)).toHaveLength(2);
    expect(result.params).toEqual(['%p\\_1\\%%', '%100\\%\\_complete%']);
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

  it('reuses prepared statements and commits multiple writes as one batch', () => {
    const preparedSql: string[] = [];
    let transactionExecutions = 0;
    let nextId = 1;
    const database = {
      prepare: (sql: string) => {
        preparedSql.push(sql);
        return {
          get: () => undefined,
          run: () => ({ lastInsertRowid: nextId++, changes: 1 })
        };
      },
      transaction: <Args extends unknown[], Result>(operation: (...args: Args) => Result) =>
        (...args: Args): Result => {
          transactionExecutions++;
          return operation(...args);
        }
    } as unknown as Database.Database;

    const writer = createEntryWriter(database);
    expect(preparedSql).toHaveLength(5);
    expect(
      writer.writeBatch([
        { sourceFilename: 'one.cif', entry: sampleEntry },
        { sourceFilename: 'two.cif', entry: sampleEntry }
      ])
    ).toEqual([]);
    expect(transactionExecutions).toBe(3); // one outer batch plus two per-entry savepoints

    expect(writer.writeBatch([{ sourceFilename: 'three.cif', entry: sampleEntry }])).toEqual([]);
    expect(preparedSql).toHaveLength(5);
    expect(transactionExecutions).toBe(5);
  });
});
