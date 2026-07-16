const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const testUrl = process.env.CIF_UI_TEST_URL;
if (!testUrl) throw new Error('CIF_UI_TEST_URL is required.');

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function measure(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const fieldset = document.querySelector('fieldset');
      if (!dialog || !fieldset) return { found: false };

      const dialogRect = dialog.getBoundingClientRect();
      const controls = Array.from(dialog.querySelectorAll('button, input, select, fieldset, table'));
      const outsideControls = controls.filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left < dialogRect.left ||
          rect.right > dialogRect.right ||
          rect.top < dialogRect.top ||
          rect.bottom > dialogRect.bottom
        );
      });
      const axisGroups = Array.from(fieldset.querySelectorAll(':scope > div > div'));
      const axisRows = new Set(
        axisGroups.map((element) => Math.round(element.getBoundingClientRect().top))
      ).size;
      const restraintsPanel = dialog.querySelector('[aria-live="polite"]');
      const formColumn = fieldset.parentElement;
      const elementBox1 = dialog.querySelector('#quick-search-elements-1')?.getBoundingClientRect();
      const elementBox3 = dialog.querySelector('#quick-search-elements-3')?.getBoundingClientRect();
      const elementBox4 = dialog.querySelector('#quick-search-elements-4')?.getBoundingClientRect();
      const elementLabel3 = dialog.querySelector('label[for="quick-search-elements-3"]')?.getBoundingClientRect();

      return {
        found: true,
        elementBoxVerticalGap: elementBox3 && elementBox4 ? Math.round(elementBox4.top - elementBox3.bottom) : null,
        elementBoxWidthDifference: elementBox1 && elementBox3 ? Math.round(Math.abs(elementBox1.width - elementBox3.width)) : null,
        shortElementLabelGap: elementBox3 && elementLabel3 ? Math.round(elementBox3.left - elementLabel3.right) : null,
        viewport: { width: innerWidth, height: innerHeight },
        dialogInsideViewport:
          dialogRect.left >= 0 &&
          dialogRect.right <= innerWidth &&
          dialogRect.top >= 0 &&
          dialogRect.bottom <= innerHeight,
        dialogScrollable:
          dialog.scrollWidth > dialog.clientWidth || dialog.scrollHeight > dialog.clientHeight,
        pageScrollable:
          document.documentElement.scrollWidth > innerWidth ||
          document.documentElement.scrollHeight > innerHeight,
        outsideControlCount: outsideControls.length,
        axisRows,
        restraintsHeight: restraintsPanel
          ? Math.round(restraintsPanel.getBoundingClientRect().height)
          : null,
        formRowGap: formColumn ? getComputedStyle(formColumn).rowGap : null
      };
    })()
  `);
}

async function runScenario(window, scenario) {
  window.webContents.setZoomFactor(scenario.zoom);
  window.setContentSize(scenario.width, scenario.height);
  await pause(100);

  const result = await measure(window);
  assert.equal(result.found, true, `${scenario.name}: dialog did not render`);
  assert.equal(result.dialogInsideViewport, true, `${scenario.name}: dialog left the viewport`);
  assert.equal(result.dialogScrollable, false, `${scenario.name}: dialog became scrollable`);
  assert.equal(result.pageScrollable, false, `${scenario.name}: page became scrollable`);
  assert.equal(result.outsideControlCount, 0, `${scenario.name}: controls left the dialog`);
  assert.equal(result.elementBoxVerticalGap, 2, `${scenario.name}: element boxes 3 and 4 have uneven spacing`);
  assert.equal(result.elementBoxWidthDifference, 0, `${scenario.name}: element boxes have unequal widths`);
  assert.equal(result.shortElementLabelGap, 6, `${scenario.name}: short element labels have excessive horizontal spacing`);
  if (scenario.expectedAxisRows) {
    assert.equal(result.axisRows, scenario.expectedAxisRows, `${scenario.name}: unexpected cell-length wrapping`);
  }
  assert.equal(result.restraintsHeight, 120, `${scenario.name}: restraints panel is not 120px tall`);

  console.log(
    `✓ ${scenario.name} (${result.viewport.width}x${result.viewport.height}, zoom ${scenario.zoom},` +
      ` restraints ${result.restraintsHeight}px, form row gap ${result.formRowGap})`
  );
}

async function testCyclingElementBoxFlow(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      document.querySelector('#quick-search-elements-3').click();
    })()
  `);
  await pause(50);
  await window.webContents.executeJavaScript(`
    (() => {
      document.querySelector('[aria-label="Not equal element group 3"]').click();
    })()
  `);
  await pause(50);
  await window.webContents.executeJavaScript(`
    (() => {
      document.querySelector('[aria-label="Group 16"]').click();
      document.querySelector('[aria-label^="Fe, atomic number"]').click();
    })()
  `);
  await pause(50);
  const result = await window.webContents.executeJavaScript(`
    (() => ({
      box1: document.querySelector('#quick-search-elements-1').value,
      box3: document.querySelector('#quick-search-elements-3').value,
      box4Active: document.querySelector('#quick-search-elements-4').getAttribute('aria-current'),
      elementLabels: Array.from(document.querySelectorAll('.quick-search-element-groups label')).map((label) => label.textContent),
      notEqualPressed: document.querySelector('[aria-label="Not equal element group 3"]').getAttribute('aria-pressed'),
      notEqualButtonCount: document.querySelectorAll('[aria-label^="Not equal element group "]').length,
      removeButtonCount: document.querySelectorAll('[aria-label^="Clear element group "]').length,
      combineControlsRemoved: document.querySelector('#quick-search-combine-label') === null,
      group16Pressed: document.querySelector('[aria-label="Group 16"]').getAttribute('aria-pressed')
    }))()
  `);
  assert.equal(result.box1, '', 'active-box flow unexpectedly changed element box 1');
  assert.equal(result.box3, 'NOT(Fe OR Group 16)', 'not-equal selection was not shown in element box 3');
  assert.equal(result.box4Active, 'true', 'element click did not advance to element box 4');
  assert.deepEqual(result.elementLabels, ['AND:', 'AND:', 'AND:', 'AND:']);
  assert.equal(result.notEqualPressed, 'true', 'not-equal control did not remain selected');
  assert.equal(result.notEqualButtonCount, 4, 'not every element textbox has an NE button');
  assert.equal(result.removeButtonCount, 4, 'not every element textbox has a Remove button');
  assert.equal(result.combineControlsRemoved, true, 'obsolete AND/OR controls are still rendered');
  assert.equal(result.group16Pressed, 'false', 'periodic table did not switch to the next box');
  console.log('✓ cycling element-box selection flow');
}

