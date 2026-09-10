interface ScheduledRequest<T> {
  token: number;
  value: T;
}

interface SchedulerHooks<T, R> {
  onRequested?: (request: ScheduledRequest<T>) => void;
  onStarted?: (request: ScheduledRequest<T>) => void;
  onAccepted?: (result: R, request: ScheduledRequest<T>) => void;
  onDiscarded?: (result: R, request: ScheduledRequest<T>) => void;
  onError?: (error: unknown, request: ScheduledRequest<T>) => void;
}

/** Serializes a single JSmol applet while retaining only the newest pending request. */
export class LatestOnlyScheduler<T, R> {
  private sequence = 0;
  private active: ScheduledRequest<T> | null = null;
  private pending: ScheduledRequest<T> | null = null;

  constructor(
    private readonly loader: (value: T, token: number) => Promise<R>,
    private readonly hooks: SchedulerHooks<T, R> = {}
  ) {}

  request(value: T): number {
    const request = { token: ++this.sequence, value };
    this.pending = request;
    this.hooks.onRequested?.(request);
    void this.drain();
    return request.token;
  }

  isLatest(token: number): boolean {
    return token === this.sequence;
  }

  private async drain(): Promise<void> {
    if (this.active || !this.pending) return;
    const request = this.pending;
    this.pending = null;
    this.active = request;
    this.hooks.onStarted?.(request);
    try {
      const result = await this.loader(request.value, request.token);
      if (this.isLatest(request.token)) this.hooks.onAccepted?.(result, request);
      else this.hooks.onDiscarded?.(result, request);
    } catch (error) {
      if (this.isLatest(request.token)) this.hooks.onError?.(error, request);
    } finally {
      this.active = null;
      void this.drain();
    }
  }
}
