import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jsmolAssetUrls } from './runtime';

function filesBelow(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

describe('packaged JSmol resources', () => {
  const runtimeRoot = resolve(process.cwd(), 'src', 'renderer', 'public', 'vendor', 'jsmol');

  it('contains the pinned complete local runtime', () => {
    const scriptPath = join(runtimeRoot, 'JSmol.min.js');
    expect(existsSync(scriptPath)).toBe(true);
    expect(filesBelow(join(runtimeRoot, 'j2s'))).toHaveLength(1720);
    expect(createHash('sha256').update(readFileSync(scriptPath)).digest('hex'))
      .toBe('9e38944b4e5d19926d3359fb4e188ed9c7fa6f0e10b8cc099539fa0aa93fe377');
  });

  it('resolves assets beside the production renderer entry point', () => {
    expect(jsmolAssetUrls('file:///C:/Program%20Files/CIF/resources/app.asar/dist/index.html')).toEqual({
      script: 'file:///C:/Program%20Files/CIF/resources/app.asar/dist/vendor/jsmol/JSmol.min.js',
      j2s: 'file:///C:/Program%20Files/CIF/resources/app.asar/dist/vendor/jsmol/j2s'
    });
  });

  it('introduces no CDN or remote JSmol dependency in application-authored files', () => {
    const authored = [
      readFileSync(resolve(process.cwd(), 'src', 'renderer', 'index.html'), 'utf8'),
      readFileSync(resolve(process.cwd(), 'src', 'renderer', 'src', 'jsmol', 'runtime.ts'), 'utf8')
    ].join('\n');
    expect(authored).not.toMatch(/https?:\/\//i);
    expect(authored).not.toMatch(/cdn/i);
    expect(authored).toContain("serverURL: ''");
  });
});