async function testTextboxActions(window) {
  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('#quick-search-reference');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Journal');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[aria-label="Not equal reference"]').click();
    })()
  `);
  await pause(50);
  const result = await window.webContents.executeJavaScript(`
    (() => ({
        genericNotEqualButtons: ['number of elements', 'space group number', 'space group', 'reference']
          .every((name) => document.querySelector('[aria-label="Not equal ' + name + '"]')),
        genericRemoveButtons: ['number of elements', 'space group number', 'space group', 'reference']
          .every((name) => document.querySelector('[aria-label="Clear ' + name + '"]')),
        cellLengthActionButtons: document.querySelectorAll('.quick-search-range-group .quick-search-ne, .quick-search-range-group .quick-search-clear').length,
        referencePressed: document.querySelector('[aria-label="Not equal reference"]').getAttribute('aria-pressed'),
        visibleNotPrefix: document.querySelector('#quick-search-reference').parentElement.querySelector('.quick-search-not-prefix')?.textContent
      }))()
  `);
  assert.equal(result.genericNotEqualButtons, true, 'a non-cell-length textbox is missing its NE button');
  assert.equal(result.genericRemoveButtons, true, 'a non-cell-length textbox is missing its Remove button');
  assert.equal(result.cellLengthActionButtons, 0, 'cell-length textboxes unexpectedly received action buttons');
  assert.equal(result.referencePressed, 'true', 'reference NE button did not activate');
  assert.equal(result.visibleNotPrefix, "NOT('", 'negated textbox does not display its NOT wrapper');

  await window.webContents.executeJavaScript(`document.querySelector('[aria-label="Clear reference"]').click()`);
  await pause(50);
  const cleared = await window.webContents.executeJavaScript(`({
    value: document.querySelector('#quick-search-reference').value,
    pressed: document.querySelector('[aria-label="Not equal reference"]').getAttribute('aria-pressed')
  })`);
  assert.equal(cleared.value, '', 'Remove button did not clear its textbox');
  assert.equal(cleared.pressed, 'false', 'Remove button did not reset the textbox NE state');
  console.log('✓ every non-cell-length textbox has independent NE and Remove controls');
}

async function testAngstromCellLengths(window) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const grid = document.querySelector('[data-testid="data-grid-scroll"]');
      const firstRow = grid.querySelector('tbody tr[data-entry-id]');
      return {
        headers: Array.from(grid.querySelectorAll('thead th')).slice(1, 4).map((cell) => cell.textContent.trim()),
        values: Array.from(firstRow.querySelectorAll('td')).slice(1, 4).map((cell) => cell.textContent.trim()),
        searchLegend: Array.from(document.querySelectorAll('legend')).find((legend) => legend.textContent.includes('Cell lengths'))?.textContent
      };
    })()
  `);
  assert.deepEqual(result.headers, ['a [Å]', 'b [Å]', 'c [Å]']);
  assert.deepEqual(result.values, ['1.0000', '2.0000', '3.0000']);
  assert.equal(result.searchLegend, 'Cell lengths [Å]');
  console.log('✓ angstrom cell-length headers, values, and search units');
}

