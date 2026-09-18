import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { launchPackaged } from '../packaged-app-driver.mjs';
const [appArg, kitArg, applicationCommit] = process.argv.slice(2);
if (!appArg || !kitArg || !/^[a-f0-9]{40}$/.test(applicationCommit ?? '')) throw new Error('Usage: npm run prepare:packaged-startup -- <unpacked-app-directory> <new-kit-directory> <40-character-application-commit>');
const root=resolve(kitArg); const application=resolve(appArg);
const source={commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()};
await mkdir(root); // Never overwrite an existing kit or its samples.
await cp(application,join(root,'app'),{recursive:true});

const exe=join(application,'CIF Crystal Data.exe');
const fixture=await readFile('src/parser/__fixtures__/synthetic-test.cif','utf8');
const seeds={};
for(const count of [168,1000]) {
 const corpus=join(root,`input-${count}`);const profile=join(root,`seed-${count}`);
 await mkdir(corpus);await mkdir(profile);
 for(let i=1;i<=count;i++) await writeFile(join(corpus,`synthetic-${i}.cif`),fixture.replace('data_synthetic_test',`data_synthetic_${i}`));
 let run;
 try {run=await launchPackaged({exe,profile,corpus});const result=await run.ui('window.cifApi.importCifFolder()');if(result.importedCount!==count) throw new Error('Seed import count mismatch');}
 finally {if(run)await run.stop();}
 seeds[count]=profile;
}
const cases=[['fresh',0,false],['populated-off',168,false],['populated-on',168,true],['unavailable',168,true],['upgrade',168,false],['larger',1000,false]];
for(const [name,count,refresh] of cases) for(let sample=1;sample<=3;sample++) {
 const profile=join(root,'profiles',`${name}-${sample}`);await mkdir(profile,{recursive:true});
 if(count) {
  await cp(seeds[count],profile,{recursive:true});
  const db=new Database(join(profile,'cif-local.db'));
  db.prepare("INSERT INTO app_settings(key,value) VALUES('startup_refresh',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(refresh));
  if(name==='unavailable')db.prepare("UPDATE app_settings SET value=? WHERE key='import_folder'").run(join(root,'missing-input'));
  if(name==='upgrade')db.exec("DROP TABLE data_authors; PRAGMA user_version=9; UPDATE entries SET reference='',publ_title=''; DELETE FROM publ_authors;");
  db.close();
 }
}
const sha=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
await writeFile(join(root,'manifest.json'),JSON.stringify({source,applicationCommit,version:JSON.parse(await readFile('package.json','utf8')).version,exeSha256:await sha(exe),cases:cases.map(([name,entries,refresh])=>({name,entries,refresh,samples:3})),limitations:['Synthetic scale workloads; not research-corpus coverage.','Upgrade seed models bibliography repair by changing an isolated schema-10 synthetic profile to schema 9.','Prepare every profile before restart; do not pre-open the binary or data after restart.']},null,2));
console.log('Prepared restart test kit:',root);


