import { readFileSync } from "node:fs";
import { join } from "node:path";

const swPath = join(process.cwd(), "dist", "sw.js");
const sw = readFileSync(swPath, "utf8");

if (sw.includes("API_PREFIX")) {
  console.error("check-sw: dist/sw.js still references API_PREFIX (broken service worker routes).");
  process.exit(1);
}

if (!sw.includes("/billzzz-api/")) {
  console.error("check-sw: dist/sw.js missing /billzzz-api/ runtime routes.");
  process.exit(1);
}

console.log("check-sw: dist/sw.js OK");
