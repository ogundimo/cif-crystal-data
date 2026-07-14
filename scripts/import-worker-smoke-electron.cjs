const assert = require('node:assert/strict');
const { readdirSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { Worker } = require('node:worker_threads');
const Database = require('better-sqlite3');
const { app } = require('electron');

const root = dirname(dirname(__filename));

async function run() {
  const chunksDirectory = join(root, 'dist-electron', 'main', 'chunks');
  const workerFilename = readdirSync(chunksDirectory).find((name) =>
    /^importWorker-.*\.js$/.test(name)
  );
  assert.ok(workerFilename, 'Production build did not emit the import worker chunk');

  const userDataPath = mkdtempSync(join(tmpdir(), 'cif-import-worker-'));
  const rootDir = join(root, 'src', 'parser', '__fixtures__');
  const workerUrl = pathToFileURL(join(chunksDirectory, workerFilename));

  try {
    const message = await new Promise((resolve, reject) => {
      let receivedMessage;
      const worker = new Worker(workerUrl, { workerData: { rootDir, userDataPath } });
      worker.once('message', (result) => {
        receivedMessage = result;
      });
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) reject(new Error(`Import worker exited with code ${code}`));
        else if (!receivedMessage) reject(new Error('Import worker exited without a result'));
        else resolve(receivedMessage);
      });
    });

    assert.deepEqual(message, {
      ok: true,
      result: { importedCount: 1, failures: [], total: 1 }
    });

    const database = new Database(join(userDataPath, 'cif-local.db'), { readonly: true });
    try {
      const row = database.prepare('SELECT formula, sg_number FROM entries').get();
      assert.deepEqual(row, { formula: 'Eu3S9Sb4', sg_number: 62 });
    } finally {
      database.close();
    }

    console.log('✓ production import worker parsed and persisted the CIF fixture');
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
