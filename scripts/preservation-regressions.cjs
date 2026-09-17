// Real production chunks and Electron's SQLite ABI; all inputs/profiles are synthetic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join, dirname } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const Database = require('better-sqlite3');

async function loadApi(chunks) {
  return import(pathToFileURL(join(chunks, fs.readdirSync(chunks).find(name => /^db-.*\.js$/.test(name)))).href);
}

function legacyProfile(directory, path) {
  const db = new Database(join(directory, 'cif-local.db'));
  db.exec(`CREATE TABLE entries (id INTEGER PRIMARY KEY, source_filename TEXT UNIQUE, formula TEXT,
    cell_a REAL, cell_b REAL, cell_c REAL, sg_number INTEGER, space_group TEXT, reference TEXT, level_struct_studies TEXT);
    CREATE TABLE entry_elements (entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE, element TEXT, count REAL);
    CREATE INDEX idx_entry_elements_element ON entry_elements(element);
    CREATE INDEX idx_entry_elements_entry_id ON entry_elements(entry_id);
    CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE imported_files (source_filename TEXT PRIMARY KEY REFERENCES entries(source_filename) ON DELETE CASCADE,
      source_path TEXT NOT NULL, source_mtime_ms REAL NOT NULL, source_size INTEGER NOT NULL);
    INSERT INTO entries VALUES (71, 'sample.cif', 'Old', 1, 1, 1, 1, 'P1', '', 'Cell');
    INSERT INTO entry_elements VALUES (71, 'Na', 1);
    PRAGMA user_version = 1;`);
  db.prepare('INSERT INTO imported_files VALUES (?, ?, 1, 1)').run('sample.cif', path);
  db.close();
}

async function interrupted(mode, chunks, profile, backup) {
  const api = await loadApi(chunks);
  if (mode === '--interrupt-migration') {
    const exec = Database.prototype.exec;
    Database.prototype.exec = function(sql) {
      const result = exec.call(this, sql);
      if (sql.includes('DROP TABLE entries;')) process.exit(74);
      return result;
    };
    api.initDb(profile);
  } else {
    const db = api.initDb(profile);
    const prepare = db.prepare.bind(db);
    db.prepare = sql => {
      if (sql.startsWith('INSERT INTO atom_sites')) process.exit(73);
      return prepare(sql);
    };
    api.restoreProfile(backup, db);
  }
  throw new Error('Interruption checkpoint was not reached');
}

