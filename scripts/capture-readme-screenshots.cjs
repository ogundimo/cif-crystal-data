// Run after npm run build: npx electron scripts/capture-readme-screenshots.cjs
// Uses the real main/preload/renderer, SQLite importer, JSmol and PXRD calculation.
const assert = require('node:assert/strict');
const { mkdtempSync } = require('node:fs');
const { mkdir, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, dialog } = require('electron');

const root = join(__dirname, '..');
const output = join(root, 'docs', 'images');
const profile = mkdtempSync(join(tmpdir(), 'cif-readme-'));
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
  async function capture(name, selector) {
    await pause(1200);
    // Capture actual application pixels; optional crop uses the panel's DOM bounds.
    const rect = selector ? await ui(`(() => {
      const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) };
    })()`) : undefined;
    const image = await window.webContents.capturePage(rect, { stayHidden: true, stayAwake: true });
    assert.ok(!image.isEmpty(), `Empty screenshot: ${name}`);
    await writeFile(join(output, `${name}.png`), image.toPNG());
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
  await capture('workspace');
  await capture('powder-diffraction', '[data-testid=pxrd-pattern]');
  await click('Quick search');
  await waitFor("Boolean(document.querySelector('#quick-search-space-group-number'))");
  await ui(`(() => {
    const input = document.querySelector('#quick-search-space-group-number');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await capture('quick-search');
  await ui("document.querySelector('.quick-search-dialog form').requestSubmit()");
  await waitFor("!document.querySelector('.quick-search-dialog') && Boolean(document.querySelector('[data-testid=crystal-legend]'))");
  await ui(`document.querySelector('[title="Double-click to open viewer controls"]').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await waitFor("Boolean(document.querySelector('[aria-label=\"Back to quick search results\"]'))");
  await click('2³');
  await pause(2500);
  await capture('crystal-viewer');
  console.log('Screenshots saved. The isolated temporary profile is at:', profile);
}

run().then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
