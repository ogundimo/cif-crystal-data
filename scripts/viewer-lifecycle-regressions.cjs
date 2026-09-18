const assert = require('node:assert/strict');
const {writeFileSync} = require('node:fs');
module.exports = async (window, fixture, pause) => {
  const evidence = await window.webContents.executeJavaScript(`(async()=>{
    const errors=[];
    const onerror=event=>errors.push({message:event.message,stack:event.error?.stack});
    addEventListener('error',onerror);
    // Ordinary results removal unmounts the real React viewer.
    window.viewerMountHarness.setMounted(false);
    await new Promise(resolve=>setTimeout(resolve,300));
    const oldRegistryCount=Object.keys(window.Jmol._applets).length;
    const {CrystalViewerRuntime}=await import('/src/jsmol/runtime.ts');
    // Unmount after applet registration but before native initialization ends.
    const earlyHost=document.createElement('div');earlyHost.style.cssText='width:600px;height:400px';document.body.append(earlyHost);
    const early=new CrystalViewerRuntime(earlyHost,async()=>({fileName:'early.cif',text:''}),{requested(){},loading(){},ready(){},error(){}});
    const initializing=early.initialize(()=>errors.push({message:'Disposed runtime became ready'}));
    await Promise.resolve();
    const pendingApplet=Object.values(window.Jmol._applets).find(a=>a._id);
    if (!pendingApplet) throw new Error('Early-dispose fixture did not register an applet');
    early.dispose();earlyHost.remove();await initializing;
    const deadline=performance.now()+15000;
    while(Object.values(window.Jmol._applets).includes(pendingApplet)) {
      if(performance.now()>deadline) throw new Error('Disposed initialization did not release its registry entry');
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    async function create() {
      const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;width:600px;height:400px';document.body.append(host);
      let accepted,rejected;const loaded=new Promise((resolve,reject)=>{accepted=resolve;rejected=reject});
      const runtime=new CrystalViewerRuntime(host,async()=>({fileName:'lifecycle.cif',text:${JSON.stringify(fixture)}}),{requested(){},loading(){},ready:accepted,error:(_file,error)=>rejected(new Error(error))});
      await runtime.initialize(()=>{});
      runtime.request({entryId:1,expectedFileName:'lifecycle.cif',representation:'atoms',unitCellVisible:true,labelsVisible:false,supercellSize:1});
      await loaded;
      const applet=Object.values(window.Jmol._applets).find(a=>a._id&&host.querySelector('canvas')===a._canvas);
      return {host,runtime,applet};
    }
    // Reproduce the precise vendor lifecycle failure synchronously: the native
    // destroy keeps a panel whose viewer is null; a late repaint dereferences it.
    const first=await create();
    const panel=first.applet._appletPanel;
    panel.destroy();
    let reproduced;
    try { window.Jmol.repaint(first.applet,true); } catch(error) {reproduced={message:error.message,stack:error.stack,viewerNull:panel.viewer===null};}
    first.runtime.dispose();first.host.remove();
    const second=await create();
    window.Jmol.repaint(second.applet,true); // queues an animation frame
    second.applet._resize(); // queues the vendor's 100 ms timer
    second.runtime.dispose();second.host.remove();
    await new Promise(resolve=>setTimeout(resolve,350));
    const third=await create();
    const atomCount=window.Jmol.getPropertyAsArray(third.applet,'atomInfo','{*}').length;
    third.runtime.dispose();third.host.remove();
    await new Promise(resolve=>setTimeout(resolve,350));
    removeEventListener('error',onerror);
    window.viewerMountHarness.setMounted(true);
    return {oldRegistryCount,earlyInitializationReleased:true,reproduced,errors,subsequentAtomCount:atomCount};
  })()`);
  writeFileSync('reports/viewer/lifecycle.json',JSON.stringify(evidence,null,2));
  assert.match(evidence.reproduced?.message,/setScreenDimension/);
  assert.equal(evidence.reproduced.viewerNull,true);
  assert.deepEqual(evidence.errors,[]);
  assert.ok(evidence.subsequentAtomCount>0);
  assert.equal(evidence.oldRegistryCount,0);
  await pause(400);
  console.log('✓ reproduced native destroy/repaint stack; resize and paint drain safely after unmount; subsequent viewer loads');
};
