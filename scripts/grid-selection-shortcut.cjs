const assert = require('node:assert/strict');

module.exports = async function testSelectedRowShortcut(window, testUrl, waitForRenderer) {
  const evaluate = expression => window.webContents.executeJavaScript(expression);
  const grid = "document.querySelector('[data-testid=data-grid-scroll]')";
  await window.loadURL(testUrl + '?grid-shortcut');
  await waitForRenderer(window, '!!window.gridShortcut', 'selected-row test fixture');
  const update = async state => {
    await evaluate(`window.gridShortcut.update(${JSON.stringify(state)}); undefined`);
    await waitForRenderer(window, `JSON.stringify(window.gridShortcut.state) === JSON.stringify({...window.gridShortcut.state,...${JSON.stringify(state)}})`, 'updated grid state');
  };
  const scroll = async top => {
    await evaluate(`(()=>{const g=${grid};g.scrollTop=${top};g.dispatchEvent(new Event('scroll',{bubbles:true}));})()`);
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  };
  const shortcut = async () => {
    await evaluate(`${grid}.focus({preventScroll:true})`);
    window.webContents.sendInputEvent({type:'keyDown',keyCode:'ENTER',modifiers:['control','shift']});
    window.webContents.sendInputEvent({type:'keyUp',keyCode:'ENTER',modifiers:['control','shift']});
    await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  };
  const geometry = () => evaluate(`(()=>{const g=${grid}, row=g.querySelector('tr[aria-selected=true]');const r=row?.getBoundingClientRect(),header=g.querySelector('th')?.getBoundingClientRect();return {id:row?.dataset.entryId,center:r?(r.top+r.bottom)/2:null,desired:header?(header.bottom+g.getBoundingClientRect().top+g.clientTop+g.clientHeight)/2:null,top:g.scrollTop,left:g.scrollLeft,max:g.scrollHeight-g.clientHeight,count:g.querySelectorAll('tr[data-entry-id]').length,focus:document.activeElement===g,calls:{...window.gridShortcut.calls}};})()`);
  const centered = async id => {
    await waitForRenderer(window, `${grid}.querySelector('tr[aria-selected=true]')?.dataset.entryId === '${id}'`, 'selected row remounted');
    const result=await geometry();
    assert.ok(Math.abs(result.center-result.desired)<2,`row ${id} is not centered: ${JSON.stringify(result)}`);
    assert.ok(result.count<100,'reveal rendered the whole result set');
    assert.equal(result.focus,true,'reveal moved keyboard focus');
    return result;
  };
  assert.equal(await evaluate(`${grid}.querySelector('tr[aria-selected=true]') === null`),true,'selected row should begin unmounted');
  await evaluate(`${grid}.querySelector('table').style.minWidth='1800px';${grid}.scrollLeft=120;undefined`);
  await shortcut();
  const initial=await centered(5000);
  assert.equal(initial.left,120);assert.deepEqual(initial.calls,{select:0,load:0,sort:0});
  await shortcut();assert.equal((await geometry()).top,initial.top,'already-centered row moved');
  await scroll(initial.top+60);await shortcut();await centered(5000);
  await scroll(180000);assert.equal(await evaluate(`${grid}.querySelector('tr[aria-selected=true]') === null`),true);
  await shortcut();await centered(5000);
  window.setContentSize(1100,650);await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await shortcut();await centered(5000);
  await update({ids:Array.from({length:10000},(_,i)=>10000-i)});
  await scroll(0);await shortcut();await centered(5000);
  // Clamp both edges without changing the selection or fetching a page.
  await update({selectedId:10000});await shortcut();assert.equal((await geometry()).top,0);
  await update({selectedId:1});await shortcut();const end=await geometry();assert.ok(Math.abs(end.top-end.max)<1);assert.equal(end.id,'1');
  // A partly loaded collection can reveal its last loaded row without paging.
  await update({ids:Array.from({length:500},(_,i)=>i+1),selectedId:500,totalRows:1000,loadingMore:true});
  await scroll(0);await shortcut();const partial=await geometry();
  await update({loadingMore:false});
  assert.equal((await geometry()).calls.load,partial.calls.load,'reveal triggered incremental loading');
  await evaluate(`${grid}.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:120}));undefined`);
  assert.equal((await geometry()).calls.load,partial.calls.load+1,'ordinary scrolling no longer loads the next page');
  await update({ids:Array.from({length:1000},(_,i)=>i+1),loadingMore:false});await shortcut();await centered(500);
  for(const selectedId of [null,20000]) {
    await update({selectedId});const before=await geometry();await shortcut();assert.equal((await geometry()).top,before.top,'missing selection moved grid');
  }
  await update({selectedId:500});await scroll(0);
  await evaluate("document.querySelector('input').focus()");
  window.webContents.sendInputEvent({type:'keyDown',keyCode:'ENTER',modifiers:['control','shift']});
  window.webContents.sendInputEvent({type:'keyUp',keyCode:'ENTER',modifiers:['control','shift']});
  assert.equal((await geometry()).top,0,'text input shortcut leaked into grid');
  await evaluate("const dialog=document.createElement('div');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');document.body.append(dialog);undefined");
  await shortcut();assert.equal((await geometry()).top,0,'modal did not suppress shortcut');
  await evaluate("document.querySelector('[role=dialog]').remove();undefined");
  await update({ids:[],selectedId:null,totalRows:0});await shortcut();assert.equal((await geometry()).top,0);
  assert.equal((await geometry()).calls.select,0,'reveal changed selected entry');
  assert.equal((await geometry()).calls.sort,0,'reveal changed sort order');
  window.setContentSize(1200,800);
  console.log('✓ selected-row shortcut: 10,000 virtual rows, centering/clamping, sorting/loading, resize, focus and modal/input scope');
};
