// Run after npm run build, with Electron's native SQLite ABI.
const assert = require('node:assert/strict');
const { app } = require('electron');
const { mkdtempSync, readdirSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { pathToFileURL } = require('node:url');
const { performance } = require('node:perf_hooks');

app.disableHardwareAcceleration();
const elapsed = operation => {
  const start = performance.now();
  operation();
  return Number((performance.now() - start).toFixed(2));
};
const median = operation => {
  operation();
  return Array.from({ length: 7 }, () => elapsed(operation)).sort((a, b) => a - b)[3];
};

async function run() {
  const chunks = join(__dirname, '..', 'dist-electron', 'main', 'chunks');
  const filename = readdirSync(chunks).find(name => /^db-.*\.js$/.test(name));
  assert.ok(filename, 'Build the production database chunk first');
  const api = await import(pathToFileURL(join(chunks, filename)).href);
  const directory = mkdtempSync(join(tmpdir(), 'cif-api-benchmark-'));
  let database;
  try {
    database = api.initDb(directory, 'benchmark');
    const writer = api.createEntryWriter(database);
    const entry = {
      formula: 'Fe1O1', elements: [{ element: 'Fe', count: 1 }, { element: 'O', count: 1 }],
      cell_a: 0.4, cell_b: 0.5, cell_c: 0.6, cellAAngstrom: 4, cellBAngstrom: 5, cellCAngstrom: 6,
      cellAlpha: 90, cellBeta: 90, cellGamma: 90, cellVolume: 120,
      sg_number: 62, space_group: 'Pnma', reference: 'API benchmark', level: 'Complete structure determined',
      sampleType: '', crystalColour: '', publTitle: '', citationDoi: '', databaseCodeCcdc: '',
      databaseCodeCsd: '', databaseCodeIcsd: '', journalLanguage: '', formulaUnitsZ: 1,
      radiationType: '', radiationWavelengthAngstrom: null,
      atomSites: [{ typeSymbol: 'Fe', siteLabel: 'Fe1', symmetryMultiplicity: 1, wyckoffSymbol: 'a',
        fractX: 0, fractY: 0, fractZ: 0, occupancy: 1, uIsoOrEquiv: null, bIsoOrEquiv: null }],
      publAuthors: [{ name: 'Example, A.', address: 'Synthetic' }],
      symmetryOperations: [{ operationId: '1', operationXyz: 'x, y, z' }],
      atomSiteAnisotropic: [{ siteLabel: 'Fe1', u11: 0.01, u22: 0.02, u33: 0.03,
        u12: 0, u13: 0, u23: 0, b11: null, b22: null, b33: null, b12: null, b13: null, b23: null }]
    };
    const rows = 10_000;
    const items = Array.from({ length: rows }, (_, index) => ({
      sourceFilename: `${index}.cif`, sourcePath: join(directory, `${index}.cif`),
      sourceMtimeMs: 1, sourceSize: 100, entry: { ...entry, sg_number: index % 230 + 1 }
    }));
    const writeAll = () => {
      for (let offset = 0; offset < rows; offset += 250) {
        assert.deepEqual(writer.writeBatch(items.slice(offset, offset + 250)), []);
      }
    };
    const insertMs = elapsed(writeAll);
    items.forEach(item => { item.entry = { ...item.entry, reference: 'Updated benchmark' }; });
    const updateMs = elapsed(writeAll);
    assert.equal(api.getEntryCount(), rows);
    assert.equal(api.getAtomSites(1)[0].site_label, 'Fe1');
    assert.equal(api.getPublAuthors(1)[0].name, 'Example, A.');
    assert.equal(api.getSymmetryOperations(1)[0].operation_xyz, 'x, y, z');
    assert.equal(database.prepare('SELECT COUNT(*) AS n FROM atom_site_anisotropic').get().n, rows);
    assert.equal(database.prepare('SELECT u_11 FROM atom_site_anisotropic WHERE entry_id = 1').get().u_11, 0.01);
    assert.equal(database.prepare('SELECT reference FROM entries WHERE id = 1').get().reference, 'Updated benchmark');
    api.setImportFolder(directory);
    assert.equal(api.getImportFolder(), directory);
    const filter = { slot1: ['Fe'], slot2: [], mode: 'AND', aMin: 4, aMax: 5, sgQuery: '1-100' };
    const request = { filter, offset: 200, limit: 200, sortColumn: 'formula', sortDirection: 'asc' };
    assert.equal(api.computeRestraints(filter).at(-1).entries, api.searchEntriesPage(request).total);
    console.log(JSON.stringify({ runtime: process.versions, rows, batchSize: 250, insertMs, updateMs,
      medianMs: { sortedPage: median(() => api.searchEntriesPage(request)),
        restraints: median(() => api.computeRestraints(filter)),
        metadata: median(() => { api.getAtomSites(1); api.getPublAuthors(1); api.getSymmetryOperations(1); }) }
    }, null, 2));
  } finally {
    database?.close();
    rmSync(directory, { recursive: true, force: true }); // Only this run's mkdtemp directory.
  }
}
run().then(() => app.exit(0), error => { console.error(error); app.exit(1); });
