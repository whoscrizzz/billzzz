// Smoke test for Reminders-style paste (mirrors import-reminders patterns).
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('parses amount + "cada" cadence from pasted Reminders text', () => {
  const sample = `Spotify $79
28/06/26 Cada mes

Préstamo Stori $1037.70
03/07/26 Cada semana`;

  const blocks = sample.split(/\n{2,}/);
  const amountRe = /\$?\s*([\d][\d,]*(?:\.\d{1,2})?)/;
  const matched = blocks.filter((b) => amountRe.test(b) && /cada/i.test(b));

  assert.ok(matched.length >= 2, `expected at least 2 matching blocks, got ${matched.length}`);
});
