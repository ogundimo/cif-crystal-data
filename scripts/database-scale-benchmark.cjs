const Database = require('better-sqlite3');
const { app } = require('electron');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { performance } = require('node:perf_hooks');

app.disableHardwareAcceleration();

const SIZES = process.argv.slice(2).map(Number).filter((value) => Number.isInteger(value) && value > 0);
const sizes = SIZES.length ? SIZES : [10_000, 100_000, 1_000_000];

function elapsed(run) {
  const started = performance.now();
  const value = run();
  return { value, milliseconds: Number((performance.now() - started).toFixed(2)) };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function repeated(query, params = []) {
  query.get(...params);
  const samples = Array.from({ length: 7 }, () => elapsed(() => query.get(...params)).milliseconds);
  return Number(median(samples).toFixed(2));
}

function measureQueries(db) {
  return {
    primaryKeyPage: repeated(db.prepare('SELECT * FROM entries ORDER BY id LIMIT 200 OFFSET ?'), [Math.max(0, Number(db.prepare('SELECT COUNT(*) AS count FROM entries').get().count) - 200)]),
    spaceGroupNumber: repeated(db.prepare('SELECT COUNT(*) AS count FROM entries WHERE sg_number = ?'), [62]),
    cellRange: repeated(db.prepare('SELECT COUNT(*) AS count FROM entries WHERE cell_a BETWEEN ? AND ?'), [0.5, 0.55]),
    referenceContains: repeated(db.prepare("SELECT COUNT(*) AS count FROM entries WHERE LOWER(reference) LIKE ? ESCAPE '\\'"), ['%series 42%']),
    element: repeated(db.prepare('SELECT COUNT(*) AS count FROM entries WHERE id IN (SELECT entry_id FROM entry_elements WHERE element IN (?))'), ['Sb']),
    combined: repeated(db.prepare(`
      SELECT COUNT(*) AS count FROM entries
      WHERE cell_a BETWEEN ? AND ? AND sg_number BETWEEN ? AND ?
        AND id IN (SELECT entry_id FROM entry_elements WHERE element IN (?))
    `), [0.5, 0.7, 1, 100, 'Eu'])
  };
}

function benchmark(size) {
  const directory = mkdtempSync(join(tmpdir(), `cif-scale-${size}-`));
  const databasePath = join(directory, 'benchmark.db');
  const db = new Database(databasePath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    db.exec(`
      CREATE TABLE entries (
        id INTEGER PRIMARY KEY,
        source_filename TEXT UNIQUE,
        formula TEXT,
        cell_a REAL,
        cell_b REAL,
        cell_c REAL,
        sg_number INTEGER,
        space_group TEXT,
        reference TEXT,
        level_struct_studies TEXT,
        sample_type TEXT NOT NULL DEFAULT '',
        crystal_colour TEXT NOT NULL DEFAULT '',
        cell_angle_alpha REAL,
        cell_angle_beta REAL,
        cell_angle_gamma REAL,
        cell_volume REAL
      );
      CREATE TABLE entry_elements (
        entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
        element TEXT,
        count REAL
      );
      CREATE INDEX idx_entry_elements_element ON entry_elements(element);
      CREATE INDEX idx_entry_elements_entry_id ON entry_elements(entry_id);
    `);

    const insertEntry = db.prepare(`
      INSERT INTO entries (
        source_filename, formula, cell_a, cell_b, cell_c, sg_number, space_group,
        reference, level_struct_studies, sample_type, crystal_colour,
        cell_angle_alpha, cell_angle_beta, cell_angle_gamma, cell_volume
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertElement = db.prepare(
      'INSERT INTO entry_elements (entry_id, element, count) VALUES (?, ?, ?)'
    );
    const populate = db.transaction(() => {
      for (let index = 1; index <= size; index += 1) {
        insertEntry.run(
          `entry-${index}.cif`,
          `Eu${index % 4 + 1}S${index % 9 + 1}`,
          0.4 + (index % 400) / 1000,
          0.5 + (index % 300) / 1000,
          0.6 + (index % 200) / 1000,
          index % 230 + 1,
          index % 2 ? 'Pnma' : 'P 21/c',
          `Reference series ${index % 1000}`,
          index % 3 ? 'Published' : 'Preliminary',
          index % 4 ? 'Powder' : 'Sample crystal',
          index % 5 ? '' : 'black',
          90,
          90 + (index % 4),
          90,
          100 + (index % 1000)
        );
        insertElement.run(index, 'Eu', 1);
        insertElement.run(index, index % 2 ? 'S' : 'Sb', index % 9 + 1);
      }
    });
    const insertion = elapsed(populate);
    db.exec('ANALYZE');

    const allRows = elapsed(() => db.prepare('SELECT * FROM entries ORDER BY id').all());
    const payload = elapsed(() => JSON.stringify(allRows.value));
    const queries = measureQueries(db);
    const plans = {
      spaceGroupNumber: db.prepare('EXPLAIN QUERY PLAN SELECT * FROM entries WHERE sg_number = ?').all(62),
      cellRange: db.prepare('EXPLAIN QUERY PLAN SELECT * FROM entries WHERE cell_a BETWEEN ? AND ?').all(0.5, 0.55),
      referenceContains: db.prepare("EXPLAIN QUERY PLAN SELECT * FROM entries WHERE LOWER(reference) LIKE ? ESCAPE '\\'").all('%series 42%'),
      element: db.prepare('EXPLAIN QUERY PLAN SELECT * FROM entries WHERE id IN (SELECT entry_id FROM entry_elements WHERE element IN (?))').all('Sb')
    };
    db.exec(`
      CREATE INDEX idx_entries_sg_number ON entries(sg_number);
      CREATE INDEX idx_entries_cell_a ON entries(cell_a);
      CREATE INDEX idx_entries_cell_b ON entries(cell_b);
      CREATE INDEX idx_entries_cell_c ON entries(cell_c);
      ANALYZE;
    `);
    const indexedQueries = measureQueries(db);

    return {
      rows: size,
      insertSeconds: Number((insertion.milliseconds / 1000).toFixed(2)),
      insertRowsPerSecond: Math.round(size / (insertion.milliseconds / 1000)),
      allRowsMilliseconds: allRows.milliseconds,
      jsonMilliseconds: payload.milliseconds,
      jsonMegabytes: Number((Buffer.byteLength(payload.value) / 1024 / 1024).toFixed(2)),
      queryMedianMilliseconds: queries,
      indexedQueryMedianMilliseconds: indexedQueries,
      plans
    };
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  runtime: process.versions,
  results: sizes.map(benchmark)
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
app.exit(0);
