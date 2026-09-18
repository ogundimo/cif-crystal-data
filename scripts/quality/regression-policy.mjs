import ts from 'typescript';

export const dimensions = ['lines', 'statements', 'functions', 'branches'];
const metrics = ['cyclomatic', 'cognitive'];
const fail = message => { throw new Error(message); };

// Names follow lexical owners, never line numbers. Anonymous siblings have explicit
// ordinals: reorganizing callbacks requires review instead of transferring a waiver.
export function identifyFunctions(file, text, findings) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const functions = [];
  const counters = new Map();
  function visit(node, owners = []) {
    let next = owners;
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) next = [...owners, node.name?.text ?? '<class>'];
    if (ts.isPropertyDeclaration(node) && node.initializer) functions.push({
      key:[...owners, node.name.getText(source), '<initializer>'].join('/'),
      start:node.getStart(source), end:node.end, implicit:true
    });
    if (ts.isClassStaticBlockDeclaration(node)) functions.push({
      key:[...owners, `<static-block-${node.parent.members.filter(ts.isClassStaticBlockDeclaration).indexOf(node)}>`].join('/'),
      start:node.getStart(source), end:node.end, implicit:true
    });
    if (ts.isFunctionLike(node) && node.body) {
      const parent = node.parent;
      const name = node.name?.getText(source) ??
        ((ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent))
          ? parent.name.getText(source) : '<callback>');
      const base = [...owners, name].join('/');
      const count = (counters.get(base) ?? 0) + 1;
      counters.set(base, count);
      const key = `${base}#${count}`;
      const reportedOwner = (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) &&
        (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent)) ? parent : node;
      functions.push({ key, start:reportedOwner.getStart(source), end:node.end });
      next = [key];
    }
    ts.forEachChild(node, child => visit(child, next));
  }
  visit(source);
  return findings.map(row => {
    const offset = source.getPositionOfLineAndCharacter(row.line - 1, row.column - 1);
    const implicit = /^(Class field initializer|Class static block)/.test(row.message);
    const owner = functions.filter(fn => Boolean(fn.implicit) === implicit && offset >= fn.start && offset < fn.end)
      .sort((a,b) => (a.end-a.start)-(b.end-b.start))[0];
    if (!owner) fail(`Cannot identify measured function: ${file}:${row.line}:${row.column}`);
    return {...row, key:`${file}::${owner.key}`};
  });
}

function validateCounter(counter, label) {
  if (!counter || !Number.isSafeInteger(counter.total) || !Number.isSafeInteger(counter.covered) ||
    counter.total < 0 || counter.covered < 0 || counter.covered > counter.total) fail(`Invalid coverage counter: ${label}`);
}

function validate(snapshot) {
  if (snapshot?.schemaVersion !== 1 || !snapshot.contract || !snapshot.coverage?.files ||
    !snapshot.coverage.total || !snapshot.complexity || !snapshot.production?.length) fail('Missing or invalid regression measurement');
  for (const [file, data] of Object.entries({...snapshot.coverage.files, total:snapshot.coverage.total})) {
    for (const dimension of dimensions) validateCounter(data[dimension], `${file} ${dimension}`);
  }
  for (const metric of metrics) {
    const rows = snapshot.complexity[metric];
    if (!Array.isArray(rows) || (metric === 'cyclomatic' && !rows.length && !snapshot.exceptionsOnly)) fail(`Missing ${metric} measurements`);
    const seen = new Set();
    for (const row of rows) {
      if (!row.key || !row.file || !Number.isInteger(row.value) || row.value < 0 || seen.has(row.key)) fail(`Invalid/duplicate ${metric} function: ${row.key}`);
      seen.add(row.key);
    }
  }
  for (const file of snapshot.production) {
    if (!snapshot.coverage.files[file] && !snapshot.declarationOnly?.includes(file)) fail(`Missing coverage for ${file}`);
  }
  for (const file of Object.keys(snapshot.coverage.files)) {
    if (!snapshot.production.includes(file)) fail(`Coverage outside production inventory: ${file}`);
  }
  for (const dimension of dimensions) {
    for (const field of ['total','covered']) {
      const sum = Object.values(snapshot.coverage.files).reduce((n,row) => n + row[dimension][field],0);
      if (snapshot.coverage.total[dimension][field] !== sum) fail(`Invalid aggregate ${dimension} ${field}`);
    }
  }
}

export function compareRegression(current, baseline) {
  validate(current); validate(baseline);
  if (JSON.stringify(current.contract) !== JSON.stringify(baseline.contract)) fail('Measurement contract changed: explicitly review scope, analyzer/configuration versions and baseline migration');
  if (!baseline.policy || !baseline.review?.reason || !baseline.review?.trigger) fail('Baseline is missing its review decision');
  const failures = [], accepted = [];
  const compare = (scope, actual, floor) => {
    for (const dimension of dimensions) {
      const now = actual[dimension], old = floor[dimension];
      // Empty denominators are n/a, not 100%. New executable counters must be covered.
      if (now.total === 0) continue;
      if (old.total === 0 ? now.covered !== now.total : now.covered * old.total < old.covered * now.total) {
        failures.push(`${scope}: ${dimension} ${now.covered}/${now.total} below ${old.total ? `${old.covered}/${old.total}` : 'full coverage for newly executable dimension'}`);
      }
    }
  };
  compare('All production',current.coverage.total,baseline.coverage.total);
  for (const [file, data] of Object.entries(current.coverage.files)) {
    compare(file,data,baseline.coverage.files[file] ?? baseline.coverage.total);
    if (!baseline.coverage.files[file] && dimensions.some(d => data[d].total > 0 && data[d].covered === 0)) failures.push(`${file}: new untested production file/dimension`);
  }
  for (const metric of metrics) {
    const limit = baseline.policy[metric];
    if (!Number.isInteger(limit) || limit < 1) fail(`Invalid ${metric} policy ceiling`);
    const exceptions = new Map(baseline.complexity[metric].filter(row => row.value > limit).map(row => [row.key,row]));
    for (const row of current.complexity[metric]) {
      const exception = exceptions.get(row.key);
      if (exception && (!exception.reason || !exception.reviewTrigger)) fail(`Undocumented exception: ${row.key}`);
      const allowed = exception?.value ?? limit;
      const message = `${row.file}:${row.line}:${row.column} ${row.key} ${metric}=${row.value}, allowed=${allowed}`;
      if (row.value > allowed) failures.push(message);
      else if (exception) accepted.push(`${message}; ${exception.reason}; review: ${exception.reviewTrigger}`);
    }
  }
  return {failures, accepted};
}

export function protectBaseline(next, previous) {
  // PRs must still meet the target branch policy. A new snapshot cannot silently
  // weaken a floor/waiver. Exceptional migrations require an explicit workflow review.
  const result = compareRegression(next, previous);
  for (const metric of metrics) {
    if (next.policy?.[metric] > previous.policy[metric]) result.failures.push(`${metric} ceiling increased in baseline`);
  }
  for (const file of previous.production) {
    if (!next.production.includes(file)) result.failures.push(`Baseline removed production scope: ${file}`);
  }
  return result;
}
