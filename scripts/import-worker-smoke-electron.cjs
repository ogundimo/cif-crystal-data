const assert = require('node:assert/strict');
const { readdirSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const Database = require('better-sqlite3');
const { app } = require('electron');

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

  const userDataPath = mkdtempSync(join(tmpdir(), 'cif-import-worker-'));
  const fixtureDirectory = join(root, 'src', 'parser', '__fixtures__');
  const fixtureText = readFileSync(join(fixtureDirectory, 'synthetic-test.cif'), 'utf8');
  const rootDir = join(userDataPath, 'input');
  mkdirSync(rootDir);
  writeFileSync(join(rootDir, 'synthetic-test.cif'), fixtureText);
  const workerUrl = pathToFileURL(join(chunksDirectory, workerFilename));

  const legacyUserDataPath = mkdtempSync(join(tmpdir(), 'cif-legacy-migration-'));
  try {
    const legacyInput = join(legacyUserDataPath, 'input');
    mkdirSync(legacyInput);
    writeFileSync(join(legacyInput, 'synthetic-test.cif'), fixtureText);
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
        INSERT INTO imported_files VALUES ('synthetic-test.cif', 'stale-path', 1, 1);
        PRAGMA user_version = 1;
      `);
    } finally {
      legacyDatabase.close();
    }

    const migrationImport = await runWorker(workerUrl, legacyInput, legacyUserDataPath);
    assert.equal(migrationImport.result.importedCount, 1);
    legacyDatabase = new Database(legacyDatabasePath);
    try {
      assert.equal(legacyDatabase.pragma('user_version', { simple: true }), 3);
      assert.equal(
        legacyDatabase.prepare("SELECT value FROM app_settings WHERE key = 'schema_version'").get().value,
        '3'
      );
      assert.equal(legacyDatabase.prepare('SELECT formula FROM entries').get().formula, 'Cl1Na1');
      assert.equal(legacyDatabase.prepare('SELECT COUNT(*) AS count FROM atom_sites').get().count, 2);
      assert.equal(legacyDatabase.prepare('SELECT cell_volume FROM entries').get().cell_volume, 210);
      assert.ok(
        readdirSync(legacyUserDataPath).some((name) => name.startsWith('cif-local.pre-migration-v1-')),
        'legacy migration did not create a backup'
      );
    } finally {
      legacyDatabase.close();
    }
  } finally {
    rmSync(legacyUserDataPath, { recursive: true, force: true });
  }

  try {
    const firstImport = await runWorker(workerUrl, rootDir, userDataPath);
    assert.deepEqual(firstImport.result, { importedCount: 1, skippedCount: 0, failures: [], total: 1 });
    assert.deepEqual(firstImport.messages.filter((message) => message.type === 'progress'), [
      {
        type: 'progress',
        progress: { processed: 0, total: 1, importedCount: 0, skippedCount: 0, failureCount: 0 }
      },
      {
        type: 'progress',
        progress: { processed: 1, total: 1, importedCount: 1, skippedCount: 0, failureCount: 0 }
      }
    ]);

    const databasePath = join(userDataPath, 'cif-local.db');
    let database = new Database(databasePath);
    try {
      const row = database.prepare('SELECT formula, sg_number FROM entries').get();
      assert.deepEqual(row, { formula: 'Cl1Na1', sg_number: 1 });
      const entryId = database.prepare('SELECT id FROM entries').get().id;
      database.prepare("UPDATE entries SET formula = 'Stale' WHERE id = ?").run(entryId);
      database
        .prepare('INSERT INTO entry_elements (entry_id, element, count) VALUES (?, ?, ?)')
        .run(entryId, 'Xe', 99);
    } finally {
      database.close();
    }

    writeFileSync(join(rootDir, 'synthetic-test.cif'), `${fixtureText}\n# modified for refresh test\n`);
    const updateImport = await runWorker(workerUrl, rootDir, userDataPath);
    assert.deepEqual(updateImport.result, { importedCount: 1, skippedCount: 0, failures: [], total: 1 });
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
        total: 1
      });

      database.pragma('foreign_keys = ON');
      database.prepare('DELETE FROM entries').run();
      assert.equal(database.prepare('SELECT COUNT(*) AS count FROM entry_elements').get().count, 0);

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
    writeFileSync(join(mixedInput, 'na.cif'), fixtureText);
    writeFileSync(join(mixedInput, 'fe.cif'), fixtureText.replace("'Na1 Cl1'", "'Fe1 O1'"));

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
    } finally {
      database.close();
    }

    console.log('✓ production import worker emitted typed progress updates');
    console.log('✓ legacy schema backup, migration, and metadata backfill passed');
    console.log('✓ SQLite insert, update, element replacement, and cascade deletion passed');
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
