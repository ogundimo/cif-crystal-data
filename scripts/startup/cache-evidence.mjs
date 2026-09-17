import assert from 'node:assert/strict';

// RAMMap 1.63 amd64 RMP snapshots: PF_PFN_PRIO_REQUEST (192-byte header),
// followed by 24-byte MMPFN_IDENTITY records. Private Windows layouts: fail
// closed on format changes and cross-check every page against ListCounts.
// References: System Informer phnt/include/{ntpfapi,ntmmapi}.h and
// zodiacon/WindowsInternals/MemInfo (FileObject's low bit denotes an image).
const normalize = path => path.replaceAll('/', '\\').toLowerCase().replace(/\\+$/, '');
const decode = text => text.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, value) => {
  if(value[0]==='#') return String.fromCodePoint(value[1].toLowerCase()==='x'?parseInt(value.slice(2),16):Number(value.slice(1)));
  return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[value];
});

export function summarizeCacheSnapshot(xml, roots) {
  assert.match(xml, /<root Application="RamMap" Version="1\.0" Architecture="amd64">/, 'Unsupported RAMMap snapshot format');
  assert.ok(!xml.includes('<!DOCTYPE')&&!xml.includes('<!ENTITY'),'Unexpected XML declarations');
  assert.ok(roots.length>0,'Target roots required');
  const targets=roots.map(normalize);
  const keys=new Map();
  for(const match of xml.matchAll(/<File Key="(-?\d+)" Path="([^"]*)"\/>/g)) {
    const path=normalize(decode(match[2]));
    const group=targets.findIndex(root=>path===root||path.startsWith(root+'\\'));
    if(group>=0) keys.set(BigInt.asUintN(64,BigInt(match[1])),group);
  }
  const hex=name=>{
    const match=xml.match(new RegExp(`<${name}>([\\dA-Fa-f]+)</${name}>`));
    assert.ok(match&&match[1].length%2===0,`Missing or malformed ${name}`);
    return Buffer.from(match[1],'hex');
  };
  const pages=hex('PfnDatabase');const lists=hex('ListCounts');
  assert.ok(pages.length>=192,'Truncated page database');
  assert.equal(pages.readUInt32LE(0),1,'Unsupported PFN version');
  assert.equal(pages.readUInt32LE(4),1,'Unsupported PFN flags');
  const count=Number(pages.readBigUInt64LE(8));
  assert.ok(count>0&&Number.isSafeInteger(count),'Invalid PFN count');
  assert.equal(pages.length,192+count*24,'Unexpected PFN layout or truncated snapshot');
  assert.equal(lists.length,64,'Unexpected page-list layout');
  const observed=Array(8).fill(0);
  const groups=targets.map(()=>({fileKeys:0,pagesByList:Array(8).fill(0)}));
  for(const group of keys.values()) groups[group].fileKeys++;
  for(let offset=192;offset<pages.length;offset+=24) {
    const use=pages[offset]&15;const list=(pages[offset]>>4)&7;observed[list]++;
    if(use!==1) continue; // Memory-mapped files, including executable images.
    const key=pages.readBigUInt64LE(offset+16)&~1n;
    const group=keys.get(key);
    if(group!==undefined) groups[group].pagesByList[list]++;
  }
  assert.deepEqual(observed,Array.from({length:8},(_,i)=>Number(lists.readBigUInt64LE(i*8))),'PFN records disagree with snapshot page-list totals');
  const totalTargetPages=groups.reduce((sum,g)=>sum+g.pagesByList.reduce((a,b)=>a+b,0),0);
  return {pageCount:count,pageBytes:4096,listOrder:['zero','free','standby','modified','modifiedNoWrite','bad','active','transition'],groups,totalTargetPages};
}

export function validateCacheReset(beforeXml, afterXml, roots) {
  const before=summarizeCacheSnapshot(beforeXml,roots);
  const after=summarizeCacheSnapshot(afterXml,roots);
  // A positive before sample prevents an empty/mis-specified scope proving a reset.
  const validated=before.totalTargetPages>0&&after.totalTargetPages===0;
  return {status:validated?'target-files-absent-at-snapshot':'not-validated',before,after,
    scope:'App, isolated profile and synthetic input file pages at snapshot time; excludes shared Windows DLLs, hardware caches and later background reads.'};
}
