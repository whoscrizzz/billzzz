// Smoke test for Reminders-style paste (mirrors import-reminders patterns)
const sample = `Spotify $79
28/06/26 Cada mes

Préstamo Stori $1037.70
03/07/26 Cada semana`;

const blocks = sample.split(/\n{2,}/);
const amountRe = /\$?\s*([\d][\d,]*(?:\.\d{1,2})?)/;
let ok = 0;
for (const b of blocks) {
  if (amountRe.test(b) && /cada/i.test(b)) ok++;
}
if (ok < 2) {
  console.error("import test failed");
  process.exit(1);
}
console.log("test-import: OK");
