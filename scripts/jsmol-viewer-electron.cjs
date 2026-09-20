const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { app, BrowserWindow } = require('electron');
app.setPath('userData', mkdtempSync(join(tmpdir(), 'cif-viewer-tests-')));

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
    hasJmol: Boolean(window.Jmol),
    jmolError: window.Jmol?.getPropertyAsArray(Object.values(window.Jmol._applets)[0], 'errorMessage'),
    queue: window.Jmol?.getPropertyAsArray(Object.values(window.Jmol._applets)[0], 'scriptQueueInfo'),
    consoleText: window.Jmol?.getPropertyAsArray(Object.values(window.Jmol._applets)[0], 'consoleText')
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
    if (/ERR_FILE_NOT_FOUND|Failed to load resource|Refused to load|JSmol.*error|Uncaught/i.test(message)) resourceErrors.push(message);
  });
  await window.loadURL(testUrl);
  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Runtime.enable');
  window.webContents.debugger.on('message', (_event, method, params) => {
    if (method === 'Runtime.exceptionThrown') resourceErrors.push(JSON.stringify(params.exceptionDetails));
  });
  // Default to repository-owned synthetic geometry; real corpora are optional manual probes.
  const fixturePath = process.env.CIF_VIEWER_TEST_CIF || join(process.cwd(), 'docs', 'samples', 'rocksalt-demo.cif');
  const representativeCif = await readFile(fixturePath, 'utf8');
  console.log(`[viewer fixture] ${fixturePath}`);
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
  if (process.env.CIF_VIEWER_USABILITY_ONLY === '1') {
    await require('./viewer-usability-regressions.cjs')(window, { waitFor, clickByText, pause, representativeCif });
    await require('./viewer-lifecycle-regressions.cjs')(window, representativeCif, pause);
    window.destroy();
    return;
  }

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

  await require('./viewer-usability-regressions.cjs')(window, { waitFor, clickByText, pause, representativeCif });

  await require('./viewer-compact-regressions.cjs')(window, { waitFor, clickByText });

  for (const control of ['Cells', 'Labels', 'Fit / reset', 'a', 'b', 'c']) await clickByText(window, control);
  await window.webContents.executeJavaScript(`
    (() => {
      const rows = document.querySelectorAll('[data-testid="data-grid-scroll"] tbody tr[data-entry-id]');
      rows[1].click(); rows[2].click(); rows[3].click();
    })()
  `);
  await waitFor(window, `document.querySelector('[aria-label="Crystal structure viewer"] strong')?.textContent === '4.cif'`);
  await window.webContents.executeJavaScript(`
    (() => {
      const fetchSource = window.cifApi.getViewerSource;
      // Exercise the documented fallback for a non-Error rejection. Errors created by
      // executeJavaScript can belong to a different realm from the Vite application.
      window.cifApi.getViewerSource = (id) => id === 2
        ? Promise.reject('Intentional missing CIF test') : fetchSource(id);
      document.querySelector('tr[data-entry-id="2"]').click();
    })()
  `);
  await waitFor(window, `document.querySelector('[aria-label="Crystal structure viewer"]')?.textContent.includes('Could not display 2.cif')`);
  const errorState = await window.webContents.executeJavaScript(`({
    message: Array.from(document.querySelectorAll('[aria-label="Crystal structure viewer"] strong'))
      .find(node => node.textContent === 'Could not display 2.cif')?.nextElementSibling?.textContent,
    enabledModelControls: Array.from(document.querySelectorAll('[aria-label="Crystal structure viewer"] button'))
      .filter(button => ['Atoms', 'Ball + stick', 'Space fill'].includes(button.textContent.trim()) && !button.disabled).length
  })`);
  assert.equal(errorState.message, 'JSmol could not load this CIF.');
  assert.equal(errorState.enabledModelControls, 0, 'Model controls must stay disabled after a failed load');
  await window.webContents.executeJavaScript(`document.querySelector('tr[data-entry-id="1"]').click(); true`);
  await waitFor(window, `document.querySelector('[aria-label="Crystal structure viewer"] strong')?.textContent === '1.cif'`);
  console.log('✓ failed CIF load reports the selected file, disables controls, and recovers on the next selection');
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
  const compactBounds = await window.webContents.executeJavaScript(`(()=>{const r=document.querySelector('[data-testid="jsmol-host"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),frankX:Math.round(r.right-20),frankY:Math.round(r.bottom-8)};})()`);
  for (const event of [{button:'right',x:compactBounds.x,y:compactBounds.y},{button:'left',modifiers:['control'],x:compactBounds.x,y:compactBounds.y},{button:'left',x:compactBounds.frankX,y:compactBounds.frankY}]) {
    window.webContents.sendInputEvent({type:'mouseDown',clickCount:1,...event});
    await pause(80);
    window.webContents.sendInputEvent({type:'mouseUp',clickCount:1,...event});
    await pause(200);
    assert.equal(await window.webContents.executeJavaScript(`Array.from(document.querySelectorAll('[role=menu],[id*=PopupMenu],[class*=jmolPopup]')).some(e=>e.getBoundingClientRect().width>0)`),false);
  }
  assert.equal(await window.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Crystallographic orientation axes"]')`),true);
  await require('./viewer-lifecycle-regressions.cjs')(window, representativeCif, pause);
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
