import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrateDatabase } from '../migrations';
import type { SearchFilter } from '../../shared/types';

const doubles = vi.hoisted(() => ({ db: null as Database.Database | null }));
vi.mock('./connection', () => ({
  getDb: () => {
    if (!doubles.db) throw new Error('Database not initialized');
    return doubles.db;
  }
}));

import { computeRestraints } from './restraints';

// Four entries chosen so every count below is small enough to check by eye.
// cell_* are stored in nanometres; the filter bounds are ångströms, so a bound
// of 10 matches a stored 1.0. Every field an exclusion flag applies to is
// deliberately lopsided — a query matching two of four entries would make the
// included and excluded counts identical and hide a dropped exclude flag.
const entries = [
  { id: 1, formula: 'NaCl', elements: ['Na', 'Cl'], cell: 0.5, sg: 225, spaceGroup: 'F m -3 m', reference: 'Acta Cryst 1990', level: 'isotypic' },
  { id: 2, formula: 'FeO', elements: ['Fe', 'O'], cell: 1.0, sg: 225, spaceGroup: 'F m -3 m', reference: 'J Solid State 2001', level: 'complete' },
  { id: 3, formula: 'H2O', elements: ['H', 'O'], cell: 1.5, sg: 194, spaceGroup: 'P 63/m m c', reference: 'Acta Cryst 2010', level: 'complete' },
  { id: 4, formula: 'FeNaO2', elements: ['Fe', 'Na', 'O'], cell: 2.0, sg: 225, spaceGroup: 'P n m a', reference: 'Nature 2015', level: 'isotypic' }
];

function restraints(filter: Partial<SearchFilter>) {
  return computeRestraints({ slot1: [], slot2: [], mode: 'AND', ...filter });
}

