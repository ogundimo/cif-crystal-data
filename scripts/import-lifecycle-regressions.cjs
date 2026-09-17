const assert = require('node:assert/strict');
const { Worker } = require('node:worker_threads');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const Database = require('better-sqlite3');
module.exports = async function(workerUrl, fixture) {
  const root = mkdtempSync(join(tmpdir(), 'cif-cancel-worker-'));
  const corpus = join(root, 'input'); mkdirSync(corpus);
  for (let i = 0; i < 1000; i++) writeFileSync(join(corpus, `${i}.cif`), fixture);
  const run = phase => new Promise((resolve, reject) => {
    const cancellation = new SharedArrayBuffer(4); let result;
    const worker = new Worker(workerUrl, { workerData: { rootDir: corpus, userDataPath: root, cancellation } });
    worker.on('message', message => {
      if (message.type === 'progress' && message.progress.phase === phase &&
          (phase === 'discovery' ? message.progress.discovered > 0 : message.progress.processed > 0)) Atomics.store(new Int32Array(cancellation), 0, 1);
      if (message.type === 'result') result = message.result;
      if (message.type === 'error') reject(new Error(message.error));
    });
    worker.once('error', reject);
    worker.once('exit', code => code === 0 && result ? resolve(result) : reject(new Error('Cancellation worker did not finish')));
  });
  try {
    const crashedProfile = join(root,'crashed'); mkdirSync(crashedProfile);
    await new Promise((resolve,reject)=> {
      const worker=new Worker(workerUrl,{workerData:{rootDir:corpus,userDataPath:crashedProfile}});
      let terminated=false;
      worker.on('message',message=> {
        if(message.type==='progress' && message.progress.phase==='ingestion' && message.progress.processed>0 && !terminated) {
          terminated=true; void worker.terminate();
        }
        if(message.type==='error') reject(new Error(message.error));
      });
      worker.once('error',reject);
      worker.once('exit',code=>terminated && code!==0 ? resolve() : reject(new Error('Crash checkpoint not reached')));
    });
    const crashedDb = new Database(join(crashedProfile,'cif-local.db'));
    assert.equal(crashedDb.pragma('integrity_check',{simple:true}),'ok');
    assert.deepEqual(crashedDb.pragma('foreign_key_check'),[]);
    crashedDb.close();
    await new Promise((resolve,reject)=> {
      const worker=new Worker(workerUrl,{workerData:{rootDir:corpus,userDataPath:crashedProfile}});
      let result;
      worker.on('message',message=>{if(message.type==='result') result=message.result; if(message.type==='error') reject(new Error(message.error));});
      worker.once('error',reject);
      worker.once('exit',code=>code===0 && result && result.importedCount+result.skippedCount===1000 ? resolve() : reject(new Error('Crash retry failed')));
    });
    const discovery = await run('discovery');
    assert.equal(discovery.cancelled, true); assert.equal(discovery.importedCount, 0);
    const ingestion = await run('ingestion');
    assert.equal(ingestion.cancelled, true); assert.ok(ingestion.importedCount > 0); assert.ok(ingestion.unattempted > 0);
    let db = new Database(join(root, 'cif-local.db'));
    assert.equal(db.prepare('SELECT count(*) n FROM entries').get().n, ingestion.importedCount); db.close();
    const retry = await run(null);
    assert.equal(retry.cancelled, false); assert.equal(retry.total, 1000);
    assert.equal(retry.skippedCount, ingestion.importedCount);
    assert.equal(retry.importedCount + retry.skippedCount, 1000);
    db = new Database(join(root, 'cif-local.db'));
    assert.equal(db.prepare('SELECT count(*) n FROM entries').get().n, 1000); db.close();
    console.log('✓ real worker discovery/ingestion cancellation preserves committed files and supports retry');
    console.log('✓ abrupt worker termination leaves an integral database and supports retry');
  } finally { rmSync(root, { recursive: true, force: true }); }
};
