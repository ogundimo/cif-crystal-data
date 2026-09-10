import { afterEach, describe, expect, it, vi } from 'vitest';
import { readPreference, validColumnWidths } from './layoutPreferences';

afterEach(() => vi.unstubAllGlobals());
describe('layout preferences', () => {
  it('restores validated column sizes', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{"formula":200}' });
    expect(readPreference('column-widths', {}, validColumnWidths)).toEqual({ formula: 200 });
  });
  it.each(['broken JSON', '{"formula":-1}', '{"unknown":100}', 'null', '[]'])('ignores invalid stored values: %s', value => {
    vi.stubGlobal('localStorage', { getItem: () => value });
    expect(readPreference('column-widths', {}, validColumnWidths)).toEqual({});
  });
  it('works when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Blocked'); } });
    expect(readPreference('column-widths', {}, validColumnWidths)).toEqual({});
  });
});
