import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { resolve } from 'node:path';
import ts from 'typescript';

// Reproduce characterization against the immutable pre-refactor revision without
// checking it out or accessing any database/profile. Only portable TS is loaded.
const base = '5e23e57dfc7927d1f51fbc10a7b3f0e7e6d64eff';
const require = createRequire(import.meta.url);
const compile = (text,filename) => {
  const module = new Module(filename);
  module.filename = filename;
  module.paths = require.resolve.paths('typescript');
  module._compile(ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,
    target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,filename);
  return module.exports;
};
require.extensions['.ts'] = (module,filename) => {
  module.exports = compile(readFileSync(filename,'utf8'),filename);
};
const hash = text => createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex');
const loadPair = file => {
  const before=execFileSync('git',['show',`${base}:${file}`],{encoding:'utf8',windowsHide:true});
  const after=readFileSync(file,'utf8');
  return {before:compile(before,resolve(file)),after:compile(after,resolve(file)),
    hashes:{before:hash(before),after:hash(after)}};
};
const parser = loadPair('src/parser/cif/entry.ts');
const { scanCif } = require('../src/parser/cif/scanner.ts');
const parserFixtures = [];
const outcome = (fn,raw) => { try {return {value:fn(raw)};} catch (error) {return {error:error.message};} };
for (const file of ['docs/samples/rocksalt-demo.cif','src/parser/__fixtures__/synthetic-test.cif']) {
  const text=readFileSync(file,'utf8'), original=scanCif(text);
  const cases=[original];
  for (const tag of ['_chemical_formula_sum','_cell_length_a','_cell_length_b','_cell_length_c',
    '_cell_angle_alpha','_cell_angle_beta','_cell_angle_gamma','_cell_volume','_space_group_it_number',
    '_space_group_name_h-m_alt','_diffrn_radiation_wavelength','_cell_formula_units_z']) {
    for (const value of [undefined,'?','.','0','-1','NaN','4.2(3)','181']) {
      const raw=structuredClone(original);
      if (value===undefined) raw.tags.delete(tag); else raw.tags.set(tag,value);
      cases.push(raw);
    }
  }
  for (const raw of cases) assert.deepEqual(outcome(parser.after.normalizeCif,raw),outcome(parser.before.normalizeCif,raw));
  parserFixtures.push({file,sha256:hash(text),cases:cases.length});
}

const pxrd=loadPair('src/renderer/src/pxrd.ts');
const entry={sg_number:1,cell_a:0.4,cell_b:0.4,cell_c:0.4,cell_a_angstrom:4,cell_b_angstrom:4,
  cell_c_angstrom:4,cell_angle_alpha:90,cell_angle_beta:90,cell_angle_gamma:90,radiation_wavelength_angstrom:1.5406};
const site={type_symbol:'Na',site_label:'Na1',fract_x:0,fract_y:0,fract_z:0,occupancy:1,u_iso_or_equiv:0,b_iso_or_equiv:0};
const identity=[{operation_xyz:'x,y,z'}];
const models = [
  {name:'cubic',entry,sites:[site],operations:identity},
  {name:'triclinic mixed sites',entry:{...entry,cell_a_angstrom:4.1,cell_b_angstrom:5.3,cell_c_angstrom:6.7,
    cell_angle_alpha:73,cell_angle_beta:82,cell_angle_gamma:67},sites:[site,{...site,type_symbol:'Fe',fract_x:0.17,fract_y:0.23,fract_z:0.37,occupancy:0.6,b_iso_or_equiv:0.8}],operations:identity},
  {name:'body-centred extinction',entry,sites:[site],operations:[...identity,{operation_xyz:'x+1/2,y+1/2,z+1/2'}]},
  {name:'thirds translations',entry,sites:[site],operations:[...identity,{operation_xyz:'x,y,z+1/3'},{operation_xyz:'x,y,z+2/3'}]},
  {name:'capped search',entry:{...entry,cell_c_angstrom:60},sites:[site],operations:identity},
  {name:'invalid geometry',entry:{...entry,cell_angle_gamma:0},sites:[site],operations:identity},
  {name:'zero occupancy',entry,sites:[{...site,occupancy:0}],operations:identity},
];
const pxrdCases=[];
for (const model of models) for (const wavelength of [1.5406,0.7107,1.7902,0.5609]) {
  const args=[model.entry,model.sites,model.operations,wavelength];
  const before=pxrd.before.calculatePxrd(...args), after=pxrd.after.calculatePxrd(...args);
  assert.deepEqual(after,before,`${model.name}/${wavelength}`);
  for (const fwhm of [0.1,0.3]) {
    const oldProfile=pxrd.before.createPxrdProfile(before.peaks,fwhm);
    const newProfile=pxrd.after.createPxrdProfile(after.peaks,fwhm);
    assert.deepEqual(newProfile,oldProfile);
    for (const header of [false,true]) assert.equal(
      pxrd.after.serializePxrdProfile(newProfile,header,{result:after,fwhm}),
      pxrd.before.serializePxrdProfile(oldProfile,header,{result:before,fwhm}));
  }
  pxrdCases.push({model:model.name,wavelength,peaks:after.peaks.length,status:after.status});
}
console.log(JSON.stringify({baseCommit:base,node:process.version,tolerance:'Exact deep equality, including labels, diagnostics and exported text; zero numerical tolerance.',
  parser:{hashes:parser.hashes,fixtures:parserFixtures},pxrd:{hashes:pxrd.hashes,models,cases:pxrdCases}},null,2));
