import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svg = readFileSync(join(root, "public/app-icon.svg"));

const sizes = [180, 192, 512];

for (const size of sizes) {
  const out = join(root, "public", `icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`Generated ${out}`);
}
