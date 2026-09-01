import { describe, expect, it } from 'vitest';
import { extractStructuralStatus } from './status';

describe('structural status extraction', () => {
  it('extracts runtime, atom count, unit cell, and recognized space group', () => {
    const values: Record<string, unknown> = {
      appletInfo: { version: 'Jmol 16.4.15' },
      atomInfo: [{}, {}, {}],
      unitcellInfo: { params: [5, 6, 7, 90, 91, 92, 0] },
      auxiliaryInfo: { models: [{ spaceGroupTitle: 'P 21/c' }] }
    };
    expect(extractStructuralStatus((name) => values[name])).toMatchObject({
      loaded: true, runtimeVersion: 'Jmol 16.4.15', atomCount: 3,
      unitCell: [5, 6, 7, 90, 91, 92], spaceGroup: 'P 21/c', warning: null
    });
  });

  it('returns concise warnings when structural evidence is unavailable', () => {
    const status = extractStructuralStatus(() => null);
    expect(status.loaded).toBe(false);
    expect(status.warning).toContain('atom count');
    expect(status.warning).toContain('unit-cell parameters');
    expect(status.warning).toContain('recognized space group');
  });
});
