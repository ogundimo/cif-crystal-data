const assert = require('node:assert/strict');

module.exports = async (window, { waitFor, clickByText }) => {
  const ui = code => window.webContents.executeJavaScript(code);
  const click = text => clickByText(window, text);
  const ready = () => waitFor(window, `!!document.querySelector('[aria-label="Crystallographic orientation axes"]')`);
  const property = (name, parameter = '') => ui(`window.Jmol.getPropertyAsArray(Object.values(window.Jmol._applets)[0],${JSON.stringify(name)},${JSON.stringify(parameter)})`);
  // Native Labels shape (JV.JC.SHAPE_LABELS = 5), inspected only by the test.
  const labelCount = () => ui(`(Object.values(window.Jmol._applets)[0]._appletPanel.viewer.shm.shapes[5]?.strings ?? []).filter(Boolean).length`);
  const open = () => ui(`document.querySelector('[title="Double-click to open viewer controls"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));true`);
  const script = async text => {
    await ui(`window.compactScriptDone=false;window.Jmol.script(Object.values(window.Jmol._applets)[0],${JSON.stringify(text + ';javascript "window.compactScriptDone=true"')});true`);
    await waitFor(window, 'window.compactScriptDone');
  };
  // Start from a fresh compact view to record the native default atom radii/count.
  await click('← Back to results');
  await ready();
  const baseline = await property('atomInfo', '{*}');
  const verify = async () => {
    await ready();
    const atoms = await property('atomInfo', '{*}');
    assert.equal(atoms.length, baseline.length, 'Compact viewer must return to one cell');
    assert.deepEqual(atoms.map(atom => atom.spacefill), baseline.map(atom => atom.spacefill), 'Compact atom sizes must reset');
    assert.equal((await property('bondInfo')).length, 0, 'Compact viewer must not retain sticks');
    assert.equal(String(await property('evaluate', 'showUnitCell')), 'true');
    assert.equal(String(await property('evaluate', 'displayCellParameters')), 'false');
    assert.equal(await labelCount(), 0);
    const measures = await property('measurementInfo');
    assert.ok(Array.isArray(measures) ? measures.length === 0 : measures.measurementInfo === null);
    const shapes = await property('shapeInfo');
    assert.equal(Object.entries(shapes).filter(([key]) => /polyhedra/i.test(key)).reduce((sum,[,items]) => sum + items.length, 0), 0);
    await open();
    assert.deepEqual(await ui(`Array.from(document.querySelectorAll('[aria-label="Crystal structure viewer"] button.btn-on')).map(button=>button.textContent.trim())`), ['Atoms','Cells','1³']);
    assert.match(await ui(`document.querySelector('[data-testid="viewer-picking-status"]').textContent`), /Picking off/);
  };
  await open();
  for (const [size, representation] of [['1³','Space fill'], ['2³','Ball + stick']]) {
    await click(size);
    await ready();
    await click(representation);
    await click('Cells');
    await click('Labels');
    await script('measure ({atomIndex=0}) ({atomIndex=1}) "%VALUE %UNITS"');
    assert.equal((await property('measurementInfo')).length, 1);
    assert.ok(await labelCount() > 0);
    await click('Distance');
    await click('← Back to results');
    await verify();
  }
  // Pause the source fetch, exit during the 2³ request, then release it. The
  // queued expanded appearance must never win over the compact reset request.
  await click('Labels');
  await click('Space fill');
  await ui(`window.compactOriginalSource=window.cifApi.getViewerSource;window.compactFetchStarted=false;
    window.cifApi.getViewerSource=async id=>{window.compactFetchStarted=true;await new Promise(resolve=>window.compactRelease=resolve);return window.compactOriginalSource(id)};true`);
  await click('2³');
  await waitFor(window, 'window.compactFetchStarted');
  await click('← Back to results');
  await ui('window.cifApi.getViewerSource=window.compactOriginalSource;window.compactRelease();true');
  await verify();
  console.log('✓ compact defaults after single-cell, supercell and in-flight exits; annotations and picking cleared');
};
