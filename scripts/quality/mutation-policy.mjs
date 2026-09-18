import { createHash } from 'node:crypto';

const mutationStates=['Killed','Survived','NoCoverage','Timeout','CompileError','RuntimeError','Ignored'];
const sorted = object => JSON.stringify(Object.fromEntries(Object.entries(object).sort(([a],[b])=>a.localeCompare(b))));
export function assessMutation(report, execution, baseline) {
  if (!execution?.completed || execution.exitCode!==0 || !execution.startedAt || !execution.contract) throw new Error('Mutation execution failed or incomplete; no valid score');
  if (!report?.files || !Object.keys(report.files).length) throw new Error('Missing mutation report');
  const counts=Object.fromEntries(mutationStates.map(state=>[state,0]));
  const sourceHashes={};
  const identities=[];
  for (const [file,data] of Object.entries(report.files)) {
    if (typeof data.source!=='string' || !Array.isArray(data.mutants)) throw new Error(`Malformed mutation report: ${file}`);
    sourceHashes[file]=createHash('sha256').update(data.source.replaceAll('\r\n','\n')).digest('hex');
    const ids=new Set();
    for (const mutant of data.mutants) {
      if (!mutationStates.includes(mutant.status) || ids.has(mutant.id)) throw new Error(`Incomplete/invalid mutant: ${file} ${mutant.id} ${mutant.status}`);
      ids.add(mutant.id);counts[mutant.status]++;
      identities.push([file,mutant.location,mutant.mutatorName,mutant.replacement]);
    }
  }
  if (sorted(sourceHashes)!==sorted(execution.sourceHashes)) throw new Error('Stale report/source mismatch');
  if (!identities.length) throw new Error('Empty mutation population');
  if (counts.Ignored) throw new Error('Ignored mutations require explicit policy review; no exclusions are adopted');
  const populationHash=createHash('sha256').update(JSON.stringify(identities)).digest('hex');
  const denominator=counts.Killed+counts.Survived+counts.NoCoverage+counts.Timeout;
  const score=denominator ? 100*(counts.Killed+counts.Timeout)/denominator : null;
  const comparable=Boolean(baseline && JSON.stringify(baseline.contract)===JSON.stringify(execution.contract) &&
    sorted(baseline.sourceHashes)===sorted(sourceHashes) && baseline.populationHash===populationHash);
  const changes=comparable ? Object.fromEntries(mutationStates.map(state=>[state,counts[state]-baseline.counts[state]])) : null;
  return {schemaVersion:1,policy:'advisory',counts,score,populationHash,sourceHashes,contract:execution.contract,
    comparison:baseline ? (comparable?'comparable':'not comparable: source, mutation population or tool/configuration contract changed') : 'initial measurement; no baseline',changes,
    notes:['Survivors and uncovered mutants remain advisory and visible.','Timeout is not an assertion kill; invalid outcomes are not detections.','Reviewed equivalents remain in the denominator.']};
}
