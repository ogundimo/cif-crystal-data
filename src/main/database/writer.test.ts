import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createEntryWriter, type EntryWriteItem } from './writer';
import { migrateDatabase } from '../migrations';
import type { CifEntry } from '../../parser/cifParser';

/**
 * Every entry column gets a value unique across the whole row, so a statement that
 * binds the right count of arguments in the wrong order still lands a detectably
 * wrong value in at least two columns. SQLite is dynamically typed, so a text value
 * written into a numeric column is stored rather than rejected; only distinct
 * values catch that.
 */
function entryFixture(tag: string, offset: number): CifEntry {
  return {
    formula: `formula-${tag}`,
    elements: [{ element: 'C', count: 1 }],
    cell_a: offset + 0.1,
    cell_b: offset + 0.2,
    cell_c: offset + 0.3,
    cellAAngstrom: offset + 0.4,
    cellBAngstrom: offset + 0.5,
    cellCAngstrom: offset + 0.6,
    cellAlpha: offset + 0.7,
    cellBeta: offset + 0.8,
    cellGamma: offset + 0.9,
    cellVolume: offset + 1.1,
    sg_number: offset + 2,
    space_group: `space-group-${tag}`,
    reference: `reference-${tag}`,
    level: `level-${tag}`,
    sampleType: tag === 'a' ? 'Powder' : 'Sample crystal',
    crystalColour: `colour-${tag}`,
    publTitle: `title-${tag}`,
    citationDoi: `doi-${tag}`,
    databaseCodeCcdc: `ccdc-${tag}`,
    databaseCodeCsd: `csd-${tag}`,
    databaseCodeIcsd: `icsd-${tag}`,
    journalLanguage: `language-${tag}`,
    formulaUnitsZ: offset + 3,
    radiationType: `radiation-${tag}`,
    radiationWavelengthAngstrom: offset + 1.2,
    publAuthors: [],
    atomSites: [],
    symmetryOperations: [],
    atomSiteAnisotropic: []
  };
}

/**
 * The expected column order, restated independently of the production declaration
 * so that adding a column there without updating both write paths fails here.
 */
const columns = [
  'formula', 'cell_a', 'cell_b', 'cell_c', 'cell_angle_alpha', 'cell_angle_beta', 'cell_angle_gamma',
  'cell_volume', 'sg_number', 'space_group', 'reference', 'level_struct_studies', 'sample_type',
  'crystal_colour', 'publ_title', 'citation_doi', 'database_code_ccdc', 'database_code_csd',
  'database_code_icsd', 'journal_language', 'cell_a_angstrom', 'cell_b_angstrom', 'cell_c_angstrom',
  'formula_units_z', 'radiation_type', 'radiation_wavelength_angstrom'
];

let db: Database.Database;
const sourcePath = 'C:/fixtures/columns.cif';

beforeEach(() => {
  db = new Database(':memory:');
  migrateDatabase(db, ':memory:', false);
});

afterEach(() => db.close());

function writeEntry(entry: CifEntry) {
  const writer = createEntryWriter(db);
  const item: EntryWriteItem = { sourceFilename: 'columns.cif', sourcePath, blockKey: 'label:block', entry };
  expect(writer.writeBatch([item])).toEqual([]);
  return item.outcome;
}

function storedEntry() {
  return db.prepare(`SELECT ${columns.join(', ')} FROM entries`).get() as Record<string, unknown>;
}

function expectedRow(tag: string, offset: number) {
  const entry = entryFixture(tag, offset);
  return {
    formula: entry.formula,
    cell_a: entry.cell_a,
    cell_b: entry.cell_b,
    cell_c: entry.cell_c,
    cell_angle_alpha: entry.cellAlpha,
    cell_angle_beta: entry.cellBeta,
    cell_angle_gamma: entry.cellGamma,
    cell_volume: entry.cellVolume,
    sg_number: entry.sg_number,
    space_group: entry.space_group,
    reference: entry.reference,
    level_struct_studies: entry.level,
    sample_type: entry.sampleType,
    crystal_colour: entry.crystalColour,
    publ_title: entry.publTitle,
    citation_doi: entry.citationDoi,
    database_code_ccdc: entry.databaseCodeCcdc,
    database_code_csd: entry.databaseCodeCsd,
    database_code_icsd: entry.databaseCodeIcsd,
    journal_language: entry.journalLanguage,
    cell_a_angstrom: entry.cellAAngstrom,
    cell_b_angstrom: entry.cellBAngstrom,
    cell_c_angstrom: entry.cellCAngstrom,
    formula_units_z: entry.formulaUnitsZ,
    radiation_type: entry.radiationType,
    radiation_wavelength_angstrom: entry.radiationWavelengthAngstrom
  };
}

describe('entry column order', () => {
  it('writes each parsed field into its own column when creating an entry', () => {
    expect(writeEntry(entryFixture('a', 10))).toBe('created');
    expect(storedEntry()).toEqual(expectedRow('a', 10));
  });

  it('writes each parsed field into the same column when updating an entry', () => {
    writeEntry(entryFixture('a', 10));
    expect(writeEntry(entryFixture('b', 20))).toBe('updated');
    expect(db.prepare('SELECT COUNT(*) AS c FROM entries').get()).toEqual({ c: 1 });
    expect(storedEntry()).toEqual(expectedRow('b', 20));
  });

  it('agrees on column order between the insert and update statements', () => {
    // Read back from the two prepared statements rather than from the declaration,
    // so a change that reaches only one of them is caught.
    const prepared: string[] = [];
    const recorder = {
      prepare: (sql: string) => {
        prepared.push(sql);
        return {};
      },
      transaction: (operation: unknown) => operation
    } as unknown as Database.Database;
    createEntryWriter(recorder);

    const insert = prepared.find(sql => sql.includes('INSERT INTO entries'));
    // setIdentity is also an UPDATE on entries; the entry update is the one that
    // writes the parsed fields.
    const update = prepared.find(sql => sql.startsWith('UPDATE entries SET') && sql.includes('formula = ?'));
    if (!insert || !update) throw new Error('Entry insert and update statements were not prepared');

    const insertColumns = insert.slice(insert.indexOf('(') + 1, insert.indexOf(')')).split(',').map(name => name.trim());
    const updateColumns = update.slice('UPDATE entries SET '.length, update.indexOf(' WHERE '))
      .split(',').map(assignment => assignment.trim().replace(/ = \?$/, ''));

    expect(insertColumns).toEqual(['source_filename', ...columns]);
    expect(updateColumns).toEqual(columns);
    // The update binds one extra parameter for the WHERE clause, the insert none.
    expect(insert.match(/\?/g)).toHaveLength(insertColumns.length);
    expect(update.match(/\?/g)).toHaveLength(updateColumns.length + 1);
  });
});
