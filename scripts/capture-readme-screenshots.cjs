// Run after npm run build: npx electron scripts/capture-readme-screenshots.cjs
// Uses the real main/preload/renderer, SQLite importer, JSmol and PXRD calculation.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { mkdtempSync } = require('node:fs');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog } = require('electron');

const root = join(__dirname, '..');
const output = join(root, 'docs', 'images');
const profile = mkdtempSync(join(tmpdir(), 'cif-readme-'));
const captures = [];
const rendererErrors = [];
app.setPath('userData', profile);
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
delete process.env.ELECTRON_RENDERER_URL;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [join(root, 'docs', 'samples')] });
dialog.showErrorBox = (title, message) => { throw new Error(`${title}: ${message}`); };
app.on('browser-window-created', (_, window) => {
  window.hide();
  window.setContentSize(1440, 1000);
  window.webContents.setBackgroundThrottling(false);
  window.webContents.on('console-message', event => {
    if (/ERR_FILE_NOT_FOUND|Failed to load resource|Refused to load|Uncaught/i.test(event.message ?? '')) rendererErrors.push(event.message);
  });
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function run() {
  await mkdir(output, { recursive: true });
  await import(pathToFileURL(join(root, 'dist-electron', 'main', 'index.js')).href);
  let window;
  for (let i = 0; i < 200; i++) {
    window = BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isLoading()) break;
    await pause(100);
  }
  assert.ok(window, 'Application window must start');
  const ui = async expression => {
    try { return await window.webContents.executeJavaScript(expression); }
    catch (error) { throw new Error(`Renderer action failed: ${expression}`, { cause: error }); }
  };
  async function waitFor(expression) {
    console.log('Waiting for:', expression);
    for (let i = 0; i < 900; i++) {
      if (await ui(expression)) return;
      await pause(100);
    }
    console.error(await ui('document.body.innerText'));
    throw new Error(`Timed out: ${expression}`);
  }
  const click = text => ui(`(() => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim().endsWith(${JSON.stringify(text)}));
    if (!button || button.disabled) throw new Error('Unavailable button: ' + ${JSON.stringify(text)});
    button.click();
  })()`);
  async function rotateCrystal() {
    const point = await ui(`(() => {
      const r = document.querySelector('[data-testid="jsmol-host"] canvas').getBoundingClientRect();
      return { x: Math.round(r.x + r.width * 0.45), y: Math.round(r.y + r.height * 0.45) };
    })()`);
    window.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    for (let step = 1; step <= 12; step++) {
      window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x + step * 6, y: point.y + step * 3,
        button: 'left', modifiers: ['leftButtonDown'] });
      await pause(30);
    }
    window.webContents.sendInputEvent({ type: 'mouseUp', x: point.x + 72, y: point.y + 36, button: 'left', clickCount: 1 });
    await pause(500);
  }
  async function capture(name, selector) {
    // Dismiss focus/hover feedback through ordinary input; do not modify the UI.
    await ui('document.activeElement?.blur()');
    window.webContents.sendInputEvent({ type: 'mouseMove', x: 1, y: 1 });
    await pause(1200);
    assert.equal(await ui("document.querySelectorAll('[role=alert]').length"), 0, 'No visible application error');
    assert.deepEqual(rendererErrors, [], 'No renderer resource errors');
    // Capture actual application pixels; optional crop uses the panel's DOM bounds.
    const rect = selector ? await ui(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
    })()`) : undefined;
    const image = await window.webContents.capturePage(rect, { stayHidden: true, stayAwake: true });
    assert.ok(!image.isEmpty(), `Empty screenshot: ${name}`);
    const png = image.toPNG();
    await writeFile(join(output, `${name}.png`), png);
    captures.push({ file: `${name}.png`, ...image.getSize(), bytes: png.length, sha256: createHash('sha256').update(png).digest('hex') });
    console.log(`Captured ${name}.png (${image.getSize().width} × ${image.getSize().height})`);
  }
  await waitFor('Boolean(window.cifApi)');
  await waitFor("Boolean(document.querySelector('[aria-label=\"Application actions\"]'))");
  assert.equal(await ui('window.cifApi.getEntryCount()'), 0, 'Must use an empty profile');
  await click('Import CIFs...');
  await waitFor("document.body.innerText.includes('1 imported') || document.querySelector('[aria-label=Dismiss]')");
  assert.equal(await ui('window.cifApi.getEntryCount()'), 1);
  await ui("document.querySelector('[aria-label=Dismiss]')?.click()");
  await click('Quick search');
  await waitFor("Boolean(document.querySelector('.quick-search-dialog form'))");
  await ui(`(() => {
    const input = document.querySelector('#quick-search-space-group-number');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor("!document.querySelector('.quick-search-dialog button[type=submit]').disabled");
  await ui("document.querySelector('.quick-search-dialog form').requestSubmit()");
  await waitFor("Boolean(document.querySelector('[data-role=pxrd-profile]')) && Boolean(document.querySelector('[data-testid=crystal-legend]'))");
  await waitFor(`(() => {
    const canvas = document.querySelector('[data-testid="jsmol-host"] canvas');
    const rect = canvas?.getBoundingClientRect();
    return canvas && Math.abs(canvas.width - rect.width) < 1 && Math.abs(canvas.height - rect.height) < 1;
  })()`);
  assert.equal(await ui("document.querySelector('[data-testid=pxrd-pattern]').dataset.calculationStatus"), 'complete');
  assert.deepEqual(await ui("[...document.querySelector('[data-testid=pxrd-wavelength-input]').options].map(option => option.text)"),
    ['Cu (1.5406 Å)', 'Mo (0.7107 Å)', 'Co (1.7902 Å)', 'Ag (0.5609 Å)']);
  // Use the ordinary keyboard divider to give the single-result details more room.
  for (let step = 0; step < 10; step++) {
    await ui("document.querySelector('[aria-label=\"Resize results and compound information\"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))");
    await pause(50);
  }
  await pause(1200);
  await rotateCrystal();
  await capture('workspace');
  // Exercise the real file-input handler and parser with a repository-owned
  // illustrative pattern. No simulated response or rendered pixels are replaced.
  const comparisonText = await readFile(join(root, 'docs', 'samples', 'synthetic-comparison.xy'), 'utf8');
  await ui(`(() => {
    const input = document.querySelector('input[aria-label="Import personal XY pattern"]');
    const transfer = new DataTransfer();
    transfer.items.add(new File([${JSON.stringify(comparisonText)}], 'synthetic-comparison.xy', { type: 'text/plain' }));
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor("Boolean(document.querySelector('[data-role=pxrd-imported-profile]'))");
  await waitFor(`(() => {
    const chart = document.querySelector('[data-testid="pxrd-chart"]');
    const svg = chart.querySelector('svg');
    return svg && svg.getBoundingClientRect().bottom <= chart.getBoundingClientRect().bottom + 1;
  })()`);
  await capture('powder-diffraction', '[data-testid=pxrd-pattern]');
  await click('Clear');
  await click('Quick search');
  await waitFor("Boolean(document.querySelector('#quick-search-space-group-number'))");
  await ui(`(() => {
    const input = document.querySelector('#quick-search-space-group-number');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor("[...document.querySelectorAll('.quick-search-preview tbody tr')].some(row => row.cells.length === 3 && row.cells[2].textContent === '1') && !document.body.innerText.includes('Updating preview')");
  await capture('quick-search');
  await ui("document.querySelector('.quick-search-dialog form').requestSubmit()");
  await waitFor("!document.querySelector('.quick-search-dialog') && Boolean(document.querySelector('[data-testid=crystal-legend]'))");
  await ui(`document.querySelector('[title="Double-click to open viewer controls"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await waitFor("Boolean(document.querySelector('[aria-label=\"Back to quick search results\"]'))");
  await click('2³');
  await waitFor("document.querySelector('#crystal-viewer-pane')?.innerText.includes('2×2×2 unit-cell block') && document.querySelector('#crystal-viewer-pane [aria-live=polite]')?.innerText.includes('Loaded: yes')");
  await pause(2500);
  await rotateCrystal();
  await capture('crystal-viewer');
  await ui("document.querySelector('[aria-label=\"Back to quick search results\"]').click()");
  await ui("document.querySelector('input[aria-label=\"Select entry 1 for batch export\"]').click()");
  await click('Batch export…');
  await waitFor("document.querySelector('[aria-labelledby=batch-export-title]')?.innerText.includes('1 structures will be requested.')");
  await capture('batch-export');
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const inputs = ['docs/samples/rocksalt-demo.cif', 'docs/samples/synthetic-comparison.xy',
    'scripts/capture-readme-screenshots.cjs', 'package-lock.json'];
  const inputSha256 = Object.fromEntries(await Promise.all(inputs.map(async file =>
    [file, createHash('sha256').update((await readFile(join(root, file), 'utf8')).replaceAll('\r\n', '\n')).digest('hex')])));
  await writeFile(join(output, 'capture.json'), JSON.stringify({
    applicationRevision: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD:src'),
    applicationSourceDirty: Boolean(git('status', '--porcelain', '--', 'src', 'electron.vite.config.ts', 'package.json', 'package-lock.json')),
    electron: process.versions.electron, platform: process.platform, contentSize: [1440, 1000], deviceScaleFactor: 1,
    inputSha256, captures
  }, null, 2) + '\n');
  console.log('Screenshots saved. The isolated temporary profile is at:', profile);
}

run().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
