const assert = require('node:assert/strict');
const { writeFileSync, mkdirSync } = require('node:fs');

module.exports = async (window, { waitFor, clickByText, pause, representativeCif }) => {
  const ui = code => window.webContents.executeJavaScript(code);
  const wait = code => waitFor(window, code, 15000);
  const click = text => clickByText(window, text);
  const script = async text => {
    await ui(`window.testScriptDone=false;window.Jmol.script(Object.values(window.Jmol._applets)[0], ${JSON.stringify(text+';javascript "window.testScriptDone=true"')});true`);
    await wait('window.testScriptDone');
    await pause(300);
  };
  const property = (name, parameter='') => ui(`window.Jmol.getPropertyAsArray(Object.values(window.Jmol._applets)[0],${JSON.stringify(name)},${JSON.stringify(parameter)})`);
  const status = () => ui("document.querySelector('[data-testid=viewer-picking-status]').textContent");
  let row = 1;
  const load = async text => {
    row = row === 1 ? 2 : 1;
    await ui(`window.cifApi.getViewerSource=async id=>({fileName:id+'.cif',text:${JSON.stringify(text)}});document.querySelector('tr[data-entry-id="${row}"]').click();true`);
    await wait(`document.querySelector('[aria-label="Crystal structure viewer"] strong')?.textContent === '${row}.cif'`);
  };
  const cif = (points, gamma=90) => `data_synthetic\n_cell_length_a 20\n_cell_length_b 20\n_cell_length_c 20\n_cell_angle_alpha 90\n_cell_angle_beta 90\n_cell_angle_gamma ${gamma}\n_space_group_name_H-M_alt 'P 1'\nloop_\n_atom_site_label\n_atom_site_type_symbol\n_atom_site_fract_x\n_atom_site_fract_y\n_atom_site_fract_z\n${points.map((p,i)=>`C${i} C ${p.map(v=>v/20).join(' ')}`).join('\n')}\n`;
  // Native screen coordinates are used only by the test to aim actual Electron
  // pointer events. Production picking goes through JSmol's pick callback.
  const pick = async index => {
    const point = await ui(`(()=>{const a=Object.values(window.Jmol._applets)[0];const atom=a._appletPanel.viewer.ms.at[${index}];const canvas=document.querySelector('[data-testid=jsmol-host] canvas');const r=canvas.getBoundingClientRect();const scale=a._appletPanel.viewer.gdata.isAntialiased()?2:1;return {x:Math.round(r.x+atom.sX/scale),y:Math.round(r.y+atom.sY/scale)};})()`);
    for (const type of ['mouseMove','mouseDown','mouseUp']) {
      window.webContents.sendInputEvent({type,button:'left',clickCount:1,...point});
      await pause(80);
    }
    await pause(600);
  };
  const evidence = {};
  const geometry = [[10,10,10],[11.5,10,10],[10,11.5,10],[10,10,11.5],[8.5,10,10],[10,8.5,10],[10,10,8.5]];
  await load(cif(geometry.slice(0,3)));
  await click('Atoms');
  await script('rotate x 20;rotate y 25');
  assert.equal(String(await property('evaluate','disablePopupMenu')), 'true');
  await click('Distance');
  await pick(0); await pick(1);
  assert.match(await status(), /Distance: 1\.5000 Å/);
  const measures = await property('measurementInfo');
  evidence.distance = measures;
  assert.equal(measures.length, 1);
  assert.ok(Math.abs(measures[0].value - 1.5) < 1e-5);
  await pick(0); await pick(1);
  assert.equal((await property('measurementInfo')).length,1,'Repeated measurement must remain visible instead of toggling off');
  await click('Angle'); await pick(1); await pick(0); await pick(2);
  assert.match(await status(), /Angle: 90\.0000 °/);
  evidence.angle = await property('measurementInfo');
  assert.ok(evidence.angle.some(item=>Math.abs(item.value-90)<1e-4));
  await pick(1); await click('Cancel picking');
  assert.match(await status(), /Picking off/);
  await click('Distance'); await pick(0); await pick(0);
  assert.match(await status(), /different atom/);
  await click('Clear measurements');
  assert.equal((await property('measurementInfo')).length, 0);
  await load(cif([...geometry,[3,3,3]]));
  await script('moveto 0 {1 1 0} 45;refresh');
  await click('Polyhedra'); await pick(0);
  evidence.validPolyhedron = { status:await status(), shape:await property('shapeInfo'), bonds:await property('bondInfo') };
  assert.match(evidence.validPolyhedron.status, /Coordination polyhedron: 6/);
  assert.equal(evidence.validPolyhedron.bonds.length, 0);
  await pick(7);
  assert.match(await status(), /No supported polyhedron: 0 neighbors/);
  assert.deepEqual(await property('shapeInfo'), evidence.validPolyhedron.shape, 'An insufficient center must preserve the existing polyhedron');
  await pick(0); assert.equal((await property('bondInfo')).length, 0);
  await click('Clear polyhedra');
  assert.match(await status(), /Picking off/);
  assert.equal(Object.entries(await property('shapeInfo')).filter(([key])=>/polyhedra/i.test(key)).reduce((sum,[,value])=>sum+value.length,0),0);
  await click('Ball + stick');
  const ordinary = (await property('bondInfo')).length;
  await click('Polyhedra'); await pick(0);
  assert.equal((await property('bondInfo')).length, ordinary);
  // A sparse center has two neighbors at exactly 1.5 Å. Old script creates
  // two connections and no polyhedron, reproducing the reported failure class.
  await load(cif([[10,10,10],[11.5,10,10],[8.5,10,10]]));
  await click('Atoms');
  await script('polyhedra {*} DELETE;connect 15% 125% {atomIndex=0} {*} CREATE;polyhedra BONDS {atomIndex=0} TO {*} COLLAPSED EDGES');
  evidence.oldSparse = { bonds:await property('bondInfo'), shape:await property('shapeInfo') };
  assert.equal(evidence.oldSparse.bonds.length, 2);
  assert.equal(Object.entries(evidence.oldSparse.shape).filter(([key])=>/polyhedra/i.test(key)).reduce((sum,[,value])=>sum+value.length,0),0);
  await click('Atoms'); await click('Polyhedra'); await pick(0);
  evidence.newSparse = await status();
  assert.match(evidence.newSparse, /No supported polyhedron: 2 neighbors/);
  assert.equal((await property('bondInfo')).length, 0);
  // All three candidate neighbors are collinear: no fabricated shape.
  await load(cif([[10,10,10],[10.6,10,10],[11.2,10,10],[8.8,10,10]]));
  await click('Atoms'); await click('Polyhedra'); await pick(0);
  assert.match(await status(), /No supported polyhedron: 3 neighbors/);
  assert.equal((await property('bondInfo')).length, 0);
  // Anchored indicator uses the native rotation but ignores zoom/translation.
  // The pinned default carbon radius is 0.680 Å (JU/Elements.js), so
  // 125% of a C+C radius sum is 1.700 Å. Test both sides independently.
  await load(cif([[10,10,10],[11.699,10,10],[10,11.699,10],[8.301,10,10],[10,8.299,10]]));
  await click('Atoms'); await click('Polyhedra'); await pick(0);
  assert.match(await status(), /Coordination polyhedron: 3 neighbors/);
  evidence.cutoff = { radiusAngstrom:.68, upperAngstrom:1.700, included:1.699, excluded:1.701, status:await status() };
  // A center on a packed boundary has only the displayed side's neighbors;
  // enlarging the block and selecting an interior image exposes both sides.
  await load(cif([[0,10,10],[1.5,10,10],[18.5,10,10]]));
  await click('Atoms'); await click('Polyhedra'); await pick(0);
  assert.match(await status(), /No supported polyhedron/);
  await click('2³');
  await wait("!document.querySelector('[aria-label=\"Crystal structure viewer\"]').textContent.includes('Preparing')");
  assert.match(await status(), /Picking off/);
  const reloadedMeasurements = await property('measurementInfo');
  assert.deepEqual(reloadedMeasurements,{measurementInfo:null});
  const boundaryAtoms = await property('atomInfo','{*}');
  const interior = boundaryAtoms.find(a=>Math.abs(a.x-20)<.001 && Math.abs(a.y-10)<.001 && Math.abs(a.z-10)<.001);
  assert.ok(interior);
  await script(`set refreshing false;connect DELETE;connect 15% 125% {atomIndex=${interior.atomIndex}} {*} CREATE;set refreshing true;refresh`);
  const periodicBonds = await property('bondInfo',`{atomIndex=${interior.atomIndex}}`);
  assert.equal(periodicBonds.length,2);
  assert.ok(periodicBonds.every(b=>Math.abs(b.length_Ang-1.5)<1e-4));
  evidence.periodic = {center:interior.coord,neighbors:periodicBonds};
  await click('Atoms'); await click('1³');
  await wait("!document.querySelector('[aria-label=\"Crystal structure viewer\"]').textContent.includes('Preparing')");
  await load(cif(geometry,60));
  const axes = () => ui("document.querySelector('[aria-label=\"Crystallographic orientation axes\"]').innerHTML");
  const before = await axes();
  await script('zoom 140;translate x 10;translate y 5');
  assert.equal(await axes(), before);
  await script('rotate z 30');
  assert.notEqual(await axes(), before);
  evidence.axes = {before, rotated:await axes()};
  const box = () => ui("(()=>{const r=document.querySelector('[aria-label=\"Crystallographic orientation axes\"]').getBoundingClientRect();const v=document.querySelector('[data-testid=jsmol-host]').getBoundingClientRect();return {left:r.left-v.left,bottom:v.bottom-r.bottom,width:r.width,height:r.height};})()");
  const initialBox = await box();
  window.setContentSize(950,700); await pause(400);
  assert.deepEqual(await box(),initialBox);
  window.setContentSize(1200,800); await pause(400);
  await click('a'); await click('Fit / reset');
  assert.equal(String(await property('evaluate','disablePopupMenu')), 'true');
  const bounds = await ui("(()=>{const r=document.querySelector('[data-testid=jsmol-host]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()");
  window.webContents.sendInputEvent({type:'mouseDown',button:'right',clickCount:1,...bounds});
  window.webContents.sendInputEvent({type:'mouseUp',button:'right',clickCount:1,...bounds});
  await pause(200);
  assert.equal(await ui("[...document.querySelectorAll('[id*=PopupMenu],[class*=jmolPopup]')].some(e=>e.getBoundingClientRect().width>0)"),false);
  // The native frank and Ctrl+left entry points are suppressed by the same setting.
  window.webContents.sendInputEvent({type:'mouseDown',button:'left',modifiers:['control'],clickCount:1,...bounds});
  await pause(80);
  window.webContents.sendInputEvent({type:'mouseUp',button:'left',modifiers:['control'],clickCount:1,...bounds});
  await pause(200);
  assert.equal(await ui("[...document.querySelectorAll('[role=menu],[id*=PopupMenu],[class*=jmolPopup]')].some(e=>e.getBoundingClientRect().width>0)"),false);
  assert.equal(String(await property('evaluate','disablePopupMenu')), 'true');
  mkdirSync('reports/viewer',{recursive:true});
  const frank = await ui("(()=>{const r=document.querySelector('[data-testid=jsmol-host]').getBoundingClientRect();return {x:Math.round(r.right-20),y:Math.round(r.bottom-8)};})()");
  window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...frank});
  await pause(80);
  window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...frank});
  await pause(200);
  assert.equal(await ui("[...document.querySelectorAll('[role=menu],[id*=PopupMenu],[class*=jmolPopup]')].some(e=>e.getBoundingClientRect().width>0)"),false);
  writeFileSync('reports/viewer/usability.json',JSON.stringify(evidence,null,2));
  window.showInactive();
  await pause(300);
  writeFileSync('reports/viewer/viewer-controls.png',(await window.webContents.capturePage()).toPNG());
  window.hide();
  await load(representativeCif);
  console.log('✓ actual pointer measurements, mode transitions, popup suppression, polyhedra failure reproduction and anchored nonorthogonal axes');
};
