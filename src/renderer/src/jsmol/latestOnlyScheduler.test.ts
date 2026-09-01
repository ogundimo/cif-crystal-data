import { describe, expect, it } from 'vitest';
import { LatestOnlyScheduler } from './latestOnlyScheduler';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('LatestOnlyScheduler', () => {
  it('accepts only the latest request during rapid selection changes', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const accepted: string[] = [];
    const discarded: string[] = [];
    const scheduler = new LatestOnlyScheduler<string, string>(
      (value) => value === 'old' ? first.promise : second.promise,
      { onAccepted: (result) => accepted.push(result), onDiscarded: (result) => discarded.push(result) }
    );
    scheduler.request('old');
    scheduler.request('intermediate');
    scheduler.request('new');
    first.resolve('old result');
    await flush();
    second.resolve('new result');
    await flush();
    expect(discarded).toEqual(['old result']);
    expect(accepted).toEqual(['new result']);
  });

  it('prevents a stale completion callback from updating visible state', async () => {
    const old = deferred<string>();
    const latest = deferred<string>();
    let visible = 'initial';
    const scheduler = new LatestOnlyScheduler<string, string>(
      (value) => value === 'old' ? old.promise : latest.promise,
      { onAccepted: (result) => { visible = result; } }
    );
    scheduler.request('old');
    scheduler.request('latest');
    old.resolve('obsolete structure');
    await flush();
    expect(visible).toBe('initial');
    latest.resolve('latest structure');
    await flush();
    expect(visible).toBe('latest structure');
  });

  it('reports a controlled error only for the request that failed', async () => {
    let errorState = '';
    const scheduler = new LatestOnlyScheduler<string, string>(
      async () => { throw new Error('Invalid CIF'); },
      { onError: (error) => { errorState = error instanceof Error ? error.message : 'Unknown error'; } }
    );
    scheduler.request('broken');
    await flush();
    expect(errorState).toBe('Invalid CIF');
  });

  it('ignores an error from a stale request', async () => {
    const stale = deferred<string>();
    const latest = deferred<string>();
    let errorState = '';
    const scheduler = new LatestOnlyScheduler<string, string>(
      (value) => value === 'stale' ? stale.promise : latest.promise,
      { onError: (error) => { errorState = String(error); } }
    );
    scheduler.request('stale');
    scheduler.request('latest');
    stale.reject(new Error('stale failure'));
    await flush();
    expect(errorState).toBe('');
    latest.resolve('ok');
    await flush();
  });
});
