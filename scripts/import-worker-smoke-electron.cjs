const assert = require('node:assert/strict');
const { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const Database = require('better-sqlite3');
const { app } = require('electron');
app.setPath('userData', mkdtempSync(join(tmpdir(), 'cif-worker-shell-')));
const runDatabaseQueryRegressions = require('./database-query-regressions.cjs');

const root = dirname(dirname(__filename));

function runWorker(workerUrl, rootDir, userDataPath) {
  return new Promise((resolve, reject) => {
    const messages = [];
    let finalMessage;
    const worker = new Worker(workerUrl, { workerData: { rootDir, userDataPath } });
    worker.on('message', (message) => {
      messages.push(message);
      if (message.type !== 'progress') finalMessage = message;
    });
    worker.once('error', reject);
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`Import worker exited with code ${code}`));
      else if (!finalMessage) reject(new Error('Import worker exited without a result'));
      else if (finalMessage.type === 'error') reject(new Error(finalMessage.error));
      else resolve({ messages, result: finalMessage.result });
    });
  });
}

async function run() {
  const chunksDirectory = join(root, 'dist-electron', 'main', 'chunks');
  const workerFilename = readdirSync(chunksDirectory).find((name) =>
    /^importWorker-.*\.js$/.test(name)
  );
  assert.ok(workerFilename, 'Production build did not emit the import worker chunk');
  await runDatabaseQueryRegressions(chunksDirectory);

  const userDataPath = mkdtempSync(join(tmpdir(), 'cif-import-worker-'));
  const fixtureDirectory = join(root, 'src', 'parser', '__fixtures__');
  const fixtureText = readFileSync(join(fixtureDirectory, 'synthetic-test.cif'), 'utf8');
  const diffractionFixtureText = `${fixtureText}\nloop_\n` +
    `_atom_site_aniso_label\n_atom_site_aniso_U_11\n_atom_site_aniso_U_22\n` +
    `_atom_site_aniso_U_33\n_atom_site_aniso_U_12\n_atom_site_aniso_U_13\n` +
    `_atom_site_aniso_U_23\nNa1 0.01 0.02 0.03 0.004 0.005 0.006\n`;
  const rootDir = join(userDataPath, 'input');
  mkdirSync(rootDir);
  writeFileSync(join(rootDir, 'synthetic-test.cif'), diffractionFixtureText);
  const workerUrl = pathToFileURL(join(chunksDirectory, workerFilename));
  await require('./import-lifecycle-regressions.cjs')(workerUrl, fixtureText);
  await require('./preservation-regressions.cjs')(chunksDirectory, runWorker, workerUrl);

  const legacyUserDataPath = mkdtempSync(join(tmpdir(), 'cif-legacy-migration-'));
  try {
    const legacyInput = join(legacyUserDataPath, 'input');
    mkdirSync(legacyInput);
    writeFileSync(join(legacyInput, 'synthetic-test.cif'), diffractionFixtureText);
    const legacyDatabasePath = join(legacyUserDataPath, 'cif-local.db');
    let legacyDatabase = new Database(legacyDatabasePath);
    try {
      legacyDatabase.exec(`
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
          level_struct_studies TEXT
        );
        CREATE TABLE entry_elements (entry_id INTEGER, element TEXT, count REAL);
        CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE imported_files (
          source_filename TEXT PRIMARY KEY,
          source_path TEXT NOT NULL,
          source_mtime_ms REAL NOT NULL,
          source_size INTEGER NOT NULL
        );
        INSERT INTO entries VALUES (1, 'synthetic-test.cif', 'Stale', 1, 1, 1, 1, 'P1', '', 'Cell');
        INSERT INTO imported_files VALUES ('synthetic-test.cif', '${join(legacyInput, 'synthetic-test.cif').replaceAll("'", "''")}', 1, 1);
        PRAGMA user_version = 1;
      `);
    } finally {
      legacyDatabase.close();
    }

    const migrationImport = await runWorker(workerUrl, legacyInput, legacyUserDataPath);
    assert.equal(migrationImport.result.importedCount, 1);
    legacyDatabase = new Database(legacyDatabasePath);
    try {
      assert.equal(legacyDatabase.pragma('user_version', { simple: true }), 10);
      assert.equal(
        legacyDatabase.prepare("SELECT value FROM app_settings WHERE key = 'schema_version'").get().value,
        '10'
      );
      assert.equal(legacyDatabase.prepare('SELECT formula FROM entries').get().formula, 'Cl1Na1');
      assert.ok(
        legacyDatabase.prepare('PRAGMA table_info(entries)').all()
          .some((column) => column.name === 'database_code_csd'),
        'schema migration did not add the CSD refcode column'
      );
      assert.equal(legacyDatabase.prepare('SELECT COUNT(*) AS count FROM atom_sites').get().count, 2);
      assert.equal(
        legacyDatabase.prepare('SELECT COUNT(*) AS count FROM symmetry_operations').get().count,
        1
      );
      assert.equal(
        legacyDatabase.prepare('SELECT COUNT(*) AS count FROM atom_site_anisotropic').get().count,
        1
      );
      assert.equal(legacyDatabase.prepare('SELECT cell_volume FROM entries').get().cell_volume, 210);
      assert.ok(
        readdirSync(legacyUserDataPath).some((name) => name.startsWith('cif-local.pre-migration-v1-')),
        'legacy migration did not create a backup'
      );
      const backupName = readdirSync(legacyUserDataPath).find(name => name.startsWith('cif-local.pre-migration-v1-'));
      const backup = new Database(join(legacyUserDataPath, backupName), { readonly: true });
      try {
        assert.equal(backup.pragma('user_version', { simple: true }), 1);
        assert.equal(backup.prepare('SELECT formula FROM entries').get().formula, 'Stale',
          'backup must contain the pre-migration data, not just exist');
      } finally {
        backup.close();
      }
    } finally {
      legacyDatabase.close();
    }
  } finally {
    rmSync(legacyUserDataPath, { recursive: true, force: true });
  }

  try {
    const firstImport = await runWorker(workerUrl, rootDir, userDataPath);
    assert.deepEqual(firstImport.result, { outcomes: { created: 1, updated: 0, duplicate: 0 }, importedCount: 1, skippedCount: 0, failures: [], total: 1, processed: 1, unattempted: 0, cancelled: false, discoveryComplete: true, skippedLinks: 0 });
    assert.deepEqual(firstImport.messages.filter((message) => message.type === 'progress' && message.progress.phase === 'ingestion'), [
      {
        type: 'progress',
        progress: { phase: 'ingestion', discovered: 1, processed: 0, total: 1, importedCount: 0, skippedCount: 0, failureCount: 0 }
      },
      {
        type: 'progress',
        progress: { phase: 'ingestion', discovered: 1, processed: 1, total: 1, importedCount: 1, skippedCount: 0, failureCount: 0 }
      }
    ]);

    const databasePath = join(userDataPath, 'cif-local.db');
    let database = new Database(databasePath);
    try {
      const row = database.prepare(
        `SELECT formula, sg_number, cell_a_angstrom, cell_b_angstrom, cell_c_angstrom,
          formula_units_z, radiation_type, radiation_wavelength_angstrom FROM entries`
      ).get();
      assert.deepEqual(row, {
        formula: 'Cl1Na1',
        sg_number: 1,
        cell_a_angstrom: 5,
        cell_b_angstrom: 6,
        cell_c_angstrom: 7,
        formula_units_z: 1,
        radiation_type: 'X-rays, Cu Ka',
        radiation_wavelength_angstrom: 1.54056
      });
      assert.deepEqual(
        database.prepare(
          'SELECT site_label, u_iso_or_equiv, b_iso_or_equiv FROM atom_sites ORDER BY site_order'
        ).all(),
        [
          { site_label: 'Na1', u_iso_or_equiv: 0.0063, b_iso_or_equiv: 0.5 },
          { site_label: 'Cl1', u_iso_or_equiv: 0.0076, b_iso_or_equiv: 0.6 }
        ]
      );
      assert.deepEqual(
        database.prepare('SELECT operation_id, operation_xyz FROM symmetry_operations').all(),
        [{ operation_id: '1', operation_xyz: 'x, y, z' }]
      );
      assert.deepEqual(
        database.prepare(
          `SELECT site_label, u_11, u_22, u_33, u_12, u_13, u_23
           FROM atom_site_anisotropic`
        ).all(),
        [{
          site_label: 'Na1',
          u_11: 0.01,
          u_22: 0.02,
          u_33: 0.03,
          u_12: 0.004,
          u_13: 0.005,
          u_23: 0.006
        }]
      );
      const entryId = database.prepare('SELECT id FROM entries').get().id;
      database.prepare("UPDATE entries SET formula = 'Stale' WHERE id = ?").run(entryId);
      database
        .prepare('INSERT INTO entry_elements (entry_id, element, count) VALUES (?, ?, ?)')
        .run(entryId, 'Xe', 99);
    } finally {
      database.close();
    }

    writeFileSync(
      join(rootDir, 'synthetic-test.cif'),
      `${diffractionFixtureText}\n# modified for refresh test\n`
    );
    const updateImport = await runWorker(workerUrl, rootDir, userDataPath);
    assert.deepEqual(updateImport.result, { outcomes: { created: 0, updated: 1, duplicate: 0 }, importedCount: 1, skippedCount: 0, failures: [], total: 1, processed: 1, unattempted: 0, cancelled: false, discoveryComplete: true, skippedLinks: 0 });
    database = new Database(databasePath);
    try {
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entries').get().count, 1);
      assert.equal(database.prepare('SELECT formula FROM entries').get().formula, 'Cl1Na1');
      const elements = database
        .prepare('SELECT element FROM entry_elements ORDER BY element')
        .all()
        .map((row) => row.element);
      assert.deepEqual(elements, ['Cl', 'Na']);

      const unchangedImport = await runWorker(workerUrl, rootDir, userDataPath);
      assert.deepEqual(unchangedImport.result, {
        importedCount: 0,
        skippedCount: 1,
        failures: [],
        total: 1, processed: 1, unattempted: 0, cancelled: false, discoveryComplete: true, skippedLinks: 0
      });

      database.pragma('foreign_keys = ON');
      database.prepare('DELETE FROM entries').run();
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entry_elements').get().count, 0);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM symmetry_operations').get().count, 0);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM atom_site_anisotropic').get().count, 0);

      database.exec(`
        CREATE TRIGGER fail_na_element
        BEFORE INSERT ON entry_elements
        WHEN NEW.element = 'Na'
        BEGIN
          SELECT RAISE(FAIL, 'intentional Na write failure');
        END;
      `);
    } finally {
      database.close();
    }

    const mixedInput = join(userDataPath, 'mixed-input');
    mkdirSync(mixedInput);
    writeFileSync(join(mixedInput, 'na.cif'), diffractionFixtureText);
    writeFileSync(
      join(mixedInput, 'fe.cif'),
      diffractionFixtureText.replace("'Na1 Cl1'", "'Fe1 O1'")
    );

    const mixedImport = await runWorker(workerUrl, mixedInput, userDataPath);
    assert.equal(mixedImport.result.importedCount, 1);
    assert.equal(mixedImport.result.total, 2);
    assert.equal(mixedImport.result.failures.length, 1);
    assert.equal(mixedImport.result.failures[0].filename, 'na.cif');
    assert.match(mixedImport.result.failures[0].reason, /intentional Na write failure/);

    database = new Database(databasePath);
    try {
      assert.deepEqual(database.prepare('SELECT source_filename, formula FROM entries').all(), [
        { source_filename: 'fe.cif', formula: 'Fe1O1' }
      ]);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entry_elements').get().count, 2);
      database.pragma('foreign_keys = ON');
      database.prepare('DELETE FROM entries').run();
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entry_elements').get().count, 0);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM symmetry_operations').get().count, 0);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM atom_site_anisotropic').get().count, 0);
    } finally {
      database.close();
    }

    const multiInput = join(userDataPath, 'multi-input');
    mkdirSync(multiInput);
    const goodBlock = diffractionFixtureText.replace('data_synthetic_test', 'data_good').replace("'Na1 Cl1'", "'Fe1 O1'");
    const badBlock = diffractionFixtureText.replace('data_synthetic_test', 'data_bad');
    const multiPath = join(multiInput, 'multi.cif');
    writeFileSync(multiPath, `${goodBlock}\n${badBlock}`);
    const partialWrite = await runWorker(workerUrl, multiInput, userDataPath);
    assert.equal(partialWrite.result.importedCount, 0);
    assert.equal(partialWrite.result.failures.length, 2);
    database = new Database(databasePath);
    database.exec('DROP TRIGGER fail_na_element');
    database.close();
    const retry = await runWorker(workerUrl, multiInput, userDataPath);
    assert.equal(retry.result.skippedCount, 0, 'partial write must not mark the whole file complete');
    assert.equal(retry.result.importedCount, 2);
    assert.equal((await runWorker(workerUrl, multiInput, userDataPath)).result.skippedCount, 1);

    // A successful shrink/rename refresh removes obsolete sibling blocks and their children.
    writeFileSync(multiPath, goodBlock.replace('data_good', 'data_only'));
    const shrink = await runWorker(workerUrl, multiInput, userDataPath);
    assert.equal(shrink.result.importedCount, 1);
    database = new Database(databasePath);
    try {
      assert.deepEqual(database.prepare('SELECT source_filename FROM entries').all(), [{ source_filename: 'multi.cif' }]);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM atom_sites').get().count, 2);
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM imported_files').get().count, 1);
      assert.equal(database.prepare('SELECT data_block_index FROM imported_files').get().data_block_index, 0);
    } finally {
      database.close();
    }

    writeFileSync(multiPath, `${goodBlock.replace('data_good', 'data_new')}\ndata_invalid\n_cell_length_a 1\n`);
    const partialParse = await runWorker(workerUrl, multiInput, userDataPath);
    assert.equal(partialParse.result.importedCount, 0);
    assert.equal(partialParse.result.failures.length, 1);
    database = new Database(databasePath);
    const source = database.prepare("SELECT * FROM imported_files WHERE source_filename = 'multi.cif'").get();
    assert.equal(source.source_path, multiPath, 'previous complete source retains viewer/export paths after a sibling parse failure');
    assert.equal(source.data_block_index, 0);
    assert.ok(source.content_hash, 'previous complete version must remain available');
    database.close();

    const emptyInput = join(userDataPath, 'empty-input');
    mkdirSync(emptyInput);
    await runWorker(workerUrl, emptyInput, userDataPath);
    database = new Database(databasePath);
    assert.equal(database.prepare("SELECT source_path FROM imported_files WHERE source_filename = 'multi.cif'").get().source_path, multiPath,
      'migration must preserve source paths outside the folder being refreshed');
    database.close();
    assert.equal((await runWorker(workerUrl, multiInput, userDataPath)).result.skippedCount, 0);
    console.log('✓ partial-block failures remain retryable and migration preserves source paths');

    console.log('✓ production import worker emitted typed progress updates');
    console.log('✓ legacy schema backup, migration, and metadata backfill passed');
    console.log('✓ diffraction inputs survived SQLite insert, update, and cascade deletion');
    console.log('✓ batch savepoint isolated one failed CIF while committing its sibling');
  } finally {
    rmSync(userDataPath, { recursive: true, force: true });
  }
}

app.whenReady().then(run).then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  }
);