async function testCompoundInformationSelection(window) {
  const initial = await window.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('[data-testid="compound-info-panel"]');
      const separator = document.querySelector('[role="separator"][aria-orientation="horizontal"]');
      const grid = document.querySelector('[data-testid="data-grid-scroll"]');
      const rows = document.querySelectorAll('[data-testid="data-grid-scroll"] tbody tr[data-entry-id]');
      const headings = Array.from(panel.querySelectorAll('[data-testid="atom-sites-table"] thead th')).map((cell) => cell.textContent.trim());
      const values = Array.from(panel.querySelectorAll('[data-testid="atom-sites-table"] tbody tr:first-child td')).map((cell) => cell.textContent.trim());
      const metadata = Array.from(panel.querySelectorAll('[data-testid="compound-sample-metadata"] tr')).map((row) => ({
        label: row.querySelector('th').textContent.trim(),
        value: row.querySelector('td').textContent.trim()
      }));
      const cellParameters = {
        headings: Array.from(panel.querySelectorAll('[data-testid="cell-parameters-table"] thead th')).map((cell) => cell.textContent.trim()),
        values: Array.from(panel.querySelectorAll('[data-testid="cell-parameters-table"] tbody td')).map((cell) => cell.textContent.trim())
      };
      rows[1]?.click();
      return {
        headings,
        values,
        metadata,
        cellParameters,
        gridOverflowY: getComputedStyle(grid).overflowY,
        panelOverflowY: getComputedStyle(panel).overflowY,
        hasSeparator: Boolean(separator)
      };
    })()
  `);
  assert.deepEqual(initial.headings, ['Elements', 'Site', 'Wyck.', 'x', 'y', 'z', 'Occ.']);
  assert.deepEqual(initial.values, ['Sb', 'Sb1', '4c', '0.0286', '0.25', '0.394', '1']);
  assert.deepEqual(initial.metadata, [
    { label: 'Sample', value: 'Sample crystal' },
    { label: 'Color', value: 'gray steel' },
    { label: 'Unit-cell volume [Å³]', value: '6' }
  ]);
  assert.deepEqual(initial.cellParameters, {
    headings: ['a [Å]', 'b [Å]', 'c [Å]', 'α [°]', 'β [°]', 'γ [°]'],
    values: ['1.0000', '2.0000', '3.0000', '90', '90', '90']
  });
  assert.equal(initial.gridOverflowY, 'scroll', 'results grid does not own its vertical scrollbar');
  assert.equal(initial.panelOverflowY, 'scroll', 'information panel does not own its vertical scrollbar');
  assert.equal(initial.hasSeparator, true, 'resizable results separator is missing');
  await pause(50);
  const selectedSite = await window.webContents.executeJavaScript(`
    document.querySelector('[data-testid="atom-sites-table"] tbody tr:first-child td:nth-child(2)')?.textContent.trim()
  `);
  assert.equal(selectedSite, 'Sb2', 'information panel did not follow the selected row');
  console.log('✓ compound information follows result selection');
}

async function testLargeGridVirtualization(window) {
  const before = await window.webContents.executeJavaScript(`
    (() => {
      const grid = document.querySelector('[data-testid="data-grid-scroll"]');
      const rows = Array.from(grid.querySelectorAll('tbody tr[data-entry-id]'));
      return {
        renderedRows: rows.length,
        firstId: Number(rows[0]?.getAttribute('data-entry-id')),
        scrollable: grid.scrollHeight > grid.clientHeight
      };
    })()
  `);
  assert.equal(before.scrollable, true, '10,000-row grid is not scrollable');
  assert.ok(before.renderedRows < 100, `grid rendered ${before.renderedRows} rows at once`);
  assert.equal(before.firstId, 1, 'grid did not begin with the first entry');

  await window.webContents.executeJavaScript(`
    (() => {
      const grid = document.querySelector('[data-testid="data-grid-scroll"]');
      grid.scrollTop = grid.scrollHeight * 0.9;
      grid.dispatchEvent(new Event('scroll', { bubbles: true }));
    })()
  `);
  await pause(100);

  const after = await window.webContents.executeJavaScript(`
    (() => {
      const rows = Array.from(
        document.querySelectorAll('[data-testid="data-grid-scroll"] tbody tr[data-entry-id]')
      );
      return {
        renderedRows: rows.length,
        firstId: Number(rows[0]?.getAttribute('data-entry-id')),
        lastId: Number(rows.at(-1)?.getAttribute('data-entry-id')),
        scrollTop: document.querySelector('[data-testid="data-grid-scroll"]').scrollTop,
        scrollHeight: document.querySelector('[data-testid="data-grid-scroll"]').scrollHeight
      };
    })()
  `);
  assert.ok(after.renderedRows < 100, `deep scroll rendered ${after.renderedRows} rows at once`);
  assert.ok(
    after.firstId > 8_000,
    `deep scroll stopped near entry ${after.firstId} (scrollTop ${after.scrollTop}/${after.scrollHeight})`
  );
  assert.ok(after.lastId > after.firstId, 'deep-scroll virtual window is empty');
  console.log(`✓ 10,000-row grid virtualization (${after.renderedRows} DOM rows near entry ${after.firstId})`);
}

async function testImportProgressIndicator(window) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const indicator = document.querySelector('[data-testid="import-progress"]');
      const progress = indicator?.querySelector('progress');
      return {
        label: indicator?.getAttribute('aria-label'),
        text: indicator?.textContent,
        value: progress?.value,
        max: progress?.max
      };
    })()
  `);
  assert.equal(result.label, 'Import progress: 800 of 1000 files processed');
  assert.match(result.text, /90 imported, 700 unchanged, 10 failed/);
  assert.equal(result.value, 800);
  assert.equal(result.max, 1000);
  console.log('✓ import progress indicator counts and accessibility label');
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    useContentSize: true,
    backgroundColor: '#f3f3f3',
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  await window.loadURL(testUrl);
  await runScenario(window, {
    name: 'minimum application viewport',
    width: 1100,
    height: 650,
    zoom: 1,
    expectedAxisRows: 2
  });
  await runScenario(window, {
    name: 'default application viewport',
    width: 1200,
    height: 800,
    zoom: 1,
    expectedAxisRows: 2
  });
  await runScenario(window, {
    name: 'narrow viewport wrapping',
    width: 900,
    height: 800,
    zoom: 1,
    expectedAxisRows: 2
  });
  await runScenario(window, {
    name: '125 percent zoom at default size',
    width: 1200,
    height: 800,
    zoom: 1.25,
    expectedAxisRows: 2
  });
  await testCyclingElementBoxFlow(window);
  await testTextboxActions(window);
  await testAngstromCellLengths(window);
  await testCompoundInformationSelection(window);
  await testLargeGridVirtualization(window);
  await testImportProgressIndicator(window);

  window.destroy();
}

app.whenReady().then(run).then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  }
);

