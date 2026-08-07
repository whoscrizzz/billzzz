---
name: validate-bills-pwa
description: Run the full validation gate for bills-pwa (typecheck + lint + tests). Use before any commit, PR, or deploy sign-off request.
---

## Gate

```bash
npm run validate
```

Runs, in order: `cf-typegen` + `tsc -b` (root) + `tsc -p worker/tsconfig.json --noEmit`, then `oxlint`, then the `node --test` suite in `scripts/test-*.mjs`. Husky's pre-commit hook already runs `lint-staged` + `typecheck` on every commit — `validate` is the same gate plus the full test run, run manually before opening a PR or asking for deploy sign-off.

## If it fails

- **Typecheck**: after any edit to `wrangler.jsonc` bindings, run `npm run cf-typegen` first — `worker-configuration.d.ts` is generated/gitignored and goes stale otherwise.
- **Tests**: the file list lives in the `test` script in `package.json`, not in a runner config — a new `scripts/test-*.mjs` file must be added there manually or it silently never runs.
- **Lint**: `typescript/no-floating-promises` and `react/rules-of-hooks` are errors, not warnings — floating promises in async handlers fail this step specifically.

## Single test file

```bash
node --test scripts/test-stats.mjs
```

## Related

- `npm run fmt:check` — prettier, not part of `validate` but part of CI.
- Full gate before deploy: see `deploy-bills-pwa` skill — `deploy:safe` runs `validate` again as its first step.
