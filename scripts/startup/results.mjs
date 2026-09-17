export const protocol = 'visible-dev-fresh-vite-empty-profile-v1';
export const metrics = ['mainMs', 'firstContentfulPaintMs', 'controlsReadyMs', 'databaseReadyMs', 'quickSearchPaintMs', 'emptySearchMs', 'resourceCount', 'decodedBytes'];

export function summarize(samples) {
  if (samples.length < 3) throw new Error('At least three samples are required.');
  return Object.fromEntries(metrics.map(metric => {
    const values = samples.map(sample => sample[metric]);
    if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid or missing ${metric}`);
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    return [metric, { samples: values, min: sorted[0], median, max: sorted.at(-1) }];
  }));
}

export function compare(current, baseline) {
  if (current.status !== 'passed' || baseline.status !== 'passed') throw new Error('Only complete, passed reports can be compared.');
  if (current.protocol !== protocol || baseline.protocol !== protocol) throw new Error('Incompatible startup benchmark protocol.');
  const changedConditions = ['platform', 'arch', 'os', 'cpu', 'memoryBytes', 'node', 'electron', 'vite', 'electronVite', 'harnessHash']
    .filter(key => current.environment[key] !== baseline.environment[key]);
  const now = summarize(current.samples); const before = summarize(baseline.samples);
  return {
    advisory: true, changedConditions,
    metrics: Object.fromEntries(metrics.map(metric => [metric, {
      baselineMedian: before[metric].median, currentMedian: now[metric].median,
      change: now[metric].median - before[metric].median,
      percent: before[metric].median === 0 ? null : (now[metric].median / before[metric].median - 1) * 100
    }]))
  };
}
