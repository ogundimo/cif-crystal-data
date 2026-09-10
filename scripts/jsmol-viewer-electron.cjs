const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('disable-gpu');
const testUrl = process.env.CIF_UI_TEST_URL;
if (!testUrl) throw new Error('CIF_UI_TEST_URL is required.');

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(window, expression, timeout = 90_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await pause(100);
  }
  const diagnostics = await window.webContents.executeJavaScript(`({
    viewerText: document.querySelector('[aria-label="Crystal structure viewer"]')?.innerText,
    canvasCount: document.querySelectorAll('canvas').length,
    scriptSources: Array.from(document.scripts).map((script) => script.src),
    hasJmol: Boolean(window.Jmol)
  })`);
  throw new Error(`Timed out waiting for: ${expression}\n${JSON.stringify(diagnostics, null, 2)}`);
}

async function clickByText(window, text) {
  await window.webContents.executeJavaScript(`
    (() => {
      const button = Array.from(document.querySelectorAll('[aria-label="Crystal structure viewer"] button'))
        .find((candidate) => candidate.textContent.trim() === ${JSON.stringify(text)});
      if (!button) throw new Error('Missing viewer control: ' + ${JSON.stringify(text)});
      button.click();
    })()
  `);
  await pause(
    ['Atoms', 'Ball + stick', 'Space fill'].includes(text)
      ? 2_500
      : ['Fit / reset', 'a', 'b', 'c'].includes(text)
        ? 1_500
        : 250
  );
  const active = await window.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('[aria-label="Crystal structure viewer"] button.btn-on'))
      .map((button) => button.textContent.trim())
  `);
  console.log(`[viewer control] requested ${text}; active: ${active.join(', ')}`);
}

async function captureViewer(window, name) {
  const dataUrl = await window.webContents.executeJavaScript(`
    (() => {
      const canvas = document.querySelector('[data-testid="jsmol-host"] canvas');
      if (!canvas) throw new Error('JSmol canvas is unavailable');
      return canvas.toDataURL('image/png');
    })()
  `);
  const png = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  const output = join(process.cwd(), '.dist', 'jsmol-verification');
  await mkdir(output, { recursive: true });
  await writeFile(join(output, `${name}.png`), png);
  return createHash('sha256').update(png).digest('hex');
}

async function run() {
  const resourceErrors = [];
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  window.webContents.on('console-message', (event, ...args) => {
    const message = event.message ?? (typeof args[0] === 'object' ? args[0]?.message : args[1]) ?? '';
    if (message) console.log(`[renderer] ${message}`);
    if (/ERR_FILE_NOT_FOUND|Failed to load resource|Refused to load|JSmol.*error/i.test(message)) resourceErrors.push(message);
  });
  await window.loadURL(testUrl);
  const representativeCif = await readFile(join(process.cwd(), '..', 'CIFS', '1140624.cif'), 'utf8');
  await window.webContents.executeJavaScript(`
    window.cifApi.getViewerSource = async (entryId) => ({
      fileName: entryId + '.cif',
      text: ${JSON.stringify(representativeCif)}
    }); true
  `);
  await waitFor(window, `document.querySelector('[data-testid="jsmol-host"] canvas')`);
  await window.webContents.executeJavaScript(`
    document.querySelector('[aria-label="Crystal structure viewer"] [title="Double-click to open viewer controls"]')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); true
  `);
  await waitFor(window, `
    (() => {
      const canvas = document.querySelector('[data-testid="jsmol-host"] canvas');
      const rect = canvas?.getBoundingClientRect();
      return canvas && Math.abs(canvas.width - rect.width) < 1 && Math.abs(canvas.height - rect.height) < 1;
    })()
  `);
  const fullWindowBounds = await window.webContents.executeJavaScript(`
    (() => {
      const rect = document.querySelector('[aria-label="Crystal structure viewer"]').getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, windowWidth: innerWidth, windowHeight: innerHeight };
    })()
  `);
  assert.equal(fullWindowBounds.x, 0, 'The full-window viewer did not start at the left edge');
  assert.equal(fullWindowBounds.y, 0, 'The full-window viewer did not start at the top edge');
  assert.ok(
    Math.abs(fullWindowBounds.width - fullWindowBounds.windowWidth) < 1 &&
      Math.abs(fullWindowBounds.height - fullWindowBounds.windowHeight) < 1,
    'The viewer controls page did not fill the application window'
  );
  await waitFor(window, `document.querySelector('[aria-label="Crystal structure viewer"] strong')?.textContent === '1.cif'`);
  const fullScreenCellParameters = await window.webContents.executeJavaScript(`
    (() => {
      const applet = Object.values(window.Jmol._applets)[0];
      return window.Jmol.getPropertyAsArray(applet, 'evaluate', 'displayCellParameters');
    })()
  `);
  assert.equal(String(fullScreenCellParameters), 'true', 'Full-window viewer did not show cell parameters');

  const evidence = await window.webContents.executeJavaScript(`
    (() => {
      const applet = Object.values(window.Jmol._applets)[0];
      const atomInfo = window.Jmol.getPropertyAsArray(applet, 'atomInfo', '(visible)');
      return {
        canvas: Boolean(document.querySelector('[data-testid="jsmol-host"] canvas')),
        text: document.querySelector('[aria-label="Crystal structure viewer"] [aria-live="polite"]')?.textContent,
        projectedFitShape: {
          atom: Array.isArray(atomInfo) ? atomInfo[0] : atomInfo,
          orientation: window.Jmol.getPropertyAsArray(applet, 'orientationInfo')
        }
      };
    })()
  `);
  assert.equal(evidence.canvas, true, 'JSmol did not create an HTML5 canvas');
  assert.match(evidence.text, /Loaded:\s*yes/);
  assert.match(evidence.text, /Atoms:\s*[1-9][0-9]*/);
  assert.match(evidence.text, /Space group:\s*(?!unavailable)[^·]+/i);
  assert.ok(Array.isArray(evidence.projectedFitShape.atom?.coord), 'JSmol did not expose atom coordinates');
  assert.ok(Array.isArray(evidence.projectedFitShape.orientation?.rotationMatrix), 'JSmol did not expose the view rotation matrix');
  await window.webContents.executeJavaScript(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog?.parentElement) dialog.parentElement.style.display = 'none';
    })()
  `);
  await pause(500);

  await clickByText(window, 'Atoms');
  const atomsHash = await captureViewer(window, 'atoms');
  await clickByText(window, 'Ball + stick');
  const ballStickHash = await captureViewer(window, 'ball-stick');
  await clickByText(window, 'Space fill');
  const spacefillHash = await captureViewer(window, 'spacefill');
  assert.equal(new Set([atomsHash, ballStickHash, spacefillHash]).size, 3, 'The three representations were not visually distinct');

  const atomCount = () => window.webContents.executeJavaScript(`
    (() => {
      const applet = Object.values(window.Jmol._applets)[0];
      const atoms = window.Jmol.getPropertyAsArray(applet, 'atomInfo', '(visible)');
      return Array.isArray(atoms) ? atoms.length : 0;
    })()
  `);
  const oneCellAtoms = await atomCount();
  await clickByText(window, '2³');
  await waitFor(window, `!document.querySelector('[aria-label="Crystal structure viewer"]')?.textContent.includes('Preparing')`);
  const twoCellAtoms = await atomCount();
  assert.ok(twoCellAtoms > oneCellAtoms, '2×2×2 did not load more atoms than 1×1×1');
  await clickByText(window, '3³');
  await waitFor(window, `!document.querySelector('[aria-label="Crystal structure viewer"]')?.textContent.includes('Preparing')`);
  const threeCellAtoms = await atomCount();
  assert.ok(threeCellAtoms > twoCellAtoms, '3×3×3 did not load more atoms than 2×2×2');
  await clickByText(window, '1³');
  await waitFor(window, `!document.querySelector('[aria-label="Crystal structure viewer"]')?.textContent.includes('Preparing')`);

  const polyhedraModeActive = await window.webContents.executeJavaScript(`
    Array.from(document.querySelectorAll('[aria-label="Crystal structure viewer"] button.btn-on'))
      .some((button) => button.textContent.trim() === 'Polyhedra')
  `);
  assert.equal(polyhedraModeActive, true, 'Fullscreen polyhedra picking mode was not enabled');
  const polyhedraBindingActive = await window.webContents.executeJavaScript(`
    (() => {
      const applet = Object.values(window.Jmol._applets)[0];
      const mouseInfo = window.Jmol.getPropertyAsArray(applet, 'mouseInfo');
      return JSON.stringify(mouseInfo).toLowerCase().includes('polyhedra');
    })()
  `);
  assert.equal(polyhedraBindingActive, true, 'JSmol did not install the atom double-click polyhedra binding');
  await window.webContents.executeJavaScript(`
    (() => {
      const applet = Object.values(window.Jmol._applets)[0];
      window.Jmol.script(applet, 'polyhedra {*} DELETE;connect 15% 125% {atomIndex=0} {*} CREATE;polyhedra BONDS {atomIndex=0} TO {*} COLLAPSED EDGES;select {atomIndex=0};color polyhedra translucent 0.45 [x66B5D8];select none');
    })()
  `);
  await pause(1_000);
  const hasPolyhedron = await window.webContents.executeJavaScript(`
    (() => {
      const applet = Object.values(window.Jmol._applets)[0];
      return JSON.stringify(window.Jmol.getPropertyAsArray(applet, 'shapeInfo')).toLowerCase().includes('polyhedra');
    })()
  `);
  assert.equal(hasPolyhedron, true, 'JSmol did not create a polyhedron around the selected atom');
  await clickByText(window, 'Clear polyhedra');

  for (const control of ['Cells', 'Labels', 'Fit / reset', 'a', 'b', 'c']) await clickByText(window, control);
  await window.webContents.executeJavaScript(`
    (() => {
      const rows = document.querySelectorAll('[data-testid="data-grid-scroll"] tbody tr[data-entry-id]');
      rows[1].click(); rows[2].click(); rows[3].click();
    })()
  `);
  await waitFor(window, `document.querySelector('[aria-label="Crystal structure viewer"] strong')?.textContent === '4.cif'`);
  await clickByText(window, '← Back to results');
  await waitFor(window, `!document.querySelector('[aria-label="Crystal structure viewer"] button')`);
  await waitFor(window, `
    (() => {
      const canvas = document.querySelector('[data-testid="jsmol-host"] canvas');
      const rect = canvas?.getBoundingClientRect();
      return canvas && Math.abs(canvas.width - rect.width) < 1 && Math.abs(canvas.height - rect.height) < 1;
    })()
  `);
  const compactCellParameters = await window.webContents.executeJavaScript(`
    (() => {
      const applet = Object.values(window.Jmol._applets)[0];
      return window.Jmol.getPropertyAsArray(applet, 'evaluate', 'displayCellParameters');
    })()
  `);
  assert.equal(String(compactCellParameters), 'false', 'Compact viewer did not hide cell parameters');
  assert.deepEqual(resourceErrors, [], `JSmol console/resource errors: ${resourceErrors.join('; ')}`);
  console.log('✓ live JSmol CIF load and structural evidence');
  console.log('✓ Atoms, Ball + stick, and Space fill produced distinct canvas captures');
  console.log('✓ cells, labels, fit/reset, and a/b/c controls executed');
  console.log('✓ 1³, 2³, and 3³ controls loaded progressively larger unit-cell blocks');
  console.log('✓ radius-based coordination polyhedron creation and clearing executed');
  console.log('✓ full-window viewer controls returned to the results page');
  console.log('✓ JSmol canvas resized with both viewer layout transitions');
  console.log('✓ rapid selections resolved to the newest CIF only');
  window.destroy();
}

app.whenReady().then(run).then(
  () => app.exit(0),
  (error) => { console.error(error); app.exit(1); }
);
