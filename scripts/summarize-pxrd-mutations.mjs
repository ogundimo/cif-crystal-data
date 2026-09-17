import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const read = async path=>JSON.parse(await readFile(path,'utf8'));
const old=await read('reports/scientific/mutation-before.json');
const measured=await read('reports/scientific/mutation-analytic.json');
const file='src/renderer/src/pxrd.ts';
const decisions=new Map();
function classify(ids,category,reason) { for(const id of ids.split(' ')) decisions.set(id,{category,reason}); }
classify('148','equivalent on reachable bases','The first product or the second product in this cross component is zero for the triangular direct-cell vectors used by reciprocalBasis; changing its sign leaves the component unchanged.');
classify('173','equivalent numeric result','An empty additive term parses as Number(\"\") = 0, so retaining empty split terms changes no coordinate.');
classify('200','missing assertion; contract replaced','Removing the absent-denominator branch rejects integer translations. The current strict operation parser and independent full-space-group references replace this permissive grammar; this old survivor is not equivalent.');
classify('194 206','missing assertion','Negating rotation or translation terms can alter a non-centrosymmetric orbit. Existing powder averages can conceal differences; these are not certified equivalent. Current independent mixed-site/symmetry references exercise the new validated grammar.');
classify('208 209','numerical equivalence with a boundary caveat','Integer lattice translations preserve complex reflection phases for integer hkl. Removing canonical wrapping can change the per-site deduplication keys at translated special positions; current periodic-key behavior is tested separately, so this is not global equivalence.');
classify('220 240','unsupported/malformed-input gap','These mutations admit unusable symmetry results or bypass element rejection. The current contract rejects invalid sites/operations before enumeration; missing/unknown/non-finite regressions cover that policy.');
classify('272','missing deduplication assertion addressed in current suite','Removing the colon separator permits collisions between concatenated integer coordinate keys. This is not equivalent; the current suite explicitly compares keys [1,23456,7] and [12,3456,7] against expanded positions.');
classify('305 306 308 309 310 311 314 316 317 319 334 335 339','invalid-input or numerical-degeneracy guard','Some invalid/zero cells are rejected later or produce no finite reflections without this guard. That does not prove equivalence: current explicit unsupported status and finite positive-cell tests protect the public contract.');
classify('320 340','numerical boundary difference','Changing strictness at the 1e-8 degeneracy threshold affects only exactly-on-threshold cells. Those cases are outside independently validated well-conditioned structures; preserve the guard and document rather than certify equivalence.');
classify('351 357','equivalent old fallback','The preceding truthiness test already excludes zero. New explicit invalid-wavelength rejection supersedes the fallback contract.');
classify('363','equivalent returned peaks; extra work','With zero expanded atoms all structure factors are zero and no reflection survives. Removing the early empty-atoms return changes work, not returned peaks.');
classify('366 368 369 380 381','search-bound completeness gap','Changed d_min or index bounds can miss supported reflections, especially near the cap or for long cells. These are not equivalent. Current completeness diagnostics, resource bounds and independent larger-cell references protect the replacement contract.');
classify('385 391 397','equivalent for uncapped domain; incomplete-domain boundary','ceil(length/d_min)+1 is strictly outside the physical sphere, so excluding its final index changes only work when uncapped. At the 36 cap it can omit valid boundary planes; capped results are explicitly incomplete, not certified converged.');
classify('408 437','equivalent returned peaks','These change only origin handling: removing the explicit origin exclusion or changing l<0 to l<=0 when h=k=0. The origin is also rejected by the q=0 condition; other planes are unchanged.');
classify('440 441 445','equivalent on triangular reciprocal basis','The changed terms multiply components that are identically zero: c* has only z and b* has no x in this constructed basis. This is basis-specific, not a general reciprocal-vector identity.');
classify('458 459 460 461 463 464','equivalent finite output; redundant guard','qLength is nonnegative. sinTheta=0 or 1 gives 0 or 180 degrees and is removed by the range filter; >1 produces NaN, which never passes the positive-intensity test. Keeping the early guard avoids invalid intermediate arithmetic.');
classify('471','missing lower-range assertion','Removing the 5-degree bound admits low-angle peaks in long cells. The current larger-cell independent references and range tests cover this behavior.');
classify('472 475','inclusive-range boundary difference','Equality changes admission at exactly 5 or 80 degrees. Preserve the documented inclusive range; floating-point construction at an exact boundary is not evidence of global equivalence.');
classify('493 495','equivalent','Negating the complete real or imaginary sum leaves its square unchanged.');
classify('506','numerical threshold boundary difference','Equality admits an intensity exactly 1e-8. This is not mathematically equivalent; the threshold is an absolute numerical-noise policy, far below the reference relative-intensity tolerance for the fixtures.');
classify('522','retired approximation','The 0.025-degree merge was replaced by 1e-7 degeneracy grouping; distinct nearby reflections now broaden independently. Equality at the old merge tolerance is no longer the scientific contract.');
classify('527 529 530','retired label policy','The old strongest-versus-accumulated label comparison was not a reliable representative-selection rule. The new documented label is the deterministic first enumerated family member; numerical intensity is independently tested.');
classify('541','equivalent','No retained peaks means mapping an empty merged array returns [] regardless of the zero-maximum branch.');
classify('554','performance-only','An empty profile accumulates zeros and subsequently returns [] even without this early return; removing it allocates unnecessary work.');
classify('576','equivalent typed-array output; extra work','Writes beyond a Float64Array boundary are ignored; the extra loop iterations do not change in-range samples. Keep the bound to avoid wasted work.');
classify('581','missing upper-tail assertion','Dropping the last index can remove an in-range endpoint sample (not only negligible far tails). Current full-grid independent references and the explicit upper-boundary profile test address it.');
const before=old.files[file], after=measured.files[file];
const reviews=before.mutants.filter(m=>m.status==='Survived').map(m=> {
  const now=after.mutants.find(n=>n.id===m.id);
  const decision=decisions.get(m.id) ?? (now.status==='Killed' ? {category:'missing assertion now detected',reason:'The added triclinic interference/multiplicity tests kill this mutant in the comparable unchanged-source run.'} : null);
  if(!decision) throw new Error('Unreviewed mutant '+m.id);
  return {id:m.id,location:m.location,replacement:m.replacement,before:m.status,after:now.status,...decision};
});
const counts=f=>f.mutants.reduce((s,m)=>({...s,[m.status]:(s[m.status]??0)+1}),{});
const output={measuredOn:'2026-09-17',node:'22.23.2',stryker:'10.0.0',durationSeconds:1187,
  sourceSha256:createHash('sha256').update(before.source.replace(/\r\n/g,'\n')).digest('hex'),
  comparableSource:before.source===after.source,scope:'Same three files, 709 generated mutants; only analytic tests added before model changes',
  before:counts(before),after:counts(after),reviews};
await writeFile('docs/pxrd-mutation-review.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({before:output.before,after:output.after,reviewed:reviews.length}));
