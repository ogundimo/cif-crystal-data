export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function waitFor(operation, description, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await operation();
    if (result) return result;
    await pause(50);
  }
  throw new Error(`Timed out: ${description}`);
}

export async function connect(port) {
  const target = await waitFor(async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) });
      return (await response.json())[0];
    } catch { return null; }
  }, 'local diagnostic endpoint');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Diagnostic connection timed out')); }, 5000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('Diagnostic connection failed')); };
  });
  const pending = new Map(); let sequence = 0;
  socket.onclose = () => { for (const entry of pending.values()) entry.reject(new Error('Diagnostic endpoint closed')); pending.clear(); };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data); const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Diagnostic request timed out: ${method}`)); }, 15_000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
  return {
    close: () => socket.close(),
    evaluate: async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
  };
}
