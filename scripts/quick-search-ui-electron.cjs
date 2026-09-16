const assert = require('node:assert/strict');
const { app, BrowserWindow } = require('electron');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
app.setPath('userData', mkdtempSync(join(tmpdir(), 'cif-ui-tests-')));

app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const testUrl = process.env.CIF_UI_TEST_URL;
if (!testUrl) throw new Error('CIF_UI_TEST_URL is required.');

const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForRenderer(window, expression, description) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(expression)) return;
    await pause(50);
  }
  throw new Error('Timed out waiting for ' + description);
}

async function measure(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const dialog = document.querySelector('[role="dialog"]');
      const fieldset = document.querySelector('fieldset');
      if (!dialog || !fieldset) return { found: false };

      const dialogRect = dialog.getBoundingClientRect();
      const controls = Array.from(dialog.querySelectorAll('button, input, select, fieldset, table'));
      const scrollContent = dialog.querySelector('.quick-search-content');
      const outsideControls = controls.filter((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left < dialogRect.left ||
          rect.right > dialogRect.right ||
          ((!scrollContent?.contains(element) || scrollContent.scrollHeight <= scrollContent.clientHeight) && (rect.top < dialogRect.top || rect.bottom > dialogRect.bottom))
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
        outsideControls: outsideControls.map(e => ({tag:e.tagName, text:e.textContent.slice(0,50), rect: e.getBoundingClientRect().toJSON()})),
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

  // Wait for Chromium's viewport and zoom changes, not native hidden-window bounds.
  for (let attempt = 0; attempt < 30; attempt++) {
    const width = await window.webContents.executeJavaScript('innerWidth');
    if (Math.abs(width - scenario.width / scenario.zoom) <= 1) break;
    await pause(50);
  }
  const result = await measure(window);
  assert.ok(Math.abs(result.viewport.width - scenario.width / scenario.zoom) <= 1, 'test viewport did not reach requested width');
  const inaccessible = await window.webContents.executeJavaScript(
    "(() => { const c = document.querySelector('.quick-search-content'); const saved = c.scrollTop; const bad = []; for (const e of c.querySelectorAll('input, select, button')) { e.scrollIntoView({block:'nearest'}); const r=e.getBoundingClientRect(), p=c.getBoundingClientRect(); if(r.top < p.top-1 || r.bottom > p.bottom+1) bad.push(e.id || e.textContent); } c.scrollTop=saved; return bad; })()"
  );
  assert.deepEqual(inaccessible, [], 'search controls must remain reachable by scrolling');
  assert.equal(result.found, true, `${scenario.name}: dialog did not render`);
  assert.equal(result.dialogInsideViewport, true, `${scenario.name}: dialog left the viewport`);
  assert.equal(result.dialogScrollable, false, `${scenario.name}: dialog became scrollable`);
  assert.equal(result.pageScrollable, false, `${scenario.name}: page became scrollable`);
  assert.equal(result.outsideControlCount, 0, `${scenario.name}: controls left the dialog: ${JSON.stringify(result.outsideControls)}`);
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
      notEqualSymbol: document.querySelector('[aria-label="Not equal element group 3"] .quick-search-ne-icon')?.textContent,
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
  assert.equal(result.notEqualSymbol, '≠', 'not-equal control does not display the native symbol');
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
        sgNumber: firstRow.querySelectorAll('td')[4]?.textContent.trim(),
        reference: firstRow.querySelectorAll('td')[6]?.textContent.trim(),
        referenceIsLinked: Boolean(firstRow.querySelectorAll('td')[6]?.querySelector('button, a')),
        searchLegend: Array.from(document.querySelectorAll('legend')).find((legend) => legend.textContent.includes('Cell lengths'))?.textContent
      };
    })()
  `);
  assert.deepEqual(result.headers, ['a [Å]', 'b [Å]', 'c [Å]']);
  assert.deepEqual(result.values, ['1.0000', '2.0000', '3.0000']);
  assert.equal(result.sgNumber, '1', 'SG-number column did not render the stored number');
  assert.equal(result.reference, 'Reference 1', 'Reference column did not render the bibliography text');
  assert.equal(result.referenceIsLinked, false, 'Reference column should not contain a publication link');
  assert.equal(result.searchLegend, 'Cell lengths [Å]');
  console.log('✓ angstrom cell-length headers, values, and search units');
}

async function testCompoundInformationSelection(window) {
  const initial = await window.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('[data-testid="compound-info-panel"]');
      const separator = document.querySelector('[role="separator"][aria-orientation="horizontal"]');
      const columnSeparator = document.querySelector('[role="separator"][aria-label="Resize compound information and visual panels"]');
      const viewerSeparator = document.querySelector('[role="separator"][aria-label="Resize crystal viewer and lower visual panel"]');
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
      const coordinateHeadingStyles = Array.from(panel.querySelectorAll('[data-testid="atom-sites-table"] thead th'))
        .slice(3, 6)
        .map((cell) => getComputedStyle(cell).fontStyle);
      const wyckoffCell = panel.querySelector('[data-testid="atom-sites-table"] tbody tr:first-child td:nth-child(3)');
      rows[1]?.click();
      return {
        headings,
        values,
        metadata,
        cellParameters,
        formula: grid.querySelector('tbody tr[data-entry-id] td:first-child')?.textContent.trim(),
        coordinateHeadingStyles,
        wyckoffText: wyckoffCell?.textContent.trim(),
        wyckoffLetterStyle: wyckoffCell?.querySelector('span') ? getComputedStyle(wyckoffCell.querySelector('span')).fontStyle : null,
        wyckoffNumberOutsideItalicSpan: wyckoffCell?.firstChild?.textContent,
        gridOverflowY: getComputedStyle(grid).overflowY,
        panelOverflowY: getComputedStyle(panel).overflowY,
        hasSeparator: Boolean(separator),
        hasColumnSeparator: Boolean(columnSeparator),
        hasViewerSeparator: Boolean(viewerSeparator)
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
    headings: ['α [°]', 'β [°]', 'γ [°]'],
    values: ['90', '90', '90']
  });
  assert.equal(initial.formula, 'FeO', 'formula displays a subscript when stoichiometry is exactly one');
  assert.deepEqual(initial.coordinateHeadingStyles, ['italic', 'italic', 'italic']);
  assert.equal(initial.wyckoffText, '4c');
  assert.equal(initial.wyckoffLetterStyle, 'italic');
  assert.equal(initial.wyckoffNumberOutsideItalicSpan, '4');
  assert.equal(initial.gridOverflowY, 'scroll', 'results grid does not own its vertical scrollbar');
  assert.equal(initial.panelOverflowY, 'scroll', 'information panel does not own its vertical scrollbar');
  assert.equal(initial.hasSeparator, true, 'resizable results separator is missing');
  assert.equal(initial.hasColumnSeparator, true, 'resizable information/viewer separator is missing');
  assert.equal(initial.hasViewerSeparator, true, 'resizable viewer/lower-panel separator is missing');
  const resizeBefore = await window.webContents.executeJavaScript(`
    (() => {
      const info = document.querySelector('[data-testid="compound-info-panel"]').getBoundingClientRect();
      const viewer = document.querySelector('[aria-label="Crystal structure viewer"]').getBoundingClientRect();
      const column = document.querySelector('[aria-label="Resize compound information and visual panels"]').getBoundingClientRect();
      const row = document.querySelector('[aria-label="Resize crystal viewer and lower visual panel"]').getBoundingClientRect();
      return {
        infoWidth: info.width,
        viewerHeight: viewer.height,
        column: { x: Math.round(column.x + column.width / 2), y: Math.round(column.y + column.height / 2) },
        row: { x: Math.round(row.x + row.width / 2), y: Math.round(row.y + row.height / 2) }
      };
    })()
  `);
  await window.webContents.executeJavaScript(`
    (() => {
      const separator = document.querySelector('[aria-label="Resize compound information and visual panels"]');
      separator.setPointerCapture = () => undefined;
      separator.hasPointerCapture = () => false;
      separator.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: ${resizeBefore.column.x}, clientY: ${resizeBefore.column.y} }));
      separator.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: ${resizeBefore.column.x + 30}, clientY: ${resizeBefore.column.y} }));
      separator.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: ${resizeBefore.column.x + 30}, clientY: ${resizeBefore.column.y} }));
    })()
  `);
  await pause(50);
  await window.webContents.executeJavaScript(`
    (() => {
      const separator = document.querySelector('[aria-label="Resize crystal viewer and lower visual panel"]');
      separator.setPointerCapture = () => undefined;
      separator.hasPointerCapture = () => false;
      separator.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: ${resizeBefore.row.x}, clientY: ${resizeBefore.row.y} }));
      separator.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 2, clientX: ${resizeBefore.row.x}, clientY: ${resizeBefore.row.y + 20} }));
      separator.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2, clientX: ${resizeBefore.row.x}, clientY: ${resizeBefore.row.y + 20} }));
    })()
  `);
  await pause(100);
  const resizeAfter = await window.webContents.executeJavaScript(`({
    infoWidth: document.querySelector('[data-testid="compound-info-panel"]').getBoundingClientRect().width,
    viewerHeight: document.querySelector('[aria-label="Crystal structure viewer"]').getBoundingClientRect().height
  })`);
  assert.ok(resizeAfter.infoWidth > resizeBefore.infoWidth + 20, 'information/viewer divider did not resize its columns');
  assert.ok(resizeAfter.viewerHeight > resizeBefore.viewerHeight + 10, 'viewer/lower-panel divider did not resize its rows');
  await pause(50);
  const selected = await window.webContents.executeJavaScript(`
    (() => {
      const panel = document.querySelector('[data-testid="compound-info-panel"]');
      const publicationRows = panel.querySelector('[data-testid="publication-table"] > tbody').children;
      return {
        site: document.querySelector('[data-testid="atom-sites-table"] tbody tr:first-child td:nth-child(2)')?.textContent.trim(),
        publication: Array.from(publicationRows).map((row) => ({
          label: row.querySelector('th').textContent.trim(),
          value: row.querySelector('td').textContent.trim()
        })),
        authorHeadings: Array.from(panel.querySelectorAll('[data-testid="publication-authors"] thead th'))
          .map((cell) => cell.textContent.trim()),
        authors: Array.from(panel.querySelectorAll('[data-testid="publication-authors"] tbody tr')).map((row) =>
          Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent.trim())
        ),
        pxrdLabel: document.querySelector('[data-testid="pxrd-pattern"] svg')?.getAttribute('aria-label'),
        hasPxrdProfile: Boolean(document.querySelector('[data-testid="pxrd-pattern"] svg path[data-role="pxrd-profile"]')),
        pxrdProfilePath: document.querySelector('[data-testid="pxrd-pattern"] svg path[data-role="pxrd-profile"]')?.getAttribute('d'),
        pxrdFwhm: Number(document.querySelector('[data-testid="pxrd-fwhm-input"]')?.value),
        pxrdToolbarBottom: document.querySelector('[data-testid="pxrd-toolbar"]')?.getBoundingClientRect().bottom,
        pxrdChartTop: document.querySelector('[data-testid="pxrd-chart"]')?.getBoundingClientRect().top
      };
    })()
  `);
  assert.equal(selected.site, 'Sb2', 'information panel did not follow the selected row');
  assert.deepEqual(selected.publication.slice(0, 3), [
    { label: 'Reference', value: 'Reference 2' },
    { label: 'Publication link', value: 'Synthetic structure report 2' },
    { label: 'Language', value: 'English' }
  ]);
  assert.equal(selected.publication[3]?.label, 'Publication authors');
  assert.deepEqual(selected.authorHeadings, ['Name', 'Organization / City']);
  assert.deepEqual(selected.authors, [
    ['Doe, J.', 'Department of Chemistry, Example University, Springfield'],
    ['Roe, A.', '']
  ]);
  await window.webContents.executeJavaScript(`
    (() => {
      window.__publicationLookup = null;
      window.__publicationDestination = null;
      window.cifApi.resolvePublication = async (request) => {
        window.__publicationLookup = request;
        return { status: 'verified', doi: '10.1000/verified', url: 'https://doi.org/10.1000/verified' };
      };
      window.cifApi.openExternal = async (url) => { window.__publicationDestination = url; };
      const rows = document.querySelector('[data-testid="publication-table"] > tbody').children;
      rows[1].querySelector('button').click();
    })()
  `);
  await pause(100);
  const publicationResolution = await window.webContents.executeJavaScript(`({
    lookup: window.__publicationLookup,
    destination: window.__publicationDestination
  })`);
  assert.deepEqual(publicationResolution.lookup, {
    title: 'Synthetic structure report 2',
    reference: 'Reference 2',
    authors: ['Doe, J.', 'Roe, A.']
  });
  assert.equal(publicationResolution.destination, 'https://doi.org/10.1000/verified');
  assert.match(selected.pxrdLabel ?? '', /Simulated PXRD pattern with \d+ reflections/);
  assert.ok(selected.hasPxrdProfile, 'simulated PXRD profile did not render');
  assert.equal(selected.pxrdFwhm, 0.1, 'simulated PXRD profile did not use the default FWHM');
  assert.ok(selected.pxrdToolbarBottom <= selected.pxrdChartTop + 0.5, 'PXRD controls overlap the graph');
  await window.webContents.executeJavaScript(`
    (() => {
      const input = document.querySelector('[data-testid="pxrd-fwhm-input"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, '0.2');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()
  `);
  await pause(50);
  const updatedPxrd = await window.webContents.executeJavaScript(`({
    fwhm: Number(document.querySelector('[data-testid="pxrd-fwhm-input"]')?.value),
    path: document.querySelector('[data-testid="pxrd-pattern"] svg path[data-role="pxrd-profile"]')?.getAttribute('d')
  })`);
  assert.equal(updatedPxrd.fwhm, 0.2, 'PXRD FWHM control did not accept a custom value');
  assert.notEqual(updatedPxrd.path, selected.pxrdProfilePath, 'PXRD profile did not respond to the custom FWHM');
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-role="pxrd-peak-hit-target"]')
      ?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })); true
  `);
  await pause(50);
  const peakTooltip = await window.webContents.executeJavaScript(`
    (() => {
      const tooltip = document.querySelector('[data-testid="pxrd-hover-label"]');
      return tooltip ? { text: tooltip.textContent, fontSize: parseFloat(getComputedStyle(tooltip).fontSize) } : null;
    })()
  `);
  assert.ok(peakTooltip, 'PXRD peak hover annotation did not appear');
  assert.match(peakTooltip.text, /2θ\s*=.*h,k,l\s*=/);
  assert.ok(peakTooltip.fontSize >= 13, 'PXRD peak hover annotation is too small to read');
  for (const delta of [0, 90, -45]) {
    await window.webContents.executeJavaScript(
      "(() => { const chart = document.querySelector('[data-testid=pxrd-chart]'); chart.style.height = (210 + " + delta + ") + 'px'; chart.style.flex = 'none'; })()"
    );
    await pause(100);
    const geometry = await window.webContents.executeJavaScript(
      "(() => { const chart = document.querySelector('[data-testid=pxrd-chart]'); const svg = chart.querySelector('svg'); const text = Array.from(svg.querySelectorAll('text')).map(t => { const m = t.getScreenCTM(); return [Math.hypot(m.a,m.b), Math.hypot(m.c,m.d)]; }); const handles = document.querySelectorAll('[data-resize-handle]'); const details = document.querySelector('[data-testid=compound-info-panel]'); const viewer = document.querySelector('[aria-label=\"Crystal structure viewer\"]'); const grid = document.querySelector('[data-testid=data-grid-scroll]'); return {text, horizontalGap: handles[0].getBoundingClientRect().top - grid.getBoundingClientRect().bottom, verticalGap: viewer.getBoundingClientRect().left - handles[1].getBoundingClientRect().right}; })()"
    );
    for (const [sx, sy] of geometry.text) {
      assert.ok(Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01, 'PXRD text was stretched or scaled');
    }
    assert.ok(Math.abs(geometry.horizontalGap) < 1, 'dead space above horizontal divider');
    assert.ok(Math.abs(geometry.verticalGap) < 1, 'dead space beside vertical divider');
  }
  await window.webContents.executeJavaScript("document.querySelector('[data-testid=pxrd-chart]').removeAttribute('style')");
  console.log('✓ compound information follows result selection; dividers are flush and PXRD text stays unscaled');
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
  assert.match(result.text, /90 structures imported, 700 unchanged, 10 failed/);
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

  window.webContents.on('console-message', (details) => {
    if (details.level === 'error') console.error('Renderer:', details.message);
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
  window.webContents.setZoomFactor(1);
  window.setContentSize(1200, 800);
  await pause(100);
  await testCyclingElementBoxFlow(window);
  await testTextboxActions(window);
  await testAngstromCellLengths(window);
  await testCompoundInformationSelection(window);
  await testLargeGridVirtualization(window);
  await testImportProgressIndicator(window);

  await require('./quick-search-lifecycle.cjs')(window, testUrl, waitForRenderer);

  await window.loadURL(testUrl + '?app-regression');
  await pause(300);
  const clickButton = async (text) => {
    await window.webContents.executeJavaScript(`(() => { const button = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(${JSON.stringify(text)})); button.focus(); button.click(); })()`);
    await pause(100);
  };
  const search = async () => {
    await clickButton('Quick search');
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('#quick-search-space-group-number');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '1');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await pause(100);
    await clickButton('Search!');
  };
  const scrollToEnd = async () => {
    await window.webContents.executeJavaScript(`(() => {
      const scroller = document.querySelector('table').parentElement;
      scroller.scrollTop = scroller.scrollHeight;
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
    })()`);
    await pause(100);
  };
  await search();
  await scrollToEnd();
  assert.equal(await window.webContents.executeJavaScript('window.appRegression.pending.length'), 1);
  await clickButton('Reset search');
  await window.webContents.executeJavaScript('window.appRegression.pending.shift()()');
  await search();
  await scrollToEnd();
  assert.equal(await window.webContents.executeJavaScript('window.appRegression.pending.length'), 1,
    'resetting an in-flight page must not block pagination in a new search');
  // Replace the search while its second page remains pending, then release the stale page.
  await search();
  await window.webContents.executeJavaScript('window.appRegression.pending.shift()()');
  await pause(100);
  await scrollToEnd();
  assert.equal(await window.webContents.executeJavaScript('window.appRegression.pending.length'), 1);
  await window.webContents.executeJavaScript('window.appRegression.pending.shift()()');
  await pause(100);
  for (let index = 0; index < 3; index++) {
    await window.webContents.executeJavaScript(`document.querySelector('th').click()`);
    await pause(100);
  }
  const sortRequests = await window.webContents.executeJavaScript('window.appRegression.requests.filter(r => r.offset === 0).slice(-3).map(r => [r.sortColumn ?? null, r.sortDirection ?? null])');
  assert.deepEqual(sortRequests, [['formula', 'asc'], ['formula', 'desc'], [null, null]],
    'third header click must reset the database ordering');
  console.log('✓ interrupted pagination recovers and clearing sorting resets the database order');

  await window.webContents.executeJavaScript("(() => { const scroller = document.querySelector('[data-testid=data-grid-scroll]'); scroller.scrollTop = 0; scroller.dispatchEvent(new Event('scroll', { bubbles: true })); })()");
  await waitForRenderer(window, "document.querySelector('tr[data-entry-id]')?.dataset.entryId === '1'", 'the first virtual row after scrolling to the top');
  await window.webContents.executeJavaScript("document.querySelector('tr[data-entry-id]').click()");
  await waitForRenderer(window, "!!document.querySelector('tr[aria-selected=true]')", 'the clicked row to be selected');
  const firstSelected = await window.webContents.executeJavaScript("document.querySelector('tr[aria-selected=true]').dataset.entryId");
  await window.webContents.executeJavaScript("document.querySelector('[data-testid=data-grid-scroll]').focus()");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'DOWN' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'DOWN' });
  await pause(100);
  assert.notEqual(await window.webContents.executeJavaScript("document.querySelector('tr[aria-selected=true]').dataset.entryId"), firstSelected);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'UP' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'UP' });
  await pause(100);
  assert.equal(await window.webContents.executeJavaScript("document.querySelector('tr[aria-selected=true]').dataset.entryId"), firstSelected);
  for (let index = 0; index < 3; index++) {
    const before = await window.webContents.executeJavaScript(
      "(() => { const e = document.querySelectorAll('[data-resize-handle]')[" + index + "]; e.focus(); const r = e.getBoundingClientRect(); return e.getAttribute('aria-orientation') === 'vertical' ? r.x : r.y; })()"
    );
    const key = index === 1 ? 'RIGHT' : 'DOWN';
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: key });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: key });
    await pause(100);
    const after = await window.webContents.executeJavaScript(
      "(() => { const e = document.querySelectorAll('[data-resize-handle]')[" + index + "]; const r = e.getBoundingClientRect(); return e.getAttribute('aria-orientation') === 'vertical' ? r.x : r.y; })()"
    );
    assert.ok(after > before + 5, 'keyboard did not move divider ' + index);
    window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'RETURN' });
    window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'RETURN' });
    await pause(100);
  }
  await clickButton('About');
  assert.equal(await window.webContents.executeJavaScript("document.activeElement.getAttribute('aria-labelledby')"), 'about-title');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'TAB', modifiers: ['shift'] });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'TAB', modifiers: ['shift'] });
  await pause(50);
  assert.equal(await window.webContents.executeJavaScript('document.activeElement.textContent'), 'Close');
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'ESCAPE' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'ESCAPE' });
  await pause(50);
  assert.ok(await window.webContents.executeJavaScript("document.activeElement.textContent.includes('About')"));
  await window.webContents.executeJavaScript("document.querySelectorAll('[data-resize-handle]')[1].focus()");
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'RIGHT' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'RIGHT' });
  await pause(100);
  const storedWidth = await window.webContents.executeJavaScript("Number(localStorage.getItem('cif-layout-v1:information-width'))");
  assert.ok(storedWidth > 220);
  await window.webContents.executeJavaScript("localStorage.setItem('cif-layout-v1:column-widths', JSON.stringify({formula:210})); undefined");
  await window.reload();
  await pause(400);
  await search();
  const restored = await window.webContents.executeJavaScript("({width: document.querySelector('[data-testid=compound-info-panel]').getBoundingClientRect().width, column:parseFloat(document.querySelector('th').style.width), values:Array.from(document.querySelectorAll('[data-resize-handle]')).map(e=>({value:e.getAttribute('aria-valuenow'),target:!!document.getElementById(e.getAttribute('aria-controls'))}))})");
  assert.ok(Math.abs(restored.width - storedWidth) < 1);
  assert.equal(restored.column, 210);
  assert.ok(restored.values.every(e => e.target && Number(e.value) >= 0 && Number(e.value) <= 100));
  console.log('✓ About focus/Escape, persisted layout after reload, and splitter accessibility');
  await clickButton('Reset search');
  assert.ok(await window.webContents.executeJavaScript("document.body.textContent.includes('No structures imported')"));
  await window.webContents.executeJavaScript("window.cifApi.searchPage = async () => ({ rows: [], total: 0 }); undefined");
  await search();
  assert.ok(await window.webContents.executeJavaScript("document.body.textContent.includes('No matching results')"));
  console.log('✓ keyboard result selection, all three panel dividers, and search-reset empty state');
  window.destroy();
}

app.whenReady().then(run).then(
  () => app.exit(0),
  (error) => {
    console.error(error);
    app.exit(1);
  }
);
