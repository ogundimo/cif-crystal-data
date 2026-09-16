import { describe, expect, it } from 'vitest';
import { splitCifDataBlocks } from '../parser/cifParser';
import { blockIdentities, sourceKey } from './sourceIdentity';

describe('source and block identity', () => {
  it('normalizes Windows path case, separators and dot segments', () => {
    expect(sourceKey('C:\\Data\\folder\\..\\Sample.CIF')).toBe(sourceKey('c:/data/sample.cif'));
    expect(sourceKey('C:\\Other\\Sample.CIF')).not.toBe(sourceKey('C:\\Data\\Sample.CIF'));
  });

  it('uses scanner labels rather than apparent labels inside semicolon text', () => {
    const blocks = splitCifDataBlocks('_note\n;\ndata_fake\n;\ndata_real\n_tag value\n');
    expect(blockIdentities(blocks)).toEqual(['label:real']);
  });

  it('keeps identical repeated blocks distinct while tracking nonidentical repeated blocks across reorder', () => {
    const a = 'data_same\n_tag A\n';
    const b = 'data_same\n_tag B\n';
    const before = blockIdentities(splitCifDataBlocks(a + a + b));
    const after = blockIdentities(splitCifDataBlocks(b + a + a));
    expect(new Set(before).size).toBe(3);
    expect(after).toEqual([before[2], before[0], before[1]]);
  });

  it('keeps unnamed blocks distinct from a literal block-1 label', () => {
    const keys = blockIdentities(splitCifDataBlocks('data_\n_tag A\ndata_block-1\n_tag B\n'));
    expect(keys[0]).toMatch(/^content:/);
    expect(keys[1]).toBe('label:block-1');
  });
});
