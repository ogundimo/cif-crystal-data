import { describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import {
  buildWhereClause,
  clearAllEntries,
  createEntryWriter,
  getEntryCount,
  getSymmetryOperations,
  searchEntriesPage
} from './db';
import type { CifEntry } from '../parser/cifParser';

it('retains the internal query fallback for malformed numeric text; IPC rejects it before this layer (#109)', () => {
  for (const fields of [{ sgQuery: 'abc' }, { elementCountQuery: 'many' }]) {
    expect(buildWhereClause({ slot1: [], slot2: [], mode: 'AND', ...fields }))
      .toEqual({ sql: '1=1', params: [] });
  }
});

const sampleEntry: CifEntry = {
  formula: 'Fe1O1',
  elements: [
    { element: 'Fe', count: 1 },
    { element: 'O', count: 1 }
  ],
  cell_a: 0.1,
  cell_b: 0.2,
  cell_c: 0.3,
  cellAAngstrom: 1,
  cellBAngstrom: 2,
  cellCAngstrom: 3,
  cellAlpha: 90,
  cellBeta: 90,
  cellGamma: 90,
  cellVolume: 6,
  sg_number: 1,
  space_group: 'P1',
  reference: 'Test reference',
  level: 'Complete structure determined',
  sampleType: 'Sample crystal',
  crystalColour: 'red',
  publTitle: 'Test publication title',
  citationDoi: '10.1000/example',
  databaseCodeCcdc: '',
  databaseCodeCsd: '',
  databaseCodeIcsd: '',
  journalLanguage: 'English',
  formulaUnitsZ: 2,
  radiationType: 'X-rays, Cu Ka',
  radiationWavelengthAngstrom: 1.54056,
  publAuthors: [{ name: 'Doe, J.', address: 'Example University' }],
  atomSites: [{
    siteLabel: 'Fe1',
    typeSymbol: 'Fe',
    symmetryMultiplicity: 4,
    wyckoffSymbol: 'c',
    fractX: 0.1,
    fractY: 0.2,
    fractZ: 0.3,
    occupancy: 1,
    uIsoOrEquiv: 0.0063,
    bIsoOrEquiv: 0.5
  }],
  symmetryOperations: [{ operationId: '1', operationXyz: 'x, y, z' }],
  atomSiteAnisotropic: [{
    siteLabel: 'Fe1',
    u11: 0.01,
    u22: 0.02,
    u33: 0.03,
    u12: 0.004,
    u13: 0.005,
    u23: 0.006,
    b11: null,
    b22: null,
    b33: null,
    b12: null,
    b13: null,
    b23: null
  }]
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

  it('builds preview queries for the selectable 4f and 5f rows', () => {
    const result = buildWhereClause({
      slot1: [],
      slot2: [],
      mode: 'AND',
      elementSelections: [
        { elements: [], groups: [], periods: [9] },
        { elements: [], groups: [], periods: [10] }
      ]
    });

    expect(result.sql).toContain(' AND ');
    expect(result.params).toEqual([
      'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho', 'Er', 'Tm', 'Yb', 'Lu',
      'Th', 'Pa', 'U', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No', 'Lr'
    ]);
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

  it('combines element boxes with AND and negates boxes marked not equal', () => {
    const result = buildWhereClause({
      slot1: ['Fe'],
      slot2: ['O'],
      mode: 'OR',
      elementSelections: [
        { elements: ['Fe'], groups: [], periods: [], exclude: true },
        { elements: ['O'], groups: [], periods: [] }
      ]
    });

    expect(result.sql).toContain('id NOT IN');
    expect(result.sql).toContain(' AND ');
    expect(result.sql).not.toContain(' OR ');
    expect(result.params).toEqual(['Fe', 'O']);
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

  it('negates each non-cell-length textbox criterion independently', () => {
    const result = buildWhereClause({
      slot1: [],
      slot2: [],
      mode: 'AND',
      sgQuery: '62',
      sgExclude: true,
      spaceGroupQuery: 'Pnma',
      spaceGroupExclude: true,
      referenceQuery: 'Journal',
      referenceExclude: true,
      elementCountQuery: '2-4',
      elementCountExclude: true
    });

    expect(result.sql).toContain('NOT (sg_number = ?)');
    expect(result.sql.match(/NOT LIKE/g)).toHaveLength(2);
    expect(result.sql).toContain('NOT (id IN');
    expect(result.params).toEqual([62, '%pnma%', '%journal%', 2, 4]);
  });

  it('converts angstrom search bounds to the database nanometre values', () => {
    const result = buildWhereClause({
      slot1: [],
      slot2: [],
      mode: 'AND',
      aMin: 4,
      aMax: 16.5,
      bMin: 5,
      cMax: 23.86
    });

    expect(result.params).toEqual([0.4, 1.65, 0.5, 2.386]);
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
    expect(statements).toEqual(['DELETE FROM entries', 'DELETE FROM source_contents']);
  });

  it('loads only the entry count for the startup database summary', () => {
    let preparedSql = '';
    const database = {
      prepare: (sql: string) => {
        preparedSql = sql;
        return { get: () => ({ count: 42 }) };
      }
    } as unknown as Database.Database;

    expect(getEntryCount(database)).toBe(42);
    expect(preparedSql).toBe('SELECT COUNT(*) AS count FROM entries');
  });

  it('loads stored symmetry operations in source order', () => {
    const preparedSql: string[] = [];
    const database = {
      prepare: (sql: string) => {
        preparedSql.push(sql);
        return { all: () => [{ id: 1 }] };
      }
    } as unknown as Database.Database;

    expect(getSymmetryOperations(7, database)).toEqual([{ id: 1 }]);
    expect(preparedSql).toEqual([
      'SELECT * FROM symmetry_operations WHERE entry_id = ? ORDER BY operation_order'
    ]);
  });

  it('pages and sorts search results in SQLite with a bounded page size', () => {
    const preparedSql: string[] = [];
    let allParameters: unknown[] = [];
    const database = {
      prepare: (sql: string) => {
        preparedSql.push(sql);
        return sql.includes('COUNT(*)')
          ? { get: () => ({ count: 2500 }) }
          : {
              all: (...parameters: unknown[]) => {
                allParameters = parameters;
                return [{ id: 501 }];
              }
            };
      }
    } as unknown as Database.Database;

    const result = searchEntriesPage({
      filter: { slot1: [], slot2: [], mode: 'AND' },
      offset: 500,
      limit: 50_000,
      sortColumn: 'formula',
      sortDirection: 'desc'
    }, database);

    expect(result).toEqual({ rows: [{ id: 501 }], total: 2500 });
    expect(preparedSql[1]).toContain('ORDER BY formula DESC, id ASC LIMIT ? OFFSET ?');
    expect(allParameters).toEqual([1000, 500]);
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
    expect(preparedSql).toHaveLength(23);
    expect(
      writer.writeBatch([
        { sourceFilename: 'one.cif', entry: sampleEntry },
        { sourceFilename: 'two.cif', entry: sampleEntry }
      ])
    ).toEqual([]);
    expect(transactionExecutions).toBe(3); // one outer batch plus two per-entry savepoints

    expect(writer.writeBatch([{ sourceFilename: 'three.cif', entry: sampleEntry }])).toEqual([]);
    expect(preparedSql).toHaveLength(23);
    expect(transactionExecutions).toBe(5);
  });
});
