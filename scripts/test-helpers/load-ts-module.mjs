// Bundles a worker/src or src/lib TypeScript module with esbuild and imports
// the result, so tests exercise the code that actually ships instead of a
// hand-copied reimplementation of it (a plain `import` can't resolve these
// modules' extensionless relative specifiers or strip their type annotations).
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadTsModule(relativePath) {
  const result = await build({
    entryPoints: [relativePath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const dir = mkdtempSync(join(tmpdir(), 'bills-pwa-test-'));
  const file = join(dir, 'bundle.mjs');
  writeFileSync(file, result.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}
