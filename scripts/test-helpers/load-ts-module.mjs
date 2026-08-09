// Bundles a worker/src or src/lib TypeScript module with esbuild and imports
// the result, so tests exercise the code that actually ships instead of a
// hand-copied reimplementation of it (a plain `import` can't resolve these
// modules' extensionless relative specifiers or strip their type annotations).
import { build } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * `options.stubs` reemplaza especificadores de import por dobles en memoria
 * (`{ './api': { createNote: async () => … } }`). Necesario para módulos de
 * `src/lib` que arrastran dependencias de navegador (fetch, localStorage,
 * IndexedDB) que no existen en `node --test`. Omitirlo deja el bundle
 * completo, que es lo que hace el resto de la suite.
 */
export async function loadTsModule(relativePath, options = {}) {
  const stubs = options.stubs ?? {};
  const stubNames = Object.keys(stubs);
  const stubRegistry = `__loadTsModuleStubs_${Date.now()}`;
  globalThis[stubRegistry] = stubs;

  const stubPlugin = {
    name: 'stub-modules',
    setup(pluginBuild) {
      for (const name of stubNames) {
        const filter = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
        pluginBuild.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'stub' }));
      }
      pluginBuild.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
        contents: `const s = globalThis[${JSON.stringify(stubRegistry)}][${JSON.stringify(args.path)}];
${Object.keys(stubs[args.path]).map((k) => `export const ${k} = s[${JSON.stringify(k)}];`).join('\n')}`,
        loader: 'js',
      }));
    },
  };

  const result = await build({
    entryPoints: [relativePath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    logLevel: 'silent',
    plugins: stubNames.length > 0 ? [stubPlugin] : [],
  });
  const dir = mkdtempSync(join(tmpdir(), 'bills-pwa-test-'));
  const file = join(dir, 'bundle.mjs');
  writeFileSync(file, result.outputFiles[0].text);
  return import(pathToFileURL(file).href);
}
