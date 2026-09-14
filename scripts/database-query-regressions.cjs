// Exercise the production database module with Electron's native SQLite ABI.
const assert = require('node:assert/strict');
const { mkdtempSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');

module.exports = async function runDatabaseQueryRegressions(chunksDirectory) {
  const filename = readdirSync(chunksDirectory).find(name => /^db-.*\.js$/.test(name));
  assert.ok(filename, 'Production database chunk is missing');
  const api = await import(pathToFileURL(join(chunksDirectory, filename)).href);
  const directory = mkdtempSync(join(tmpdir(), 'cif-query-regression-'));
  let database;
  try {
    database = api.initDb(directory);
    const insert = database.prepare(`INSERT INTO entries
      (id, source_filename, formula, cell_a, cell_b, cell_c, sg_number, space_group, reference, level_struct_studies)
      VALUES (?, ?, ?, ?, 0.5, 0.6, ?, ?, ?, ?)`);
    const rows = [
      [1, 'one.cif', 'Fe1O1', 0.4, 1, 'P1', '100%_complete', 'Complete'],
      [2, 'two.cif', 'Fe1O1', 0.5, 1, 'P1', '100XXcomplete', 'Complete'],
      [3, 'three.cif', 'Cl1Na1', 0.6, 62, 'Pnma', "O'Brien", 'Cell'],
      [4, 'four.cif', 'Fe1', 0.7, 62, 'Pnma', '', 'Cell']
    ];
    rows.forEach(row => insert.run(...row));
    const element = database.prepare('INSERT INTO entry_elements VALUES (?, ?, 1)');
    [[1, 'Fe'], [1, 'O'], [2, 'Fe'], [2, 'O'], [3, 'Cl'], [3, 'Na'], [4, 'Fe']]
      .forEach(row => element.run(...row));
    const empty = { slot1: [], slot2: [], mode: 'AND' };
    const page = (filter = {}, options = {}) => api.searchEntriesPage({
      filter: { ...empty, ...filter }, offset: 0, limit: 100, ...options
    }, database);
    const ids = filter => page(filter).rows.map(row => row.id);

    // Stable tiebreaking prevents duplicates or missing rows across page boundaries.
    const pages = [0, 1, 2, 3].map(offset => page({}, { offset, limit: 1, sortColumn: 'formula', sortDirection: 'desc' }));
    assert.deepEqual(pages.map(result => result.rows[0].id), [1, 2, 4, 3]);
    assert.ok(pages.every(result => result.total === 4));
    assert.deepEqual(page({}, { offset: 4 }), { rows: [], total: 4 });
    assert.deepEqual(page({}, { offset: -2.5, limit: 0 }).rows.map(row => row.id), [1]);
    assert.deepEqual(page({}, { sortColumn: 'id; DROP TABLE entries', sortDirection: 'sideways' }).rows.map(row => row.id), [1, 2, 3, 4]);
    assert.equal(api.getEntryCount(database), 4);

    assert.deepEqual(ids({ referenceQuery: '%_' }), [1], 'LIKE wildcards must be literal');
    assert.deepEqual(ids({ referenceQuery: "O'Brien" }), [3], 'Quotes must remain bound parameters');
    assert.deepEqual(ids({ aMin: 4, aMax: 5 }), [1, 2], 'Angstrom bounds must include both endpoints');
    assert.deepEqual(ids({ sgQuery: '1-62', sgExclude: true }), []);
    assert.deepEqual(ids({ sgQuery: '62', level: 'Cell' }), [3, 4]);
    assert.deepEqual(ids({ slot1: ['Fe'], slot2: ['Na'], mode: 'OR' }), [1, 2, 3, 4]);
    assert.deepEqual(ids({ slot1: ['Fe'], slot2: ['Na'], mode: 'AND' }), []);
    assert.deepEqual(ids({ elementSelections: [
      { elements: ['Fe'], groups: [], periods: [] },
      { elements: ['O'], groups: [], periods: [], exclude: true }
    ] }), [4]);
    assert.deepEqual(ids({ elementCountQuery: '2' }), [1, 2, 3]);
    assert.deepEqual(ids({ elementCountQuery: '2-3', elementCountExclude: true }), [4]);
    const filter = { slot1: ['Fe'], slot2: [], mode: 'AND', aMax: 5 };
    assert.deepEqual(api.computeRestraints(filter).map(row => [row.field, row.entries]), [
      ['Elements', 3], ['Cell length a', 2], ['Total', 2]
    ]);
    assert.equal(page(filter).total, 2, 'Preview and paged search must agree');

    // The same physical source can contain multiple separately exported/viewed blocks.
    const sourcePath = join(directory, 'multi.cif');
    database.prepare(`INSERT INTO imported_files
      (source_filename, source_path, source_mtime_ms, source_size, data_block_index)
      VALUES (?, ?, ?, ?, ?)`).run('two.cif', sourcePath, 1, 1, 1);
    assert.deepEqual(api.getCifExportSource(2, database), {
      formula: 'Fe1O1', sg_number: 1, source_path: sourcePath, data_block_index: 1
    });
    assert.deepEqual(api.getCifViewerSourceRecord(2, database), {
      source_filename: 'two.cif', source_path: sourcePath, data_block_index: 1
    });
    assert.equal(api.getCifExportSource(999, database), null);
    assert.equal(api.getCifViewerSourceRecord(999, database), null);
    assert.equal(api.getCifExportSource(1, database).source_path, null);
    assert.equal(api.clearAllEntries(database), 4);
    assert.deepEqual(page(), { rows: [], total: 0 });
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entry_elements').get().count, 0);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM imported_files').get().count, 0);
    console.log('✓ production SQLite filtering, stable pagination, preview counts, source lookup and clear cascades');
  } finally {
    database?.close();
    // Remove only the temporary database directory created above.
    rmSync(directory, { recursive: true, force: true });
  }
};
