import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { refinementPythonPath } from './refinementRuntime';

describe('bundled refinement runtime', () => {
  it('uses the embedded Windows interpreter', () => {
    expect(refinementPythonPath('resources/rietx-runtime', 'win32'))
      .toBe(join('resources/rietx-runtime', 'python', 'python.exe'));
  });
  it('uses the relocatable macOS interpreter', () => {
    expect(refinementPythonPath('/Applications/CIF Crystal Data.app/Contents/Resources/rietx-runtime', 'darwin'))
      .toBe(join('/Applications/CIF Crystal Data.app/Contents/Resources/rietx-runtime', 'python', 'bin', 'python3'));
  });
  it('fails explicitly on unsupported platforms', () => {
    expect(() => refinementPythonPath('/runtime', 'linux')).toThrow('does not support linux');
  });
});
