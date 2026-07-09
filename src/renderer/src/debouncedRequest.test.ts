import { afterEach, describe, expect, it, vi } from 'vitest';
import { scheduleDebouncedRequest } from './debouncedRequest';

afterEach(() => {
  vi.useRealTimers();
});

describe('scheduleDebouncedRequest', () => {
  it('waits for the debounce interval before requesting', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue('result');
    const onStart = vi.fn();
    const onSuccess = vi.fn();

    scheduleDebouncedRequest({
      delay: 250,
      request,
      onStart,
      onSuccess,
      onError: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(request).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(onStart).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith('result');
  });

  it('cancels a request that has not started', async () => {
    vi.useFakeTimers();
    const request = vi.fn().mockResolvedValue('result');
    const cancel = scheduleDebouncedRequest({
      delay: 250,
      request,
      onSuccess: vi.fn(),
      onError: vi.fn()
    });

    cancel();
    await vi.advanceTimersByTimeAsync(250);
    expect(request).not.toHaveBeenCalled();
  });

  it('suppresses a stale response after cancellation', async () => {
    vi.useFakeTimers();
    let resolveRequest!: (value: string) => void;
    const request = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const onSuccess = vi.fn();
    const cancel = scheduleDebouncedRequest({
      delay: 250,
      request,
      onSuccess,
      onError: vi.fn()
    });

    await vi.advanceTimersByTimeAsync(250);
    cancel();
    resolveRequest('stale');
    await Promise.resolve();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('reports request failures', async () => {
    vi.useFakeTimers();
    const error = new Error('database unavailable');
    const onError = vi.fn();

    scheduleDebouncedRequest({
      delay: 250,
      request: vi.fn().mockRejectedValue(error),
      onSuccess: vi.fn(),
      onError
    });

    await vi.advanceTimersByTimeAsync(250);
    expect(onError).toHaveBeenCalledWith(error);
  });
});