beforeEach(() => {
  const database = new Database(':memory:');
  migrateDatabase(database, ':memory:', false);
  const insertEntry = database.prepare(
    `INSERT INTO entries (id, source_filename, formula, cell_a, cell_b, cell_c, sg_number, space_group, reference, level_struct_studies)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertElement = database.prepare('INSERT INTO entry_elements (entry_id, element, count) VALUES (?, ?, 1)');
  for (const entry of entries) {
    insertEntry.run(entry.id, `${entry.formula}.cif`, entry.formula, entry.cell, entry.cell, entry.cell,
      entry.sg, entry.spaceGroup, entry.reference, entry.level);
    for (const element of entry.elements) insertElement.run(entry.id, element);
  }
  doubles.db = database;
});

afterEach(() => {
  doubles.db?.close();
  doubles.db = null;
});

describe('computeRestraints with no active field', () => {
  it('returns no rows, not even a total, for an empty filter', () => {
    expect(restraints({})).toEqual([]);
  });

  it('returns no rows when every text field holds only whitespace', () => {
    expect(restraints({ sgQuery: '  ', spaceGroupQuery: ' ', referenceQuery: '\t', level: ' ', elementCountQuery: '  ' })).toEqual([]);
  });
});

describe('computeRestraints element groups', () => {
  it('reports a single slot as one parenthesised group', () => {
    expect(restraints({ slot1: ['Fe'] })).toEqual([
      { field: 'Elements', content: '(Fe)', entries: 2 },
      { field: 'Total', content: '(Elements)', entries: 2 }
    ]);
  });

  it('joins the elements inside one slot with OR', () => {
    expect(restraints({ slot1: ['Fe', 'Na'] })[0]).toEqual({ field: 'Elements', content: '(Fe OR Na)', entries: 3 });
  });

  it('joins populated slots with filter.mode when no elementSelections are present', () => {
    expect(restraints({ slot1: ['Fe'], slot2: ['Na'], mode: 'AND' })[0])
      .toEqual({ field: 'Elements', content: '(Fe) AND (Na)', entries: 1 });
    expect(restraints({ slot1: ['Fe'], slot2: ['Na'], mode: 'OR' })[0])
      .toEqual({ field: 'Elements', content: '(Fe) OR (Na)', entries: 3 });
  });

  it('includes slot3 and slot4 and drops the empty slots between them', () => {
    expect(restraints({ slot1: [], slot2: ['Na'], slot3: [], slot4: ['O'], mode: 'AND' })[0])
      .toEqual({ field: 'Elements', content: '(Na) AND (O)', entries: 1 });
    expect(restraints({ slot3: ['O'] })[0])
      .toEqual({ field: 'Elements', content: '(O)', entries: 3 });
    expect(restraints({ slot4: ['H'] })[0])
      .toEqual({ field: 'Elements', content: '(H)', entries: 1 });
  });

  it('combines all four populated slots under each mode', () => {
    const all = { slot1: ['Fe'], slot2: ['Na'], slot3: ['O'], slot4: ['H'] };
    expect(restraints({ ...all, mode: 'AND' })[0])
      .toEqual({ field: 'Elements', content: '(Fe) AND (Na) AND (O) AND (H)', entries: 0 });
    expect(restraints({ ...all, mode: 'OR' })[0])
      .toEqual({ field: 'Elements', content: '(Fe) OR (Na) OR (O) OR (H)', entries: 4 });
  });

  it('joins elementSelections with AND and ignores filter.mode', () => {
    const elementSelections = [
      { elements: ['Fe'], groups: [], periods: [] },
      { elements: ['Na'], groups: [], periods: [] }
    ];
    for (const mode of ['AND', 'OR'] as const) {
      expect(restraints({ elementSelections, mode })[0])
        .toEqual({ field: 'Elements', content: '(Fe) AND (Na)', entries: 1 });
    }
  });

  it('lets elementSelections supersede the slots entirely', () => {
    expect(restraints({ slot1: ['H'], elementSelections: [{ elements: ['Fe'], groups: [], periods: [] }] })[0])
      .toEqual({ field: 'Elements', content: '(Fe)', entries: 2 });
  });

  it('drops elementSelections entries that resolve to no elements', () => {
    expect(restraints({
      elementSelections: [
        { elements: [], groups: [], periods: [] },
        { elements: ['O'], groups: [], periods: [] },
        { elements: [], groups: [], periods: [] }
      ]
    })[0]).toEqual({ field: 'Elements', content: '(O)', entries: 3 });
  });

  it('produces no Elements row when elementSelections is present but empty, even with populated slots', () => {
    expect(restraints({ slot1: ['Fe'], slot2: ['Na'], elementSelections: [] })).toEqual([]);
  });

  it('negates an excluded elementSelections group', () => {
    expect(restraints({ elementSelections: [{ elements: ['Fe'], groups: [], periods: [], exclude: true }] })[0])
      .toEqual({ field: 'Elements', content: 'NOT (Fe)', entries: 2 });
  });

  it('mixes an included and an excluded group under the AND joiner', () => {
    expect(restraints({
      elementSelections: [
        { elements: ['O'], groups: [], periods: [] },
        { elements: ['Fe'], groups: [], periods: [], exclude: true }
      ]
    })[0]).toEqual({ field: 'Elements', content: '(O) AND NOT (Fe)', entries: 1 });
  });

  it('merges the legacy elementSelection into slot1 and carries its exclude flag', () => {
    expect(restraints({ slot1: ['Na'], elementSelection: { elements: ['Fe'], groups: [], periods: [], exclude: true } })[0])
      .toEqual({ field: 'Elements', content: 'NOT (Na OR Fe)', entries: 1 });
  });

  it('tolerates a filter that omits the slot arrays altogether', () => {
    // Filters cross the IPC boundary as plain JSON, so an older saved filter can
    // arrive without the slots the type declares as required.
    const partial = { mode: 'AND', slot3: ['O'] } as unknown as SearchFilter;
    expect(computeRestraints(partial)[0]).toEqual({ field: 'Elements', content: '(O)', entries: 3 });
  });

  it('expands group and period criteria to their element symbols in the reported content', () => {
    expect(restraints({ elementSelections: [{ elements: [], groups: [17], periods: [] }] })[0])
      .toEqual({ field: 'Elements', content: '(F OR Cl OR Br OR I OR At OR Ts)', entries: 1 });
    expect(restraints({ elementSelections: [{ elements: [], groups: [], periods: [1] }] })[0])
      .toEqual({ field: 'Elements', content: '(H OR He)', entries: 1 });
  });
});

describe('computeRestraints cell-length bounds', () => {
  it('reports an open lower bound, an open upper bound and a closed range for cell length a', () => {
    expect(restraints({ aMin: 10 })[0]).toEqual({ field: 'Cell length a', content: '10 - ... Å', entries: 3 });
    expect(restraints({ aMax: 10 })[0]).toEqual({ field: 'Cell length a', content: '... - 10 Å', entries: 2 });
    expect(restraints({ aMin: 10, aMax: 15 })[0]).toEqual({ field: 'Cell length a', content: '10 - 15 Å', entries: 2 });
  });

  it('treats a zero bound as active rather than absent', () => {
    expect(restraints({ aMin: 0 })[0]).toEqual({ field: 'Cell length a', content: '0 - ... Å', entries: 4 });
  });

  it('reports cell length b and cell length c on their own axes', () => {
    expect(restraints({ bMin: 15 })[0]).toEqual({ field: 'Cell length b', content: '15 - ... Å', entries: 2 });
    expect(restraints({ bMax: 15 })[0]).toEqual({ field: 'Cell length b', content: '... - 15 Å', entries: 3 });
    expect(restraints({ cMin: 15 })[0]).toEqual({ field: 'Cell length c', content: '15 - ... Å', entries: 2 });
    expect(restraints({ cMax: 5 })[0]).toEqual({ field: 'Cell length c', content: '... - 5 Å', entries: 1 });
  });
});

describe('computeRestraints text and numeric fields', () => {
  it('counts an exact space group number and a space group range', () => {
    expect(restraints({ sgQuery: '225' })[0]).toEqual({ field: 'Space group number', content: '225', entries: 3 });
    expect(restraints({ sgQuery: '60-200' })[0]).toEqual({ field: 'Space group number', content: '60-200', entries: 1 });
  });

  it('wraps an excluded space group number in NOT and counts the complement', () => {
    expect(restraints({ sgQuery: '225', sgExclude: true })[0])
      .toEqual({ field: 'Space group number', content: "NOT('225')", entries: 1 });
  });

  it('matches the space group symbol case-insensitively and supports exclusion', () => {
    expect(restraints({ spaceGroupQuery: 'F m' })[0]).toEqual({ field: 'Space group', content: 'F m', entries: 2 });
    expect(restraints({ spaceGroupQuery: '63/M' })[0]).toEqual({ field: 'Space group', content: '63/M', entries: 1 });
    expect(restraints({ spaceGroupQuery: '63/M', spaceGroupExclude: true })[0])
      .toEqual({ field: 'Space group', content: "NOT('63/M')", entries: 3 });
  });

  it('matches the reference substring and supports exclusion', () => {
    expect(restraints({ referenceQuery: 'acta' })[0]).toEqual({ field: 'Reference', content: 'acta', entries: 2 });
    expect(restraints({ referenceQuery: '19' })[0]).toEqual({ field: 'Reference', content: '19', entries: 1 });
    expect(restraints({ referenceQuery: '19', referenceExclude: true })[0])
      .toEqual({ field: 'Reference', content: "NOT('19')", entries: 3 });
  });

  it('matches the study level exactly and has no exclusion form', () => {
    expect(restraints({ level: 'isotypic' })[0]).toEqual({ field: 'Level struct. studies', content: 'isotypic', entries: 2 });
    expect(restraints({ level: 'Isotypic' })[0]).toEqual({ field: 'Level struct. studies', content: 'Isotypic', entries: 0 });
  });

  it('counts distinct elements per entry, as an exact value, a range and an exclusion', () => {
    expect(restraints({ elementCountQuery: '3' })[0]).toEqual({ field: 'Number of elements', content: '3', entries: 1 });
    expect(restraints({ elementCountQuery: '2-3' })[0]).toEqual({ field: 'Number of elements', content: '2-3', entries: 4 });
    expect(restraints({ elementCountQuery: '3', elementCountExclude: true })[0])
      .toEqual({ field: 'Number of elements', content: "NOT('3')", entries: 3 });
  });

  it('reports the whole database for a numeric field that parses to no condition', () => {
    // parseSgQuery and parseElementCountQuery fall back to 1=1 for unparseable
    // text, so the row is shown with the unfiltered entry count. See issue #109.
    expect(restraints({ sgQuery: 'abc' })[0]).toEqual({ field: 'Space group number', content: 'abc', entries: 4 });
    expect(restraints({ elementCountQuery: 'many' })[0]).toEqual({ field: 'Number of elements', content: 'many', entries: 4 });
  });
});

describe('computeRestraints totals', () => {
  it('counts each field independently and the total as their conjunction', () => {
    expect(restraints({
      slot1: ['Fe'],
      aMin: 5, aMax: 25,
      bMin: 10,
      cMax: 20,
      sgQuery: '225',
      spaceGroupQuery: 'm',
      referenceQuery: '20',
      level: 'complete',
      elementCountQuery: '2'
    })).toEqual([
      { field: 'Elements', content: '(Fe)', entries: 2 },
      { field: 'Cell length a', content: '5 - 25 Å', entries: 4 },
      { field: 'Cell length b', content: '10 - ... Å', entries: 3 },
      { field: 'Cell length c', content: '... - 20 Å', entries: 4 },
      { field: 'Space group number', content: '225', entries: 3 },
      { field: 'Space group', content: 'm', entries: 4 },
      { field: 'Reference', content: '20', entries: 3 },
      { field: 'Level struct. studies', content: 'complete', entries: 2 },
      { field: 'Number of elements', content: '2', entries: 3 },
      {
        field: 'Total',
        content: '(Elements AND Cell length a AND Cell length b AND Cell length c AND Space group number'
          + ' AND Space group AND Reference AND Level struct. studies AND Number of elements)',
        entries: 1
      }
    ]);
  });

  it('applies filter.mode to the total count while the total label always joins with AND', () => {
    const filter = { slot1: ['Fe'], slot2: ['Na'], level: 'isotypic' };
    expect(restraints({ ...filter, mode: 'AND' })).toEqual([
      { field: 'Elements', content: '(Fe) AND (Na)', entries: 1 },
      { field: 'Level struct. studies', content: 'isotypic', entries: 2 },
      { field: 'Total', content: '(Elements AND Level struct. studies)', entries: 1 }
    ]);
    // mode only joins the element groups; the remaining fields are always
    // conjoined, so the total label reads AND even in OR mode.
    expect(restraints({ ...filter, mode: 'OR' })).toEqual([
      { field: 'Elements', content: '(Fe) OR (Na)', entries: 3 },
      { field: 'Level struct. studies', content: 'isotypic', entries: 2 },
      { field: 'Total', content: '(Elements AND Level struct. studies)', entries: 2 }
    ]);
  });

  it('adds a Total row even when only one field is active', () => {
    expect(restraints({ level: 'complete' })).toEqual([
      { field: 'Level struct. studies', content: 'complete', entries: 2 },
      { field: 'Total', content: '(Level struct. studies)', entries: 2 }
    ]);
  });
});
