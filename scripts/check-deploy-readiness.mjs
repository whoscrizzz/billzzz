#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const WORKER_DB_SCHEMA_VERSION = 2;
export const REQUIRED_MIGRATIONS_DIR = 'migrations';

export function activeMigrationsDir(configSource) {
  const dbBinding = /"binding"\s*:\s*"DB"[\s\S]*?"migrations_dir"\s*:\s*"([^"]+)"/.exec(
    configSource
  );
  if (!dbBinding) {
    throw new Error('No se pudo resolver migrations_dir para el binding DB en wrangler.jsonc');
  }
  return dbBinding[1];
}

export function deployReadiness(configSource) {
  const migrationsDir = activeMigrationsDir(configSource);
  return {
    deployAllowed: migrationsDir === REQUIRED_MIGRATIONS_DIR,
    migrationsDir,
    requiredMigrationsDir: REQUIRED_MIGRATIONS_DIR,
    workerSchemaVersion: WORKER_DB_SCHEMA_VERSION,
  };
}

function append(path, value) {
  if (path) appendFileSync(path, `${value}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = deployReadiness(readFileSync('wrangler.jsonc', 'utf8'));
    append(process.env.GITHUB_OUTPUT, `deploy_allowed=${result.deployAllowed}`);

    if (result.deployAllowed) {
      console.log(
        `Deploy habilitado: Worker/D1 schema v${result.workerSchemaVersion} usa ${result.migrationsDir}/.`
      );
    } else {
      const message =
        `Deploy omitido: el Worker requiere D1 schema v${result.workerSchemaVersion} ` +
        `(${result.requiredMigrationsDir}/), pero el binding de producción sigue en ` +
        `${result.migrationsDir}/. No ejecutes migraciones v2 sobre la D1 v1; sigue ` +
        'docs/D1_V2_MIGRATION.md para el cutover.';
      console.warn(`::warning::${message}`);
      append(process.env.GITHUB_STEP_SUMMARY, `## ⏸️ Deploy diferido\n\n${message}\n`);
    }
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
