import { createHash } from 'node:crypto';

// Only the application's two version fields are irrelevant to analyzer inputs.
// Authenticate the historical lockfile before comparing every other field.
export function sameMeasurementLock(currentText, previousText, expectedHash) {
  const hash = createHash('sha256').update(previousText.replaceAll('\r\n', '\n')).digest('hex');
  if (hash !== expectedHash) return false;
  const normalize = text => {
    const lock = JSON.parse(text);
    if (typeof lock.version !== 'string' || lock.packages?.['']?.version !== lock.version) {
      throw new Error('Root lockfile versions must agree');
    }
    delete lock.version;
    delete lock.packages[''].version;
    return JSON.stringify(lock);
  };
  return normalize(currentText) === normalize(previousText);
}
