interface DebouncedRequestOptions<T> {
  delay: number;
  request: () => Promise<T>;
  onStart?: () => void;
  onSuccess: (result: T) => void;
  onError: (error: unknown) => void;
}

export function scheduleDebouncedRequest<T>({
  delay,
  request,
  onStart,
  onSuccess,
  onError
}: DebouncedRequestOptions<T>): () => void {
  let cancelled = false;

  const timer = setTimeout(async () => {
    if (cancelled) return;
    onStart?.();

    try {
      const result = await request();
      if (!cancelled) onSuccess(result);
    } catch (error) {
      if (!cancelled) onError(error);
    }
  }, delay);

  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}