module.exports = async function runPreservation(chunks, runWorker, workerUrl) {
  const api = await loadApi(chunks);
  const root = fs.mkdtempSync(join(tmpdir(), 'cif-preservation-'));
  const profile = join(root, 'profile'); fs.mkdirSync(profile);
  const input = join(root, 'input'); fs.mkdirSync(input);
  const fixture = fs.readFileSync(join(__dirname, '../src/parser/__fixtures__/synthetic-test.cif'), 'utf8');
  const block = (name, formula = 'Na1 Cl1') => fixture.slice(fixture.indexOf('data_synthetic_test')).replace('data_synthetic_test', `data_${name}`).replace("'Na1 Cl1'", `'${formula}'`).trim() + '\n';
  const write = (name, text) => { const path = join(input, name); fs.mkdirSync(dirname(path), { recursive: true }); fs.writeFileSync(path, text); return path; };
  const scan = () => runWorker(workerUrl, input, profile).then(result => result.result);
  let db;
  const opened = [];
  try {
    const future = join(root, 'future'); fs.mkdirSync(future);
    const futurePath = join(future, 'cif-local.db');
    const futureDb = new Database(futurePath);
    futureDb.exec('CREATE TABLE future_data(value TEXT); INSERT INTO future_data VALUES (\'preserve me\'); PRAGMA user_version=999');
    futureDb.close();
    const futureBytes = fs.readFileSync(futurePath);
    assert.throws(()=>api.initDb(future), /newer than supported/);
    assert.deepEqual(fs.readFileSync(futurePath), futureBytes, 'future database changed before rejection');
    const broken = join(root, 'broken'); fs.mkdirSync(broken);
    const brokenPath = join(broken, 'cif-local.db');
    fs.writeFileSync(brokenPath, 'synthetic corrupt SQLite file');
    const brokenBytes = fs.readFileSync(brokenPath);
    assert.throws(()=>api.initDb(broken), /Could not initialize.*not a database/);
    assert.deepEqual(fs.readFileSync(brokenPath),brokenBytes);
    // Renaming after failure also verifies the connection was closed on Windows.
    fs.renameSync(brokenPath,join(broken,'corrupt-preserved.db'));
    const repaired = api.initDb(broken); repaired.close();
    // Engine-enforced read-only mode, independent of elevated CI account ACLs.
    const readOnly = join(root,'readonly'); fs.mkdirSync(readOnly);
    const writable = api.initDb(readOnly); writable.close();
    const pragma = Database.prototype.pragma;
    const openedCandidates = [];
    Database.prototype.pragma = function(sql, options) {
      if (!openedCandidates.includes(this)) { openedCandidates.push(this); pragma.call(this,'query_only=ON'); }
      return pragma.call(this,sql,options);
    };
    try { assert.throws(()=>api.initDb(readOnly), /readonly|read-only/i); }
    finally { Database.prototype.pragma = pragma; }
    assert.ok(openedCandidates.every(candidate=>!candidate.open),'failed read-only initialization leaked a handle');
    const retried = api.initDb(readOnly); retried.close();
    const a = write('a/sample.cif', block('a'));
    const b = write('b/sample.cif', block('b', 'Fe1 O1'));
    assert.equal((await scan()).importedCount, 2);
    db = api.initDb(profile); opened.push(db);
    const rows = () => db.prepare('SELECT id, source_filename, formula, source_key, block_key FROM entries ORDER BY id').all();
    const initial = rows(); assert.equal(initial.length, 2);
    assert.deepEqual(new Set(initial.map(row => row.formula)), new Set(['Cl1Na1', 'Fe1O1']));
    assert.equal((await scan()).skippedCount, 2);
    assert.deepEqual(rows(), initial);
    write('copy/sample.cif', block('a'));
    assert.equal((await scan()).outcomes.duplicate, 1, 'exact copies retain distinct provenance');
    assert.equal(rows().length, 3);
    const aid = initial.find(row => row.block_key === 'label:a').id;
    fs.writeFileSync(a, block('a', 'Fe1 O1'));
    assert.equal((await scan()).outcomes.updated, 1);
    assert.equal(rows().find(row => row.id === aid).formula, 'Fe1O1');
    assert.match(api.readStoredCif(aid, db), /Fe1 O1/);
    // Same size and timestamp still require hashing.
    const beforeStat = fs.statSync(a);
    fs.writeFileSync(a, block('a', 'Cu1 O1'));
    fs.utimesSync(a, beforeStat.atime, beforeStat.mtime);
    assert.equal((await scan()).outcomes.updated, 1);
    assert.equal(rows().find(row => row.id === aid).formula, 'Cu1O1');

    const multi = write('multi.cif', block('one') + block('two', 'Fe1 O1'));
    assert.equal((await scan()).outcomes.created, 2, 'sibling blocks are not duplicate copies');
    const ids = Object.fromEntries(rows().filter(row => row.source_filename.startsWith('multi')).map(row => [row.block_key, row.id]));
    fs.writeFileSync(multi, block('two', 'Fe1 O1') + block('three', 'Cu1 O1') + block('one'));
    await scan();
    for (const [key, id] of Object.entries(ids)) assert.equal(rows().find(row => row.block_key === key).id, id);
    assert.match(api.readStoredCif(ids['label:one'], db), /^data_one/);
    assert.match(api.readStoredCif(ids['label:two'], db), /^data_two/);
    assert.equal(api.getAtomSites(ids['label:one'], db).length, 2);
    assert.equal(api.getSymmetryOperations(ids['label:one'], db).length, 1);
    fs.writeFileSync(multi, block('one'));
    await scan();
    assert.equal(rows().find(row => row.block_key === 'label:one').id, ids['label:one']);
    assert.equal(db.prepare('SELECT 1 FROM atom_sites WHERE entry_id = ?').get(ids['label:two']), undefined);
    // Duplicate labels and unnamed blocks follow bytes through reorder, not ordinals.
    const ambiguous = write('ambiguous.cif', block('same') + block('same', 'Fe1 O1') + block('', 'Cu1 O1'));
    await scan();
    const ambiguousRows = rows().filter(row => row.source_filename.startsWith('ambiguous'));
    fs.writeFileSync(ambiguous, block('', 'Cu1 O1') + block('same', 'Fe1 O1') + block('same'));
    await scan();
    for (const row of ambiguousRows) {
      assert.equal(rows().find(item => item.block_key === row.block_key).id, row.id);
      assert.equal(db.prepare('SELECT formula FROM entries WHERE id = ?').get(row.id).formula, row.formula);
    }
    const beforeFailure = rows();
    fs.writeFileSync(multi, block('changed') + 'data_invalid\n_cell_length_a 1\n');
    assert.equal((await scan()).failures.length, 1);
    assert.deepEqual(rows(), beforeFailure);
    assert.match(api.readStoredCif(ids['label:one'], db), /^data_one/);

    const moved = join(root, 'moved.cif'); fs.renameSync(a, moved);
    assert.match(api.readStoredCif(aid, db), /Cu1 O1/);
    assert.throws(() => api.relinkSource(aid, b, db), /differs/);
    assert.throws(() => api.relinkSource(aid, join(root, 'missing.cif'), db), /Cannot read/);
    api.relinkSource(aid, moved, db);
    assert.equal(api.getCifViewerSourceRecord(aid, db).source_path, moved);
    if (process.platform === 'win32') {
      const movedFolder = join(root, 'renamed'); fs.mkdirSync(movedFolder);
      const renamed = join(movedFolder, 'Renamed.cif'); fs.renameSync(moved, renamed);
      api.relinkSource(aid, renamed, db);
      assert.equal((await runWorker(workerUrl, movedFolder.toUpperCase(), profile)).result.skippedCount, 1);
      assert.equal(rows().find(row => row.id === aid).formula, 'Cu1O1');
      fs.unlinkSync(renamed);
    } else fs.unlinkSync(moved);
    // Backup never consults external paths, including changed and unavailable originals.
    api.setImportFolder(input, db);
    db.prepare("INSERT INTO app_settings VALUES ('example_setting', 'retained')").run();
    db.prepare("INSERT INTO entries (id, source_filename) VALUES (10000, 'removed.cif')").run();
    db.prepare('DELETE FROM entries WHERE id = 10000').run();
    const backup = join(root, 'portable.cifbackup');
    const snapshotPrepare = db.prepare.bind(db);
    db.prepare = sql => {
      if (sql === 'VACUUM INTO ?') fs.writeFileSync(b, block('changed-during-backup', 'Cu1 O1'));
      return snapshotPrepare(sql);
    };
    try { api.backupProfile(backup, db); } finally { db.prepare = snapshotPrepare; }
    fs.writeFileSync(b, block('b', 'Fe1 O1'));

    assert.throws(() => api.backupProfile(backup, db), /not completed/);
    const fresh = join(root, 'fresh'); fs.mkdirSync(fresh);
    const restored = api.initDb(fresh); opened.push(restored);
    const recovery = api.restoreProfile(backup, restored); assert.ok(fs.existsSync(recovery));
    assert.deepEqual(restored.prepare('SELECT id, formula FROM entries ORDER BY id').all(), db.prepare('SELECT id, formula FROM entries ORDER BY id').all());
    assert.equal(api.getImportFolder(restored), null);
    assert.equal(restored.prepare("SELECT value FROM app_settings WHERE key = 'example_setting'").get().value, 'retained');
    for (const row of rows()) assert.equal(api.readStoredCif(row.id, restored), api.readStoredCif(row.id, db));
    const next = restored.prepare("INSERT INTO entries (source_filename) VALUES ('next.cif')").run();
    assert.ok(Number(next.lastInsertRowid) > 10000, 'restore must not reuse a previously deleted ID');
    restored.prepare('DELETE FROM entries WHERE id = ?').run(next.lastInsertRowid);
    const restoredRows = restored.prepare('SELECT * FROM entries ORDER BY id').all();
    for (const [name, mutate] of [
      ['checksum', archive => archive.exec("UPDATE entries SET formula = 'tampered'")],
      ['missing', archive => archive.exec('DELETE FROM source_contents')],
      ['schema', archive => archive.pragma('user_version = 999')],
      ['manifest', archive => archive.exec('DELETE FROM backup_manifest')],
      ['unexpected', archive => archive.exec('CREATE TABLE unexpected (value TEXT)')],
      ['column', archive => archive.exec('ALTER TABLE entries ADD COLUMN unexpected TEXT')],
      ['sequence', archive => archive.exec('UPDATE sqlite_sequence SET seq = 0')]
    ]) {
      const bad = join(root, `${name}.cifbackup`); fs.copyFileSync(backup, bad);
      const archive = new Database(bad); archive.pragma('foreign_keys = OFF'); try { mutate(archive); } finally { archive.close(); }
      assert.throws(() => api.restoreProfile(bad, restored));
      assert.deepEqual(restored.prepare('SELECT * FROM entries ORDER BY id').all(), restoredRows);
    }
    const corrupt = join(root, 'corrupt.cifbackup'); fs.writeFileSync(corrupt, 'not a database');
    assert.throws(() => api.restoreProfile(corrupt, restored));
    // Inject a write failure after deletion and parent inserts; rollback restores dependents too.
    const prepare = restored.prepare.bind(restored);
    restored.prepare = sql => { if (sql.startsWith('INSERT INTO atom_sites')) throw new Error('injected disk full'); return prepare(sql); };
    assert.throws(() => api.restoreProfile(backup, restored), /disk full/);
    restored.prepare = prepare;
    assert.deepEqual(restored.prepare('SELECT * FROM entries ORDER BY id').all(), restoredRows);
    assert.equal(api.getAtomSites(aid, restored).length, 2);
    api.restoreProfile(backup, restored);
    restored.close(); opened.splice(opened.indexOf(restored), 1);
    const crash = spawnSync(process.execPath, [__filename, '--interrupt-restore', chunks, fresh, backup], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(crash.status, 73, crash.stderr);
    const reopened = api.initDb(fresh); opened.push(reopened);
    assert.deepEqual(reopened.prepare('SELECT * FROM entries ORDER BY id').all(), restoredRows);
    api.restoreProfile(backup, reopened);
    assert.equal(api.readStoredCif(aid, reopened), api.readStoredCif(aid, db));

    const legacy = join(root, 'legacy'); fs.mkdirSync(legacy); legacyProfile(legacy, b);
    const migrationCrash = spawnSync(process.execPath, [__filename, '--interrupt-migration', chunks, legacy], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8', timeout: 30000 });
    assert.equal(migrationCrash.status, 74, migrationCrash.stderr);
    let old = new Database(join(legacy, 'cif-local.db'));
    assert.equal(old.pragma('user_version', { simple: true }), 1);
    assert.equal(old.prepare('SELECT id FROM entries').get().id, 71);
    old.exec('CREATE TABLE source_contents (conflict TEXT)'); old.close();
    assert.throws(() => api.initDb(legacy), /already exists/);
    old = new Database(join(legacy, 'cif-local.db'));
    assert.equal(old.pragma('user_version', { simple: true }), 1);
    assert.equal(old.prepare('SELECT COUNT(*) AS n FROM entry_elements').get().n, 1);
    old.exec('DROP TABLE source_contents'); old.close();
    const migrated = api.initDb(legacy); opened.push(migrated);
    assert.equal(migrated.prepare('SELECT id FROM entries').get().id, 71);
    assert.throws(() => api.readStoredCif(71, migrated), /legacy/);
    assert.throws(() => api.backupProfile(join(root, 'incomplete.cifbackup'), migrated), /not completed/);
    assert.ok(!fs.existsSync(join(root, 'incomplete.cifbackup')));
    assert.equal((await runWorker(workerUrl, dirname(b), legacy)).result.importedCount, 1);
    assert.equal(migrated.prepare('SELECT id FROM entries').get().id, 71);
    assert.match(api.readStoredCif(71, migrated), /Fe1 O1/);
    const legacyPortable = join(root, 'legacy-portable.cifbackup');
    api.backupProfile(legacyPortable, migrated);
    api.restoreProfile(legacyPortable, reopened);
    assert.equal(api.readStoredCif(71, reopened), api.readStoredCif(71, migrated));
    const migrationBackups = fs.readdirSync(legacy).filter(name => name.includes('pre-migration'));
    assert.ok(migrationBackups.length >= 2);
    const original = new Database(join(legacy, migrationBackups[0]), { readonly: true });
    assert.equal(original.pragma('user_version', { simple: true }), 1); original.close();
    console.log('✓ identity collisions, hashes, case, block reorder, relink and preserved bytes');
    console.log('✓ portable restore, manifest/schema corruption, write failure and process interruption');
    console.log('✓ migration backup, rollback, process interruption, retry and stable legacy IDs');
    console.log('✓ corrupt/future/read-only database rejection, handle cleanup and retry');
  } catch (error) { console.error(error); throw error; } finally {
    for (const database of opened) if (database.open) database.close();
    // All paths are descendants of the test-created temporary root.
    fs.rmSync(root, { recursive: true, force: true });
  }
};

if (process.argv[2]?.startsWith('--interrupt-')) interrupted(...process.argv.slice(2)).catch(error => { console.error(error); process.exit(1); });
